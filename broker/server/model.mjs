// The price model. Server only: it is never copied into the website, so nobody can
// read a future price or the host's plans from it.
//
// price(m) = listed price × host level(m) × (1 + wiggle(m)), rounded to ₹0.05
//
//  - m is "market time" in milliseconds: it runs while the market is open and stands
//    still while it is closed, so prices freeze when trading is closed.
//  - wiggle(m) is the automatic movement: six layers of random drift, from a few seconds
//    to several minutes long. Each layer is pulled back towards zero all the time, so the
//    price keeps returning to the listed price and averages to it. The randomness comes
//    from a secret seed chosen when the game starts (through SHA-256), so every device
//    sees the same price at the same moment, but the next steps are new random numbers
//    that past prices do not reveal: there is no repeating pattern to fit. It eases in
//    over the first 90 seconds, so the game opens at exactly the listed prices.
//  - host level(m) is 1 until the host moves the stock. A move takes the level from
//    where it is now to a new value, at once or over a chosen time.
// Every function here is pure: it takes the time it should use and never reads a clock.

import { createHash } from 'node:crypto';
import { BY_T, TICKERS, TICK_PAISE } from '../src/stocks.mjs';

/** How lively each stock is (1 = typical). Tech, EV and green energy move most. */
export const VOL = { AURI: 0.8, NEXO: 1.35, VANT: 1.25, MERB: 0.75, HELX: 0.9, CRTL: 0.7, SKYF: 1.0, GRVT: 1.5, URBT: 1.3, TCOR: 1.15 };

// The layers: [how long a swing lasts, in seconds; its typical size as a fraction of the
// price]. Most of the movement is in swings of one to three minutes; the longest layer is
// small, so a session's average stays close to the listed price (in testing, a one-hour
// average is typically within about 0.1% of it, and rarely more than 0.5% away).
const LAYERS = [[4, 0.0004], [12, 0.0012], [30, 0.0026], [75, 0.0038], [180, 0.0030], [420, 0.0010]];
// Each layer is a chain of random points SPLIT to a swing, joined smoothly. Each point is
// the last one times RHO plus a new random number, so the chain keeps drifting back to
// zero; N points of the past are enough (RHO^N is under 0.1%).
const SPLIT = 4;
const RHO = Math.exp(-1 / SPLIT);
const N = 28;
const RHO_N = RHO ** N;
const NORM = Math.sqrt((3 * (1 - RHO * RHO)) / (1 - RHO ** (2 * N))); // typical size 1

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

const cache = new Map();
function wiggleFor(seed, t) {
  const key = `${seed}:${t}`;
  let f = cache.get(key);
  if (f) return f;
  const vol = VOL[t] ?? 1;
  const layers = LAYERS.map(([swing, a], i) => ({ dt: (swing * 1000) / SPLIT, a: a * vol * NORM, key: words(`${key}:layer:${i}`).slice(0, 4), k: NaN, p0: 0, p1: 0 }));
  f = (m) => {
    let v = 0;
    for (const L of layers) {
      const x = m / L.dt;
      const k = Math.floor(x);
      if (k !== L.k) { // the chain's points k and k+1 (kept for the next call)
        let p = 0; let r = 1;
        for (let j = 0; j < N; j++) { p += r * knot(L.key, k - j); r *= RHO; }
        L.k = k; L.p0 = p; L.p1 = knot(L.key, k + 1) + RHO * p - RHO_N * knot(L.key, k + 1 - N);
      }
      const u = (1 - Math.cos(Math.PI * (x - k))) / 2;
      v += L.a * (L.p0 + (L.p1 - L.p0) * u);
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
 * moves: [[m0, from, to, durMs, wallTime], ...] in the order they were made.
 */
export function levelAt(moves, m) {
  if (!moves || !moves.length) return 1;
  for (let i = moves.length - 1; i >= 0; i--) {
    const [m0, from, to, dur] = moves[i];
    if (m0 > m) continue;
    if (dur > 0 && m < m0 + dur) return from + (to - from) * smooth((m - m0) / dur);
    return to;
  }
  return 1;
}

const OPEN_EASE_MS = 90000;
/** 0 at the opening bell (market time 0), 1 from 90 seconds either side of it. */
function openEase(m) {
  const x = Math.min(1, Math.abs(m) / OPEN_EASE_MS);
  return x * x * (3 - 2 * x);
}

/** The price of stock t, in paise, at market time m. */
export function priceAt(state, t, m) {
  const raw = BY_T[t].base * levelAt(state.moves[t], m) * (1 + wiggle(state.seed, t, m) * openEase(m));
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
