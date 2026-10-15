// Small DOM helpers. Text from people (names, updates) always goes in as text, never HTML.
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v; // only ever our own markup (icons)
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  add(el, kids);
  return el;
}
function add(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k === null || k === undefined || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export function set(el, text) { if (el && el.textContent !== text) el.textContent = text; }
export function setClass(el, cls, on) { if (el) el.classList.toggle(cls, !!on); }
export function swap(el, ...kids) { el.replaceChildren(); add(el, kids); }

/** Set a number and flash it green/red when it moved. */
export function tickText(el, text, delta) {
  if (!el || el.textContent === text) return;
  el.textContent = text;
  if (delta) {
    el.classList.remove('tick-up', 'tick-down');
    void el.offsetWidth;
    el.classList.add(delta > 0 ? 'tick-up' : 'tick-down');
  }
}

// thin-line icons (24px grid, one stroke weight)
const P = {
  list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  pie: '<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>',
  news: '<path d="M4 5h13v14H6a2 2 0 0 1-2-2z"/><path d="M17 9h3v8a2 2 0 0 1-2 2"/><path d="M7.5 9h6M7.5 12.5h6M7.5 16h4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  chart: '<path d="M3 17l6-6 4 4 8-9"/><path d="M15 6h6v6"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 9h18M3 14h18M9 9v11"/>',
  coins: '<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v4c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M9 14v3c0 1.7 2.7 3 6 3s6-1.3 6-3v-4c0-1.6-2.4-2.9-5.5-3"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  out: '<path d="M14 4h5v16h-5"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
};
export const icon = (name) => h('span', { 'aria-hidden': 'true', style: { display: 'inline-flex' }, html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>` });

// ---------------- toasts ----------------
export function toast(msg, { title = '', kind = '', sticky = false, ms = 4200 } = {}) {
  const wrap = document.getElementById('toasts');
  const close = () => el.remove();
  const el = h('div', { class: `toast ${kind}` },
    h('div', { class: 't-body' }, title ? h('b', { text: title }) : null, h('span', { text: msg })),
    h('button', { type: 'button', 'aria-label': 'Dismiss', onclick: close, text: '×' }));
  wrap.append(el);
  while (wrap.children.length > 3) wrap.firstElementChild.remove();
  if (!sticky) setTimeout(close, ms);
  return close;
}

// ---------------- sheets (dialogs) ----------------
const openSheets = new Set();
/** Close every open window (when the page behind them is replaced). */
export function closeAllSheets() { for (const close of [...openSheets]) close(); }

export function sheet(title, body, { wide = false, sub = '', autofocus = true } = {}) {
  const prev = document.activeElement;
  const opened = performance.now();
  const close = () => { openSheets.delete(close); scrim.remove(); document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  // Escape closes only the sheet on top (a confirmation can sit on another sheet)
  const onKey = (e) => { if (e.key === 'Escape' && !e.defaultPrevented && scrim === [...document.querySelectorAll('.scrim')].at(-1)) { e.preventDefault(); close(); } };
  // a click landing in the first moments is the end of the tap that opened the window
  const scrim = h('div', { class: 'scrim', onclick: (e) => { if (e.target === scrim && performance.now() - opened > 400) close(); } },
    h('div', { class: `sheet${wide ? ' wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'sheet-head' },
        h('div', {}, h('h2', { text: title }), sub ? h('p', { class: 'muted small', text: sub, style: { margin: '4px 0 0' } }) : null),
        h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Close', onclick: close }, icon('x'))),
      body));
  document.body.append(scrim);
  openSheets.add(close);
  document.addEventListener('keydown', onKey);
  const target = (autofocus && scrim.querySelector('input, select, textarea')) || scrim.querySelector('button');
  target?.focus({ preventScroll: true });
  close.scrim = scrim;
  return close;
}

export function confirmBox(title, text, okLabel = 'Confirm', danger = false) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; close(); resolve(v); } };
    const close = sheet(title, h('div', {},
      h('p', { text }),
      h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '16px' } },
        h('button', { class: 'btn ghost', type: 'button', onclick: () => finish(false), text: 'Cancel' }),
        h('button', { class: `btn${danger ? ' danger' : ''}`, type: 'button', onclick: () => finish(true), text: okLabel }))));
    const obs = new MutationObserver(() => { if (!close.scrim.isConnected) { obs.disconnect(); finish(false); } });
    obs.observe(document.body, { childList: true });
  });
}

/** Download text as a file (CSV). */
export function download(name, text, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob(['﻿', text], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
/** One CSV cell. Text that a spreadsheet would run as a formula (= + - @ …) gets a leading ' so it stays text. */
export const csvCell = (v) => {
  let s = String(v ?? '');
  if (typeof v !== 'number' && /^[=+\-@\t\r|%]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
