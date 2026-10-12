// Small DOM toolkit: h() builds elements, sheets, toasts, formatting and charts.
import { fmtCr, fmtRupees, fmtNum, fmtSigned, fmtPrice, fmtTerm, roundTo } from '../src/engine/num.mjs';
export { fmtCr, fmtRupees, fmtNum, fmtSigned, fmtPrice, fmtTerm };

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  append(el, kids);
  return el;
}
function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k === null || k === undefined || k === false) continue;
    el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}
export const frag = (...kids) => { const f = document.createDocumentFragment(); append(f, kids); return f; };
export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
export function mount(el, ...kids) { clear(el); append(el, kids); return el; }

/** A signed, coloured money amount in ₹ Cr. */
export function money(paise, { dp = 2, signed = true, exact = false } = {}) {
  const cls = paise > 0 ? 'num up' : paise < 0 ? 'num down' : 'num';
  return h('span', { class: cls, title: fmtRupees(paise, { signed }) }, exact ? fmtRupees(paise, { signed }) : fmtCr(paise, dp, { signed }));
}
export function pct(x, { dp = 2, signed = true } = {}) {
  const v = roundTo(x, dp);
  return h('span', { class: `num ${v > 0 ? 'up' : v < 0 ? 'down' : ''}` }, `${signed ? fmtSigned(v, dp) : fmtNum(v, dp)}%`);
}
export const arrow = (x) => (x > 0 ? '▲' : x < 0 ? '▼' : '•');
export const crStr = (paise, dp = 2) => fmtCr(paise, dp);
export const rs = (paise) => fmtRupees(paise);

// ---------- sheet (modal) ----------
let openSheets = [];
export function sheet(title, body, { eyebrow = null, onClose = null, wide = false } = {}) {
  const close = () => { scrim.remove(); openSheets = openSheets.filter((s) => s !== scrim); document.removeEventListener('keydown', esc); onClose && onClose(); };
  const esc = (e) => { if (e.key === 'Escape' && openSheets.at(-1) === scrim) close(); };
  const box = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, style: wide ? { maxWidth: '980px' } : null },
    h('div', { class: 'head' }, h('div', { style: { flex: 1 } }, eyebrow ? h('div', { class: 'eyebrow' }, eyebrow) : null, h('h3', {}, title)), h('button', { class: 'x', 'aria-label': 'Close', onclick: close }, '×')),
    typeof body === 'function' ? body(close) : body);
  const scrim = h('div', { class: 'scrim', onclick: (e) => { if (e.target === scrim) close(); } }, box);
  document.body.appendChild(scrim);
  openSheets.push(scrim);
  document.addEventListener('keydown', esc);
  setTimeout(() => box.querySelector('button, input, [tabindex]')?.focus(), 30);
  return { close, box };
}
export function closeAllSheets() { for (const s of [...openSheets]) s.querySelector('.x')?.click(); }

// ---------- toast ----------
export function toast(msg, kind = '', ms = 3800) {
  const wrap = document.getElementById('toasts');
  if (!wrap) return;
  const t = h('div', { class: `toast ${kind}` }, msg);
  wrap.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

// ---------- working blocks ----------
export function calc(...lines) { return lines.filter(Boolean).map((l) => h('div', { class: 'calc num' }, l)); }
export function steps(list) { return h('ol', { class: 'steps' }, list.filter(Boolean).map((s) => h('li', {}, s))); }
export function termTable(terms, { result, resultLabel = 'Result', unit = '%', dp = 2 } = {}) {
  return h('div', { class: 'working' },
    terms.map((t) => h('div', { class: 'line' }, h('span', { class: 'lbl' }, t.label), h('span', { class: 'expr num' }, t.expr ? `${t.expr} = ${fmtTerm(t.value, dp)}` : fmtTerm(t.value, dp)))),
    result !== undefined ? h('div', { class: 'line result' }, h('span', {}, resultLabel), h('span', { class: 'num' }, `${fmtNum(result, dp)}${unit}`)) : null);
}

// ---------- charts (plain SVG) ----------
const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => { const el = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, v); for (const k of kids.flat()) if (k) el.appendChild(typeof k === 'string' ? document.createTextNode(k) : k); return el; };
export const PALETTE = ['#d8b870', '#8fd3b4', '#f39a8c', '#9bb7e8', '#e3a6e0', '#f2c46b', '#a6d96a', '#c9b7a0', '#7fd1d8', '#ff9f5a', '#b39ddb', '#e0e0e0', '#ffcc80', '#80cbc4', '#ef9a9a', '#90caf9'];

