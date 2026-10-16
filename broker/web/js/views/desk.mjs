// The Team Desk (#/desk): join with the team code, then the broker desk — watchlist,
// stock pages with buy and sell, the team's portfolio, the host's updates and notices
// about loans. A desk only ever receives its own team's account from the server.
import { h, set, swap, tickText, icon, toast, sheet, closeAllSheets } from '../dom.mjs';
import { rs, amt, signedRs, pct, qty, dir, arrow, clock, hm, axisTime, when, ago, mins, initials } from '../fmt.mjs';
import { get, post, net, token, setToken, loop, onNet, newRid } from '../net.mjs';
import { STOCKS, BY_T, START_CASH } from '../../src/stocks.mjs';
import { ensure, series, tick } from '../series.mjs';
import { lineChart, spark } from '../chart.mjs';
import { band, setGame, themeSwitch, trackDeskHeight, fmtLeft } from '../site.mjs';

const S = { mk: null, me: null, game: null, place: null, updates: [], uv: -1, now: 0, first: true };
const subs = new Set();
const wide = matchMedia('(min-width: 1000px)');
let root; let poller = null; let shell = null; let pane = null; let lastStock = 'AURI';
let chartRange = '30m';
const cleanups = [];

const store = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); localStorage.setItem(k, JSON.stringify(v)); } catch { return null; } return v; };
const changePct = (t) => (S.mk ? ((S.mk.p[t] - S.mk.o[t]) / S.mk.o[t]) * 100 : 0);
const pad = (n) => String(n).padStart(2, '0');
const ord = (n) => `${n}${[, 'st', 'nd', 'rd'][(n % 100 >> 3 ^ 1) && n % 10] || 'th'}`;
const canTrade = () => S.game?.phase === 'live' && S.mk?.open;

export default function desk(app) {
  root = app;
  if (!token('team')) renderJoin();
  else renderShell();
  return () => { poller?.stop(); for (const fn of cleanups) fn(); };
}

// ======================= join =======================

function renderJoin(msg = '') {
  poller?.stop(); poller = null; shell = null;
  const code = h('input', { type: 'text', name: 'code', class: 'code-input', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', maxlength: '8', placeholder: 'K7QX4P', 'aria-label': 'Team code', required: true });
  const name = h('input', { type: 'text', name: 'name', autocomplete: 'given-name', maxlength: '40', placeholder: 'Your name', required: true });
  const phone = h('input', { type: 'tel', name: 'phone', autocomplete: 'tel', maxlength: '20', placeholder: 'Optional' });
  const err = h('p', { class: 'form-error', role: 'alert', text: msg });
  const go = h('button', { class: 'btn block lg', type: 'submit', text: 'Join the team' });
  const form = h('form', { novalidate: true },
    h('label', { class: 'field' }, h('span', { text: 'Team code (from the host; keep it private)' }), code),
    h('label', { class: 'field' }, h('span', { text: 'Your name' }), name),
    h('label', { class: 'field' }, h('span', { text: 'Phone number (optional; only the host sees it)' }), phone),
    err, go);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    go.disabled = true; set(err, '');
    try {
      const r = await post('join', { code: code.value, name: name.value, phone: phone.value });
      if (!r.ok) { set(err, r.error || 'Could not join. Please try again.'); return; }
      setToken('team', r.token);
      setGame(r.game);
      if (!location.hash.startsWith('#/desk')) location.hash = '#/desk';
      renderShell();
      toast(`You are on ${r.team}’s desk. Any member’s order is the team’s order.`, { title: 'Joined' });
    } catch (x) {
      set(err, x.message === 'no-server' ? 'The live server is not running on this website. Ask the host (see DEPLOY.md).' : 'Could not reach the server. Check the Wi-Fi and try again.');
    } finally { go.disabled = false; }
  });
  swap(root, band('desk'), h('main', { class: 'narrow join-page' },
    h('p', { class: 'eyebrow', text: 'Team Desk' }), h('h1', { text: 'Join your team', style: { margin: '6px 0 10px' } }),
    h('p', { class: 'lead', text: 'Every member of your team can sign in on their own device. You all see the same desk, and any member’s trade is the team’s trade.' }),
    h('div', { class: 'card' }, form),
    h('p', { class: 'small muted', style: { marginTop: '16px' } }, 'New here? ', h('a', { href: '#/learn', text: 'Read How to Play' }), ' first.')));
  code.focus();
}

function leave(msg = '') {
  setToken('team', '');
  gen += 1; orderSeq = ++seq; lostOrders.clear(); // answers already on their way are for the desk being left
  closeAllSheets(); closeTicket = null; pop?.remove(); pop = null; clearNoticeToasts();
  poller?.stop(); poller = null;
  pane?.destroy?.(); pane = null; subs.clear(); shown = null;
  Object.assign(S, { mk: null, me: null, game: null, place: null, updates: [], uv: -1, now: 0, first: true, prev: null });
  if (location.hash !== '#/desk') history.replaceState(null, '', '#/desk');
  renderJoin(msg);
}

// ======================= the desk shell =======================

