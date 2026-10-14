// The investor's app: sign in, watchlist, stock pages with buy and sell, portfolio,
// updates from the host and notices about loans. An investor only ever receives their
// own account from the server.
import { h, set, swap, tickText, icon, toast, sheet } from './dom.mjs';
import { rs, amt, signedRs, pct, qty, dir, arrow, clock, hm, when, ago, mins, initials } from './fmt.mjs';
import { get, post, net, token, setToken, loop, onNet } from './net.mjs';
import { STOCKS, BY_T, START_CASH } from '../src/stocks.mjs';
import { ensure, series, tick } from './series.mjs';
import { lineChart, spark } from './chart.mjs';

const S = { mk: null, me: null, updates: [], uv: -1, now: 0, first: true };
const subs = new Set();
const wide = matchMedia('(min-width: 1000px)');
let root; let poller = null; let shell = null; let pane = null; let lastStock = 'AURI';
let chartRange = '30m';

const store = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); localStorage.setItem(k, JSON.stringify(v)); } catch { return null; } return v; };
const changeOf = (t) => (S.mk ? S.mk.p[t] - S.mk.o[t] : 0);
const changePct = (t) => (S.mk ? ((S.mk.p[t] - S.mk.o[t]) / S.mk.o[t]) * 100 : 0);

export function startInvestor(el) {
  root = el;
  if (!token('inv')) return renderAuth();
  renderShell();
}

// ======================= sign in =======================

function renderAuth() {
  poller?.stop(); poller = null; shell = null;
  const rows = {};
  const tape = h('ul', { class: 'auth-tape', 'aria-label': 'Live prices' }, STOCKS.map((s) => {
    const c = h('canvas', { 'aria-hidden': 'true' }); const px = h('span', { class: 'px num' });
    rows[s.t] = { c, px };
    return h('li', {}, h('span', { class: 'tk', text: s.t }), c, px);
  }));
  const err = h('p', { class: 'form-error', role: 'alert' });
  let mode = 'in';
  const formBox = h('div');
  const tabs = h('div', { class: 'seg full', role: 'tablist' },
    h('button', { type: 'button', role: 'tab', 'aria-selected': 'true', 'data-mode': 'in', text: 'Sign in' }),
    h('button', { type: 'button', role: 'tab', 'aria-selected': 'false', 'data-mode': 'up', text: 'Create account' }));
  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    mode = b.dataset.mode;
    for (const x of tabs.children) x.setAttribute('aria-selected', String(x === b));
    drawForm();
  });
  const field = (label, attrs) => h('label', { class: 'field' }, h('span', { text: label }), h('input', attrs));
  function drawForm() {
    err.textContent = '';
    const f = mode === 'in'
      ? h('form', { novalidate: true },
        field('Email', { type: 'email', name: 'email', autocomplete: 'email', required: true }),
        field('Password', { type: 'password', name: 'password', autocomplete: 'current-password', required: true }),
        err, h('button', { class: 'btn block lg', type: 'submit', text: 'Sign in' }))
      : h('form', { novalidate: true },
        field('Full name', { type: 'text', name: 'name', autocomplete: 'name', required: true, maxlength: '60' }),
        field('Email', { type: 'email', name: 'email', autocomplete: 'email', required: true }),
        field('Phone', { type: 'tel', name: 'phone', autocomplete: 'tel', required: true, placeholder: '+91 98765 43210' }),
        field('School, college or team (optional)', { type: 'text', name: 'org', autocomplete: 'organization', maxlength: '80' }),
        field('Password (at least 6 characters)', { type: 'password', name: 'password', autocomplete: 'new-password', required: true }),
        err, h('button', { class: 'btn block lg', type: 'submit', text: 'Create account' }),
        h('p', { class: 'tiny muted', text: 'You start with ₹10,00,000 in paper money. Only the host can see your details.' }));
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = f.querySelector('button[type=submit]');
      const body = Object.fromEntries(new FormData(f));
      btn.disabled = true; err.textContent = '';
      try {
        const r = await post(mode === 'in' ? 'login' : 'signup', body);
        if (!r.ok) { err.textContent = r.error || 'That did not work. Please try again.'; return; }
        setToken('inv', r.token);
        clearInterval(authTimer);
        location.hash = '#/';
        renderShell();
        toast(mode === 'in' ? 'Welcome back.' : 'Your account is ready: ₹10,00,000 to invest.', { title: mode === 'in' ? 'Signed in' : 'Account created' });
      } catch (x) {
        err.textContent = x.message === 'no-server' ? 'The live server is not running on this website. See DEPLOY.md.' : 'Could not reach the server. Check your connection and try again.';
      } finally { btn.disabled = false; }
    });
    swap(formBox, f);
    if (formBox.isConnected) f.querySelector('input')?.focus();
  }
  drawForm();
  swap(root, h('main', { class: 'auth' },
    h('section', { class: 'auth-art' },
      h('p', { class: 'eyebrow', text: 'Paper trading · live market' }),
      h('h1', {}, 'Ten companies.', h('br'), 'One live market.'),
      h('p', { class: 'lead', text: 'Start with ₹10,00,000 in paper money. Prices move every second: buy, sell and watch your profit and loss as it happens.' }),
      tape),
    h('section', { class: 'auth-form' },
      h('div', { class: 'card' },
        h('p', { class: 'eyebrow', text: 'Your account' }),
        h('h2', { text: 'Sign in to trade', style: { margin: '6px 0 16px' } }),
        tabs, h('div', { style: { height: '16px' } }), formBox))));
  formBox.querySelector('input')?.focus();
  let hist = null;
  const refresh = async () => {
    try {
      const r = await get('market');
      if (!r.ok) return;
      if (!hist || hist.g !== r.mk.g) { const x = await get('history?t=all&r=30m'); if (x.ok) hist = x; }
      for (const s of STOCKS) {
        const p = r.mk.p[s.t];
        set(rows[s.t].px, rs(p));
        if (hist) { const ys = [...hist.p[s.t], p]; spark(rows[s.t].c, ys, dir(p - ys[0])); }
      }
    } catch { /* the tape just waits */ }
  };
  refresh();
  const authTimer = setInterval(() => { if (!root.querySelector('.auth')) clearInterval(authTimer); else refresh(); }, 3000);
}

