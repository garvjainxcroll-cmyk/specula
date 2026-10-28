// Artha Vyūha web app: routes, the header band, and the connection banners.
import { h, mount, avatar, fmt } from './ui.mjs';
import { net, onNet, detect, session, onSession, refreshMe } from './net.mjs';
import { applyPrefs, adoptAccount } from './prefs.mjs';

const ROUTES = {
  '': () => import('./views/home.mjs'),
  lobby: () => import('./views/lobby.mjs'),
  t: () => import('./views/table.mjs'),
  practice: () => import('./views/practice.mjs'),
  profile: () => import('./views/profile.mjs'),
  hand: () => import('./views/hand.mjs'),
  host: () => import('./views/host.mjs'),
  screen: () => import('./views/screen.mjs'),
  learn: () => import('./views/learn.mjs'),
};
const NAV = [['', 'Home'], ['lobby', 'Lobby'], ['practice', 'Practice'], ['learn', 'How to Play']];

let current = null;
let unmount = null;

export function routeParts() {
  const hsh = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = hsh.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  return { name: ROUTES[parts[0]] ? parts[0] : '', args: parts.slice(1), query: new URLSearchParams(query) };
}

export function band(active, { minimal = false } = {}) {
  const me = session.me;
  return h('header', { class: 'band no-print', 'data-active': active, 'data-minimal': minimal ? '1' : '0' }, h('div', { class: 'bar' },
    h('img', { class: 'crest', src: 'img/crest.png', alt: 'JACO CORP crest' }),
    h('a', { class: 'brand', href: '#/' }, 'Artha Vyūha', h('span', { class: 'sub' }, 'No-Limit Hold’em · JACO CORP')),
    minimal ? null : h('nav', { 'aria-label': 'Main' },
      NAV.map(([r, label]) => h('a', { href: `#/${r}`, 'aria-current': r === active ? 'page' : null }, label)),
      me
        ? h('a', { class: 'me', href: '#/profile', 'aria-current': active === 'profile' ? 'page' : null, title: 'Your profile and settings' }, avatar(me.avatar, { size: 'sm' }), h('span', {}, me.name), h('span', { class: 'num' }, fmt(me.bankroll)))
        : h('a', { href: '#/profile', 'aria-current': active === 'profile' ? 'page' : null }, 'Sign in'))));
}

function banners() {
  const el = document.getElementById('banner');
  const kids = [];
  if (!net.online) kids.push(h('div', { class: 'offline', role: 'status' }, 'Connection lost — reconnecting… Your seat and chips are safe on the server; the table catches up by itself.'));
  if (net.mode === 'single' && ['lobby', 't', 'host', 'screen'].includes(current)) kids.push(h('div', { class: 'single' }, 'Single device mode: this copy of the site has no live game server, so players cannot play together. Practice against bots still works. (Event Head: see DEPLOY.md, “It says Single device”.)'));
  mount(el, kids);
}

async function render() {
  const { name, args, query } = routeParts();
  if (unmount) { try { unmount(); } catch { /* ignore */ } unmount = null; }
  current = name;
  document.documentElement.dataset.theme = name === 'learn' ? (localStorage.getItem('artha-theme-learn') || 'dark') : 'dark';
  document.body.classList.toggle('screen-body', name === 'screen');
  const app = document.getElementById('app');
  try {
    const mod = await ROUTES[name]();
    if (current !== name) return;
    unmount = (await mod.default(app, { band, args, query })) || null;
  } catch (e) {
    console.error(e);
    mount(app, band(name), h('div', { class: 'narrow page' }, h('h2', {}, 'Something went wrong'), h('p', {}, String(e.message || e)), h('button', { class: 'btn', onclick: () => location.reload() }, 'Reload')));
  }
  banners();
  window.scrollTo(0, 0);
}

let lastMe = null;
onSession((s) => {
  if (s.me && (!lastMe || lastMe.id !== s.me.id)) adoptAccount(s.me);
  lastMe = s.me;
  const bandEl = document.querySelector('header.band');
  if (bandEl) bandEl.replaceWith(band(bandEl.dataset.active || '', { minimal: bandEl.dataset.minimal === '1' }));
});
window.addEventListener('hashchange', render);
onNet(banners);
applyPrefs();
detect().then(() => refreshMe());
render();
