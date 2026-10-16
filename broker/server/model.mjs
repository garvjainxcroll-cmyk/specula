// The price model. Server only: it is never copied into the website, so nobody can
// read a future price or the host's plans from it.
//
// price(m) = listed price × host level(m) × (1 + wiggle(m)), rounded to ₹0.05
//
//  - m is "market time" in milliseconds: it runs while the market is open and stands
//    still while it is closed, so prices freeze when trading is closed.
//  - wiggle(m) is the automatic movement: six layers of random drift, from a few seconds
//    to several minutes long. Every layer takes a small random step at each whole second
//    of market time, all of them together, and each step is pulled back towards zero, so
//    the price keeps returning to the listed price and averages to it. The randomness
//    comes from a secret seed chosen when the game is created (through SHA-256), so every
//    device sees the same price at the same moment, but each step is a new random number
//    that past prices do not reveal: no repeating pattern to fit, no glide to follow, and
//    no moment when one layer can be seen moving alone. Every layer starts from zero at
//    the opening bell, so the game opens at exactly the listed prices.
//  - host level(m) is 1 until the host moves the stock. A move takes the level from
//    where it is now to a new value, at once or over a chosen time. A gradual move, like
//    the drift, changes only at whole seconds, so it cannot be told apart by its timing.
// Every function here is pure: it takes the time it should use and never reads a clock.

import { createHash } from 'node:crypto';
import { BY_T, TICKERS, TICK_PAISE } from '../src/stocks.mjs';

/** How lively each stock is (1 = typical). Tech, EV and green energy move most. */
export const VOL = { AURI: 0.8, NEXO: 1.35, VANT: 1.25, MERB: 0.75, HELX: 0.9, CRTL: 0.7, SKYF: 1.0, GRVT: 1.5, URBT: 1.3, TCOR: 1.15 };

// The layers: [how long a swing lasts, in seconds; its typical size as a fraction of the
// price]. Most of the movement is in swings of one to three minutes; the longest layer is
// small, so a session's average stays close to the listed price (in testing, a one-hour
// average is typically within about 0.06% of it, and rarely more than 0.35% away).
const LAYERS = [[4, 0.00028], [12, 0.00084], [30, 0.00182], [75, 0.00266], [180, 0.0021], [420, 0.0007]];
// Each layer is a chain, one point a second: each point is the one before times RHO
// (= e^(-1/swing)) plus a new random number, scaled so its typical size is 1. A point is
// worked out from the last ln(10^4)·swing points (older ones count for under 0.01%),
// summed in blocks of BLOCK seconds that are kept once computed. Every value is computed
// the same way whatever the order of the questions, so every server answers alike.
const BLOCK = 32;
const KEEP = Math.log(1e4);

export const LEVEL_MIN = 0.05;
export const LEVEL_MAX = 20;

/** Eight 32-bit words from SHA-256 of a string. */
function words(str) {
  const d = createHash('sha256').update(str).digest();
  return [0, 4, 8, 12, 16, 20, 24, 28].map((i) => d.readUInt32LE(i));
}
function fmix(h) {
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  return h ^ (h >>> 16);
}
/** A random value in [-1, 1) fixed by a 128-bit key and point number k. */
function knot(key, k) {
  let x = fmix(Math.imul((k | 0) ^ key[0], 0x9e3779b1) ^ key[1]);
  x = fmix(((x + key[2]) | 0) ^ key[3]);
  return ((x >>> 0) / 4294967296) * 2 - 1;
}

/** One side of a layer's chain (after or before the opening bell): x(0) = 0 and
 * x(s) = RHO·x(s-1) + a new random number, for whole seconds s >= 1. */
function chainSide(key, swing) {
  const rho = Math.exp(-1 / swing); const sig = Math.sqrt(3 * (1 - rho * rho));
  const n = Math.ceil(KEEP * swing); const J = Math.ceil(n / BLOCK);
  const pw = [1]; for (let i = 1; i <= Math.max(BLOCK, n); i++) pw.push(pw[i - 1] * rho);
  const blocks = new Map(); const ends = new Map();
  const block = (b) => { // block b's own part of the value at its last second
    let v = blocks.get(b);
    if (v === undefined) { v = 0; for (let i = 1; i <= BLOCK; i++) v += pw[BLOCK - i] * knot(key, b * BLOCK + i); v *= sig; if (blocks.size > 40000) blocks.clear(); blocks.set(b, v); }
    return v;
  };
  const end = (b) => { // the chain at the last second of block b
    if (b < 0) return 0;
    let v = ends.get(b);
    if (v === undefined) { v = 0; let r = 1; for (let j = 0; j <= Math.min(b, J); j++) { v += r * block(b - j); r *= pw[BLOCK]; } if (ends.size > 40000) ends.clear(); ends.set(b, v); }
    return v;
  };
  return (s) => {
    if (s <= 0) return 0;
    if (n <= BLOCK) { let v = 0; for (let j = 0; j < Math.min(s, n); j++) v += pw[j] * knot(key, s - j); return sig * v; }
    const b = Math.floor((s - 1) / BLOCK); const r = s - b * BLOCK;
    let v = 0; for (let i = 1; i <= r; i++) v += pw[r - i] * knot(key, b * BLOCK + i);
    return pw[r] * end(b - 1) + sig * v;
  };
}

