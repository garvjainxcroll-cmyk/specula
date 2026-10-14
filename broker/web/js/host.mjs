// The host console: open and close the market, move any stock up or down, see every
// investor's details and portfolio (the dataset), arrange loans, post updates.
// Only the host's password unlocks it; investors never receive any of this.
import { h, set, swap, tickText, icon, toast, sheet, confirmBox, download, csvCell } from './dom.mjs';
import { rs, amt, signedRs, pct, qty, dir, arrow, clock, hm, when, ago, mins, compact } from './fmt.mjs';
import { get, post, net, token, setToken, loop, onNet } from './net.mjs';
import { STOCKS, BY_T, START_CASH } from '../src/stocks.mjs';
import { ensure, series, tick } from './series.mjs';
import { lineChart, spark } from './chart.mjs';
import { setTheme } from './investor.mjs';

let root; let poller = null; let shell = null; let view = null;
const H = { data: null, prev: null };
const subs = new Set();
const tokenH = () => token('host');
const pad = (n) => String(n).padStart(2, '0');

export function startHost(el) {
  root = el;
  if (!tokenH()) return renderAuth();
  renderShell();
}

// ======================= sign in =======================

async function renderAuth() {
  poller?.stop(); poller = null; shell = null;
  swap(root, h('p', { class: 'boot', text: 'Loading the host console…' }));
  let setup = true;
  try { const r = await get('host/status'); setup = r.setup; } catch (e) {
    swap(root, h('main', { class: 'auth-form', style: { minHeight: '100vh' } }, h('div', { class: 'card' },
      h('h2', { text: 'The live server is not running' }),
      h('p', { class: 'muted', style: { marginTop: '10px' }, text: e.message === 'no-server' ? 'This copy of the website was published without its server function. Follow DEPLOY.md (the GitHub way) to put it online with the server.' : 'Could not reach the server. Check the internet connection and reload.' }))));
    return;
  }
  const err = h('p', { class: 'form-error', role: 'alert' });
  const pass = h('input', { type: 'password', name: 'password', autocomplete: setup ? 'current-password' : 'new-password', required: true });
  const pass2 = h('input', { type: 'password', name: 'password2', autocomplete: 'new-password' });
  const form = h('form', { novalidate: true },
    h('label', { class: 'field' }, h('span', { text: setup ? 'Host password' : 'Choose the host password (at least 6 characters)' }), pass),
    setup ? null : h('label', { class: 'field' }, h('span', { text: 'Type it again' }), pass2),
    err, h('button', { class: 'btn block lg', type: 'submit', text: setup ? 'Open the console' : 'Save password and open the console' }),
    setup ? null : h('p', { class: 'tiny muted', text: 'Write it down. Anyone with this password controls the market, so do this before you share the website link.' }));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!setup && pass.value !== pass2.value) { set(err, 'The two passwords are different.'); return; }
    const btn = form.querySelector('button'); btn.disabled = true;
    try {
      const r = await post(setup ? 'host/login' : 'host/setup', { password: pass.value });
      if (!r.ok) { set(err, r.error); return; }
      setToken('host', r.token);
      renderShell();
    } catch { set(err, 'Could not reach the server. Please try again.'); } finally { btn.disabled = false; }
  });
  swap(root, h('main', { class: 'auth' },
    h('section', { class: 'auth-art' },
      h('p', { class: 'eyebrow', text: 'Host console' }),
      h('h1', {}, 'Run the market.'),
      h('p', { class: 'lead', text: 'Open and close trading, move any of the ten stocks, see every investor’s portfolio, arrange loans and post updates.' })),
    h('section', { class: 'auth-form' }, h('div', { class: 'card' },
      h('p', { class: 'eyebrow', text: setup ? 'Sign in' : 'First visit' }),
      h('h2', { text: setup ? 'Host sign in' : 'Choose the host password', style: { margin: '6px 0 16px' } }), form))));
  pass.focus();
}

// ======================= shell =======================

const TABS = [
  ['market', 'Market', 'chart'], ['data', 'Dataset', 'table'], ['loans', 'Loans', 'coins'], ['updates', 'Updates', 'news'], ['settings', 'Settings', 'cog'],
];

function renderShell() {
  const mkt = h('span', { class: 'mkt' }, h('i'), h('b', { text: 'Connecting…' }));
  const clk = h('span', { class: 'clock num' });
  const toggle = h('button', { class: 'btn sm', type: 'button', onclick: toggleMarket, text: '…' });
  const nav = h('nav', { class: 'top-nav', 'aria-label': 'Host' }, TABS.map(([k, label]) => h('a', { href: `#/host/${k}`, 'data-key': k, text: label })));
  const top = h('header', { class: 'top' },
    h('div', { class: 'top-l' }, h('span', { class: 'eyebrow', text: 'Host' }), mkt, clk), nav,
    h('div', { class: 'top-r' }, toggle));
  const banner = h('div');
  const kpis = h('dl', { class: 'host-kpis', style: { margin: '0 0 24px' } });
  const body = h('div');
  const main = h('main', { class: 'host-main' }, kpis, body);
  const tabbar = h('nav', { class: 'tabbar', 'aria-label': 'Host' }, TABS.map(([k, label, ic]) => h('a', { href: `#/host/${k}`, 'data-key': k }, icon(ic), label)));
  swap(root, h('div', { class: 'app host' }, top, banner, main, tabbar));
  const k = {};
  for (const [key, label] of [['n', 'Investors'], ['liq', 'Total liquidable money'], ['pnl', 'Total P&L'], ['loans', 'Ongoing loans'], ['moves', 'Stocks you have moved']]) {
    k[key] = h('dd', { class: 'num' });
    kpis.append(h('div', { class: 'card quiet' }, h('dt', { class: 'muted small', text: label }), k[key]));
  }
  shell = { mkt, clk, toggle, nav, tabbar, banner, body, k };
  setInterval(() => { if (shell) set(clk, clock(net.now())); }, 1000);
  onNet(drawBanner);
  window.addEventListener('hashchange', onRoute);
  ensure('30m').then(publish);
  poller = loop(poll, 1500, 6000);
  onRoute();
}

