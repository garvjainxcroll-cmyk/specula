// Number helpers. Every rounding rule in SPECULA lives here, so the shown working
// and the engine always agree.
//
// Conventions
//  - Rates, growth, inflation and returns are plain percentages (4.25 means 4.25%).
//  - Money is held as whole paise (₹1 = 100 paise, ₹1 Cr = 1e9 paise) in ordinary
//    Numbers. Every multiplication of money by a rate goes through BigInt so the
//    result is exact to the paisa.
//  - Rounding is "half away from zero" at the stated number of decimals.

const EPS = 1e-9;

export function roundTo(x, dp) {
  if (!Number.isFinite(x)) throw new Error(`roundTo: not a finite number (${x})`);
  const f = 10 ** dp;
  const y = Math.abs(x) * f;
  // EPS guards against binary artefacts such as 1.005 * 100 = 100.49999999999999
  const r = Math.round(y + EPS * Math.max(1, y)) / f;
  const out = x < 0 ? -r : r;
  return out === 0 ? 0 : out; // no negative zero
}
export const r1 = (x) => roundTo(x, 1);
export const r2 = (x) => roundTo(x, 2);
export const r3 = (x) => roundTo(x, 3);
export const r4 = (x) => roundTo(x, 4);
export const r6 = (x) => roundTo(x, 6);

/** Round to the nearest 0.25, halves upward (4.375 -> 4.50, 4.125 -> 4.25). */
export function roundQuarter(x) {
  const q = Math.floor(x * 4 + 0.5 + EPS) / 4;
  return q === 0 ? 0 : q;
}

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// ---------- money ----------
export const PAISE_PER_CR = 1e9;
export const crToPaise = (cr) => Math.round(cr * 1e9);
export const paiseToCr = (p) => p / 1e9;

function bigRoundDiv(num, den) {
  // num, den BigInt; den > 0. Round half away from zero.
  if (den < 0n) { num = -num; den = -den; }
  const neg = num < 0n;
  const a = neg ? -num : num;
  const q = a / den;
  const rem = a - q * den;
  const out = rem * 2n >= den ? q + 1n : q;
  return neg ? -out : out;
}

/** paise × pct% exactly, e.g. mulPct(1e11, 1.25) = 1.25% of ₹100 Cr. pct may have up to 4 dp. */
export function mulPct(paise, pct) {
  const p = BigInt(Math.round(paise));
  const scaled = BigInt(Math.round(roundTo(pct, 4) * 1e4)); // pct × 10^4
  return Number(bigRoundDiv(p * scaled, 1000000n)); // /100 for percent, /10^4 for scale
}

/** paise × (newPrice - oldPrice) / oldPrice exactly. Prices with up to 6 dp. */
export function mulRatioChange(paise, oldPrice, newPrice) {
  const p = BigInt(Math.round(paise));
  const a = BigInt(Math.round(roundTo(oldPrice, 6) * 1e6));
  const b = BigInt(Math.round(roundTo(newPrice, 6) * 1e6));
  if (a === 0n) throw new Error('mulRatioChange: zero price');
  return Number(bigRoundDiv(p * (b - a), a));
}

/** paise × (points) / 100 exactly — used for rate futures and default protection. */
export function mulPoints(paise, points) {
  const p = BigInt(Math.round(paise));
  const s = BigInt(Math.round(roundTo(points, 4) * 1e4));
  return Number(bigRoundDiv(p * s, 1000000n));
}

/** paise × num/den with exact rounding (all integers). */
export function mulFrac(paise, num, den) {
  return Number(bigRoundDiv(BigInt(Math.round(paise)) * BigInt(num), BigInt(den)));
}

export const sum = (arr) => arr.reduce((a, b) => a + b, 0);

/** Sum of numbers that are each already rounded to dp, cleaned of float dust. */
export const sumRound = (arr, dp = 2) => roundTo(sum(arr), dp);

// ---------- formatting (shared by engine working text and the web app) ----------
export function fmtNum(x, dp = 2) {
  const v = roundTo(x, dp);
  const s = Math.abs(v).toFixed(dp);
  return (v < 0 ? '−' : '') + s;
}
export function fmtSigned(x, dp = 2) {
  const v = roundTo(x, dp);
  return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(dp);
}
/** Formats inside an expression: negative numbers in brackets, e.g. (−0.80). */
export function fmtTerm(x, dp = 2) {
  const v = roundTo(x, dp);
  return v < 0 ? `(−${Math.abs(v).toFixed(dp)})` : v.toFixed(dp);
}
export const fmtPct = (x, dp = 2) => `${fmtNum(x, dp)}%`;

/** Indian digit grouping: 12,34,56,789.00 */
export function groupIndian(intStr) {
  if (intStr.length <= 3) return intStr;
  const last3 = intStr.slice(-3);
  let rest = intStr.slice(0, -3);
  const parts = [];
  while (rest.length > 2) { parts.unshift(rest.slice(-2)); rest = rest.slice(0, -2); }
  if (rest) parts.unshift(rest);
  return parts.join(',') + ',' + last3;
}

/** ₹ Cr with dp decimals, e.g. fmtCr(1.5e12) = "₹1,500.00 Cr". */
export function fmtCr(paise, dp = 2, { signed = false } = {}) {
  const cr = roundTo(paise / 1e9, dp);
  const [i, d] = Math.abs(cr).toFixed(dp).split('.');
  const sign = cr < 0 ? '−' : signed && cr > 0 ? '+' : '';
  return `${sign}₹${groupIndian(i)}${d ? '.' + d : ''} Cr`;
}

/** Exact rupees and paise, e.g. "₹4,12,00,000.00". */
export function fmtRupees(paise, { signed = false } = {}) {
  const p = Math.round(paise);
  const neg = p < 0;
  const a = Math.abs(p);
  const rupees = Math.floor(a / 100);
  const ps = String(a % 100).padStart(2, '0');
  const sign = neg ? '−' : signed && p > 0 ? '+' : '';
  return `${sign}₹${groupIndian(String(rupees))}.${ps}`;
}

/** A price in rupees with sensible decimals. */
export function fmtPrice(x) {
  const v = Math.abs(x);
  const dp = v >= 1000 ? 2 : v >= 10 ? 2 : 4;
  const [i, d] = roundTo(x, dp).toFixed(dp).split('.');
  const neg = i.startsWith('-');
  return `${neg ? '−' : ''}₹${groupIndian(neg ? i.slice(1) : i)}.${d}`;
}
