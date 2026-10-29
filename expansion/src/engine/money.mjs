// Money and number helpers for the Round 4 engine.
//
// Conventions
//  - Money is held as whole minor units (paise when the currency is the rupee: ₹1 = 100)
//    in ordinary integer Numbers. Every money line is rounded once, to the minor unit,
//    "half away from zero". Totals are sums of rounded lines, so every total reconciles
//    exactly with the lines it is made of.
//  - Percentages are plain numbers (12.5 means 12.5%). Multipliers are plain numbers
//    (1.15 means ×1.15). Scores are 0–100.
//  - Nothing here reads the clock or draws random numbers: the same inputs always give
//    the same outputs.

export function roundTo(x, dp = 0) {
  if (!Number.isFinite(x)) throw new Error(`roundTo: not a finite number (${x})`);
  const f = 10 ** dp;
  const y = Math.abs(x) * f;
  // a nudge the size of floating-point error, so that 2.675 × 100 = 267.49999… still
  // rounds to 268 without moving any genuine value
  const r = Math.round(y + Math.max(y * 8 * Number.EPSILON, 1e-12)) / f;
  const out = x < 0 ? -r : r;
  return out === 0 ? 0 : out;
}
export const r1 = (x) => roundTo(x, 1);
export const r2 = (x) => roundTo(x, 2);
export const r4 = (x) => roundTo(x, 4);
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const sum = (arr) => arr.reduce((a, b) => a + b, 0);

/** A money amount in minor units, rounded half away from zero. */
export const money = (x) => roundTo(x, 0);

/** Major units (rupees) typed by a person → minor units (paise). */
export function toMinor(major, minor = 100) {
  const n = typeof major === 'string' ? Number(major.replace(/[,\s₹]/g, '')) : Number(major);
  if (!Number.isFinite(n)) return NaN;
  return roundTo(n * minor, 0);
}
export const toMajor = (m, minor = 100) => m / minor;

/** Is this a valid, non-negative whole money amount? */
export const isMoney = (m) => Number.isInteger(m) && m >= 0;

/**
 * Split an integer total into integer parts in proportion to weights (largest remainder).
 * Ties in the remainder go to the earlier item, so the split is always the same.
 * If every weight is zero the total is split equally.
 */
export function allocate(total, weights) {
  const n = weights.length;
  if (!n) return [];
  let w = weights.map((x) => Math.max(0, x));
  let wsum = sum(w);
  if (wsum <= 0) { w = weights.map(() => 1); wsum = n; }
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const raw = w.map((x) => (abs * x) / wsum);
  const base = raw.map((x) => Math.floor(x + 1e-9));
  let left = abs - sum(base);
  const order = raw.map((x, i) => ({ i, rem: x - base[i] })).sort((a, b) => (b.rem - a.rem) || (a.i - b.i));
  for (let k = 0; left > 0 && k < order.length; k++, left--) base[order[k].i] += 1;
  return base.map((x) => (x === 0 ? 0 : sign * x));
}

/** Safe ratio: null when the denominator is zero, negative or missing (shown as "n/a"). */
export function ratio(num, den, { allowNegativeDen = false } = {}) {
  if (!Number.isFinite(num) || !Number.isFinite(den)) return null;
  if (den === 0 || (!allowNegativeDen && den < 0)) return null;
  return num / den;
}

// ---------------- formatting ----------------

export function groupIndian(intStr) {
  if (intStr.length <= 3) return intStr;
  const last3 = intStr.slice(-3);
  let rest = intStr.slice(0, -3);
  const parts = [];
  while (rest.length > 2) { parts.unshift(rest.slice(-2)); rest = rest.slice(0, -2); }
  if (rest) parts.unshift(rest);
  return `${parts.join(',')},${last3}`;
}
export function groupWestern(intStr) {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export const DEFAULT_CURRENCY = Object.freeze({ code: 'INR', symbol: '₹', minor: 100, grouping: 'indian', name: 'Indian rupee' });

/** Full amount, e.g. ₹12,50,000 (or ₹12,50,000.50 with decimals). */
export function fmtMoney(minorAmount, cur = DEFAULT_CURRENCY, { decimals = 0, signed = false, symbol = true } = {}) {
  if (minorAmount === null || minorAmount === undefined || !Number.isFinite(minorAmount)) return 'n/a';
  const major = roundTo(minorAmount / (cur.minor || 100), decimals);
  const neg = major < 0;
  const [i, d] = Math.abs(major).toFixed(decimals).split('.');
  const g = cur.grouping === 'indian' ? groupIndian(i) : groupWestern(i);
  const sign = neg ? '−' : signed && major > 0 ? '+' : '';
  const sym = symbol ? (cur.symbol || cur.code || '') : '';
  const spacer = sym && /[A-Za-z]$/.test(sym) ? ' ' : '';
  return `${sign}${sym}${spacer}${g}${d ? `.${d}` : ''}`;
}

/** Short amount for charts and summaries: ₹1.25 Cr, ₹12.5 L (Indian) or $1.25M (western). */
export function fmtCompact(minorAmount, cur = DEFAULT_CURRENCY, { signed = false } = {}) {
  if (minorAmount === null || minorAmount === undefined || !Number.isFinite(minorAmount)) return 'n/a';
  const major = minorAmount / (cur.minor || 100);
  const a = Math.abs(major);
  const neg = major < 0;
  const sign = neg ? '−' : signed && major > 0 ? '+' : '';
  const sym = cur.symbol || cur.code || '';
  const spacer = sym && /[A-Za-z]$/.test(sym) ? ' ' : '';
  let body;
  if (cur.grouping === 'indian') {
    if (a >= 1e7) body = `${roundTo(a / 1e7, 2).toFixed(2)} Cr`;
    else if (a >= 1e5) body = `${roundTo(a / 1e5, 2).toFixed(2)} L`;
    else body = groupIndian(String(roundTo(a, 0)));
  } else if (a >= 1e9) body = `${roundTo(a / 1e9, 2).toFixed(2)}B`;
  else if (a >= 1e6) body = `${roundTo(a / 1e6, 2).toFixed(2)}M`;
  else if (a >= 1e3) body = `${roundTo(a / 1e3, 1).toFixed(1)}K`;
  else body = String(roundTo(a, 0));
  return `${sign}${sym}${spacer}${body}`;
}

export function fmtPct(x, dp = 1, { signed = false } = {}) {
  if (x === null || x === undefined || !Number.isFinite(x)) return 'n/a';
  const v = roundTo(x, dp);
  const sign = v < 0 ? '−' : signed && v > 0 ? '+' : '';
  return `${sign}${Math.abs(v).toFixed(dp)}%`;
}
export function fmtNum(x, dp = 2) {
  if (x === null || x === undefined || !Number.isFinite(x)) return 'n/a';
  const v = roundTo(x, dp);
  return `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(dp)}`;
}
export const fmtMult = (x, dp = 3) => (x === null || x === undefined ? 'n/a' : `×${fmtNum(x, dp)}`);

/** Format a value by its kind (used by calculation traces). */
export function fmtKind(value, kind, cur = DEFAULT_CURRENCY) {
  if (value === null || value === undefined) return 'n/a';
  if (typeof value === 'string') return value;
  switch (kind) {
    case 'money': return fmtMoney(value, cur);
    case 'pct': return fmtPct(value, 2);
    case 'mult': return fmtMult(value, 4);
    case 'score': return fmtNum(value, 1);
    case 'months': return `${fmtNum(value, 2)} months`;
    case 'int': return String(value);
    case 'factor': return fmtNum(value, 4);
    default: return fmtNum(value, 4);
  }
}
