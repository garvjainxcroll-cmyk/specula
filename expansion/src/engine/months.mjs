// The financial evaluation period, counted in whole calendar months.
// Month 1 is the first month of the period. Dates are handled as plain 'YYYY-MM' text,
// never with the clock, so the engine stays deterministic.

const NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function parseYm(s) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const y = Number(m[1]); const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return { y, mo };
}

/** 1-based month of the period for 'YYYY-MM' (can be ≤ 0 or > months when outside). */
export function monthIndex(period, ym) {
  const p = parseYm(ym);
  if (!p) return null;
  return (p.y - period.startYear) * 12 + (p.mo - period.startMonth) + 1;
}

/** 'YYYY-MM' of the period's month k (1-based). */
export function ymOf(period, k) {
  const z = period.startYear * 12 + (period.startMonth - 1) + (k - 1);
  const y = Math.floor(z / 12); const mo = (z % 12) + 1;
  return `${y}-${String(mo).padStart(2, '0')}`;
}

export function monthLabel(period, k) {
  const z = period.startYear * 12 + (period.startMonth - 1) + (k - 1);
  return `${NAMES[z % 12]} ${Math.floor(z / 12)}`;
}

export function ymLabel(ym) {
  const p = parseYm(ym);
  return p ? `${NAMES[p.mo - 1]} ${p.y}` : String(ym || '');
}

export function periodLabel(period) {
  return `${monthLabel(period, 1)} – ${monthLabel(period, period.months)} (${period.months} months)`;
}

export const range = (a, b) => { const out = []; for (let i = a; i <= b; i++) out.push(i); return out; };