function renderShell() {
  const nav = h('nav', { class: 'top-nav', 'aria-label': 'Desk' },
    navLink('#/desk', 'Watchlist', 'home'), navLink('#/desk/portfolio', 'Portfolio', 'portfolio'), navLink('#/desk/updates', 'Updates', 'updates'));
  const bell = h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Notices', onclick: () => toggleNotices() }, icon('bell'));
  const avatar = h('a', { class: 'avatar', href: '#/desk/team', 'aria-label': 'Your team', text: '·' });
  const who = h('div', { class: 'who' }, h('b', { text: '' }), h('span', { text: '' }));
  const teamName = h('b', { text: '…' });
  const mkt = h('span', { class: 'mkt' }, h('i'), h('b', { text: 'Connecting…' }));
  const clk = h('div', { class: 'clock', hidden: true, 'aria-label': 'Time left in this session' });
  const top = h('div', { class: 'desk-top' }, h('div', { class: 'inner' },
    h('div', { class: 'who-team' }, h('span', { class: 'eyebrow', text: 'Team Desk' }), teamName), mkt, clk, nav, h('div', { class: 'top-r' }, who, bell, avatar)));
  const tapeTrack = h('div', { class: 'tape-track' });
  const tape = h('div', { class: 'tape', 'aria-hidden': 'true' }, tapeTrack);
  const tapeItems = [];
  for (let k = 0; k < 2; k++) for (const s of STOCKS) {
    const px = h('span', { class: 'num' }); const ch = h('span', { class: 'num' });
    tapeItems.push({ t: s.t, px, ch });
    tapeTrack.append(h('a', { class: 'tape-item', href: `#/desk/s/${s.t}`, tabindex: '-1' }, h('span', { class: 'tk', text: s.t }), px, ch));
  }
  const head = h('div', { class: 'desk-head' }, top, tape);
  const wl = h('aside', { class: 'wl', 'aria-label': 'Watchlist' });
  const paneEl = h('section', { class: 'pane' });
  const layout = h('main', { class: 'layout' }, wl, paneEl);
  const tabbar = h('nav', { class: 'tabbar', 'aria-label': 'Desk' },
    tabLink('#/desk', 'Watchlist', 'list', 'home'), tabLink('#/desk/portfolio', 'Portfolio', 'pie', 'portfolio'),
    tabLink('#/desk/updates', 'Updates', 'news', 'updates'), tabLink('#/desk/team', 'Team', 'user', 'team'));
  const banner = h('div', { class: 'no-print' });
  swap(root, h('div', { class: 'app desk' }, band('desk'), head, banner, layout, tabbar));
  const watch = Watchlist(wl);
  shell = { top, nav, tabbar, bell, avatar, who, teamName, mkt, clk, layout, paneEl, watch, tapeItems, banner };
  cleanups.push(trackDeskHeight(head));
  const t = setInterval(drawClock, 500); cleanups.push(() => clearInterval(t));
  onNet(() => drawBanner());
  window.addEventListener('hashchange', onRoute);
  wide.addEventListener('change', onRoute);
  cleanups.push(() => { window.removeEventListener('hashchange', onRoute); wide.removeEventListener('change', onRoute); });
  ensure('30m').then(() => publish());
  poller = loop(poll, 1500, 8000);
  onRoute();
}

function navLink(href, label, key) { return h('a', { href, 'data-key': key }, label, h('span', { class: 'badge', hidden: true, 'data-badge': key })); }
function tabLink(href, label, ic, key) { return h('a', { href, 'data-key': key }, icon(ic), label, h('span', { class: 'badge', hidden: true, 'data-badge': key })); }

function drawClock() {
  if (!shell || !S.game) return;
  const g = S.game;
  const running = g.phase === 'live' && S.mk?.open && g.endsAt;
  shell.clk.hidden = !running;
  if (running) {
    const left = g.endsAt - net.now();
    set(shell.clk, fmtLeft(left));
    shell.clk.className = `clock${left < 60000 ? ' closing' : ''}`;
  }
}

function drawBanner() {
  if (!shell) return;
  const bars = [];
  const g = S.game;
  if (!net.online) bars.push(h('div', { class: 'bar off', text: 'Connection lost. Reconnecting… Prices on screen may be out of date.' }));
  else if (g?.phase === 'lobby') bars.push(h('div', { class: 'bar closed', text: 'The game has not started yet. Prices are paused; orders open when the host starts the game.' }));
  else if (g?.phase === 'ended') bars.push(h('div', { class: 'bar closed', text: S.place ? `The game is over. Your team finished ${ord(S.place.rank)} of ${S.place.of}.` : 'The game is over. The market is closed; the host will reveal the results.' }));
  else if (S.mk && !S.mk.open) bars.push(h('div', { class: 'bar closed', text: 'The market is closed. Prices are paused; orders open when the host opens the market.' }));
  swap(shell.banner, bars);
}

let seq = 0; let orderSeq = 0;
let gen = 0; // goes up each time the desk is left
let closeTicket = null; // the open order ticket, if any
// Orders whose answer was lost, by stock, side and quantity: pressing the same order again
// (in this ticket or a new one) sends the same id, so the server never places it twice.
const lostOrders = new Map();
const LOST_KEEP_MS = 10 * 60000;
async function poll() {
  const my = ++seq;
  const r = await get(`poll?uv=${S.uv}`, token('team'));
  if (my < orderSeq) return; // this answer left before an order's result arrived (or before the desk was left)
  if (r.status === 401) { leave('Your desk was signed out: the host gave your team a new code, signed you out, or removed the team. Join again with your team’s code (ask the host if it changed).'); return; }
  if (!r.ok) return;
  apply(r);
}

function apply(r) {
  if (S.mk && r.mk.g !== S.mk.g) { shown = null; S.updates = []; S.uv = -1; S.first = true; clearNoticeToasts(); }
  const prev = S.mk;
  S.mk = r.mk; S.me = r.me; S.now = r.now;
  if (r.game) { S.game = r.game; setGame(r.game); }
  if ('place' in r) S.place = r.place;
  if (r.updates) {
    const before = new Set(S.updates.map((u) => u.id));
    const fresh = S.uv >= 0 ? r.updates.filter((u) => !before.has(u.id)) : [];
    S.updates = r.updates; S.uv = r.uv;
    if (!S.first) for (const u of fresh) if (route().view !== 'updates') toast(u.text.length > 120 ? `${u.text.slice(0, 120)}…` : u.text, { title: `Update ${pad(u.n)} from the host`, ms: 9000 });
  }
  if (tick(r.mk, r.now)) { ensure('30m').then(publish); if (chartRange !== '30m') ensure(chartRange).then(publish); }
  checkNotices();
  S.first = false;
  S.prev = prev;
  publish();
}

function publish() {
  if (!shell || !S.mk || !S.me) return;
  const { mk, me, game } = S;
  const phase = game?.phase;
  shell.mkt.className = `mkt ${phase === 'lobby' ? 'lobby' : phase === 'ended' ? 'ended' : mk.open ? 'open' : 'closed'}`;
  set(shell.mkt.lastChild, phase === 'lobby' ? 'Waiting to start' : phase === 'ended' ? 'Game over' : mk.open ? 'Market open' : 'Market closed');
  set(shell.teamName, me.name);
  set(shell.who.firstChild, rs(me.sum.liq));
  set(shell.who.lastChild, 'liquidable money');
  set(shell.avatar, initials(me.member?.name || me.name));
  for (const x of shell.tapeItems) {
    set(x.px, amt(mk.p[x.t]));
    const c = changePct(x.t);
    set(x.ch, `${arrow(c)} ${pct(c)}`); x.ch.className = `num ${dir(c)}`;
  }
  const nUp = unseenUpdates();
  for (const b of root.querySelectorAll('[data-badge="updates"]')) { b.hidden = !nUp; set(b, String(nUp)); }
  const nN = unreadNotices().length;
  let bb = shell.bell.querySelector('.badge');
  if (nN && !bb) shell.bell.append(bb = h('span', { class: 'badge' }));
  if (bb) { if (nN) set(bb, String(nN)); else bb.remove(); }
  for (const b of root.querySelectorAll('[data-badge="team"]')) { b.hidden = !nN; set(b, String(nN)); }
  drawBanner(); drawClock();
  shell.watch.update();
  for (const fn of subs) fn();
}