// ======================= the app shell =======================

function signOut() {
  setToken('inv', '');
  poller?.stop(); poller = null;
  location.hash = '#/';
  renderAuth();
}

function renderShell() {
  const nav = h('nav', { class: 'top-nav', 'aria-label': 'Main' },
    navLink('#/', 'Watchlist', 'home'), navLink('#/portfolio', 'Portfolio', 'portfolio'), navLink('#/updates', 'Updates', 'updates'));
  const bell = h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Notices', onclick: () => toggleNotices() }, icon('bell'));
  const avatar = h('a', { class: 'avatar', href: '#/account', 'aria-label': 'Your account', text: '·' });
  const who = h('div', { class: 'who' }, h('b', { text: '' }), h('span', { text: '' }));
  const mkt = h('span', { class: 'mkt' }, h('i'), h('b', { text: 'Connecting…' }));
  const clk = h('span', { class: 'clock num' });
  const top = h('header', { class: 'top' }, h('div', { class: 'top-l' }, mkt, clk), nav, h('div', { class: 'top-r' }, who, bell, avatar));
  const tapeTrack = h('div', { class: 'tape-track' });
  const tape = h('div', { class: 'tape', 'aria-hidden': 'true' }, tapeTrack);
  const tapeItems = [];
  for (let k = 0; k < 2; k++) for (const s of STOCKS) {
    const px = h('span', { class: 'num' }); const ch = h('span', { class: 'num' });
    tapeItems.push({ t: s.t, px, ch });
    tapeTrack.append(h('a', { class: 'tape-item', href: `#/s/${s.t}`, tabindex: '-1' }, h('span', { class: 'tk', text: s.t }), px, ch));
  }
  const wl = h('aside', { class: 'wl', 'aria-label': 'Watchlist' });
  const paneEl = h('section', { class: 'pane' });
  const layout = h('main', { class: 'layout' }, wl, paneEl);
  const tabbar = h('nav', { class: 'tabbar', 'aria-label': 'Main' },
    tabLink('#/', 'Watchlist', 'list', 'home'), tabLink('#/portfolio', 'Portfolio', 'pie', 'portfolio'),
    tabLink('#/updates', 'Updates', 'news', 'updates'), tabLink('#/account', 'Account', 'user', 'account'));
  const banner = h('div');
  swap(root, h('div', { class: 'app inv' }, top, banner, tape, layout, tabbar));
  const watch = Watchlist(wl);
  shell = { top, nav, tabbar, bell, avatar, who, mkt, clk, layout, paneEl, watch, tapeItems, banner };

  setInterval(() => { if (shell) set(clk, clock(net.now())); }, 1000);
  onNet(() => drawBanner());
  window.addEventListener('hashchange', onRoute);
  wide.addEventListener('change', onRoute);
  ensure('30m').then(() => publish());
  poller = loop(poll, 1500, 8000);
  onRoute();
}

