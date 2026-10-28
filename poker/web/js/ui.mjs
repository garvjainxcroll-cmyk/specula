// Small DOM toolkit: h() builds elements; sheets (dialogs), toasts, number formatting,
// thin-line icons and avatars (JACO CORP: single-weight gold line, no emoji).

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'value') el.value = v;
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
export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
export function mount(el, ...kids) { clear(el); append(el, kids); return el; }

const NS = 'http://www.w3.org/2000/svg';
export function svg(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, v);
  for (const k of kids.flat()) if (k) el.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
  return el;
}

// ---------- numbers ----------
export const fmt = (n) => (n === null || n === undefined || Number.isNaN(n) ? '—' : Math.round(n).toLocaleString('en-IN'));
export const fmtSigned = (n) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '0');
export function chips(n, { signed = false } = {}) {
  const cls = signed ? (n > 0 ? 'num up' : n < 0 ? 'num down' : 'num') : 'num';
  return h('span', { class: cls }, signed ? fmtSigned(n) : fmt(n));
}
export function fmtClock(ms) {
  if (ms === null || ms === undefined) return '—';
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`;
}
export const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd']; const v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
export const ago = (t, now = Date.now()) => { const m = Math.round((now - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };

// ---------- storage (per-browser conveniences only) ----------
export function store(key, value) {
  try {
    if (value === undefined) return JSON.parse(localStorage.getItem(key) || 'null');
    if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value));
  } catch { return null; }
  return value;
}
export function sstore(key, value) {
  try {
    if (value === undefined) return JSON.parse(sessionStorage.getItem(key) || 'null');
    if (value === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, JSON.stringify(value));
  } catch { return null; }
  return value;
}

// ---------- sheet (dialog) ----------
let open = [];
export function sheet(title, body, { eyebrow = null, onClose = null, wide = false } = {}) {
  const close = () => { scrim.remove(); open = open.filter((s) => s !== scrim); document.removeEventListener('keydown', esc); onClose && onClose(); };
  const esc = (e) => { if (e.key === 'Escape' && open.at(-1) === scrim) close(); };
  const box = h('div', { class: `sheet${wide ? ' wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'head' }, h('div', { style: { flex: 1 } }, eyebrow ? h('div', { class: 'eyebrow' }, eyebrow) : null, h('h3', {}, title)), h('button', { class: 'x', 'aria-label': 'Close', onclick: close }, '×')),
    typeof body === 'function' ? body(close) : body);
  const scrim = h('div', { class: 'scrim', onclick: (e) => { if (e.target === scrim) close(); } }, box);
  document.body.appendChild(scrim);
  open.push(scrim);
  document.addEventListener('keydown', esc);
  setTimeout(() => box.querySelector('input, select, button.btn, [tabindex]')?.focus(), 30);
  return { close, box };
}
export function closeAllSheets() { for (const s of [...open]) s.querySelector('.x')?.click(); }
export function confirmSheet(title, text, yes = 'Yes', no = 'Cancel') {
  return new Promise((resolve) => {
    let done = false;
    sheet(title, (close) => h('div', { class: 'stack' }, h('p', {}, text), h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: () => { done = true; close(); resolve(true); } }, yes),
      h('button', { class: 'btn ghost', onclick: () => { close(); } }, no))), { onClose: () => { if (!done) resolve(false); } });
  });
}