// ======================= routing (#/desk/…) =======================

function route() {
  const [, a, b] = location.hash.replace(/^#\/?/, '').split('/');
  if (a === 's' && BY_T[b]) return { view: 'stock', t: b };
  if (['portfolio', 'updates', 'team'].includes(a)) return { view: a };
  return { view: 'home' };
}

function onRoute() {
  if (!shell) return;
  const r = route();
  const key = r.view === 'stock' ? 'home' : r.view;
  for (const a of [...shell.nav.children, ...shell.tabbar.children]) {
    if (a.dataset.key === key) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  const showWl = r.view === 'home' && !wide.matches;
  shell.layout.classList.toggle('show-wl', showWl);
  let next = r;
  if (r.view === 'home') next = { view: 'stock', t: lastStock };
  if (r.view === 'stock') lastStock = r.t;
  shell.watch.select(next.view === 'stock' && (wide.matches || r.view === 'stock') ? next.t : null);
  const sig = `${next.view}:${next.t || ''}`;
  if (pane?.sig === sig) return;
  pane?.destroy?.();
  subs.clear();
  shell.paneEl.replaceChildren();
  const make = { stock: () => StockView(shell.paneEl, next.t), portfolio: () => PortfolioView(shell.paneEl), updates: () => UpdatesView(shell.paneEl), team: () => TeamView(shell.paneEl) }[next.view];
  pane = make() || {};
  pane.sig = sig;
  if (!showWl) window.scrollTo(0, 0);
  if (S.mk && S.me) for (const fn of subs) fn();
}

// ======================= watchlist =======================

function Watchlist(el) {
  const refs = {};
  const search = h('input', { type: 'search', placeholder: 'Search the ten stocks', 'aria-label': 'Search stocks' });
  const list = h('ul', { class: 'wl-list' });
  for (const s of STOCKS) {
    const px = h('span', { class: 'px num' }); const ch = h('span', { class: 'ch' }); const held = h('span', { class: 'held' });
    const c = h('canvas', { class: 'spark', 'aria-hidden': 'true' });
    const a = h('a', { class: 'wl-row', href: `#/desk/s/${s.t}` },
      h('div', { class: 'wl-id' }, h('span', { class: 'tk', text: s.t }), h('span', { class: 'nm', text: s.name }), held), c,
      h('div', { class: 'wl-px' }, px, ch));
    const li = h('li', { 'data-t': s.t }, a);
    refs[s.t] = { li, a, px, ch, c, held };
    list.append(li);
  }
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    for (const s of STOCKS) refs[s.t].li.hidden = !!q && !`${s.t} ${s.name} ${s.sector}`.toLowerCase().includes(q);
  });
  el.append(h('div', { class: 'wl-head' },
    h('div', { class: 'row between' }, h('h2', { class: 'eyebrow', text: 'Watchlist' }), h('span', { class: 'muted tiny', text: '10 stocks · since open' })),
    search), list);
  return {
    select(t) { for (const s of STOCKS) { if (s.t === t) refs[s.t].a.setAttribute('aria-current', 'true'); else refs[s.t].a.removeAttribute('aria-current'); } },
    update() {
      if (!S.mk) return;
      const sp = series('30m');
      const holdings = Object.fromEntries((S.me?.h || []).map((x) => [x.t, x.q]));
      for (const s of STOCKS) {
        const r = refs[s.t]; const p = S.mk.p[s.t];
        tickText(r.px, amt(p), S.prev ? p - S.prev.p[s.t] : 0);
        const c = changePct(s.t);
        set(r.ch, `${arrow(c)} ${pct(c)}`); r.ch.className = `ch ${dir(c)}`;
        set(r.held, holdings[s.t] ? `${qty(holdings[s.t])} held` : '');
        if (sp) spark(r.c, sp.p[s.t], dir(sp.p[s.t].at(-1) - sp.p[s.t][0]));
      }
    },
  };
}

// ======================= one stock =======================