function navLink(href, label, key) { return h('a', { href, 'data-key': key }, label, h('span', { class: 'badge', hidden: true, 'data-badge': key })); }
function tabLink(href, label, ic, key) { return h('a', { href, 'data-key': key }, icon(ic), label, h('span', { class: 'badge', hidden: true, 'data-badge': key })); }

function drawBanner() {
  if (!shell) return;
  const bars = [];
  if (!net.online) bars.push(h('div', { class: 'bar off', text: 'Connection lost. Reconnecting… Prices on screen may be out of date.' }));
  else if (S.mk && !S.mk.open) bars.push(h('div', { class: 'bar closed', text: 'The market is closed. Prices are paused; orders open when the host opens the market.' }));
  swap(shell.banner, bars);
}

async function poll() {
  const r = await get(`poll?uv=${S.uv}`, token('inv'));
  if (r.status === 401) { toast('Please sign in again.', { kind: 'err' }); signOut(); return; }
  if (!r.ok) return;
  apply(r);
}

function apply(r) {
  const prev = S.mk;
  S.mk = r.mk; S.me = r.me; S.now = r.now;
  if (r.updates) {
    const before = new Set(S.updates.map((u) => u.id));
    const fresh = S.uv >= 0 ? r.updates.filter((u) => !before.has(u.id)) : [];
    S.updates = r.updates; S.uv = r.uv;
    if (!S.first) for (const u of fresh) if (route().view !== 'updates') toast(u.text.length > 120 ? `${u.text.slice(0, 120)}…` : u.text, { title: `Update ${pad(u.n)} from the host`, ms: 9000 });
  }
  if (tick(r.mk, r.now)) ensure('30m').then(publish);
  checkNotices();
  S.first = false;
  S.prev = prev;
  publish();
}

function publish() {
  if (!shell || !S.mk) return;
  const { mk, me } = S;
  shell.mkt.className = `mkt ${mk.open ? 'open' : 'closed'}`;
  set(shell.mkt.lastChild, mk.open ? 'Market open' : 'Market closed');
  set(shell.who.firstChild, me.name);
  set(shell.who.lastChild, `${rs(me.sum.liq)} liquidable`);
  set(shell.avatar, initials(me.name));
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
  for (const b of root.querySelectorAll('[data-badge="account"]')) { b.hidden = !nN; set(b, String(nN)); }
  drawBanner();
  shell.watch.update();
  for (const fn of subs) fn();
}

// ======================= routing =======================