const cache = new Map();
function wiggleFor(seed, t) {
  const key = `${seed}:${t}`;
  let f = cache.get(key);
  if (f) return f;
  const vol = VOL[t] ?? 1;
  const layers = LAYERS.map(([swing, a], i) => ({
    a: a * vol, s: NaN, v: 0,
    after: chainSide(words(`${key}:layer:${i}:after`).slice(0, 4), swing),
    before: chainSide(words(`${key}:layer:${i}:before`).slice(0, 4), swing),
  }));
  f = (m) => {
    const s = m >= 0 ? Math.floor(m / 1000) : -Math.floor(-m / 1000); // whole seconds from the bell
    let v = 0;
    for (const L of layers) {
      if (L.s !== s) { L.s = s; L.v = s >= 0 ? L.after(s) : L.before(-s); }
      v += L.a * L.v;
    }
    return v;
  };
  if (cache.size > 200) cache.clear();
  cache.set(key, f);
  return f;
}

/** The automatic movement of one stock at market time m, as a fraction (0.01 = +1%). */
export function wiggle(seed, t, m) { return wiggleFor(seed, t)(m); }

const smooth = (x) => x * x * (3 - 2 * x);

/**
 * The host's level for one stock at market time m.
 * moves: [[m0, from, to, durMs, wallTime, ...], ...] in the order they were made; the latest
 * one that has started wins. dur 0: instant, from the next whole second. dur 1: instant at
 * the opening bell (1 ms after the moment the market closed). Longer: a gradual move,
 * which (like the drift) changes only at whole seconds and ends on one.
 */
export function levelAt(moves, m) {
  if (!moves || !moves.length) return 1;
  const q = Math.floor(m / 1000) * 1000; // the last whole second
  let cut = Infinity; // an older move set to start after a newer one was replaced by it
  for (let i = moves.length - 1; i >= 0; i--) {
    const [m0, from, to, dur] = moves[i];
    if (m0 > cut) continue;
    cut = m0;
    if (m0 > m) continue;
    if (dur === 0) { if (m < Math.ceil(m0 / 1000) * 1000) continue; return to; }
    if (dur === 1) return m < m0 + 1 ? from : to;
    if (q < m0 + dur) return from + (to - from) * smooth(Math.max(0, q - m0) / dur);
    return to;
  }
  return 1;
}

/** When a move takes effect, and when it is complete (both in market time). */
export const moveStart = (x) => (x[3] === 0 ? Math.ceil(x[0] / 1000) * 1000 : x[3] === 1 ? x[0] + 1 : x[0]);
export const moveEnd = (x) => (x[3] <= 1 ? moveStart(x) : Math.ceil((x[0] + x[3]) / 1000) * 1000);

/**
 * How one stock's moves play from market time m, as levelAt plays them: `now` is the move in
 * effect (or null), `next` the moves still to come, in the order they will take over.
 */
export function movePlan(moves, m) {
  const live = []; let cut = Infinity;
  for (let i = (moves?.length || 0) - 1; i >= 0; i--) { const x = moves[i]; if (x[0] > cut) continue; cut = x[0]; live.unshift(x); }
  let k = live.length - 1;
  while (k >= 0 && moveStart(live[k]) > m) k--;
  return { now: k >= 0 ? live[k] : null, next: live.slice(k + 1) };
}

/** The price of stock t, in paise, at market time m. */
export function priceAt(state, t, m) {
  const raw = BY_T[t].base * levelAt(state.moves[t], m) * (1 + wiggle(state.seed, t, m));
  return Math.max(TICK_PAISE, Math.round(raw / TICK_PAISE) * TICK_PAISE);
}

export function pricesAt(state, m) {
  const out = {};
  for (const t of TICKERS) out[t] = priceAt(state, t, m);
  return out;
}

export function levelsAt(state, m) {
  const out = {};
  for (const t of TICKERS) out[t] = levelAt(state.moves[t], m);
  return out;
}

// ---------------- the market clock ----------------
// clock: [[wallTime, marketTime, running(0|1)], ...]: a new entry each time the host
// opens or closes the market.

export function marketTime(clock, w) {
  let s = clock[0];
  for (const x of clock) { if (x[0] <= w) s = x; else break; }
  if (w < s[0]) return s[1];
  return s[2] ? s[1] + (w - s[0]) : s[1];
}

export const isRunning = (clock) => !!clock[clock.length - 1][2];

/** Open (true) or close (false) the market at wall time w. Returns the new clock. */
export function setRunning(clock, w, run) {
  const last = clock[clock.length - 1];
  if (!!last[2] === !!run) return clock;
  const m = marketTime(clock, w);
  const next = clock.slice();
  if (last[0] === w) next.pop();
  next.push([w, m, run ? 1 : 0]);
  return next;
}

/**
 * The wall time at which the market showed market time m: used to label charts.
 * Before the market first opened (the history every stock already has), time is
 * counted back from the first opening (or from now, if it has never opened).
 */
export function wallTimeOf(clock, m, nowW) {
  for (let i = clock.length - 1; i >= 0; i--) {
    const [w0, m0, run] = clock[i];
    if (!run) continue;
    const end = i + 1 < clock.length ? clock[i + 1][1] : Infinity;
    if (m >= m0 && m <= end) return w0 + (m - m0);
  }
  const first = clock.find((x) => x[2]);
  if (first && m < first[1]) return first[0] - (first[1] - m);
  if (!first) return nowW - (marketTime(clock, nowW) - m);
  // inside a closed spell: the moment it closed
  for (let i = clock.length - 1; i >= 0; i--) if (clock[i][1] <= m) return clock[i][0];
  return nowW;
}