function StockView(el, t) {
  const st = BY_T[t];
  const big = h('span', { class: 'big num' });
  const chg = h('span', { class: 'chg num' });
  const box = h('div', { class: 'chart-box' });
  const ranges = h('div', { class: 'seg', role: 'tablist', 'aria-label': 'Chart range' },
    ['5m', '30m', '1h', '1d'].map((r) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(r === chartRange), 'data-r': r, text: r.toUpperCase() })));
  const stat = (label) => { const dd = h('dd', { class: 'num' }); return [h('div', {}, h('dt', { text: label }), dd), dd]; };
  const [sOpen, dOpen] = stat('Open'); const [sHi, dHi] = stat('High'); const [sLo, dLo] = stat('Low'); const [sCh, dCh] = stat('Change');
  const pos = h('div');
  const buyB = h('button', { class: 'btn lg', type: 'button', onclick: () => openTicket(t, 'buy'), text: 'Buy' });
  const sellB = h('button', { class: 'btn sell lg', type: 'button', onclick: () => openTicket(t, 'sell'), text: 'Sell' });
  el.append(h('article', { class: 'sd' },
    h('a', { class: 'back', href: '#/desk' }, icon('back'), 'Watchlist'),
    h('div', { class: 'sd-head' },
      h('div', {}, h('p', { class: 'eyebrow', text: `${t} · ${st.sector}` }), h('h1', { text: st.name, style: { marginTop: '6px' } })),
      h('div', { class: 'sd-price' }, big, chg)),
    h('div', { class: 'chart-tools' }, ranges, h('span', { class: 'muted tiny', text: 'Live · tap or hover the chart to read it' })),
    box,
    h('dl', { class: 'stats' }, sOpen, sHi, sLo, sCh),
    h('section', { class: 'card quiet tight' }, h('h3', { text: 'Your team’s position', style: { marginBottom: '10px' } }), pos),
    h('div', { class: 'trade-bar sticky' }, buyB, sellB)));
  const chart = lineChart(box, { fmtY: (v, full) => (full ? rs(v) : amt(v)), fmtX: axisTime, fmtTip: clock });
  ranges.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    chartRange = b.dataset.r;
    for (const x of ranges.children) x.setAttribute('aria-selected', String(x === b));
    box.classList.add('loading');
    ensure(chartRange).then(() => { box.classList.remove('loading'); draw(); });
  });
  box.classList.add('loading');
  ensure(chartRange).then(() => { box.classList.remove('loading'); draw(); });
  let posSig = '';
  function draw() {
    if (!S.mk || !S.me) return;
    const p = S.mk.p[t]; const o = S.mk.o[t];
    tickText(big, rs(p), S.prev ? p - S.prev.p[t] : 0);
    set(chg, `${arrow(p - o)} ${signedRs(p - o)} (${pct(((p - o) / o) * 100)}) since open`); chg.className = `chg num ${dir(p - o)}`;
    set(dOpen, rs(o));
    const s = series(chartRange);
    if (s) {
      const ys = s.p[t];
      set(dHi, rs(Math.max(...ys))); set(dLo, rs(Math.min(...ys)));
      const c = ys.at(-1) - ys[0];
      set(dCh, `${signedRs(c)} (${pct((c / ys[0]) * 100)})`); dCh.className = `num ${dir(c)}`;
      sHi.firstChild.textContent = `High · ${chartRange.toUpperCase()}`; sLo.firstChild.textContent = `Low · ${chartRange.toUpperCase()}`; sCh.firstChild.textContent = `Change · ${chartRange.toUpperCase()}`;
      chart.set({ xs: s.xs, ws: s.ws, ys, ref: o, refLabel: `Open ${amt(o)}`, tone: dir(c), live: S.mk.open, label: `${st.name} price, last ${rs(p)}` });
    }
    const hd = S.me.h.find((x) => x.t === t);
    sellB.disabled = !hd;
    const sig = hd ? `${hd.q}:${hd.cost}:${p}` : `none:${S.me.cash}`;
    if (sig !== posSig) {
      posSig = sig;
      if (!hd) swap(pos, h('p', { class: 'muted', style: { margin: 0 }, text: `Your team does not hold ${t}. Cash available: ${rs(S.me.cash)}.` }));
      else {
        const val = hd.q * p; const pl = val - hd.cost;
        const kv = (label, v, cls = '') => h('div', { class: 'kpi' }, h('dt', { text: label }), h('dd', { class: `num ${cls}`, text: v }));
        swap(pos, h('dl', { class: 'position', style: { margin: 0 } },
          kv('Shares', qty(hd.q)), kv('Average price', rs(Math.round(hd.cost / hd.q))), kv('Value now', rs(val)),
          kv('Profit / loss', `${arrow(pl)} ${signedRs(pl)} (${pct((pl / hd.cost) * 100)})`, dir(pl))));
      }
    }
  }
  subs.add(draw);
  return { destroy: () => chart.destroy() };
}

// ======================= order ticket =======================