function route() {
  const [a, b] = location.hash.replace(/^#\/?/, '').split('/');
  if (a === 's' && BY_T[b]) return { view: 'stock', t: b };
  if (['portfolio', 'updates', 'account'].includes(a)) return { view: a };
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
  shell.paneEl.scrollTop = 0;
  const make = { stock: () => StockView(shell.paneEl, next.t), portfolio: () => PortfolioView(shell.paneEl), updates: () => UpdatesView(shell.paneEl), account: () => AccountView(shell.paneEl) }[next.view];
  pane = make() || {};
  pane.sig = sig;
  if (!showWl) window.scrollTo(0, 0);
  if (S.mk) for (const fn of subs) fn();
}

// ======================= watchlist =======================

function Watchlist(el) {
  const refs = {};
  const search = h('input', { type: 'search', placeholder: 'Search the ten stocks', 'aria-label': 'Search stocks' });
  const list = h('ul', { class: 'wl-list' });
  for (const s of STOCKS) {
    const px = h('span', { class: 'px num' }); const ch = h('span', { class: 'ch' }); const held = h('span', { class: 'held' });
    const c = h('canvas', { class: 'spark', 'aria-hidden': 'true' });
    const a = h('a', { class: 'wl-row', href: `#/s/${s.t}` },
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
    h('a', { class: 'back', href: '#/' }, icon('back'), 'Watchlist'),
    h('div', { class: 'sd-head' },
      h('div', {}, h('p', { class: 'eyebrow', text: `${t} · ${st.sector}` }), h('h1', { text: st.name, style: { marginTop: '6px' } })),
      h('div', { class: 'sd-price' }, big, chg)),
    h('div', { class: 'chart-tools' }, ranges, h('span', { class: 'muted tiny', text: 'Live · tap or hover the chart to read it' })),
    box,
    h('dl', { class: 'stats' }, sOpen, sHi, sLo, sCh),
    h('section', { class: 'card quiet tight' }, h('h3', { text: 'Your position', style: { marginBottom: '10px' } }), pos),
    h('div', { class: 'trade-bar sticky' }, buyB, sellB)));
  const chart = lineChart(box, { fmtY: (v, full) => (full ? rs(v) : amt(v)), fmtX: hm, fmtTip: clock });
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
    if (!S.mk) return;
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
    const sig = hd ? `${hd.q}:${hd.cost}:${p}` : 'none';
    if (sig !== posSig) {
      posSig = sig;
      if (!hd) swap(pos, h('p', { class: 'muted', style: { margin: 0 }, text: `You do not hold ${t}. Cash available: ${rs(S.me.cash)}.` }));
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
  if (!S.mk) return;
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
  const form = h('form', { novalidate: true },
    sideSeg,
    h('div', { class: 'ticket-px', style: { marginTop: '16px' } }, h('span', { class: 'muted', text: 'Market price · live' }), pxEl),
    h('label', { class: 'field' }, h('span', { text: 'Quantity (shares)' }), h('div', { class: 'qty' }, minus, input, plus)),
    quick,
    h('dl', { class: 'lines' },
      h('div', { class: 'total' }, h('dt', { text: 'Order value' }), dValue),
      h('div', {}, tAvail, dAvail), h('div', {}, tAfter, dAfter), h('div', {}, h('dt', { text: `${t} you hold` }), dHeld)),
    err, go,
    h('p', { class: 'tiny muted', style: { margin: '10px 0 0' }, text: 'A market order: it fills at the live price the moment it reaches the market. No brokerage is charged.' }));
  const q = () => Math.max(0, Math.floor(Number(input.value) || 0));
  function maxQ() {
    const p = S.mk.p[t];
    if (side === 'buy') return Math.max(0, Math.floor(S.me.cash / p));
    return S.me.h.find((x) => x.t === t)?.q || 0;
  }
  function drawQuick() {
    swap(quick, [25, 50, 75, 100].map((f) => h('button', { type: 'button', text: f === 100 ? (side === 'buy' ? 'Max' : 'All') : `${f}%`, onclick: () => { input.value = String(Math.max(1, Math.floor((maxQ() * f) / 100))); draw(); } })));
  }
  function draw() {
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
    const bad = !n || (side === 'buy' ? n * p > S.me.cash : n > held);
    go.disabled = bad || !S.mk.open;
    if (!S.mk.open) set(err, 'The market is closed. Orders open when the host opens it.');
    else if (n && side === 'buy' && n * p > S.me.cash) set(err, `Not enough cash. You can buy up to ${qty(maxQ())}.`);
    else if (n && side === 'sell' && n > held) set(err, held ? `You hold only ${qty(held)}.` : `You do not hold any ${t}.`);
    else if (!err.dataset.server) set(err, '');
  }
  sideSeg.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { side = b.dataset.side; err.dataset.server = ''; drawQuick(); draw(); } });
  minus.addEventListener('click', () => { input.value = String(Math.max(1, q() - 1)); draw(); });
  plus.addEventListener('click', () => { input.value = String(q() + 1); draw(); });
  input.addEventListener('input', () => { err.dataset.server = ''; draw(); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const n = q(); if (!n) return;
    go.disabled = true;
    try {
      const r = await post('trade', { t, side, q: n }, token('inv'));
      if (r.status === 401) { signOut(); return; }
      if (!r.ok) { err.dataset.server = '1'; set(err, r.error || 'The order did not go through.'); return; }
      close();
      const f = r.fill;
      toast(`${f.side === 'buy' ? 'Bought' : 'Sold'} ${qty(f.q)} ${f.t} at ${rs(f.p)}: ${rs(f.value)} in all.`, { title: 'Order filled' });
      apply({ mk: r.mk, me: r.me, now: r.now });
    } catch { err.dataset.server = '1'; set(err, 'Could not reach the server. Your order was not placed; please try again.'); } finally { draw(); }
  });
  const close = sheet(`${t} · ${st.name}`, form, { sub: st.sector });
  const unsub = () => subs.delete(draw);
  subs.add(draw);
  const obs = new MutationObserver(() => { if (!form.isConnected) { unsub(); obs.disconnect(); } });
  obs.observe(document.body, { childList: true });
  drawQuick(); draw();
  input.select();
}

