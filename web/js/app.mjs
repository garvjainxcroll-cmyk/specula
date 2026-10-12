// SPECULA web app: routes and the header band.
import { h, mount, store } from './ui.mjs';
import { net, detect, subscribe } from './net.mjs';

const ROUTES = {
  '': () => import('./views/home.mjs'),
  learn: () => import('./views/learn.mjs'),
  practice: () => import('./views/practice.mjs'),
  desk: () => import('./views/desk.mjs'),
  display: () => import('./views/display.mjs'),
  admin: () => import('./views/admin.mjs'),
};
const NAV = [['', 'Home'], ['learn', 'How to Play'], ['practice', 'Practice'], ['desk', 'Team Desk']];

let current = null;
let unmount = null;

function routeName() {
  const hsh = location.hash.replace(/^#\/?/, '');
  const name = hsh.split(/[/?]/)[0];
  return ROUTES[name] ? name : '';
}

export function band(active, { minimal = false } = {}) {
  return h('header', { class: 'band no-print' }, h('div', { class: 'bar' },
    h('img', { class: 'crest', src: 'img/crest.png', alt: 'JACO CORP crest' }),
    h('a', { class: 'brand', href: '#/' }, 'SPECULA', h('span', { class: 'sub' }, 'Copia et Inopia · Round 3')),
    minimal ? null : h('nav', { 'aria-label': 'Main' }, NAV.map(([r, label]) => h('a', { href: `#/${r}`, 'aria-current': r === active ? 'page' : null }, label)))));
}

function banners() {
  const el = document.getElementById('banner');
  const kids = [];
  if (!net.online) kids.push(h('div', { class: 'offline' }, 'Connection lost — reconnecting… Your desk will catch up by itself; nothing you saved is lost.'));
  if (net.mode === 'single' && ['desk', 'display', 'admin'].includes(current)) kids.push(h('div', { class: 'single' }, 'Single device mode: the live game server is not running on this copy of the site, so funds cannot trade together. How to Play and Practice still work. (Event Head: see DEPLOY.md, “It says Single device”.)'));
  mount(el, kids);
}

async function render() {
  const name = routeName();
  if (unmount) { try { unmount(); } catch { /* ignore */ } unmount = null; }
  current = name;
  const theme = name === 'learn' ? (store('specula-theme-learn') || 'light') : (store('specula-theme') || 'dark');
  document.documentElement.dataset.theme = theme;
  document.body.className = name === 'display' ? 'display-body' : '';
  const app = document.getElementById('app');
  try {
    const mod = await ROUTES[name]();
    if (current !== name) return;
    unmount = (await mod.default(app, { band, route: location.hash })) || null;
  } catch (e) {
    console.error(e);
    mount(app, band(name), h('div', { class: 'narrow', style: { padding: '40px 16px' } }, h('h2', {}, 'Something went wrong'), h('p', {}, String(e.message || e)), h('button', { class: 'btn', onclick: () => location.reload() }, 'Reload')));
  }
  banners();
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', render);
subscribe(banners);
detect();
render();