function openTicket(t, side0) {
  if (!S.mk || !S.me || closeTicket) return; // one ticket at a time
  let side = side0;
  const st = BY_T[t];
  const sideSeg = h('div', { class: 'seg full', role: 'radiogroup', 'aria-label': 'Buy or sell' },
    h('button', { type: 'button', class: 'buy', 'data-side': 'buy', text: 'Buy' }), h('button', { type: 'button', class: 'sell', 'data-side': 'sell', text: 'Sell' }));
  const pxEl = h('span', { class: 'px num' });
  const input = h('input', { type: 'number', inputmode: 'numeric', min: '1', step: '1', value: '1', 'aria-label': 'Quantity' });
  const minus = h('button', { type: 'button', 'aria-label': 'One less', text: '−' });
  const plus = h('button', { type: 'button', 'aria-label': 'One more', text: '+' });
  const quick = h('div', { class: 'quick' });
  const dValue = h('dd'); const dAvail = h('dd'); const dAfter = h('dd'); const dHeld = h('dd');
  const tAvail = h('dt'); const tAfter = h('dt');
  const err = h('p', { class: 'form-error', role: 'alert' });
  const go = h('button', { class: 'btn block lg', type: 'submit' });
  const form = h('form', { class: 'ticket', novalidate: true },
    sideSeg,
    h('div', { class: 'ticket-px', style: { marginTop: '16px' } }, h('span', { class: 'muted', text: 'Market price · live' }), pxEl),
    h('label', { class: 'field' }, h('span', { text: 'Quantity (shares)' }), h('div', { class: 'qty' }, minus, input, plus)),
    quick,
    h('dl', { class: 'lines' },
      h('div', { class: 'total' }, h('dt', { text: 'Order value' }), dValue),
      h('div', {}, tAvail, dAvail), h('div', {}, tAfter, dAfter), h('div', {}, h('dt', { text: `${t} your team holds` }), dHeld)),
    err, go,
    h('p', { class: 'tiny muted', style: { margin: '10px 0 0' }, text: 'A market order for your team: it fills at the live price the moment it reaches the market. No brokerage is charged.' }));
  const q = () => Math.max(0, Math.floor(Number(input.value) || 0));
  let inFlight = false;
  // Buy stays off for a moment, so the second tap of a double tap cannot place an order
  let settling = true; setTimeout(() => { settling = false; if (form.isConnected) draw(); }, 500);
  const lostFor = (n) => { const x = lostOrders.get(`${t}:${side}:${n}`); return x && Date.now() - x.at < LOST_KEEP_MS ? x : null; };
  const LOST_MSG = 'No answer came for this order. Press the button again to make sure: if the first press went through, it is not placed twice.';
  function maxQ() {
    if (!S.mk || !S.me) return 0;
    const p = S.mk.p[t];
    if (side === 'buy') return Math.max(0, Math.floor(S.me.cash / p));
    return S.me.h.find((x) => x.t === t)?.q || 0;
  }
  function drawQuick() {
    swap(quick, [25, 50, 75, 100].map((f) => h('button', { type: 'button', text: f === 100 ? (side === 'buy' ? 'Max' : 'All') : `${f}%`, onclick: () => { input.value = String(Math.max(1, Math.floor((maxQ() * f) / 100))); draw(); } })));
  }
  function draw() {
    if (!S.mk || !S.me) return;
    const p = S.mk.p[t]; const n = q(); const held = S.me.h.find((x) => x.t === t)?.q || 0;
    for (const b of sideSeg.children) b.setAttribute('aria-pressed', String(b.dataset.side === side));
    tickText(pxEl, rs(p), 0);
    set(dValue, rs(n * p));
    set(tAvail, side === 'buy' ? 'Cash available' : 'Cash now');
    set(dAvail, rs(S.me.cash));
    set(tAfter, 'Cash after this order');
    const after = side === 'buy' ? S.me.cash - n * p : S.me.cash + n * p;
    set(dAfter, rs(after)); dAfter.className = after < 0 ? 'down' : '';
    set(dHeld, `${qty(held)} → ${qty(side === 'buy' ? held + n : held - n)}`);
    go.className = `btn block lg${side === 'sell' ? ' sell solid' : ''}`;
    set(go, `${side === 'buy' ? 'Buy' : 'Sell'} ${n ? qty(n) : ''} ${t}`.replace(/\s+/g, ' '));
    const lost = n && lostFor(n); // after a lost answer the cash and shares may already include it
    const bad = !n || (!lost && (side === 'buy' ? n * p > S.me.cash : n > held));
    go.disabled = settling || inFlight || bad || !canTrade();
    if (lost && canTrade()) set(err, LOST_MSG);
    else if (S.game?.phase === 'lobby') set(err, 'The game has not started yet. Orders open when the host starts it.');
    else if (S.game?.phase === 'ended') set(err, 'The game is over. No more orders.');
    else if (!S.mk.open) set(err, 'The market is closed. Orders open when the host opens it.');
    else if (n && side === 'buy' && n * p > S.me.cash) set(err, `Not enough cash. You can buy up to ${qty(maxQ())}.`);
    else if (n && side === 'sell' && n > held) set(err, held ? `Your team holds only ${qty(held)}.` : `Your team does not hold any ${t}.`);
    else if (!err.dataset.server) set(err, '');
  }
  sideSeg.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { side = b.dataset.side; err.dataset.server = ''; drawQuick(); draw(); } });
  minus.addEventListener('click', () => { input.value = String(Math.max(1, q() - 1)); draw(); });
  plus.addEventListener('click', () => { input.value = String(q() + 1); draw(); });
  input.addEventListener('input', () => { err.dataset.server = ''; draw(); });
  const fail = (msg) => {
    err.dataset.server = '1'; set(err, msg);
    if (!form.isConnected) toast(msg, { kind: 'err', title: `${t} order`, ms: 9000 }); // the ticket was closed meanwhile
  };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const n = q(); if (!n || inFlight) return;
    if (settling) return;
    const key = `${t}:${side}:${n}`;
    const rid = lostFor(n)?.rid || newRid();
    lostOrders.set(key, { rid, at: Date.now() }); // until an answer comes
    inFlight = true; go.disabled = true;
    orderSeq = ++seq;
    const myGen = gen;
    try {
      const r = await post('trade', { t, side, q: n, rid }, token('team'));
      lostOrders.delete(key); // an answer came
      if (myGen !== gen) { // the desk was signed out while this order was on its way
        toast(r.ok ? `${r.fill.side === 'buy' ? 'Bought' : 'Sold'} ${qty(r.fill.q)} ${r.fill.t} at ${rs(r.fill.p)} before your desk was signed out.` : `Your order for ${qty(n)} ${t} was not placed: your desk was signed out.`, { kind: r.ok ? '' : 'err', title: `${t} order`, ms: 9000 });
        return;
      }
      orderSeq = ++seq; // and drop every check that left while the order was on its way
      if (r.status === 401) { close(); leave('Your desk was signed out. Join again with your team code.'); return; }
      if (!r.ok) { fail(r.error || 'The order did not go through.'); return; }
      close();
      const f = r.fill;
      toast(`${r.again ? 'Your first press went through: ' : ''}${f.side === 'buy' ? 'bought' : 'sold'} ${qty(f.q)} ${f.t} at ${rs(f.p)}: ${rs(f.value)} in all.`.replace(/^./, (c) => c.toUpperCase()), { title: 'Order filled' });
      apply({ mk: r.mk, me: r.me, now: r.now, game: r.game });
    } catch {
      if (myGen !== gen) return;
      if (form.isConnected) fail(LOST_MSG);
      else toast(`No answer came for your order of ${qty(n)} ${t}. Open ${t} again and press ${side === 'buy' ? 'Buy' : 'Sell'} ${qty(n)} to make sure: if the first press went through, it is not placed twice.`, { kind: 'err', title: `${t} order`, ms: 12000 });
      poller?.now();
    } finally { inFlight = false; if (form.isConnected) draw(); }
  });
  const close = sheet(`${t} · ${st.name}`, form, { sub: st.sector });
  closeTicket = close;
  subs.add(draw);
  const obs = new MutationObserver(() => { if (!form.isConnected) { subs.delete(draw); obs.disconnect(); if (closeTicket === close) closeTicket = null; } });
  obs.observe(document.body, { childList: true });
  drawQuick(); draw();
  input.select();
}

// ======================= portfolio =======================