// ---------- toast ----------
export function toast(msg, kind = '', ms = 3600) {
  const wrap = document.getElementById('toasts');
  if (!wrap) return;
  const t = h('div', { class: `toast ${kind}` }, msg);
  wrap.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

// ---------- icons (thin gold line) ----------
const ICONS = {
  sound: 'M4 9v6h4l5 4V5L8 9H4z M16 9a4 4 0 0 1 0 6 M18.5 6.5a7.5 7.5 0 0 1 0 11',
  mute: 'M4 9v6h4l5 4V5L8 9H4z M16 9l5 6 M21 9l-5 6',
  layout: 'M3 5h18v14H3z M15 5v14',
  gear: 'M12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M4.9 4.9l2.1 2.1 M17 17l2.1 2.1 M4.9 19.1L7 17 M17 7l2.1-2.1',
  exit: 'M10 4H4v16h6 M14 8l4 4-4 4 M8 12h10',
  history: 'M4 12a8 8 0 1 0 2.4-5.7 M4 4v4h4 M12 8v4l3 2',
  screen: 'M3 4h18v12H3z M8 20h8 M12 16v4',
  play: 'M6 4l13 8-13 8z',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M2 20a7 7 0 0 1 14 0 M16 4.5a3.5 3.5 0 0 1 0 6.5 M18 14a6 6 0 0 1 4 6',
  lock: 'M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  trophy: 'M7 4h10v5a5 5 0 0 1-10 0z M7 6H4a3 3 0 0 0 3 4 M17 6h3a3 3 0 0 1-3 4 M12 14v4 M8 21h8 M9 18h6',
  target: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z M12 11.5v1',
  duel: 'M5 19L19 5 M15 5h4v4 M19 19L5 5 M9 5H5v4',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z M4 19V5 M8 7h7',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  chart: 'M4 20V10 M10 20V4 M16 20v-7 M22 20H2',
  pause: 'M8 5v14 M16 5v14',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7 M20 5v6h-6',
  plus: 'M12 5v14 M5 12h14',
};
export function icon(name, cls = '') {
  return svg('svg', { viewBox: '0 0 24 24', class: cls, 'aria-hidden': 'true' }, svg('path', { d: ICONS[name] || ICONS.target }));
}

// ---------- avatars: twelve thin-line glyphs on a crest-coloured disc ----------
const GLYPHS = {
  eagle: ['M3 9l5 1 4-5 4 5 5-1-3 6-6 4-6-4z', 'M12 5v3'],
  globe: ['M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z', 'M3 12h18', 'M12 3c-3 3-3 15 0 18 M12 3c3 3 3 15 0 18'],
  crown: ['M3 8l4 4 5-7 5 7 4-4-2 10H5z', 'M5 21h14'],
  key: ['M8 8a4 4 0 1 1 0 .1z', 'M11 11l9 9 M16 16l2-2 M18 18l2-2'],
  anchor: ['M12 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4z', 'M12 7v14 M8 10h8', 'M4 14a8 8 0 0 0 16 0'],
  star: ['M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z'],
  compass: ['M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z', 'M15.5 8.5L13 13l-4.5 2.5L11 11z'],
  tower: ['M6 21V8h12v13', 'M6 8V4h2v2h2V4h4v2h2V4h2v4', 'M10 21v-5h4v5'],
  laurel: ['M12 21c-6-3-8-9-6-15', 'M12 21c6-3 8-9 6-15', 'M6 9l-2-1 M5 13l-2 0 M7 17l-2 1 M18 9l2-1 M19 13l2 0 M17 17l2 1'],
  owl: ['M5 9c0-4 3-6 7-6s7 2 7 6v6c0 3-3 6-7 6s-7-3-7-6z', 'M9 11a2 2 0 1 1 0 .1z M15 11a2 2 0 1 1 0 .1z', 'M11 14l1 1.5 1-1.5'],
  sun: ['M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10z', 'M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 M17.5 17.5L19 19 M5 19l1.5-1.5 M17.5 6.5L19 5'],
  wave: ['M3 8c3-2 6 2 9 0s6 2 9 0', 'M3 13c3-2 6 2 9 0s6 2 9 0', 'M3 18c3-2 6 2 9 0s6 2 9 0'],
  bot: ['M6 8h12v10H6z', 'M12 4v4 M10 4h4', 'M9 12h.1 M15 12h.1', 'M9 15h6'],
};
export const AVATAR_GLYPHS = Object.keys(GLYPHS).filter((g) => g !== 'bot');
export const AVATAR_TONES = ['gold', 'sheen', 'bronze', 'emblem'];
export function avatar(a, { size = '', bot = false, title = null } = {}) {
  const glyph = bot ? 'bot' : (GLYPHS[a?.glyph] ? a.glyph : 'eagle');
  const tone = bot ? 'emblem' : (AVATAR_TONES.includes(a?.tone) ? a.tone : 'gold');
  return h('span', { class: `av t-${tone} ${size}`, title, 'aria-hidden': title ? null : 'true' },
    svg('svg', { viewBox: '0 0 24 24', class: 'g' }, ...GLYPHS[glyph].map((d) => svg('path', { d }))));
}
export const initials = (name) => String(name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

/** A seg control: options [[value,label]], current, onPick. */
export function seg(options, current, onPick) {
  const el = h('div', { class: 'seg', role: 'group' });
  const draw = (cur) => mount(el, options.map(([v, l]) => h('button', { type: 'button', class: v === cur ? 'on' : '', 'aria-pressed': v === cur ? 'true' : 'false', onclick: () => { draw(v); onPick(v); } }, l)));
  draw(current);
  return el;
}