function drawBanner() {
  if (!shell) return;
  swap(shell.banner, !net.online ? h('div', { class: 'bar off', text: 'Connection lost. Reconnecting…' }) : null);
}

async function poll() {
  const r = await get('host/poll', tokenH());
  if (r.status === 401) { setToken('host', ''); toast('Please sign in as the host again.', { kind: 'err' }); renderAuth(); return; }
  if (!r.ok) return;
  H.prev = H.data; H.data = r;
  if (tick(r.mk, r.now)) ensure('30m').then(publish);
  publish();
}
const refresh = () => poller?.now();

function publish() {
  const d = H.data; if (!shell || !d) return;
  shell.mkt.className = `mkt ${d.mk.open ? 'open' : 'closed'}`;
  set(shell.mkt.lastChild, d.mk.open ? 'Market open' : 'Market closed');
  set(shell.toggle, d.mk.open ? 'Close market' : 'Open market');
  shell.toggle.className = `btn sm${d.mk.open ? ' ghost' : ''}`;
  const tl = d.users.reduce((s, u) => s + u.sum.liq, 0); const tp = d.users.reduce((s, u) => s + u.sum.pnl, 0);
  const on = d.loans.filter((L) => L.status === 'ongoing');
  set(shell.k.n, qty(d.users.length));
  set(shell.k.liq, compact(tl));
  set(shell.k.pnl, `${arrow(tp)} ${signedRs(tp)}`); shell.k.pnl.className = `num ${dir(tp)}`;
  set(shell.k.loans, on.length ? `${on.length} · ${compact(on.reduce((s, L) => s + L.amount, 0))}` : '0');
  set(shell.k.moves, String(STOCKS.filter((s) => Math.abs(d.mk.lv[s.t] - 1) > 1e-9).length));
  drawBanner();
  for (const fn of subs) fn();
}

async function toggleMarket() {
  const open = !H.data?.mk.open;
  try {
    const r = await post('host/market', { open }, tokenH());
    if (!r.ok) { toast(r.error, { kind: 'err' }); return; }
    toast(open ? 'Prices are moving and investors can trade.' : 'Prices are paused and orders are refused.', { title: open ? 'Market open' : 'Market closed' });
    refresh();
  } catch { toast('Could not reach the server.', { kind: 'err' }); }
}

function onRoute() {
  if (!shell) return;
  const key = (location.hash.split('/')[2] || 'market');
  const k = TABS.some((t) => t[0] === key) ? key : 'market';
  for (const a of [...shell.nav.children, ...shell.tabbar.children]) { if (a.dataset.key === k) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }
  if (view?.key === k) return;
  view?.destroy?.();
  subs.clear();
  shell.body.replaceChildren();
  view = ({ market: MarketView, data: DataView, loans: LoansView, updates: UpdatesView, settings: SettingsView }[k])(shell.body) || {};
  view.key = k;
  window.scrollTo(0, 0);
  if (H.data) for (const fn of subs) fn();
}

const DURS = [[0, 'Instantly'], [10, 'Over 10 s'], [30, 'Over 30 s'], [60, 'Over 1 min'], [300, 'Over 5 min'], [900, 'Over 15 min'], [1800, 'Over 30 min']];

// ======================= market control =======================

