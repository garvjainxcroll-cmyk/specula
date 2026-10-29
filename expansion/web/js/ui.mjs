// Small DOM toolkit for the console: elements, modals, toasts, tables, form fields.
// All text is inserted as text (never as HTML), so names typed into the system cannot
// inject markup.
import { fmtMoney, fmtCompact, fmtPct, fmtNum, toMinor } from '../engine/money.mjs';
export { fmtMoney, fmtCompact, fmtPct, fmtNum, toMinor };

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  add(el, kids);
  return el;
}
function add(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k === null || k === undefined || k === false) continue;
    el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}
export function mount(el, ...kids) { while (el.firstChild) el.removeChild(el.firstChild); add(el, kids); return el; }
export const frag = (...kids) => { const f = document.createDocumentFragment(); add(f, kids); return f; };

// ---------- formatting bound to the session's currency ----------
let CUR = { code: 'INR', symbol: '₹', minor: 100, grouping: 'indian' };
export const setCurrency = (c) => { if (c) CUR = c; };
export const currency = () => CUR;
export const m = (x) => fmtMoney(x, CUR);
export const mc = (x) => fmtCompact(x, CUR);
export const major = (x) => (x === null || x === undefined ? '' : x / (CUR.minor || 100));
export function moneyEl(x, { compact = false } = {}) {
  return h('span', { class: `num${x < 0 ? ' neg' : ''}`, title: fmtMoney(x, CUR, { decimals: 2 }) }, compact ? mc(x) : m(x));
}
export const pct = (x, dp = 1) => fmtPct(x, dp);

// ---------- toasts ----------
export function toast(msg, tone = '', ms = 4200) {
  const wrap = document.getElementById('toasts');
  if (!wrap) return;
  const t = h('div', { class: `toast ${tone}` }, msg);
  wrap.appendChild(t);
  while (wrap.children.length > 3) wrap.firstChild.remove();
  setTimeout(() => t.remove(), ms);
}