function PortfolioView(el) {
  const placeCard = h('section', { class: 'card place-card', hidden: true });
  const heroNum = h('p', { class: 'hero-num num' }); const heroChg = h('p', { class: 'hero-chg num' });
  const k = {};
  const kpi = (key, label) => { k[key] = h('dd', { class: 'num' }); return h('div', { class: 'kpi' }, h('dt', { text: label }), k[key]); };
  const kpis = h('dl', { class: 'kpis k6', style: { margin: 0 } }, kpi('cash', 'Cash available'), kpi('hv', 'Holdings value'), kpi('inv', 'Invested'),
    kpi('upl', 'Unrealised P&L'), kpi('rpl', 'Realised P&L'), kpi('nw', 'Net worth'));
  const box = h('div', { class: 'chart-box short' });
  let range = '1h';
  const seg = h('div', { class: 'seg', role: 'tablist', 'aria-label': 'Chart range' },
    ['30m', '1h', '1d'].map((r) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(r === range), 'data-r': r, text: r.toUpperCase() })));
  const holdings = h('div'); const loans = h('div'); const orders = h('div');
  const nH = h('span', { class: 'muted small' }); const nO = h('span', { class: 'muted small' });
  const loansCard = h('section', { class: 'card quiet', hidden: true }, h('div', { class: 'card-head' }, h('h3', { text: 'Loans' }), h('span', { class: 'muted small', text: 'Arranged by the host' })), loans);
  el.append(h('div', { class: 'pf-grid' },
    placeCard,
    h('section', { class: 'card hero-card' },
      h('p', { class: 'eyebrow', text: 'Total liquidable money' }), heroNum, heroChg,
      h('p', { class: 'tiny muted', style: { margin: '-8px 0 16px' }, text: 'Your team’s cash plus what its shares would sell for right now. Total P&L compares net worth (which counts loans) with the ₹10,00,000 you started with.' }),
      kpis),
    h('section', { class: 'card quiet' }, h('div', { class: 'card-head' }, h('h3', { text: 'Net worth over time' }), seg), box),
    h('section', { class: 'card quiet' }, h('div', { class: 'card-head' }, h('h3', { text: 'Holdings' }), nH), holdings),
    loansCard,
    h('section', { class: 'card quiet' }, h('div', { class: 'card-head' }, h('h3', { text: 'Orders' }), nO), orders)));
  const chart = lineChart(box, { fmtY: (v, full) => (full ? rs(v) : compactRs(v)), fmtX: axisTime, fmtTip: clock });
  let hist = null; let fetched = 0;
  const load = async () => {
    fetched = Date.now();
    try { const r = await get(`me/history?r=${range}`, token('team')); if (r.ok) { hist = r; draw(); } } catch { /* retry next tick */ }
  };
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    range = b.dataset.r; for (const x of seg.children) x.setAttribute('aria-selected', String(x === b));
    box.classList.add('loading'); load().then(() => box.classList.remove('loading'));
  });
  load();
  let sigH = ''; let sigL = ''; let sigO = ''; let sigP = '';
  function draw() {
    if (!S.me) return;
    const { sum } = S.me;
    const sp = JSON.stringify(S.place);
    if (sp !== sigP) {
      sigP = sp;
      placeCard.hidden = !S.place;
      if (S.place) swap(placeCard, h('p', { class: 'eyebrow', text: 'Final standings' }), h('p', { class: 'place', text: ord(S.place.rank) }), h('p', { class: 'muted', style: { margin: 0 }, text: `of ${S.place.of} teams, with a net worth of ${rs(sum.nw)}.` }));
    }
    set(heroNum, rs(sum.liq));
    set(heroChg, `${arrow(sum.pnl)} ${signedRs(sum.pnl)} (${pct(sum.pct)}) total P&L`); heroChg.className = `hero-chg num ${dir(sum.pnl)}`;
    set(k.cash, rs(sum.cash)); k.cash.className = `num ${sum.cash < 0 ? 'down' : ''}`;
    set(k.hv, rs(sum.hv)); set(k.inv, rs(sum.inv));
    set(k.upl, `${arrow(sum.upl)} ${signedRs(sum.upl)}`); k.upl.className = `num ${dir(sum.upl)}`;
    set(k.rpl, `${arrow(sum.rpl)} ${signedRs(sum.rpl)}`); k.rpl.className = `num ${dir(sum.rpl)}`;
    set(k.nw, rs(sum.nw));
    if (Date.now() - fetched > 20000) load();
    if (hist) {
      const ws = [...hist.ws]; const ys = [...hist.nw];
      if (S.now > ws.at(-1)) { ws.push(S.now); ys.push(sum.nw); } else ys[ys.length - 1] = sum.nw;
      chart.set({ xs: ws, ws, ys, ref: START_CASH, refFit: true, refLabel: 'Started with ₹10,00,000', tone: dir(sum.nw - START_CASH), live: S.mk.open, label: `Net worth, now ${rs(sum.nw)}` });
    }
    const sH = JSON.stringify([S.me.h, S.mk.p]);
    if (sH !== sigH) { sigH = sH; drawHoldings(); }
    const sL = JSON.stringify(S.me.loans) + Math.floor(S.now / 1000);
    if (sL !== sigL) { sigL = sL; drawLoans(); }
    const sO = String(S.me.ntr);
    if (sO !== sigO) { sigO = sO; drawOrders(); }
  }
  function drawHoldings() {
    const hs = S.me.h.map((x) => { const p = S.mk.p[x.t]; return { ...x, p, val: x.q * p, pl: x.q * p - x.cost }; }).sort((a, b) => b.val - a.val);
    set(nH, hs.length ? `${hs.length} of 10 stocks` : '');
    if (!hs.length) { swap(holdings, h('div', { class: 'empty' }, h('h3', { text: 'No shares yet' }), h('p', { style: { margin: 0 } }, 'Pick a stock from the ', h('a', { href: '#/desk', text: 'watchlist' }), ' and press Buy.'))); return; }
    const total = hs.reduce((s, x) => s + x.val, 0) || 1;
    const go = (x) => { location.hash = `#/desk/s/${x.t}`; };
    const table = h('div', { class: 'only-wide scroll-x' }, h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, ['Stock', 'Qty', 'Avg price', 'Price now', 'Value', 'P&L', 'Weight'].map((x, i) => h('th', { class: i ? 'num' : '', text: x })))),
      h('tbody', {}, hs.map((x) => h('tr', { class: 'click', tabindex: '0', onclick: () => go(x), onkeydown: (e) => { if (e.key === 'Enter') go(x); } },
        h('td', {}, h('span', { class: 'tk', text: x.t }), h('span', { class: 'sub', text: BY_T[x.t].name })),
        h('td', { class: 'num', text: qty(x.q) }), h('td', { class: 'num', text: amt(Math.round(x.cost / x.q)) }), h('td', { class: 'num', text: amt(x.p) }),
        h('td', { class: 'num', text: amt(x.val) }),
        h('td', { class: `num ${dir(x.pl)}` }, `${arrow(x.pl)} ${signedRs(x.pl)}`, h('span', { class: 'sub', text: pct((x.pl / x.cost) * 100) })),
        h('td', { class: 'num' }, `${((x.val / total) * 100).toFixed(1)}%`, h('span', { class: 'weight', 'aria-hidden': 'true' }, h('i', { style: { width: `${(x.val / total) * 100}%` } }))))))));
    const cards = h('div', { class: 'only-narrow h-cards' }, hs.map((x) => h('a', { class: 'h-card', href: `#/desk/s/${x.t}` },
      h('span', {}, h('span', { class: 'tk', text: x.t }), h('span', { class: 'muted small', text: ` · ${qty(x.q)} @ ${amt(Math.round(x.cost / x.q))}` })),
      h('span', { class: 'r', text: rs(x.val) }),
      h('span', { class: 'muted small', text: `Now ${amt(x.p)}` }),
      h('span', { class: `r small ${dir(x.pl)}`, text: `${arrow(x.pl)} ${signedRs(x.pl)} (${pct((x.pl / x.cost) * 100)})` }))));
    swap(holdings, table, cards);
  }
  function drawLoans() {
    const ls = S.me.loans.slice().sort((a, b) => b.n - a.n);
    loansCard.hidden = !ls.length;
    swap(loans, ls.map((L) => loanRow(L)));
  }
  function drawOrders() {
    set(nO, S.me.ntr ? `${S.me.ntr} in all` : '');
    if (!S.me.tr.length) { swap(orders, h('p', { class: 'muted', style: { margin: 0 }, text: 'No orders yet.' })); return; }
    swap(orders, h('ul', { class: 'list-plain' }, S.me.tr.map((x) => h('li', { class: 'trade-row' },
      h('span', { class: `side ${x.q > 0 ? 'b' : 's'}`, text: x.q > 0 ? 'BUY' : 'SELL' }),
      h('span', {}, h('b', { text: `${qty(Math.abs(x.q))} ${x.t}`, style: { fontWeight: 500 } }), h('span', { class: 'muted small', text: ` at ${rs(x.p)}${x.f ? ' · sold to repay a loan' : ''}` })),
      h('span', { class: 'right' }, h('span', { class: 'num', text: rs(Math.abs(x.q) * x.p) }), h('span', { class: 'sub muted tiny', style: { display: 'block' }, text: when(x.w) }))))));
  }
  subs.add(draw);
  return { destroy: () => chart.destroy() };
}
const compactRs = (v) => { const r = v / 100; return r >= 1e7 ? `${(r / 1e7).toFixed(2)} Cr` : r >= 1e5 ? `${(r / 1e5).toFixed(2)} L` : amt(v); };