function MarketView(el) {
  const cards = {};
  const grid = h('div', { class: 'mc-grid' });
  for (const s of STOCKS) {
    const px = h('span', { class: 'px num' }); const ch = h('span', { class: 'ch num' });
    const lvl = h('p', { class: 'mc-level' }); const exp = h('p', { class: 'mc-exp' });
    const c = h('canvas', { class: 'spark', style: { width: '100%', height: '64px' }, 'aria-hidden': 'true' });
    const dur = h('select', { 'aria-label': `How fast ${s.t} moves` }, DURS.map(([v, l]) => h('option', { value: String(v), text: l })));
    const mode = h('select', { 'aria-label': 'Kind of move' }, h('option', { value: 'pct', text: 'Change %' }), h('option', { value: 'price', text: 'Set price ₹' }));
    const val = h('input', { type: 'number', step: 'any', inputmode: 'decimal', placeholder: '−3 or 4.5', 'aria-label': 'Amount' });
    mode.addEventListener('change', () => { val.placeholder = mode.value === 'pct' ? '−3 or 4.5' : `e.g. ${Math.round(s.base / 100)}`; });
    const quick = h('div', { class: 'mc-quick' }, [-10, -5, -2, 2, 5, 10].map((v) => h('button', { type: 'button', class: v < 0 ? 'dn' : 'upb', text: `${v > 0 ? '+' : '−'}${Math.abs(v)}%`, 'aria-label': `${s.t} ${v > 0 ? 'up' : 'down'} ${Math.abs(v)} percent`, onclick: () => move(s.t, 'pct', v, Number(dur.value)) })));
    const form = h('form', { class: 'mc-custom', novalidate: true }, mode, val, dur, h('button', { class: 'btn sm', type: 'submit', text: 'Apply' }));
    form.addEventListener('submit', (e) => { e.preventDefault(); if (val.value.trim() === '') { val.focus(); return; } move(s.t, mode.value, Number(val.value), Number(dur.value)).then((ok) => { if (ok) val.value = ''; }); });
    const base = h('button', { class: 'linkbtn', type: 'button', text: 'Back to listed price', onclick: () => move(s.t, 'base', 0, Number(dur.value)) });
    cards[s.t] = { px, ch, lvl, exp, c };
    grid.append(h('article', { class: 'card quiet mc' },
      h('header', {}, h('div', {}, h('span', { class: 'tk', text: s.t }), h('span', { class: 'nm', text: s.name })), h('div', {}, px, ch)),
      lvl, c, exp, quick, form, h('div', { class: 'mc-foot' }, h('span', { class: 'tiny muted', text: `Listed ${rs(s.base)} · ${s.sector}` }), base)));
  }
  const log = h('div');
  el.append(
    h('div', { class: 'card-head' }, h('div', {}, h('p', { class: 'eyebrow', text: 'Only you can see this' }), h('h1', { text: 'Market control', style: { marginTop: '6px' } })),
      h('p', { class: 'muted small', style: { maxWidth: '62ch', margin: 0 }, text: 'Each stock wiggles a little on its own and averages to its listed price. Your moves shift it up or down from there and stay until you move it again. Every holder’s money changes at once. Investors see only prices, never your moves.' })),
    grid,
    h('section', { class: 'card quiet', style: { marginTop: '24px' } }, h('div', { class: 'card-head' }, h('h3', { text: 'Your moves' }), h('span', { class: 'only-host', text: 'Only you can see this' })), log));
  let sigLog = '';
  function draw() {
    const d = H.data; if (!d) return;
    const sp = series('30m');
    const exposure = {};
    for (const u of d.users) for (const x of u.h) { const e = (exposure[x.t] ||= { n: 0, q: 0 }); e.n++; e.q += x.q; }
    for (const s of STOCKS) {
      const c = cards[s.t]; const p = d.mk.p[s.t]; const o = d.mk.o[s.t];
      tickText(c.px, rs(p), H.prev ? p - H.prev.mk.p[s.t] : 0);
      const chg = ((p - o) / o) * 100;
      set(c.ch, `${arrow(chg)} ${pct(chg)} since open`); c.ch.className = `ch num ${dir(chg)}`;
      const lv = (d.mk.lv[s.t] - 1) * 100;
      const last = d.moves.find((m) => m.t === s.t);
      const ramp = last && last.dur > 0 && d.mk.m < last.m + last.dur ? Math.ceil((last.m + last.dur - d.mk.m) / 1000) : 0;
      swap(c.lvl,
        Math.abs(lv) < 0.005 ? h('span', { class: 'pill', text: 'No move: automatic only' }) : h('span', { class: `pill ${dir(lv)}`, text: `Your level ${arrow(lv)} ${pct(lv, 1)}` }),
        ramp ? h('span', { class: 'pill gold', text: `Moving to ${pct((last.to - 1) * 100, 1)} · ${ramp}s${d.mk.open ? '' : ' (paused: market closed)'}` }) : null);
      const e = exposure[s.t];
      set(c.exp, e ? `${e.n} holder${e.n > 1 ? 's' : ''} · ${qty(e.q)} shares · ${compact(e.q * p)} at stake` : 'No investor holds it yet.');
      if (sp) spark(c.c, sp.p[s.t], dir(sp.p[s.t].at(-1) - sp.p[s.t][0]), o);
    }
    const s2 = JSON.stringify(d.moves.slice(0, 60));
    if (s2 !== sigLog) {
      sigLog = s2;
      if (!d.moves.length) swap(log, h('p', { class: 'muted', style: { margin: 0 }, text: 'No moves yet. Prices are moving on their own around the listed prices.' }));
      else swap(log, h('div', { class: 'scroll-x' }, h('table', { class: 'tbl' },
        h('thead', {}, h('tr', {}, ['Time', 'Stock', 'Move', 'Speed', 'Level before', 'Level after'].map((x, i) => h('th', { class: i > 3 ? 'num' : '', text: x })))),
        h('tbody', {}, d.moves.slice(0, 60).map((m) => h('tr', {},
          h('td', { class: 'nowrap', text: clock(m.w) }), h('td', {}, h('span', { class: 'tk', text: m.t })), h('td', { text: m.label }),
          h('td', { text: m.dur ? `over ${ago(m.dur)}` : 'instant' }),
          h('td', { class: 'num', text: pct((m.from - 1) * 100, 1) }), h('td', { class: `num ${dir(m.to - m.from)}`, text: pct((m.to - 1) * 100, 1) })))))));
    }
  }
  subs.add(draw);
  return {};
}

async function move(t, mode, value, secs) {
  try {
    const r = await post('host/move', { t, mode, value, secs }, tokenH());
    if (!r.ok) { toast(r.error, { kind: 'err' }); return false; }
    const how = secs ? `over ${ago(secs * 1000)}` : 'instantly';
    toast(`${t}: ${r.move.label}, ${how}. Level now ${pct((r.move.to - 1) * 100, 1)} from the listed price.`, { title: 'Move applied' });
    refresh();
    return true;
  } catch { toast('Could not reach the server. The move was not made.', { kind: 'err' }); return false; }
}

// ======================= dataset =======================

const COLS = [
  ['no', '#', (u) => u.no, true], ['name', 'Name and email', (u) => u.name.toLowerCase()], ['phone', 'Phone', (u) => u.phone],
  ['org', 'School / team', (u) => (u.org || '').toLowerCase()], ['joined', 'Signed up', (u) => u.joined, true],
  ['cash', 'Cash', (u) => u.sum.cash, true], ['hv', 'Holdings value', (u) => u.sum.hv, true], ['liq', 'Total liquidable money', (u) => u.sum.liq, true],
  ['loan', 'Loans: due to / owed by', (u) => u.sum.rec - u.sum.pay, true], ['nw', 'Net worth', (u) => u.sum.nw, true],
  ['pnl', 'Total P&L', (u) => u.sum.pnl, true],
];

