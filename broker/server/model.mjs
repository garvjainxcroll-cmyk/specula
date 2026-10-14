// The price model. Server only: it is never copied into the website, so nobody can
// compute a future price or tell which moves were the host's.
//
// price(m) = listed price × host level(m) × (1 + wiggle(m)), rounded to ₹0.05
//
//  - m is "market time" in milliseconds: it runs while the market is open and stands
//    still while it is closed, so prices freeze when trading is closed.
//  - wiggle(m) is the automatic movement: a sum of slow and fast waves plus small
//    random steps, all centred on zero. Over time it averages to zero, so the price
//    averages to the listed price. It is fixed by a secret seed chosen when the game
//    starts, so every device sees the same price at the same moment.
//  - host level(m) is 1 until the host moves the stock. A move takes the level from
//    where it is now to a new value, at once or over a chosen time.
// Every function here is pure: it takes the time it should use and never reads a clock.

import { BY_T, TICKERS, TICK_PAISE } from '../src/stocks.mjs';

/** How lively each stock is (1 = typical). Tech, EV and green energy move most. */
export const VOL = { AURI: 0.8, NEXO: 1.35, VANT: 1.25, MERB: 0.75, HELX: 0.9, CRTL: 0.7, SKYF: 1.0, GRVT: 1.5, URBT: 1.3, TCOR: 1.15 };

// Waves: periods in seconds (none longer than ~50 minutes, so even a one-hour session
// averages out) and sizes as a fraction of the price.
const PERIODS = [7, 19, 47, 113, 271, 643, 1499, 2953];
const SIZES = [0.0006, 0.001, 0.0016, 0.0024, 0.0032, 0.004, 0.0042, 0.0036];
// Small random steps: [seconds between steps, size].
const STEPS = [[2, 0.0009], [11, 0.0014]];

export const LEVEL_MIN = 0.05;
export const LEVEL_MAX = 20;

function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** A value in [-1, 1) fixed by (seed, k). */
function knot(seed, k) {
  let x = (seed ^ Math.imul(k | 0, 0x9e3779b1)) >>> 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15; x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return ((x >>> 0) / 4294967296) * 2 - 1;
}

const cache = new Map();
function wiggleFor(seed, t) {
  const key = `${seed}:${t}`;
  let f = cache.get(key);
  if (f) return f;
  const r = rng(hash32(key));
  const vol = VOL[t] ?? 1;
  const waves = PERIODS.map((T, k) => ({ w: (2 * Math.PI) / T, ph: r() * 2 * Math.PI, a: SIZES[k] * (0.75 + 0.5 * r()) * vol }));
  const steps = STEPS.map(([dt, a], k) => ({ dt, a: a * vol, s: hash32(`${key}:s${k}`) }));
  f = (m) => {
    const sec = m / 1000;
    let v = 0;
    for (const c of waves) v += c.a * Math.sin(c.w * sec + c.ph);
    for (const st of steps) {
      const x = sec / st.dt;
      const k = Math.floor(x);
      const u = (1 - Math.cos(Math.PI * (x - k))) / 2;
      const v0 = knot(st.s, k);
      v += st.a * (v0 + (knot(st.s, k + 1) - v0) * u);
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