// ======================= portfolio =======================

function PortfolioView(el) {
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
    h('section', { class: 'card hero-card' },
      h('p', { class: 'eyebrow', text: 'Total liquidable money' }), heroNum, heroChg,
      h('p', { class: 'tiny muted', style: { margin: '-8px 0 16px' }, text: 'Your cash plus what your shares would sell for right now. Overall P&L compares your net worth (which counts loans) with the ₹10,00,000 you started with.' }),
      kpis),
    h('section', { class: 'card quiet' }, h('div', { class: 'card-head' }, h('h3', { text: 'Net worth over time' }), seg), box),
    h('section', { class: 'card quiet' }, h('div', { class: 'card-head' }, h('h3', { text: 'Holdings' }), nH), holdings),
    loansCard,
    h('section', { class: 'card quiet' }, h('div', { class: 'card-head' }, h('h3', { text: 'Orders' }), nO), orders)));
  const chart = lineChart(box, { fmtY: (v, full) => (full ? rs(v) : compactRs(v)), fmtX: hm, fmtTip: clock });
  let hist = null; let fetched = 0;
  const load = async () => {
    fetched = Date.now();
    try { const r = await get(`me/history?r=${range}`, token('inv')); if (r.ok) { hist = r; draw(); } } catch { /* retry next tick */ }
  };
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    range = b.dataset.r; for (const x of seg.children) x.setAttribute('aria-selected', String(x === b));
    box.classList.add('loading'); load().then(() => box.classList.remove('loading'));
  });
  load();
  let sigH = ''; let sigL = ''; let sigO = '';
  function draw() {
    if (!S.me) return;
    const { sum } = S.me;
    set(heroNum, rs(sum.liq));
    set(heroChg, `${arrow(sum.pnl)} ${signedRs(sum.pnl)} (${pct(sum.pct)}) overall P&L`); heroChg.className = `hero-chg num ${dir(sum.pnl)}`;
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
    // holdings
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
    if (!hs.length) { swap(holdings, h('div', { class: 'empty' }, h('h3', { text: 'No shares yet' }), h('p', { style: { margin: 0 } }, 'Pick a stock from the ', h('a', { href: '#/', text: 'watchlist' }), ' and press Buy.'))); return; }
    const total = hs.reduce((s, x) => s + x.val, 0) || 1;
    const table = h('div', { class: 'only-wide scroll-x' }, h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, ['Stock', 'Qty', 'Avg price', 'Price now', 'Value', 'P&L', 'Weight'].map((x, i) => h('th', { class: i ? 'num' : '', text: x })))),
      h('tbody', {}, hs.map((x) => h('tr', { class: 'click', tabindex: '0', onclick: () => { location.hash = `#/s/${x.t}`; }, onkeydown: (e) => { if (e.key === 'Enter') location.hash = `#/s/${x.t}`; } },
        h('td', {}, h('span', { class: 'tk', text: x.t }), h('span', { class: 'sub', text: BY_T[x.t].name })),
        h('td', { class: 'num', text: qty(x.q) }), h('td', { class: 'num', text: amt(Math.round(x.cost / x.q)) }), h('td', { class: 'num', text: amt(x.p) }),
        h('td', { class: 'num', text: amt(x.val) }),
        h('td', { class: `num ${dir(x.pl)}` }, `${arrow(x.pl)} ${signedRs(x.pl)}`, h('span', { class: 'sub', text: pct((x.pl / x.cost) * 100) })),
        h('td', { class: 'num' }, `${((x.val / total) * 100).toFixed(1)}%`, h('span', { class: 'weight', 'aria-hidden': 'true' }, h('i', { style: { width: `${(x.val / total) * 100}%` } }))))))));
    const cards = h('div', { class: 'only-narrow h-cards' }, hs.map((x) => h('a', { class: 'h-card', href: `#/s/${x.t}` },
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
  const left = L.due - S.now;
  const status = L.status === 'ongoing' ? `Ongoing · ${ago(left)} left` : L.status === 'elapsed' ? `Elapsed · repaid ${hm(L.settledAt)}` : 'Cancelled by the host';
  return h('div', { class: 'loan-row' },
    h('div', { class: 'row' }, h('b', { text: lent ? `You lent to ${L.other}` : `You borrowed from ${L.other}`, style: { fontWeight: 600 } }), h('span', { class: `status ${L.status}`, text: status })),
    h('p', { class: 'small', style: { margin: '4px 0 0' } },
      `${rs(L.amount)} at ${L.rate}% interest → ${rs(L.final)} ${lent ? 'comes back to you' : 'to repay'} ${L.status === 'ongoing' ? `at ${hm(L.due)}` : ''} · deadline ${mins(L.mins)} · loan ${L.id}`),
    L.sold?.length ? h('p', { class: 'small warn', style: { margin: '4px 0 0' }, text: `Sold to repay: ${L.sold.map(([t, q, p]) => `${qty(q)} ${t} at ${rs(p)}`).join(', ')}.` }) : null,
    L.short ? h('p', { class: 'small down', style: { margin: '4px 0 0' }, text: `Your cash went ${rs(L.short)} below zero to repay it in full.` }) : null);
}

// ======================= updates =======================

const pad = (n) => String(n).padStart(2, '0');
const seenKey = () => `seenUpdate:${S.me?.id}`;
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
      id: `${L.id}-out`, at: L.start, title: lent ? `Loan ${L.id}: you lent ${rs(L.amount)}` : `Loan ${L.id}: you received ${rs(L.amount)}`,
      text: lent
        ? `The host sent ${rs(L.amount)} from your cash to ${L.other}. It comes back with ${L.rate}% interest, ${rs(L.final)} in all, at ${hm(L.due)} (deadline ${mins(L.mins)}).`
        : `${L.other} lent you ${rs(L.amount)}; it is in your cash now. At ${hm(L.due)} (deadline ${mins(L.mins)}), ${rs(L.final)} (with ${L.rate}% interest) will be taken from your account automatically.`,
    });
    if (L.status === 'elapsed') {
      let text = lent ? `${L.other} repaid ${rs(L.final)} (${rs(L.amount)} + ${rs(L.final - L.amount)} interest). It is now in your cash.` : `${rs(L.final)} was taken from your account and paid to ${L.other}.`;
      if (!lent && L.sold.length) text += ` To cover it, these shares were sold: ${L.sold.map(([t, q, p]) => `${qty(q)} ${t} at ${rs(p)}`).join(', ')}.`;
      if (!lent && L.short) text += ` Your cash is ${rs(L.short)} below zero: sell shares to cover it.`;
      out.push({ id: `${L.id}-back`, at: L.settledAt, title: `Loan ${L.id} repaid`, text });
    }
    if (L.status === 'cancelled') out.push({ id: `${L.id}-x`, at: L.cancelledAt, title: `Loan ${L.id} cancelled`, text: lent ? `The host cancelled the loan; your ${rs(L.amount)} was returned.` : `The host cancelled the loan; ${rs(L.amount)} went back to ${L.other}.` });
  }
  return out.sort((a, b) => b.at - a.at);
}
const nKey = () => `seenNotices:${S.me?.id}`;
const allNotices = () => (S.me ? noticesFrom(S.me.loans) : []);
function unreadNotices() { const seen = new Set(store(nKey()) || []); return allNotices().filter((n) => !seen.has(n.id)); }
const noticeToasts = new Map();
function markNoticesRead() {
  store(nKey(), allNotices().map((n) => n.id).slice(0, 400));
  for (const close of noticeToasts.values()) close();
  noticeToasts.clear();
  publishSoon();
}
let shown = null;
function checkNotices() {
  const unread = unreadNotices();
  if (shown === null) {
    shown = new Set(allNotices().map((n) => n.id));
    if (unread.length) noticeToasts.set('all', toast(`You have ${unread.length} new notice${unread.length > 1 ? 's' : ''} about loans. Open the bell to read ${unread.length > 1 ? 'them' : 'it'}.`, { title: 'Notices', sticky: true }));
    return;
  }
  for (const n of unread) if (!shown.has(n.id)) { shown.add(n.id); noticeToasts.set(n.id, toast(n.text, { title: n.title, sticky: true })); }
}