function DataView(el) {
  let sort = ['pnl', -1];
  const q = h('input', { type: 'search', placeholder: 'Search name, email, phone…', 'aria-label': 'Search investors' });
  const wrap = h('div', { class: 'scroll-x' }); const count = h('span', { class: 'muted small' });
  const loansWrap = h('div'); const lcount = h('span', { class: 'muted small' });
  el.append(
    h('div', { class: 'card-head' }, h('div', {}, h('p', { class: 'eyebrow', text: 'Only you can see this' }), h('h1', { text: 'Dataset', style: { marginTop: '6px' } })),
      h('p', { class: 'muted small', style: { maxWidth: '60ch', margin: 0 }, text: 'Everyone who has signed up, with their details and money, live. Total liquidable money is cash plus what their shares would sell for now. Click a row to see the whole portfolio.' })),
    h('section', { class: 'card quiet host-sec' },
      h('div', { class: 'card-head' }, h('div', { class: 'row' }, h('h2', { text: 'Investors' }), count),
        h('div', { class: 'toolbar' }, q, h('button', { class: 'btn ghost sm', type: 'button', onclick: csvInvestors, text: 'Download CSV' }))),
      wrap),
    h('section', { class: 'card quiet host-sec' },
      h('div', { class: 'card-head' }, h('div', { class: 'row' }, h('h2', { text: 'Loans' }), lcount),
        h('div', { class: 'toolbar' }, h('a', { class: 'btn ghost sm', href: '#/host/loans', text: 'Arrange a loan' }), h('button', { class: 'btn ghost sm', type: 'button', onclick: csvLoans, text: 'Download CSV' }))),
      loansWrap));
  q.addEventListener('input', () => draw(true));
  let sig = ''; let lsig = '';
  function draw(force) {
    const d = H.data; if (!d) return;
    const s = JSON.stringify([d.users.map((u) => [u.id, u.sum, u.name]), sort]);
    if (force || s !== sig) {
      sig = s;
      const needle = q.value.trim().toLowerCase();
      const col = COLS.find((c) => c[0] === sort[0]);
      const rows = d.users.filter((u) => !needle || `${u.name} ${u.email} ${u.phone} ${u.org}`.toLowerCase().includes(needle))
        .sort((a, b) => { const x = col[2](a); const y = col[2](b); return (x > y ? 1 : x < y ? -1 : 0) * sort[1]; });
      set(count, `${d.users.length} signed up`);
      if (!d.users.length) { swap(wrap, h('div', { class: 'empty' }, h('h3', { text: 'Nobody has signed up yet' }), h('p', { style: { margin: 0 }, text: 'Share the website link: each investor creates an account on the sign-in page.' }))); }
      else {
        const head = h('tr', {}, COLS.map(([key, label, , numeric]) => {
          const th = h('th', { class: numeric && key !== 'joined' ? 'num' : '' }, h('button', { type: 'button', text: label, onclick: () => { sort = [key, sort[0] === key ? -sort[1] : (numeric ? -1 : 1)]; draw(true); } }));
          if (sort[0] === key) th.setAttribute('aria-sort', sort[1] > 0 ? 'ascending' : 'descending');
          return th;
        }));
        swap(wrap, h('table', { class: 'tbl nowrap' }, h('thead', {}, head), h('tbody', {}, rows.map((u) => {
          const net = u.sum.rec - u.sum.pay;
          return h('tr', { class: 'click', tabindex: '0', onclick: () => openInvestor(u.id), onkeydown: (e) => { if (e.key === 'Enter') openInvestor(u.id); } },
            h('td', { class: 'num muted', text: String(u.no) }),
            h('td', {}, h('b', { text: u.name, style: { fontWeight: 600 } }), h('span', { class: 'sub', text: u.email })),
            h('td', { text: u.phone }), h('td', { text: u.org || '—' }), h('td', { text: when(u.joined) }),
            h('td', { class: `num ${u.sum.cash < 0 ? 'down' : ''}`, text: rs(u.sum.cash) }), h('td', { class: 'num', text: rs(u.sum.hv) }),
            h('td', { class: 'num gold', style: { fontWeight: 600, fontSize: '18px' }, text: rs(u.sum.liq) }),
            h('td', { class: 'num', text: u.sum.rec || u.sum.pay ? `${u.sum.rec ? `+${amt(u.sum.rec)}` : ''}${u.sum.rec && u.sum.pay ? ' / ' : ''}${u.sum.pay ? `−${amt(u.sum.pay)}` : ''}` : '—', title: net ? `Net ${signedRs(net)}` : '' }),
            h('td', { class: 'num', text: rs(u.sum.nw) }),
            h('td', { class: `num ${dir(u.sum.pnl)}` }, `${arrow(u.sum.pnl)} ${signedRs(u.sum.pnl)}`, h('span', { class: `sub ${dir(u.sum.pct)}`, text: pct(u.sum.pct) })));
        }))));
      }
    }
    const ls = JSON.stringify(d.loans) + Math.floor(d.now / 1000);
    if (ls !== lsig) { lsig = ls; set(lcount, `${d.loans.length} in all`); swap(loansWrap, loansTable(d.loans, d.now, false)); }
  }
  subs.add(() => draw(false));
  return {};
}

function loanStatus(L, now) {
  if (L.status === 'ongoing') return h('span', { class: 'status ongoing', text: `Ongoing · ${ago(L.due - now)} left` });
  if (L.status === 'elapsed') return h('span', { class: 'status elapsed', text: `Elapsed · repaid ${hm(L.settledAt)}` });
  return h('span', { class: 'status cancelled', text: `Cancelled ${hm(L.cancelledAt)}` });
}

function loansTable(loans, now, withCancel) {
  if (!loans.length) return h('p', { class: 'muted', style: { margin: 0 }, text: 'No loans yet.' });
  const list = loans.slice().sort((a, b) => b.n - a.n);
  return h('div', { class: 'scroll-x' }, h('table', { class: 'tbl nowrap' },
    h('thead', {}, h('tr', {}, ['Loan', 'Lender', 'Borrower', 'Initial amount', 'Interest', 'Final amount', 'Deadline set', 'Due at', 'Status', withCancel ? '' : null].filter((x) => x !== null).map((x, i) => h('th', { class: i >= 3 && i <= 5 ? 'num' : '', text: x })))),
    h('tbody', {}, list.map((L) => h('tr', {},
      h('td', { class: 'nowrap' }, h('b', { text: L.id })), h('td', { text: L.lenderName }), h('td', { text: L.borrowerName }),
      h('td', { class: 'num', text: rs(L.amount) }), h('td', { class: 'num', text: `${L.rate}%` }), h('td', { class: 'num', style: { fontWeight: 600 }, text: rs(L.final) }),
      h('td', { class: 'nowrap', text: mins(L.mins) }), h('td', { class: 'nowrap num', text: when(L.due) }),
      h('td', {}, loanStatus(L, now),
        L.sold?.length ? h('span', { class: 'sub warn', text: `Sold: ${L.sold.map(([t, q]) => `${qty(q)} ${t}`).join(', ')}` }) : null,
        L.short ? h('span', { class: 'sub down', text: `Borrower’s cash ${rs(L.short)} below zero` }) : null),
      withCancel ? h('td', {}, L.status === 'ongoing' ? h('button', { class: 'btn danger sm', type: 'button', text: 'Cancel', onclick: () => cancelLoan(L) }) : null) : null)))));
}