// ---------- modal ----------
let openModals = [];
export function modal(title, body, { wide = false, actions = null, onClose = null, eyebrow = null } = {}) {
  const close = () => { scrim.remove(); openModals = openModals.filter((x) => x !== scrim); document.removeEventListener('keydown', esc); onClose && onClose(); };
  const esc = (e) => { if (e.key === 'Escape' && openModals.at(-1) === scrim) close(); };
  const box = h('div', { class: `modal${wide ? ' wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'mh' }, h('div', { style: { flex: '1' } }, eyebrow ? h('div', { class: 'eyebrow' }, eyebrow) : null, h('h2', {}, title)), h('button', { class: 'x', 'aria-label': 'Close', onclick: close }, '×')),
    h('div', { class: 'mb' }, typeof body === 'function' ? body(close) : body),
    actions ? h('div', { class: 'mf' }, typeof actions === 'function' ? actions(close) : actions) : null);
  const scrim = h('div', { class: 'scrim', onmousedown: (e) => { if (e.target === scrim) close(); } }, box);
  document.body.appendChild(scrim);
  openModals.push(scrim);
  document.addEventListener('keydown', esc);
  setTimeout(() => box.querySelector('input, select, textarea, .mf button')?.focus(), 20);
  return { close, box };
}
export function closeModals() { for (const s of [...openModals]) s.querySelector('.x')?.click(); }

/**
 * Ask before an irreversible or material action.
 * opts: { message, confirmLabel, danger, typed (exact text to type), reason ('required'|'optional'),
 *         reasonLabel, ack (a checkbox label that must be ticked), details (Node) }
 * Resolves to { reason } or null when cancelled.
 */
export function confirmDialog(title, opts = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const reason = opts.reason ? h('textarea', { placeholder: opts.reasonPlaceholder || 'Write the reason (it is recorded in the audit log)', 'aria-label': 'Reason' }) : null;
    const typed = opts.typed ? h('input', { type: 'text', 'aria-label': `Type ${opts.typed}`, autocomplete: 'off' }) : null;
    const ack = opts.ack ? h('input', { type: 'checkbox' }) : null;
    const go = h('button', { class: `btn ${opts.danger ? 'danger' : 'primary'}` }, opts.confirmLabel || 'Confirm');
    const check = () => {
      const ok = (!typed || typed.value === opts.typed) && (!ack || ack.checked) && (opts.reason !== 'required' || (reason.value.trim().length >= 5));
      go.disabled = !ok;
    };
    for (const el of [reason, typed, ack]) el?.addEventListener('input', check);
    ack?.addEventListener('change', check);
    const { close } = modal(title, [
      opts.message ? (opts.message instanceof Node ? opts.message : h('p', {}, opts.message)) : null,
      opts.details || null,
      ack ? h('label', { class: 'check' }, ack, opts.ack) : null,
      reason ? h('label', { class: 'field' }, `${opts.reasonLabel || 'Reason'}${opts.reason === 'required' ? ' (required)' : ' (optional)'}`, reason) : null,
      typed ? h('label', { class: 'field' }, `Type ${opts.typed} to confirm`, typed) : null,
    ], {
      actions: (cl) => [h('button', { class: 'btn', onclick: () => { cl(); } }, 'Cancel'), go],
      onClose: () => finish(null),
    });
    go.addEventListener('click', () => { const v = { reason: reason ? reason.value.trim() : undefined }; finish(v); close(); });
    check();
  });
}

// ---------- form fields ----------
export function field(label, input, help = null) { return h('label', { class: 'field' }, h('span', {}, label), input, help ? h('span', { class: 'help' }, help) : null); }
export function num(value, { min = null, max = null, step = 'any', disabled = false } = {}) {
  return h('input', { type: 'number', value: value ?? '', min, max, step, disabled });
}
export function text(value, { placeholder = '', disabled = false, max = 300 } = {}) { return h('input', { type: 'text', value: value ?? '', placeholder, disabled, maxlength: max }); }
export function area(value, { disabled = false, rows = 3 } = {}) { return h('textarea', { rows, disabled }, value ?? ''); }
export function select(options, value, { disabled = false, empty = null } = {}) {
  const s = h('select', { disabled });
  if (empty !== null) s.appendChild(h('option', { value: '' }, empty));
  for (const o of options) {
    const [v, l] = Array.isArray(o) ? o : [o.value, o.label];
    s.appendChild(h('option', { value: v }, l));
  }
  s.value = value ?? '';
  return s;
}
export function check(label, value, { disabled = false } = {}) { const i = h('input', { type: 'checkbox', checked: !!value, disabled }); return { el: h('label', { class: 'check' }, i, label), input: i }; }
/** Money typed in major units (₹) → minor units (paise). getValue() returns NaN if invalid. */
export function moneyInput(minorValue, { disabled = false, allowEmpty = false } = {}) {
  const i = h('input', { type: 'number', step: '0.01', min: 0, value: minorValue === null || minorValue === undefined ? '' : minorValue / (CUR.minor || 100), disabled });
  const el = h('span', { class: 'money-in' }, h('span', {}, CUR.symbol || CUR.code), i);
  el.getValue = () => { if (allowEmpty && i.value === '') return null; const v = toMinor(i.value, CUR.minor || 100); return Number.isFinite(v) ? v : NaN; };
  el.input = i;
  return el;
}
export const numVal = (inp) => (inp.value === '' ? NaN : Number(inp.value));

// ---------- status pills ----------
export const pill = (label, tone = 'neutral') => h('span', { class: `pill ${tone}` }, label);
export const STATUS_TONE = { compliant: 'good', waived: 'info', na: 'neutral', pending: 'warn', review: 'warn', unassessed: 'neutral', noncompliant: 'bad' };

// ---------- tabs ----------
export function tabs(list, active, onChange) {
  return h('div', { class: 'tabs', role: 'tablist' }, list.map((t) => h('button', { class: t.id === active ? 'on' : '', role: 'tab', 'aria-selected': t.id === active ? 'true' : 'false', onclick: () => onChange(t.id) }, t.label)));
}

// ---------- tables ----------
/**
 * columns: [{ key, label, get(row) → sortable value, render(row) → node|text, num, wrap, sort:false }]
 * opts: { search: true, searchText(row), filters: [{ label, options, get(row) }], onRow(row), selected(row), foot: [cells], empty, id }
 */
const tableState = new Map();
export function table(columns, rows, opts = {}) {
  const st = tableState.get(opts.id) || { q: '', sort: null, dir: 1, f: {} };
  if (opts.id) tableState.set(opts.id, st);
  const wrap = h('div', {});
  const draw = () => {
    let list = rows;
    if (st.q) { const q = st.q.toLowerCase(); list = list.filter((r) => (opts.searchText ? opts.searchText(r) : columns.map((c) => String(c.get ? c.get(r) : r[c.key] ?? '')).join(' ')).toLowerCase().includes(q)); }
    for (const [i, f] of (opts.filters || []).entries()) { const v = st.f[i]; if (v) list = list.filter((r) => String(f.get(r)) === v); }
    if (st.sort !== null) {
      const c = columns[st.sort];
      const g = c.get || ((r) => r[c.key]);
      list = [...list].sort((a, b) => { const x = g(a); const y = g(b); return (x === y ? 0 : x === null || x === undefined ? 1 : y === null || y === undefined ? -1 : x < y ? -1 : 1) * st.dir; });
    }
    const bar = (opts.search !== false || (opts.filters || []).length) ? h('div', { class: 'tbar' },
      opts.search !== false ? h('input', { type: 'search', placeholder: opts.placeholder || 'Search…', value: st.q, 'aria-label': 'Search the table', oninput: (e) => { st.q = e.target.value; draw(); const s = wrap.querySelector('input[type=search]'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }) : null,
      (opts.filters || []).map((f, i) => select(f.options, st.f[i] || '', { empty: f.label })).map((s, i) => { s.addEventListener('change', () => { st.f[i] = s.value; draw(); }); return s; }),
      h('span', { class: 'muted small' }, `${list.length} of ${rows.length}`), opts.tools || null) : null;
    const thead = h('thead', {}, h('tr', {}, columns.map((c, i) => h('th', { class: `${c.num ? 'num' : ''}${c.sort === false ? '' : ' sortable'}`, scope: 'col', onclick: c.sort === false ? null : () => { if (st.sort === i) st.dir = -st.dir; else { st.sort = i; st.dir = 1; } draw(); } }, c.label, st.sort === i ? (st.dir > 0 ? ' ▲' : ' ▼') : ''))));
    const tbody = h('tbody', {}, list.length ? list.map((r) => h('tr', { class: `${opts.onRow ? 'click' : ''}${opts.selected && opts.selected(r) ? ' sel' : ''}`, onclick: opts.onRow ? (e) => { if (!e.target.closest('button, input, select, a, textarea')) opts.onRow(r); } : null }, columns.map((c) => {
      const v = c.render ? c.render(r) : c.get ? c.get(r) : r[c.key];
      return h('td', { class: `${c.num ? 'num' : ''}${c.wrap ? ' wrap' : ''}` }, v instanceof Node ? v : v === null || v === undefined ? '' : String(v));
    }))) : h('tr', {}, h('td', { colspan: columns.length, class: 'empty' }, opts.empty || 'Nothing to show.')));
    const tfoot = opts.foot ? h('tfoot', {}, h('tr', {}, opts.foot.map((f, i) => h('td', { class: columns[i]?.num ? 'num' : '' }, f instanceof Node ? f : f ?? '')))) : null;
    mount(wrap, bar, h('div', { class: 'tablewrap' }, h('table', { class: 't' }, thead, tbody, tfoot)));
  };
  draw();
  return wrap;
}

// ---------- validation issues ----------
export function issuesList(issues, { onGo = null, empty = 'No issues.', limit = 8 } = {}) {
  if (!issues.length) return h('div', { class: 'note good' }, empty);
  const order = { blocking: 0, warning: 1 };
  const sorted = [...issues].sort((a, b) => order[a.severity] - order[b.severity]);
  const row = (i) => h('div', { class: `issue ${i.severity}` },
    h('div', {}, h('div', { class: 'sev' }, i.severity === 'blocking' ? 'Blocking' : 'Warning'), h('div', { class: 'code' }, i.code)),
    h('div', {}, h('div', { class: 'strong small' }, i.title), h('div', {}, i.message)),
    onGo && i.ref ? h('button', { class: 'btn sm', onclick: () => onGo(i.ref) }, 'Go to record') : h('span', {}));
  const box = h('div', { class: 'issues' }, sorted.slice(0, limit).map(row));
  if (sorted.length > limit) {
    const more = h('button', { class: 'btn sm', onclick: () => { more.remove(); for (const i of sorted.slice(limit)) box.appendChild(row(i)); } }, `Show all ${sorted.length} (${sorted.filter((i) => i.severity === 'blocking').length} blocking)`);
    box.appendChild(more);
  }
  return box;
}

export function kv(pairs) {
  return h('div', { class: 'kv' }, pairs.filter(Boolean).map(([k, v]) => h('div', {}, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v instanceof Node ? v : v ?? '—'))));
}
export function stat(label, value, sub = null) { return h('div', { class: 'stat' }, h('div', { class: 'label' }, label), h('div', { class: 'value' }, value), sub ? h('div', { class: 'sub' }, sub) : null); }
export function card(title, body, { tools = null, cls = '' } = {}) {
  return h('section', { class: `card ${cls}` }, title ? h('div', { class: 'head' }, typeof title === 'string' ? h('h2', {}, title) : title, h('div', { class: 'grow' }), tools) : null, body);
}
export const when = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