/** Line chart. series: [{ name, values: [number|null], color }], labels: [x labels]. */
export function lineChart(series, labels, { height = 260, unit = '', yFmt = (v) => fmtNum(v, 1), markers = [] } = {}) {
  const W = 760; const H = height; const L = 48; const R = 12; const T = 12; const B = 28;
  const all = series.flatMap((x) => x.values).filter((v) => v !== null && Number.isFinite(v));
  let lo = Math.min(...all); let hi = Math.max(...all);
  if (!all.length) { lo = 0; hi = 1; }
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
  const n = labels.length;
  const x = (i) => L + (n <= 1 ? 0 : (i * (W - L - R)) / (n - 1));
  const y = (v) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img' });
  for (let k = 0; k <= 4; k++) {
    const v = lo + ((hi - lo) * k) / 4;
    svg.appendChild(s('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'grid' }));
    svg.appendChild(s('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end' }, `${yFmt(v)}${unit}`));
  }
  const step = Math.max(1, Math.ceil(n / 12));
  labels.forEach((lab, i) => { if (i % step === 0 || i === n - 1) svg.appendChild(s('text', { x: x(i), y: H - 8, 'text-anchor': 'middle' }, String(lab))); });
  for (const m of markers) svg.appendChild(s('line', { x1: x(m.i), x2: x(m.i), y1: T, y2: H - B, stroke: m.color || '#504434', 'stroke-dasharray': '3 3' }));
  if (lo < 0 && hi > 0) svg.appendChild(s('line', { x1: L, x2: W - R, y1: y(0), y2: y(0), class: 'axis' }));
  series.forEach((ser, k) => {
    const col = ser.color || PALETTE[k % PALETTE.length];
    let d = ''; let pen = false;
    ser.values.forEach((v, i) => { if (v === null || !Number.isFinite(v)) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; });
    svg.appendChild(s('path', { d, fill: 'none', stroke: col, 'stroke-width': ser.width || 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, s('title', {}, ser.name)));
  });
  const legend = h('div', { class: 'legend' }, series.map((ser, k) => h('span', {}, h('i', { style: { background: ser.color || PALETTE[k % PALETTE.length] } }), ser.name)));
  return h('div', {}, svg, series.length > 1 ? legend : null);
}

/** Dot plot of auction bids against fair value. */
export function bidChart(bids, fair) {
  const W = 760; const H = 60 + bids.length * 34; const L = 170; const R = 30;
  const prices = bids.map((b) => b.price).concat(fair);
  let lo = Math.min(...prices); let hi = Math.max(...prices); const pad = (hi - lo) * 0.15 || 1; lo -= pad; hi += pad;
  const x = (v) => L + ((v - lo) * (W - L - R)) / (hi - lo);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img' });
  svg.appendChild(s('line', { x1: x(fair), x2: x(fair), y1: 10, y2: H - 20, stroke: '#d8b870', 'stroke-width': 2 }));
  svg.appendChild(s('text', { x: x(fair), y: H - 4, 'text-anchor': 'middle' }, `fair value ${fmtPrice(fair)}`));
  bids.forEach((b, i) => {
    const yy = 30 + i * 34;
    svg.appendChild(s('text', { x: L - 10, y: yy + 4, 'text-anchor': 'end' }, b.name));
    svg.appendChild(s('circle', { cx: x(b.price), cy: yy, r: 7, fill: b.allotted ? (b.price > fair ? '#f39a8c' : '#8fd3b4') : 'none', stroke: '#d8b870', 'stroke-width': 2 }, s('title', {}, `${b.name}: bid ${fmtPrice(b.price)}`)));
  });
  return svg;
}

export function sparkline(values, { w = 90, h: hh = 26 } = {}) {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < 2) return null;
  const lo = Math.min(...v); const hi = Math.max(...v);
  const x = (i) => (i * w) / (v.length - 1);
  const y = (val) => (hi === lo ? hh / 2 : hh - 2 - ((val - lo) * (hh - 4)) / (hi - lo));
  const d = v.map((val, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(val).toFixed(1)}`).join('');
  return s('svg', { viewBox: `0 0 ${w} ${hh}`, width: w, height: hh, 'aria-hidden': 'true' }, s('path', { d, fill: 'none', stroke: v.at(-1) >= v[0] ? '#8fd3b4' : '#f39a8c', 'stroke-width': 1.6 }));
}

export function fmtClock(ms) {
  if (ms === null || ms === undefined) return '—';
  const s2 = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s2 / 60)}:${String(s2 % 60).padStart(2, '0')}`;
}

export function initials(name) { return String(name || '?').replace(/^@/, '').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(); }

export function postEl(p, delay = 0) {
  return h('div', { class: 'post', style: { animationDelay: `${delay}ms` } },
    h('div', { class: 'av' }, initials(p.name)),
    h('div', {}, h('div', { class: 'who' }, p.name, p.verified ? h('span', { class: 'tick', title: 'Official account' }, ' ✔') : null, h('span', { class: 'h' }, p.handle)), h('div', {}, p.text)));
}

export function store(key, value) {
  try { if (value === undefined) return JSON.parse(localStorage.getItem(key) || 'null'); localStorage.setItem(key, JSON.stringify(value)); } catch { return null; }
  return value;
}
export function sstore(key, value) {
  try { if (value === undefined) return JSON.parse(sessionStorage.getItem(key) || 'null'); sessionStorage.setItem(key, JSON.stringify(value)); } catch { return null; }
  return value;
}