async function cancelLoan(L) {
  if (!(await confirmBox(`Cancel loan ${L.id}?`, `${rs(L.amount)} goes back from ${L.borrowerName} to ${L.lenderName}, with no interest. Both are told.`, 'Cancel the loan', true))) return;
  const r = await post('host/loan/cancel', { id: L.id }, tokenH()).catch(() => null);
  if (!r?.ok) { toast(r?.error || 'Could not reach the server.', { kind: 'err' }); return; }
  toast(`Loan ${L.id} cancelled.`); refresh();
}

function csvInvestors() {
  const d = H.data; if (!d) return;
  const head = ['#', 'Name', 'Email', 'Phone', 'School / team', 'Signed up', 'Last sign-in', 'Cash (₹)', 'Holdings value (₹)', 'Total liquidable money (₹)', 'Loans due to them (₹)', 'Loans they owe (₹)', 'Net worth (₹)', 'Total P&L (₹)', 'P&L %', 'Orders', 'Holdings'];
  const rows = d.users.slice().sort((a, b) => a.no - b.no).map((u) => [u.no, u.name, u.email, u.phone, u.org, new Date(u.joined).toLocaleString('en-IN'), u.last ? new Date(u.last).toLocaleString('en-IN') : '',
    u.sum.cash / 100, u.sum.hv / 100, u.sum.liq / 100, u.sum.rec / 100, u.sum.pay / 100, u.sum.nw / 100, u.sum.pnl / 100, u.sum.pct, u.ntr,
    u.h.map((x) => `${x.t} ${x.q}`).join('; ')]);
  download(`investors-${stamp()}.csv`, [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n'));
}
function csvLoans() {
  const d = H.data; if (!d) return;
  const head = ['Loan', 'Lender', 'Borrower', 'Initial amount (₹)', 'Interest %', 'Final amount (₹)', 'Deadline set', 'Started', 'Due at', 'Status', 'Repaid / cancelled at', 'Shares sold to repay'];
  const rows = d.loans.slice().sort((a, b) => a.n - b.n).map((L) => [L.id, L.lenderName, L.borrowerName, L.amount / 100, L.rate, L.final / 100, mins(L.mins),
    new Date(L.start).toLocaleString('en-IN'), new Date(L.due).toLocaleString('en-IN'), L.status === 'ongoing' ? 'Ongoing' : L.status === 'elapsed' ? 'Elapsed' : 'Cancelled',
    L.settledAt || L.cancelledAt ? new Date(L.settledAt || L.cancelledAt).toLocaleString('en-IN') : '', (L.sold || []).map(([t, q, p]) => `${q} ${t} @ ${p / 100}`).join('; ')]);
  download(`loans-${stamp()}.csv`, [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n'));
}
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

// ---------- one investor's whole portfolio ----------

function openInvestor(id) {
  const body = h('div', {}, h('p', { class: 'muted', text: 'Loading…' }));
  const close = sheet('Investor', body, { wide: true, autofocus: false });
  let chart = null; let timer = null; let first = true;
  const load = async () => {
    if (!body.isConnected) { clearInterval(timer); chart?.destroy(); return; }
    const r = await get(`host/user?id=${encodeURIComponent(id)}`, tokenH()).catch(() => null);
    if (!r?.ok) { if (first) swap(body, h('p', { class: 'form-error', text: r?.error || 'Could not load this investor.' })); return; }
    const u = r.user; const d = H.data;
    const title = body.closest('.sheet')?.querySelector('.sheet-head h2');
    if (title) set(title, u.name);
    const kv = (label, v, cls = '') => h('div', { class: 'kpi' }, h('dt', { text: label }), h('dd', { class: `num ${cls}`, text: v }));
    const box = h('div', { class: 'chart-box short' });
    const hs = u.h.map((x) => { const p = d?.mk.p[x.t] ?? 0; return { ...x, p, val: x.q * p, pl: x.q * p - x.cost }; }).sort((a, b) => b.val - a.val);
    const del = h('button', { class: 'btn danger sm', type: 'button', text: 'Delete this account', onclick: async () => {
      if (!(await confirmBox(`Delete ${u.name}?`, 'Their account, portfolio and orders are removed for good. Their loans stay in the records.', 'Delete', true))) return;
      const x = await post('host/user/delete', { id: u.id }, tokenH()).catch(() => null);
      if (!x?.ok) { toast(x?.error || 'Could not reach the server.', { kind: 'err' }); return; }
      toast(`${u.name} was deleted.`); close(); refresh();
    } });
    const scrollTop = body.closest('.sheet')?.scrollTop;
    swap(body,
      h('p', { class: 'muted', style: { marginTop: '-8px' } }, `${u.email} · ${u.phone}${u.org ? ` · ${u.org}` : ''} · signed up ${when(u.joined)}${u.last ? ` · last sign-in ${when(u.last)}` : ''}`),
      h('dl', { class: 'kpis k6', style: { margin: '0 0 16px' } },
        kv('Total liquidable money', rs(u.sum.liq), 'gold'), kv('Cash', rs(u.sum.cash), u.sum.cash < 0 ? 'down' : ''), kv('Holdings value', rs(u.sum.hv)),
        kv('Net worth', rs(u.sum.nw)), kv('Total P&L', `${arrow(u.sum.pnl)} ${signedRs(u.sum.pnl)}`, dir(u.sum.pnl)), kv('P&L %', pct(u.sum.pct), dir(u.sum.pct))),
      h('section', { class: 'card quiet tight' }, h('h3', { text: 'Net worth over time', style: { marginBottom: '8px' } }), box),
      h('div', { class: 'drawer-grid', style: { marginTop: '16px' } },
        h('section', { class: 'card quiet tight' }, h('h3', { text: `Holdings (${hs.length})`, style: { marginBottom: '8px' } }),
          hs.length ? h('div', { class: 'scroll-x' }, h('table', { class: 'tbl' },
            h('thead', {}, h('tr', {}, ['Stock', 'Qty', 'Avg', 'Now', 'Value', 'P&L'].map((x, i) => h('th', { class: i ? 'num' : '', text: x })))),
            h('tbody', {}, hs.map((x) => h('tr', {}, h('td', {}, h('span', { class: 'tk', text: x.t })), h('td', { class: 'num', text: qty(x.q) }),
              h('td', { class: 'num', text: amt(Math.round(x.cost / x.q)) }), h('td', { class: 'num', text: amt(x.p) }), h('td', { class: 'num', text: amt(x.val) }),
              h('td', { class: `num ${dir(x.pl)}`, text: `${arrow(x.pl)} ${signedRs(x.pl)}` })))))) : h('p', { class: 'muted', style: { margin: 0 }, text: 'No shares.' })),
        h('section', { class: 'card quiet tight' }, h('h3', { text: `Orders (${u.tr.length})`, style: { marginBottom: '8px' } }),
          u.tr.length ? h('ul', { class: 'list-plain', style: { maxHeight: '320px', overflowY: 'auto' } }, u.tr.slice(0, 300).map((x) => h('li', { class: 'trade-row' },
            h('span', { class: `side ${x.q > 0 ? 'b' : 's'}`, text: x.q > 0 ? 'BUY' : 'SELL' }),
            h('span', {}, `${qty(Math.abs(x.q))} ${x.t} at ${rs(x.p)}`, x.f ? h('span', { class: 'muted small', text: ' · loan repayment' }) : null),
            h('span', { class: 'muted tiny', text: when(x.w) })))) : h('p', { class: 'muted', style: { margin: 0 }, text: 'No orders.' }))),
      h('section', { class: 'card quiet tight', style: { marginTop: '16px' } }, h('h3', { text: 'Loans', style: { marginBottom: '8px' } }), loansTable(r.loans, r.now, false)),
      h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '16px' } }, del));
    if (scrollTop) body.closest('.sheet').scrollTop = scrollTop;
    chart?.destroy();
    chart = lineChart(box, { fmtY: (v, full) => (full ? rs(v) : compact(v).replace('₹', '')), fmtX: hm, fmtTip: clock });
    chart.set({ xs: r.hist.ws, ws: r.hist.ws, ys: r.hist.nw, ref: START_CASH, refFit: true, refLabel: 'Started with ₹10,00,000', tone: dir(u.sum.nw - START_CASH), label: `${u.name}: net worth` });
    first = false;
  };
  load();
  timer = setInterval(load, 4000);
}

// ======================= loans =======================

function LoansView(el) {
  const lender = h('select', { name: 'lender', required: true }); const borrower = h('select', { name: 'borrower', required: true });
  const amount = h('input', { type: 'text', name: 'amount', inputmode: 'decimal', placeholder: 'e.g. 50,000', required: true });
  const rate = h('input', { type: 'number', name: 'rate', step: 'any', min: '0', value: '10', required: true });
  const dl = h('input', { type: 'number', name: 'dl', step: 'any', min: '0.1', value: '30', required: true });
  const unit = h('select', { name: 'unit', 'aria-label': 'Minutes or hours' }, h('option', { value: '1', text: 'minutes' }), h('option', { value: '60', text: 'hours' }));
  const preview = h('p', { class: 'preview', 'aria-live': 'polite' });
  const err = h('p', { class: 'form-error', role: 'alert' });
  const go = h('button', { class: 'btn lg', type: 'submit', text: 'Send the loan' });
  const form = h('form', { class: 'form-grid', novalidate: true },
    h('label', { class: 'field' }, h('span', { text: 'Lender (money leaves their cash now)' }), lender),
    h('label', { class: 'field' }, h('span', { text: 'Borrower (money arrives now)' }), borrower),
    h('label', { class: 'field' }, h('span', { text: 'Amount (₹)' }), amount),
    h('label', { class: 'field' }, h('span', { text: 'Interest for the whole loan (%)' }), rate),
    h('label', { class: 'field' }, h('span', { text: 'Deadline: repaid automatically after' }), h('div', { class: 'deadline' }, dl, unit)),
    h('div', { class: 'field wide' }, preview), h('div', { class: 'wide' }, err, go));
  const listWrap = h('div');
  el.append(
    h('div', { class: 'card-head' }, h('div', {}, h('p', { class: 'eyebrow', text: 'Only you can arrange these' }), h('h1', { text: 'Loans', style: { marginTop: '6px' } })),
      h('p', { class: 'muted small', style: { maxWidth: '62ch', margin: 0 }, text: 'A loan needs no approval. The amount moves from the lender to the borrower at once. At the deadline the website takes the amount plus interest from the borrower and pays it to the lender, and tells them both. If the borrower is short of cash, their shares are sold to cover it.' })),
    h('section', { class: 'card host-sec' }, h('h2', { text: 'Arrange a loan', style: { marginBottom: '16px' } }), form),
    h('section', { class: 'card quiet host-sec' }, h('div', { class: 'card-head' }, h('h2', { text: 'All loans' }), h('button', { class: 'btn ghost sm', type: 'button', onclick: csvLoans, text: 'Download CSV' })), listWrap));
  const paise = () => { const n = Number(amount.value.replace(/[₹,\s]/g, '')); return Number.isFinite(n) ? Math.round(n * 100) : NaN; };
  const minutes = () => Number(dl.value) * Number(unit.value);
  function drawPreview() {
    const d = H.data; if (!d) return;
    const l = d.users.find((u) => u.id === lender.value); const b = d.users.find((u) => u.id === borrower.value);
    const a = paise(); const r = Number(rate.value); const m = minutes();
    if (!l || !b || !(a > 0) || !(r >= 0) || !(m > 0)) { set(preview, 'Choose the lender and the borrower, and type the amount, the interest and the deadline.'); return; }
    if (l.id === b.id) { set(preview, 'The lender and the borrower must be different people.'); return; }
    const fin = Math.round(a * (1 + r / 100));
    set(preview, `Now: ${rs(a)} moves from ${l.name} (cash ${rs(l.sum.cash)}) to ${b.name}. At about ${hm(net.now() + m * 60000)} (after ${mins(m)}): ${rs(fin)} (${rs(fin - a)} interest) moves from ${b.name} back to ${l.name}.${l.sum.cash < a ? ` ${l.name} does not have enough cash.` : ''}`);
  }
  for (const x of [lender, borrower, amount, rate, dl, unit]) x.addEventListener('input', drawPreview);
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); set(err, '');
    const d = H.data;
    const l = d?.users.find((u) => u.id === lender.value); const b = d?.users.find((u) => u.id === borrower.value);
    if (!l || !b) { set(err, 'Choose both the lender and the borrower.'); return; }
    if (!(await confirmBox('Send this loan?', preview.textContent, 'Send the loan'))) return;
    go.disabled = true;
    try {
      const r = await post('host/loan', { lender: l.id, borrower: b.id, amount: amount.value, rate: rate.value, mins: minutes() }, tokenH());
      if (!r.ok) { set(err, r.error); return; }
      toast(`${rs(r.loan.amount)} sent from ${l.name} to ${b.name}. ${rs(r.loan.final)} comes back at ${hm(r.loan.due)}.`, { title: `Loan ${r.loan.id} sent` });
      amount.value = '';
      refresh();
    } catch { set(err, 'Could not reach the server. The loan was not sent.'); } finally { go.disabled = false; }
  });
  let usig = ''; let lsig = '';
  function draw() {
    const d = H.data; if (!d) return;
    const us = JSON.stringify(d.users.map((u) => [u.id, u.name, Math.floor(u.sum.cash / 100)]));
    if (us !== usig) {
      usig = us;
      for (const [sel, ph] of [[lender, 'Choose the lender'], [borrower, 'Choose the borrower']]) {
        const cur = sel.value;
        swap(sel, h('option', { value: '', text: d.users.length < 2 ? 'At least two investors must sign up first' : ph }),
          d.users.slice().sort((a, b) => a.name.localeCompare(b.name)).map((u) => h('option', { value: u.id, text: `${u.name} · cash ${rs(u.sum.cash)}` })));
        sel.value = d.users.some((u) => u.id === cur) ? cur : '';
      }
    }
    const ls = JSON.stringify(d.loans) + Math.floor(d.now / 1000);
    if (ls !== lsig) { lsig = ls; swap(listWrap, loansTable(d.loans, d.now, true)); }
    drawPreview();
  }
  subs.add(draw);
  return {};
}