function noticeList(list, unreadIds) {
  if (!list.length) return h('p', { class: 'muted', style: { margin: 0 }, text: 'No notices. When the host arranges a loan for you, you will be told here.' });
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
  setTimeout(() => document.addEventListener('click', function off(e) { if (pop && !pop.contains(e.target) && !shell.bell.contains(e.target)) { pop.remove(); pop = null; } if (!pop) document.removeEventListener('click', off); }), 0);
}

// ======================= account =======================

function AccountView(el) {
  const prof = h('dl', { class: 'kv' }); const notes = h('div');
  const theme = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Appearance' },
    h('button', { type: 'button', 'data-th': 'dark', text: 'Night' }), h('button', { type: 'button', 'data-th': 'light', text: 'Parchment' }));
  const drawTheme = () => { const cur = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'; for (const b of theme.children) b.setAttribute('aria-pressed', String(b.dataset.th === cur)); };
  theme.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { setTheme(b.dataset.th); drawTheme(); } });
  drawTheme();
  el.append(h('div', { class: 'stack', style: { maxWidth: '760px' } },
    h('div', {}, h('p', { class: 'eyebrow', text: 'Account' }), h('h1', { text: 'Your account', style: { marginTop: '6px' } })),
    h('section', { class: 'card quiet' }, h('h3', { text: 'Details', style: { marginBottom: '12px' } }), prof,
      h('p', { class: 'tiny muted', style: { margin: '12px 0 0' }, text: 'Only the host can see these details and your portfolio. Other investors cannot.' })),
    h('section', { class: 'card quiet', id: 'notices' }, h('h3', { text: 'Notices', style: { marginBottom: '6px' } }), notes),
    h('section', { class: 'card quiet' }, h('div', { class: 'row between' }, h('h3', { text: 'Appearance' }), theme)),
    h('button', { class: 'btn ghost block', type: 'button', onclick: signOut }, icon('out'), 'Sign out')));
  let sig = '';
  function draw() {
    const me = S.me; if (!me) return;
    const s = JSON.stringify([me.name, me.loans]);
    if (s === sig) return;
    sig = s;
    const row = (k, v) => [h('dt', { text: k }), h('dd', { text: v || '—' })];
    swap(prof, row('Name', me.name), row('Email', me.email), row('Phone', me.phone), row('School / team', me.org), row('Joined', when(me.joined)));
    const unread = new Set(unreadNotices().map((n) => n.id));
    swap(notes, noticeList(allNotices(), unread));
    if (unread.size) markNoticesRead();
  }
  subs.add(draw);
  return {};
}

export function setTheme(th) {
  document.documentElement.dataset.theme = th;
  try { localStorage.setItem('theme', th); } catch { /* fine */ }
  window.dispatchEvent(new Event('themechange'));
  publish();
}
