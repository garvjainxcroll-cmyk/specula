// Formatting: Indian rupees (₹10,00,000.00), signs, percentages, times.
const two = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const MINUS = '−';

/** ₹1,234.50 from paise. */
export const rs = (paise) => `${paise < 0 ? MINUS : ''}₹${two.format(Math.abs(paise) / 100)}`;
/** 1,234.50 (no symbol). */
export const amt = (paise) => `${paise < 0 ? MINUS : ''}${two.format(Math.abs(paise) / 100)}`;
/** +₹1,234.50 / −₹1,234.50 */
export const signedRs = (paise) => `${paise > 0 ? '+' : paise < 0 ? MINUS : ''}₹${two.format(Math.abs(paise) / 100)}`;
export const signedAmt = (paise) => `${paise > 0 ? '+' : paise < 0 ? MINUS : ''}${two.format(Math.abs(paise) / 100)}`;
/** +1.23% */
export const pct = (x, d = 2) => `${x > 0.00001 ? '+' : x < -0.00001 ? MINUS : ''}${Math.abs(x).toFixed(d)}%`;
export const qty = (n) => whole.format(n);
/** ₹12.35 L / ₹1.20 Cr / ₹9,500 */
export function compact(paise) {
  const r = Math.abs(paise) / 100; const s = paise < 0 ? MINUS : '';
  if (r >= 1e7) return `${s}₹${(r / 1e7).toFixed(2)} Cr`;
  if (r >= 1e5) return `${s}₹${(r / 1e5).toFixed(2)} L`;
  return `${s}₹${whole.format(r)}`;
}
/** 'up' | 'down' | 'flat' */
export const dir = (x) => (x > 0 ? 'up' : x < 0 ? 'down' : 'flat');
export const arrow = (x) => (x > 0 ? '▲' : x < 0 ? '▼' : '•');

const tf = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const tm = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
const df = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
export const clock = (w) => tf.format(new Date(w));
export const hm = (w) => tm.format(new Date(w));
/** A chart's time label: the clock time, with the date when it is not today. */
export const axisTime = (w) => (new Date(w).toDateString() === new Date().toDateString() ? hm(w) : df.format(new Date(w)));
export const when = (w) => df.format(new Date(w));
export function ago(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)}d ${h % 24}h`;
}
/** "30 min" / "2 h" / "1 h 30 min" for a loan deadline set in minutes. */
export function mins(n) {
  if (n < 1) return `${Math.round(n * 60)} s`;
  if (n < 60) return `${+n.toFixed(1)} min`;
  const h = Math.floor(n / 60); const m = Math.round(n % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}
export const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