// ======================= updates =======================

function UpdatesView(el) {
  const text = h('textarea', { name: 'text', maxlength: '4000', placeholder: 'Type the update investors should read…', 'aria-label': 'Update text' });
  const err = h('p', { class: 'form-error', role: 'alert' });
  const go = h('button', { class: 'btn', type: 'submit', text: 'Post update' });
  const form = h('form', { novalidate: true }, text, err, h('div', { class: 'row between' }, h('span', { class: 'muted small', text: 'Every investor sees it at once, numbered in order.' }), go));
  const list = h('ol', { class: 'up-list' });
  el.append(
    h('div', { class: 'card-head' }, h('div', {}, h('p', { class: 'eyebrow', text: 'Seen by every investor' }), h('h1', { text: 'Updates', style: { marginTop: '6px' } }))),
    h('section', { class: 'card host-sec' }, h('h2', { text: 'Post an update', style: { marginBottom: '12px' } }), form),
    h('section', { class: 'card quiet host-sec' }, h('h2', { text: 'Posted', style: { marginBottom: '4px' } }), list));
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); set(err, '');
    if (!text.value.trim()) { set(err, 'Type the update first.'); return; }
    go.disabled = true;
    try {
      const r = await post('host/update', { text: text.value }, tokenH());
      if (!r.ok) { set(err, r.error); return; }
      text.value = ''; toast(`Update ${pad(r.update.n)} is live for every investor.`, { title: 'Posted' }); refresh();
    } catch { set(err, 'Could not reach the server. The update was not posted.'); } finally { go.disabled = false; }
  });
  let sig = '';
  function draw() {
    const d = H.data; if (!d) return;
    const s = JSON.stringify(d.updates);
    if (s === sig) return;
    sig = s;
    set(go, `Post update ${pad((d.updates.reduce((m, u) => Math.max(m, u.n), 0) || 0) + 1)}`);
    if (!d.updates.length) { swap(list, h('li', { class: 'empty' }, h('p', { style: { margin: 0 }, text: 'Nothing posted yet.' }))); return; }
    swap(list, d.updates.map((u) => h('li', { class: 'up-item' },
      h('span', { class: 'up-n', 'aria-hidden': 'true', text: pad(u.n) }),
      h('div', { class: 'up-meta' }, h('b', { class: 'eyebrow', text: `Update ${pad(u.n)}` }), h('time', { text: when(u.at) }), u.ed ? h('span', { class: 'muted tiny', text: '(edited)' }) : null,
        h('span', { class: 'spacer' }),
        h('button', { class: 'linkbtn', type: 'button', text: 'Edit', onclick: () => editUpdate(u) }),
        h('button', { class: 'linkbtn', type: 'button', text: 'Delete', style: { color: 'var(--down)' }, onclick: () => deleteUpdate(u) })),
      h('p', { class: 'up-text', text: u.text }))));
  }
  subs.add(draw);
  return {};
}