function loanRow(L) {
  const lent = L.role === 'lender';
  const status = L.status === 'ongoing' ? `Ongoing · ${ago(L.due - S.now)} left` : L.status === 'elapsed' ? `Elapsed · repaid ${hm(L.settledAt)}` : 'Cancelled by the host';
  return h('div', { class: 'loan-row' },
    h('div', { class: 'row' }, h('b', { text: lent ? `Your team lent to ${L.other}` : `Your team borrowed from ${L.other}`, style: { fontWeight: 600 } }), h('span', { class: `status ${L.status}`, text: status })),
    h('p', { class: 'small', style: { margin: '4px 0 0' } },
      `${rs(L.amount)} at ${L.rate}% interest → ${rs(L.final)} ${lent ? 'comes back to your team' : 'to repay'} ${L.status === 'ongoing' ? `at ${hm(L.due)}` : ''} · deadline ${mins(L.mins)} · loan ${L.id}`),
    L.sold?.length ? h('p', { class: 'small warn', style: { margin: '4px 0 0' }, text: `Sold to repay: ${L.sold.map(([t, q, p]) => `${qty(q)} ${t} at ${rs(p)}`).join(', ')}.` }) : null,
    L.short ? h('p', { class: 'small down', style: { margin: '4px 0 0' }, text: `Your team’s cash went ${rs(L.short)} below zero to repay it in full.` }) : null);
}

// ======================= updates =======================

const seenKey = () => `seenUpdate:${S.mk?.g}:${S.me?.id}:${S.me?.member?.id}`;
function unseenUpdates() { const seen = store(seenKey()) || 0; return S.updates.filter((u) => u.n > seen).length; }

function UpdatesView(el) {
  const list = h('ol', { class: 'up-list' });
  el.append(h('div', { class: 'updates' },
    h('p', { class: 'eyebrow', text: 'From the host' }), h('h1', { text: 'Updates', style: { margin: '6px 0 8px' } }),
    h('p', { class: 'muted', text: 'News and announcements from the host, numbered in the order they were posted.' }), list));
  let sig = ''; let seenAtOpen = null;
  function draw() {
    if (!S.me) return;
    if (seenAtOpen === null) seenAtOpen = store(seenKey()) || 0;
    const s = JSON.stringify(S.updates);
    if (s !== sig) {
      sig = s;
      if (!S.updates.length) swap(list, h('li', { class: 'empty' }, h('h3', { text: 'No updates yet' }), h('p', { style: { margin: 0 }, text: 'When the host posts news, it appears here in order.' })));
      else swap(list, S.updates.map((u) => h('li', { class: `up-item${u.n > seenAtOpen ? ' new' : ''}`, id: `update-${u.n}` },
        h('span', { class: 'up-n', 'aria-hidden': 'true', text: pad(u.n) }),
        h('div', { class: 'up-meta' }, h('b', { class: 'eyebrow', text: `Update ${pad(u.n)}` }), h('time', { datetime: new Date(u.at).toISOString(), text: when(u.at) }),
          u.n > seenAtOpen ? h('span', { class: 'pill gold', text: 'New' }) : null, u.ed ? h('span', { class: 'muted tiny', text: '(edited)' }) : null),
        h('p', { class: 'up-text', text: u.text }))));
    }
    const max = S.updates.reduce((m, u) => Math.max(m, u.n), 0);
    if (max > (store(seenKey()) || 0)) { store(seenKey(), max); publishSoon(); }
  }
  subs.add(draw);
  return {};
}
let pubT = null;
function publishSoon() { clearTimeout(pubT); pubT = setTimeout(publish, 0); }

// ======================= notices (loans) =======================

