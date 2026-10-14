// Price history on this device: fetched once per range for all ten stocks, then every
// live price from the server is added to the end, so the charts move in real time.
import { get } from './net.mjs';

const SPANS = { '5m': [300e3, 2e3], '30m': [1800e3, 10e3], '1h': [3600e3, 20e3], '1d': [86400e3, 480e3] };
const data = {};
const pending = {};
let game = null;

export function ensure(range) {
  if (data[range]) return Promise.resolve(data[range]);
  pending[range] ||= get(`history?t=all&r=${range}`).then((r) => {
    delete pending[range];
    if (!r.ok) return null;
    if (game !== null && r.g !== game) { for (const k of Object.keys(data)) delete data[k]; }
    game = r.g;
    data[range] = { xs: r.xs, ws: r.ws, p: r.p };
    return data[range];
  }).catch(() => { delete pending[range]; return null; });
  return pending[range];
}
export const series = (range) => data[range] || null;

/** Add the latest prices (mk from the server) to every loaded range. */
export function tick(mk, now) {
  if (game !== null && mk.g !== game) { for (const k of Object.keys(data)) delete data[k]; game = mk.g; return true; }
  for (const [range, s] of Object.entries(data)) {
    const [span, step] = SPANS[range];
    const n = s.xs.length;
    const prevX = n > 1 ? s.xs[n - 2] : -Infinity;
    if (mk.m < s.xs[n - 1]) continue;
    if (mk.m - prevX < step) {
      s.xs[n - 1] = mk.m; s.ws[n - 1] = now;
      for (const t of Object.keys(s.p)) s.p[t][n - 1] = mk.p[t];
    } else {
      s.xs.push(mk.m); s.ws.push(now);
      for (const t of Object.keys(s.p)) s.p[t].push(mk.p[t]);
    }
    const cut = mk.m - span;
    let k = 0;
    while (k < s.xs.length - 2 && s.xs[k + 1] <= cut) k++;
    if (k) { s.xs.splice(0, k); s.ws.splice(0, k); for (const t of Object.keys(s.p)) s.p[t].splice(0, k); }
  }
  return false;
}
