// What every page shares: SPECULA's header band (the silk banner, no crest), the game's
// name as the host set it (or a plain default), and the theme.
import { h } from './dom.mjs';
import { get } from './net.mjs';

// Unnamed unless the host names the game: the header then shows only what the site is.
export const DEFAULT_NAME = '';
let game = null;
try { game = JSON.parse(sessionStorage.getItem('game') || 'null'); } catch { game = null; }
const names = new Set();

export const gameName = () => game?.name || DEFAULT_NAME;
export const pageTitle = () => gameName() || 'Paper Trading';
export const gameInfo = () => game;

/** Remember the game (from any server answer) and rename every header on the page. */
export function setGame(g) {
  if (!g) return;
  const changed = !game || game.name !== g.name;
  game = g;
  try { sessionStorage.setItem('game', JSON.stringify({ name: g.name })); } catch { /* private mode */ }
  if (!changed) return;
  for (const el of [...names]) { if (el.isConnected) { el.textContent = gameName(); el.hidden = !gameName(); } else names.delete(el); }
  document.title = pageTitle();
}

export async function refreshGame() {
  try { const r = await get('market'); if (r.ok) setGame(r.game); return r; } catch { return null; }
}

const NAV = [['', 'Home'], ['learn', 'How to Play'], ['desk', 'Team Desk']];

/** The header band. `active` is the route to underline. */
export function band(active, { nav = true, sub = 'Paper trading · live market' } = {}) {
  const name = h('span', { class: 'brand-name', text: gameName() });
  name.hidden = !gameName();
  names.add(name);
  document.title = pageTitle();
  return h('header', { class: 'band' }, h('div', { class: 'bar' },
    h('a', { class: 'brand', href: '#/' }, name, h('span', { class: 'sub', text: sub })),
    nav ? h('nav', { 'aria-label': 'Main' }, NAV.map(([r, label]) => h('a', { href: `#/${r}`, 'aria-current': r === active ? 'page' : null, text: label }))) : null));
}

export function setTheme(th) {
  document.documentElement.dataset.theme = th;
  try { localStorage.setItem('theme', th); } catch { /* fine */ }
  window.dispatchEvent(new Event('themechange'));
}

/** Night / Parchment switch. */
export function themeSwitch() {
  const seg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Appearance' },
    h('button', { type: 'button', 'data-th': 'dark', text: 'Night' }), h('button', { type: 'button', 'data-th': 'light', text: 'Parchment' }));
  const draw = () => { const cur = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'; for (const b of seg.children) b.setAttribute('aria-pressed', String(b.dataset.th === cur)); };
  seg.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { setTheme(b.dataset.th); draw(); } });
  draw();
  return seg;
}

/** Keep --desk-h equal to the sticky desk bar's height (the watchlist sits below it). */
export function trackDeskHeight(el) {
  const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--desk-h', `${el.offsetHeight}px`));
  ro.observe(el);
  return () => ro.disconnect();
}

/** mm:ss (or h:mm:ss) for a session countdown. */
export function fmtLeft(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const hh = Math.floor(s / 3600); const mm = Math.floor((s % 3600) / 60); const ss = s % 60;
  return hh ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${mm}:${String(ss).padStart(2, '0')}`;
}