function editUpdate(u) {
  const ta = h('textarea', { maxlength: '4000', 'aria-label': 'Update text' }); ta.value = u.text;
  const err = h('p', { class: 'form-error', role: 'alert' });
  const form = h('form', {}, ta, err, h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn', type: 'submit', text: 'Save' })));
  const close = sheet(`Edit update ${pad(u.n)}`, form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await post('host/update/edit', { id: u.id, text: ta.value }, tokenH()).catch(() => null);
    if (!r?.ok) { set(err, r?.error || 'Could not reach the server.'); return; }
    close(); toast(`Update ${pad(u.n)} saved.`); refresh();
  });
}
async function deleteUpdate(u) {
  if (!(await confirmBox(`Delete update ${pad(u.n)}?`, 'It disappears for every investor. The other updates keep their numbers.', 'Delete', true))) return;
  const r = await post('host/update/delete', { id: u.id }, tokenH()).catch(() => null);
  if (!r?.ok) { toast(r?.error || 'Could not reach the server.', { kind: 'err' }); return; }
  toast(`Update ${pad(u.n)} deleted.`); refresh();
}

// ======================= settings =======================

function SettingsView(el) {
  const theme = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Appearance' },
    h('button', { type: 'button', 'data-th': 'dark', text: 'Night' }), h('button', { type: 'button', 'data-th': 'light', text: 'Parchment' }));
  const drawTheme = () => { const cur = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'; for (const b of theme.children) b.setAttribute('aria-pressed', String(b.dataset.th === cur)); };
  theme.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { setTheme(b.dataset.th); drawTheme(); } });
  drawTheme();
  const oldP = h('input', { type: 'password', autocomplete: 'current-password' }); const newP = h('input', { type: 'password', autocomplete: 'new-password' });
  const perr = h('p', { class: 'form-error', role: 'alert' });
  const pform = h('form', { class: 'form-grid', novalidate: true },
    h('label', { class: 'field' }, h('span', { text: 'Current password' }), oldP), h('label', { class: 'field' }, h('span', { text: 'New password (at least 6 characters)' }), newP),
    h('div', { class: 'wide' }, perr, h('button', { class: 'btn ghost', type: 'submit', text: 'Change password' })));
  pform.addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await post('host/password', { old: oldP.value, password: newP.value }, tokenH()).catch(() => null);
    if (!r?.ok) { set(perr, r?.error || 'Could not reach the server.'); return; }
    setToken('host', r.token); oldP.value = ''; newP.value = ''; set(perr, ''); toast('Host password changed. Other host sessions were signed out.');
  });
  const resetBtn = (mode, label, text) => h('button', { class: 'btn danger', type: 'button', text: label, onclick: async () => {
    const typed = h('input', { type: 'text', autocomplete: 'off', 'aria-label': 'Type RESET' });
    const err = h('p', { class: 'form-error', role: 'alert' });
    const form = h('form', {}, h('p', { text }), h('label', { class: 'field' }, h('span', { text: 'Type RESET to confirm' }), typed), err,
      h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn danger', type: 'submit', text: label })));
    const close = sheet(label, form);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const r = await post('host/reset', { mode, confirm: typed.value.trim() }, tokenH()).catch(() => null);
      if (!r?.ok) { set(err, r?.error || 'Could not reach the server.'); return; }
      setToken('host', r.token); close(); toast(mode === 'everything' ? 'Everything was deleted. The market is closed.' : 'New game: everyone is back to ₹10,00,000 and the market is closed.', { title: 'Reset done' });
      refresh();
    });
  } });
  const info = h('dl', { class: 'kv' });
  el.append(h('div', { class: 'stack', style: { maxWidth: '860px' } },
    h('div', {}, h('p', { class: 'eyebrow', text: 'Host' }), h('h1', { text: 'Settings', style: { marginTop: '6px' } })),
    h('section', { class: 'card quiet' }, h('h3', { text: 'Links to share', style: { marginBottom: '10px' } }), info),
    h('section', { class: 'card quiet' }, h('div', { class: 'row between' }, h('h3', { text: 'Appearance' }), theme)),
    h('section', { class: 'card quiet' }, h('h3', { text: 'Host password', style: { marginBottom: '12px' } }), pform),
    h('section', { class: 'card quiet danger-zone' }, h('h3', { text: 'Start again', style: { marginBottom: '8px' } }),
      h('p', { class: 'muted small', text: 'A new game keeps every account but gives everyone ₹10,00,000 again, with no shares, loans, moves or updates, and new price wiggles. Delete everything also removes every account (investors must sign up again). Both close the market.' }),
      h('div', { class: 'row' },
        resetBtn('portfolios', 'New game', 'Everyone keeps their account but goes back to ₹10,00,000 in cash. All shares, orders, loans, updates and your moves are cleared.'),
        resetBtn('everything', 'Delete everything', 'Every investor account, portfolio, loan and update is deleted. The host password stays.'))),
    h('button', { class: 'btn ghost', type: 'button', onclick: () => { setToken('host', ''); renderAuth(); }, text: 'Sign out of the console' })));
  let sig = '';
  subs.add(() => {
    const d = H.data; if (!d) return;
    const s = `${d.storage}:${d.env}`; if (s === sig) return; sig = s;
    const base = `${location.origin}/`;
    swap(info,
      h('dt', { text: 'Investors' }), h('dd', {}, h('a', { href: base, text: base }), h('span', { class: 'muted small', text: ' (sign-in page)' })),
      h('dt', { text: 'Host console' }), h('dd', { text: `${base}#/host` }),
      h('dt', { text: 'Storage' }), h('dd', { text: d.storage === 'blobs' ? 'Netlify Blobs (saved online)' : d.storage === 'local' ? 'This computer (local server)' : d.storage }),
      h('dt', { text: 'Password' }), h('dd', { text: d.env ? 'Set on the server (HOST_PASSWORD)' : 'Chosen on first visit' }));
  });
  return {};
}