function noticesFrom(loans) {
  const out = [];
  for (const L of loans) {
    const lent = L.role === 'lender';
    out.push({
      id: `${L.id}-out`, at: L.start, title: lent ? `Loan ${L.id}: your team lent ${rs(L.amount)}` : `Loan ${L.id}: your team received ${rs(L.amount)}`,
      text: lent
        ? `The host sent ${rs(L.amount)} from your team’s cash to ${L.other}. It comes back with ${L.rate}% interest, ${rs(L.final)} in all, at ${hm(L.due)} (deadline ${mins(L.mins)}).`
        : `${L.other} lent your team ${rs(L.amount)}; it is in your cash now. At ${hm(L.due)} (deadline ${mins(L.mins)}), ${rs(L.final)} (with ${L.rate}% interest) will be taken from your team automatically.`,
    });
    if (L.status === 'elapsed') {
      let text = lent ? `${L.other} repaid ${rs(L.final)} (${rs(L.amount)} + ${rs(L.final - L.amount)} interest). It is now in your team’s cash.` : `${rs(L.final)} was taken from your team and paid to ${L.other}.`;
      if (!lent && L.sold.length) text += ` To cover it, these shares were sold: ${L.sold.map(([t, q, p]) => `${qty(q)} ${t} at ${rs(p)}`).join(', ')}.`;
      if (!lent && L.short) text += ` Your team’s cash is ${rs(L.short)} below zero: sell shares to cover it.`;
      out.push({ id: `${L.id}-back`, at: L.settledAt, title: `Loan ${L.id} repaid`, text });
    }
    if (L.status === 'cancelled') {
      let text = lent ? `The host cancelled the loan; your team’s ${rs(L.amount)} was returned.` : `The host cancelled the loan; ${rs(L.amount)} went back to ${L.other}.`;
      if (!lent && L.sold.length) text += ` To cover it, these shares were sold: ${L.sold.map(([t, q, p]) => `${qty(q)} ${t} at ${rs(p)}`).join(', ')}.`;
      if (!lent && L.short) text += ` Your team’s cash is ${rs(L.short)} below zero: sell shares to cover it.`;
      out.push({ id: `${L.id}-x`, at: L.cancelledAt, title: `Loan ${L.id} cancelled`, text });
    }
  }
  return out.sort((a, b) => b.at - a.at);
}
const nKey = () => `seenNotices:${S.mk?.g}:${S.me?.id}:${S.me?.member?.id}`;
const allNotices = () => (S.me ? noticesFrom(S.me.loans) : []);
function unreadNotices() { const seen = new Set(store(nKey()) || []); return allNotices().filter((n) => !seen.has(n.id)); }
const noticeToasts = new Map();
function clearNoticeToasts() { for (const close of noticeToasts.values()) close(); noticeToasts.clear(); }
function markNoticesRead() {
  store(nKey(), allNotices().map((n) => n.id).slice(0, 400));
  clearNoticeToasts();
  publishSoon();
}
let shown = null;
function checkNotices() {
  const unread = unreadNotices();
  if (shown === null) {
    shown = new Set(allNotices().map((n) => n.id));
    if (unread.length) noticeToasts.set('all', toast(`Your team has ${unread.length} new notice${unread.length > 1 ? 's' : ''} about loans. Open the bell to read ${unread.length > 1 ? 'them' : 'it'}.`, { title: 'Notices', sticky: true }));
    return;
  }
  for (const n of unread) if (!shown.has(n.id)) { shown.add(n.id); noticeToasts.set(n.id, toast(n.text, { title: n.title, sticky: true })); }
}

function noticeList(list, unreadIds) {
  if (!list.length) return h('p', { class: 'muted', style: { margin: 0 }, text: 'No notices. When the host arranges a loan for your team, you will be told here.' });
  return h('div', {}, list.map((n) => h('div', { class: `notice${unreadIds.has(n.id) ? ' unread' : ''}` }, h('b', { text: n.title }), h('time', { text: when(n.at) }), h('p', { text: n.text }))));
}

let pop = null;
function toggleNotices() {
  if (pop) { pop.remove(); pop = null; return; }
  const unread = new Set(unreadNotices().map((n) => n.id));
  pop = h('div', { class: 'pop', role: 'dialog', 'aria-label': 'Notices' },
    h('div', { class: 'row between', style: { marginBottom: '6px' } }, h('h3', { text: 'Notices' }), h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Close', onclick: () => toggleNotices() }, icon('x'))),
    noticeList(allNotices(), unread));
  document.body.append(pop);
  markNoticesRead();
  setTimeout(() => document.addEventListener('click', function off(e) { if (pop && !pop.contains(e.target) && !shell?.bell.contains(e.target)) { pop.remove(); pop = null; } if (!pop) document.removeEventListener('click', off); }), 0);
}

// ======================= the team =======================

function TeamView(el) {
  const prof = h('dl', { class: 'kv' }); const notes = h('div');
  el.append(h('div', { class: 'stack', style: { maxWidth: '760px' } },
    h('div', {}, h('p', { class: 'eyebrow', text: 'Your team' }), h('h1', { class: 'team-title', text: S.me?.name || 'Your team', style: { marginTop: '6px' } })),
    h('section', { class: 'card quiet' }, h('h3', { text: 'Members on this desk', style: { marginBottom: '12px' } }), prof,
      h('p', { class: 'tiny muted', style: { margin: '12px 0 0' }, text: 'Everyone here shares one desk: the same cash, the same shares. Only the host can see your team’s portfolio; other teams cannot.' })),
    h('section', { class: 'card quiet', id: 'notices' }, h('h3', { text: 'Notices', style: { marginBottom: '6px' } }), notes),
    h('section', { class: 'card quiet' }, h('div', { class: 'row between' }, h('h3', { text: 'Appearance' }), themeSwitch())),
    h('button', { class: 'btn ghost block', type: 'button', onclick: () => { post('leave', {}, token('team')).catch(() => {}); leave(); } }, icon('out'), 'Leave this desk')));
  let sig = '';
  function draw() {
    const me = S.me; if (!me) return;
    const s = JSON.stringify([me.name, me.members, me.loans]);
    if (s === sig) return;
    sig = s;
    set(el.querySelector('.team-title'), me.name);
    swap(prof, h('dt', { text: 'You' }), h('dd', { text: me.member?.name || '—' }), h('dt', { text: 'Team' }), h('dd', { text: me.name }),
      h('dt', { text: `Members (${me.members.length})` }), h('dd', { text: me.members.join(', ') || '—' }));
    const unread = new Set(unreadNotices().map((n) => n.id));
    swap(notes, noticeList(allNotices(), unread));
    if (unread.size) markNoticesRead();
  }
  subs.add(draw);
  return {};
}
