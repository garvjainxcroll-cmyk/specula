// The host console (#/host), laid out like SPECULA's Event Head console. Game: name the
// game, set how many teams there are, hand out their codes, start, end and reveal.
// Market: move any stock up or down. Dataset: every team, every member who signed in,
// every loan. Loans, Updates and Tools. Only the host's password unlocks it.
import { h, set, swap, tickText, icon, toast, sheet, confirmBox, download, csvCell } from '../dom.mjs';
import { rs, amt, signedRs, pct, qty, dir, arrow, clock, hm, when, ago, mins, compact } from '../fmt.mjs';
import { get, post, net, token, setToken, loop, onNet } from '../net.mjs';
import { STOCKS, START_CASH } from '../../src/stocks.mjs';
import { ensure, series, tick } from '../series.mjs';
import { lineChart, spark } from '../chart.mjs';
import { band, setGame, themeSwitch, trackDeskHeight, fmtLeft } from '../site.mjs';

let root; let poller = null; let shell = null; let view = null;
const H = { data: null, prev: null };
const subs = new Set();
const cleanups = [];
const tokenH = () => token('host');
const pad = (n) => String(n).padStart(2, '0');
const SESSIONS = [[0, 'No time limit'], [300, '5 minutes'], [600, '10 minutes'], [900, '15 minutes'], [1200, '20 minutes'], [1800, '30 minutes'], [2700, '45 minutes'], [3600, '1 hour'], [5400, '1½ hours'], [7200, '2 hours']];
const sessionSelect = (id) => h('select', { id, 'aria-label': 'Session length', style: { width: 'auto' } }, SESSIONS.map(([v, l]) => h('option', { value: String(v), text: l })));

export default function host(app) {
  root = app;
  if (!tokenH()) renderAuth(); else renderShell();
  return () => { poller?.stop(); for (const fn of cleanups) fn(); };
}

// ======================= sign in =======================

async function renderAuth() {
  poller?.stop(); poller = null; shell = null;
  swap(root, band(null), h('p', { class: 'boot', text: 'Loading the host console…' }));
  let setup = true;
  try { const r = await get('host/status'); setup = r.setup; } catch (e) {
    swap(root, band(null), h('main', { class: 'narrow join-page' }, h('div', { class: 'card' },
      h('h2', { text: 'The live server is not running' }),
      h('p', { class: 'muted', style: { marginTop: '10px' }, text: e.message === 'no-server' ? 'This copy of the website was published without its server function. Follow DEPLOY.md (the GitHub way) to put it online with the server.' : 'Could not reach the server. Check the internet connection and reload.' }))));
    return;
  }
  const err = h('p', { class: 'form-error', role: 'alert' });
  const pass = h('input', { type: 'password', name: 'password', id: 'host-pass', autocomplete: setup ? 'current-password' : 'new-password', required: true });
  const pass2 = h('input', { type: 'password', name: 'password2', id: 'host-pass2', autocomplete: 'new-password' });
  const form = h('form', { novalidate: true },
    h('label', { class: 'field' }, h('span', { text: setup ? 'Host password' : 'Choose the host password (at least 6 characters)' }), pass),
    setup ? null : h('label', { class: 'field' }, h('span', { text: 'Type it again' }), pass2),
    err, h('button', { class: 'btn block lg', type: 'submit', text: setup ? 'Enter' : 'Set the password and enter' }));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!setup && pass.value !== pass2.value) { set(err, 'The two passwords do not match.'); return; }
    const btn = form.querySelector('button'); btn.disabled = true;
    try {
      const r = await post(setup ? 'host/login' : 'host/setup', { password: pass.value });
      if (!r.ok) { set(err, r.error); return; }
      setToken('host', r.token);
      renderShell();
    } catch { set(err, 'Could not reach the server. Please try again.'); } finally { btn.disabled = false; }
  });
  swap(root, band(null), h('main', { class: 'narrow join-page' },
    h('p', { class: 'eyebrow', text: 'Host' }), h('h1', { text: setup ? 'Host console' : 'Set your password', style: { margin: '6px 0 10px' } }),
    h('p', { class: 'lead', text: setup ? 'Sign in to run the game.' : 'First visit after deploying: choose the host password. Only someone with it can run the game, so do this before you share the link. Write it down.' }),
    h('div', { class: 'card' }, form)));
  pass.focus();
}

// ======================= shell =======================

const TABS = [['game', 'Game', 'cog'], ['market', 'Market', 'chart'], ['data', 'Dataset', 'table'], ['loans', 'Loans', 'coins'], ['updates', 'Updates', 'news'], ['tools', 'Tools', 'user']];

function renderShell() {
  const phase = h('b', { text: 'Connecting…' });
  const clk = h('div', { class: 'clock shut', text: '—' });
  const nav = h('nav', { class: 'top-nav', 'aria-label': 'Console' }, TABS.map(([k, label]) => h('a', { href: `#/host/${k}`, 'data-key': k, text: label })));
  const top = h('div', { class: 'desk-top' }, h('div', { class: 'inner' },
    h('div', { class: 'who-team' }, h('span', { class: 'eyebrow', text: 'Host console' }), phase), clk, nav));
  const head = h('div', { class: 'desk-head' }, top);
  const banner = h('div');
  const kpis = h('dl', { class: 'host-kpis', style: { margin: '0 0 24px' } });
  const body = h('div');
  const main = h('main', { class: 'host-main' }, kpis, body);
  const tabbar = h('nav', { class: 'tabbar no-print', 'aria-label': 'Console' }, TABS.map(([k, label, ic]) => h('a', { href: `#/host/${k}`, 'data-key': k }, icon(ic), label)));
  swap(root, h('div', { class: 'app host' }, band(null, { sub: 'Host console' }), head, banner, main, tabbar));
  const k = {};
  for (const [key, label] of [['n', 'Teams'], ['m', 'Members signed in'], ['liq', 'Total liquidable money'], ['pnl', 'Total P&L'], ['loans', 'Ongoing loans']]) {
    k[key] = h('dd', { class: 'num' });
    kpis.append(h('div', { class: 'card quiet' }, h('dt', { class: 'muted small', text: label }), k[key]));
  }
  shell = { phase, clk, nav, tabbar, banner, body, k };
  cleanups.push(trackDeskHeight(head));
  const t = setInterval(drawClock, 500); cleanups.push(() => clearInterval(t));
  onNet(drawBanner);
  window.addEventListener('hashchange', onRoute);
  cleanups.push(() => window.removeEventListener('hashchange', onRoute));
  ensure('30m').then(publish);
  poller = loop(poll, 1500, 6000);
  onRoute();
}

function drawBanner() {
  if (!shell) return;
  swap(shell.banner, !net.online ? h('div', { class: 'bar off', text: 'Connection lost. Reconnecting…' }) : null);
}

function phaseTitle(d) {
  const g = d.game;
  if (g.phase === 'lobby') return d.teams.length ? 'Lobby · teams can join; start when ready' : 'Lobby · create the teams';
  if (g.phase === 'ended') return g.revealed ? 'Game over · results revealed' : 'Game over · results sealed';
  return d.mk.open ? 'Live · market open' : 'Live · market closed';
}

function drawClock() {
  const d = H.data; if (!shell || !d) return;
  const g = d.game;
  if (g.phase === 'live' && d.mk.open && g.endsAt) {
    const left = g.endsAt - net.now();
    set(shell.clk, fmtLeft(left));
    shell.clk.className = `clock${left < 60000 ? ' closing' : ''}`;
  } else {
    set(shell.clk, g.phase === 'lobby' ? 'LOBBY' : g.phase === 'ended' ? 'FINAL' : d.mk.open ? 'OPEN' : 'CLOSED');
    shell.clk.className = 'clock shut';
  }
}

async function poll() {
  const r = await get('host/poll', tokenH());
  if (r.status === 401) { setToken('host', ''); toast('Please sign in as the host again.', { kind: 'err' }); renderAuth(); return; }
  if (!r.ok) return;
  H.prev = H.data; H.data = r;
  setGame(r.game);
  if (tick(r.mk, r.now)) ensure('30m').then(publish);
  publish();
}
const refresh = () => poller?.now();

function publish() {
  const d = H.data; if (!shell || !d) return;
  set(shell.phase, phaseTitle(d));
  const tl = d.teams.reduce((s, t) => s + t.sum.liq, 0); const tp = d.teams.reduce((s, t) => s + t.sum.pnl, 0);
  const on = d.loans.filter((L) => L.status === 'ongoing');
  set(shell.k.n, qty(d.teams.length));
  set(shell.k.m, qty(d.teams.reduce((s, t) => s + t.members.length, 0)));
  set(shell.k.liq, compact(tl));
  set(shell.k.pnl, `${arrow(tp)} ${signedRs(tp)}`); shell.k.pnl.className = `num ${dir(tp)}`;
  set(shell.k.loans, on.length ? `${on.length} · ${compact(on.reduce((s, L) => s + L.amount, 0))}` : '0');
  drawBanner(); drawClock();
  for (const fn of subs) fn();
}

/** Call the server; toast a refusal; refresh on success. Returns the answer or null. */
async function act(path, body, okMsg = '') {
  try {
    const r = await post(path, body, tokenH());
    if (r.status === 401) { setToken('host', ''); renderAuth(); return null; }
    if (!r.ok) { toast(r.error || 'Refused.', { kind: 'err', ms: 7000 }); return null; }
    if (okMsg) toast(okMsg);
    refresh();
    return r;
  } catch { toast('No connection to the server. Nothing has changed; try again.', { kind: 'err', ms: 7000 }); return null; }
}

function onRoute() {
  if (!shell) return;
  const key = (location.hash.split('/')[2] || 'game');
  const k = TABS.some((t) => t[0] === key) ? key : 'game';
  for (const a of [...shell.nav.children, ...shell.tabbar.children]) { if (a.dataset.key === k) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }
  if (view?.key === k) return;
  view?.destroy?.();
  subs.clear();
  shell.body.replaceChildren();
  view = ({ game: GameView, market: MarketView, data: DataView, loans: LoansView, updates: UpdatesView, tools: ToolsView }[k])(shell.body) || {};
  view.key = k;
  window.scrollTo(0, 0);
  if (H.data) for (const fn of subs) fn();
}

// ======================= the game: name, teams, codes, start, end =======================

function GameView(el) {
  // step 1 · the game's name
  const nameIn = h('input', { type: 'text', id: 'game-name', maxlength: '60', placeholder: 'Leave empty for no name' });
  const nameForm = h('form', { class: 'row', novalidate: true }, h('div', { style: { flex: '1 1 220px' } }, nameIn), h('button', { class: 'btn', type: 'submit', id: 'btn-save-name', text: 'Save name' }));
  nameForm.addEventListener('submit', async (e) => { e.preventDefault(); if (await act('host/game', { name: nameIn.value }, nameIn.value.trim() ? `The game is called “${nameIn.value.trim()}” on every screen.` : 'The game has no name now.')) nameIn.dataset.dirty = ''; });
  nameIn.addEventListener('input', () => { nameIn.dataset.dirty = '1'; });

  // step 2 · how many teams, and their names
  const count = h('input', { type: 'number', id: 'team-count', min: '1', max: '120', value: '8', inputmode: 'numeric', 'aria-label': 'Number of teams' });
  const names = h('textarea', { id: 'team-names', rows: '8', placeholder: 'One team name per line, e.g.\nAlpha Capital\nBull Run Partners' });
  let dirty = false;
  const lines = () => names.value.split('\n').map((x) => x.trim()).filter(Boolean);
  function fitLines() {
    const n = Math.max(1, Math.min(120, Math.floor(Number(count.value) || 1)));
    const cur = lines();
    const next = cur.slice(0, n);
    for (let i = next.length; i < n; i++) { let k = i + 1; while (next.includes(`Team ${pad(k)}`)) k++; next.push(`Team ${pad(k)}`); }
    names.value = next.join('\n'); dirty = true;
  }
  const step = (d) => h('button', { type: 'button', 'aria-label': d > 0 ? 'One more team' : 'One fewer team', text: d > 0 ? '+' : '−', onclick: () => { count.value = String(Math.max(1, Math.min(120, (Number(count.value) || 0) + d))); fitLines(); } });
  count.addEventListener('change', fitLines);
  names.addEventListener('input', () => { dirty = true; count.value = String(lines().length || 1); });
  const saveTeams = h('button', { class: 'btn', type: 'button', id: 'btn-save-teams', text: 'Save teams and make codes' });
  saveTeams.addEventListener('click', async () => { if (await act('host/teams', { names: lines() }, 'Teams saved. Each team has its own code below.')) dirty = false; });

  // step 3 · start
  const startLen = sessionSelect('start-secs');
  const startBtn = h('button', { class: 'btn lg', type: 'button', id: 'btn-start', text: 'Start the game' });
  startBtn.addEventListener('click', async () => {
    if (!(await confirmBox('Start the game?', 'The market opens and every team can trade. You can close and reopen the market at any time.', 'Start the game'))) return;
    const secs = Number(startLen.value);
    act('host/start', { secs }, secs ? `The game has started. The market closes by itself in ${fmtLeft(secs * 1000)}.` : 'The game has started. The market is open.');
  });

  const setupCol = h('div', { class: 'stack' },
    h('section', { class: 'card' }, h('p', { class: 'eyebrow', text: 'Step 1 · the game' }), h('p', { class: 'small', text: 'Its name appears on every screen. Leave it empty and the site stays unnamed.' }), nameForm),
    h('section', { class: 'card' }, h('p', { class: 'eyebrow', text: 'Step 2 · the teams' }),
      h('p', { class: 'small', text: 'How many teams are playing? Each starts with ₹10,00,000 and gets a private code. Each line below is one team, in order: changing a line renames that team and keeps its code.' }),
      h('div', { class: 'count-row', style: { margin: '10px 0' } }, h('span', { class: 'small muted', text: 'Number of teams' }), step(-1), count, step(1)),
      names, h('div', { class: 'row', style: { marginTop: '10px' } }, saveTeams)),
    h('section', { class: 'card', id: 'start-card' }, h('p', { class: 'eyebrow', text: 'Step 3 · start' }),
      h('p', { class: 'small', text: 'When the teams have joined, start the game. Choose a session length to have the market close by itself, or none to close it yourself.' }),
      h('div', { class: 'btn-row' }, startLen, startBtn)));

  const nowCard = h('section', { class: 'card phase-card' });
  const standCard = h('section', { class: 'card quiet' });
  const liveCol = h('div', { class: 'stack' }, nowCard, standCard);

  const codesBody = h('div');
  const addIn = h('input', { type: 'text', id: 'add-team', maxlength: '40', placeholder: 'New team’s name' });
  const addForm = h('form', { class: 'row no-print', novalidate: true, style: { marginTop: '12px' } }, h('div', { style: { flex: '1 1 200px' } }, addIn), h('button', { class: 'btn ghost', type: 'submit', text: 'Add a team' }));
  addForm.addEventListener('submit', async (e) => { e.preventDefault(); const r = await act('host/team/add', { name: addIn.value }); if (r) { toast(`${r.team.name} added. Code: ${r.team.code}`); addIn.value = ''; } });
  const codesCard = h('section', { class: 'card' },
    h('div', { class: 'row between' }, h('p', { class: 'eyebrow', id: 'codes-title', text: 'Team codes' }), h('button', { class: 'btn sm ghost no-print', type: 'button', onclick: () => window.print(), text: 'Print' })),
    codesBody, addForm,
    h('p', { class: 'small muted', style: { marginTop: '12px' } }, `Teams join at ${location.host}/#/desk with their code. Big Screen: ${location.host}/#/display`));
  const left = h('div');
  el.append(h('div', { class: 'admin-grid' }, left, codesCard));

  let sigPhase = ''; let sigCodes = ''; let sigNow = ''; let sigStand = '';
  function draw() {
    const d = H.data; if (!d) return;
    const g = d.game;
    if (!nameIn.dataset.dirty && document.activeElement !== nameIn) nameIn.value = g.name || '';
    if (!dirty && document.activeElement !== names) {
      if (d.teams.length) { names.value = d.teams.map((t) => t.name).join('\n'); count.value = String(d.teams.length); } else if (!names.value) fitLines();
      dirty = false;
    }
    if (sigPhase !== g.phase) {
      sigPhase = g.phase;
      swap(left, g.phase === 'lobby' ? setupCol : liveCol);
      addForm.hidden = g.phase === 'ended';
    }
    startBtn.disabled = !d.teams.length;
    // codes
    const sc = JSON.stringify(d.teams.map((t) => [t.id, t.name, t.code, t.members.map((m) => m.name), t.ntr]));
    if (sc !== sigCodes) {
      sigCodes = sc;
      set(root.querySelector('#codes-title'), `Team codes · ${d.teams.length} team${d.teams.length === 1 ? '' : 's'}`);
      if (!d.teams.length) swap(codesBody, h('p', { class: 'muted', style: { margin: '12px 0 0' }, text: 'No teams yet. Choose how many in Step 2 and press “Save teams and make codes”.' }));
      else swap(codesBody, h('div', { class: 'scroll-x' }, h('table', { class: 'tbl codes' },
        h('thead', {}, h('tr', {}, ['#', 'Team', 'Code', 'Signed in', ''].map((x) => h('th', { text: x })))),
        h('tbody', {}, d.teams.map((t, i) => h('tr', { 'data-team': t.name },
          h('td', { class: 'muted', text: String(i + 1) }),
          h('td', {}, h('b', { text: t.name, style: { fontWeight: 600 } })),
          h('td', { class: 'code', 'data-code': t.code, text: t.code }),
          h('td', { class: 'members', text: t.members.length ? t.members.map((m) => m.name).join(', ') : '—' }),
          h('td', { class: 'no-print nowrap' },
            h('button', { class: 'linkbtn', type: 'button', text: 'Rename', onclick: () => renameTeam(t) }), ' · ',
            h('button', { class: 'linkbtn', type: 'button', text: 'New code', onclick: () => newCode(t) }),
            t.ntr ? null : [' · ', h('button', { class: 'linkbtn', type: 'button', style: { color: 'var(--down)' }, text: 'Remove', onclick: () => removeTeam(t) })])))))));
    }
    if (g.phase !== 'lobby') {
      const sn = JSON.stringify([g, d.mk.open, d.teams.length]);
      if (sn !== sigNow) { sigNow = sn; swap(nowCard, nowControls(d)); }
      const ss = JSON.stringify(d.standings.map((x) => [x.name, x.nw])) + g.revealed;
      if (ss !== sigStand) {
        sigStand = ss;
        swap(standCard, h('div', { class: 'row between' }, h('p', { class: 'eyebrow', text: g.phase === 'ended' ? 'Final standings' : 'Standings now' }), h('span', { class: 'pill down', text: g.revealed ? 'revealed' : 'only you can see this' })),
          h('p', { class: 'tiny muted', text: 'Ranked by net worth (cash + shares at today’s prices + loans owed to the team − loans it owes). Teams see only their own money until you reveal the results at the end.' }),
          standingsTable(d.standings));
      }
    }
  }
  subs.add(draw);
  return {};
}

function nowControls(d) {
  const g = d.game;
  const out = [h('p', { class: 'eyebrow', text: 'Now' }), h('h2', { text: phaseTitle(d) })];
  if (g.phase === 'live') {
    if (d.mk.open) {
      out.push(h('p', { class: 'small', text: g.endsAt ? `The market closes by itself at ${hm(g.endsAt)}. Prices are moving and teams can trade.` : 'Prices are moving and teams can trade. The market stays open until you close it.' }),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn ghost', type: 'button', id: 'btn-close', text: 'Close the market', onclick: () => act('host/market', { open: false }, 'Market closed: prices are paused and orders are refused.') }),
          g.endsAt ? h('button', { class: 'btn ghost', type: 'button', text: '+1 min', onclick: () => act('host/timer', { add: 60 }) }) : null,
          g.endsAt ? h('button', { class: 'btn ghost', type: 'button', text: '+5 min', onclick: () => act('host/timer', { add: 300 }) }) : null));
    } else {
      const len = sessionSelect('open-secs');
      out.push(h('p', { class: 'small', text: 'Prices are paused and orders are refused. Open the market to carry on.' }),
        h('div', { class: 'btn-row' }, len, h('button', { class: 'btn', type: 'button', id: 'btn-open', text: 'Open the market', onclick: () => { const secs = Number(len.value); act('host/market', { open: true, secs }, secs ? `Market open for ${fmtLeft(secs * 1000)}.` : 'Market open.'); } })));
    }
    out.push(h('hr'), h('div', { class: 'btn-row' }, h('button', { class: 'btn danger', type: 'button', id: 'btn-end', text: 'End the game', onclick: async () => {
      if (await confirmBox('End the game?', 'The market closes for good, every loan still running is repaid now with its full interest, and the standings are calculated. Results stay sealed until you reveal them.', 'End the game', true)) act('host/end', {}, 'The game is over. Reveal the results when you are ready.');
    } }), h('a', { class: 'btn ghost', href: '#/display', target: '_blank', text: 'Open the Big Screen' })));
  } else if (g.phase === 'ended') {
    out.push(h('p', { class: 'small', text: g.revealed ? 'The Big Screen shows the standings, last place first and the winner last, and each desk shows its own place.' : 'The market is closed and every score is calculated, but the results are sealed. Each desk sees only its own money; the Big Screen is waiting.' }),
      h('div', { class: 'btn-row' },
        g.revealed
          ? h('button', { class: 'btn ghost', type: 'button', text: 'Hide the results again', onclick: () => act('host/reveal', { show: false }) })
          : h('button', { class: 'btn lg', type: 'button', id: 'btn-reveal', text: 'Reveal the results on every screen', onclick: async () => { if (await confirmBox('Reveal the results?', 'The Big Screen shows the standings and every desk shows its own place.', 'Reveal')) act('host/reveal', { show: true }); } }),
        h('button', { class: 'btn ghost', type: 'button', text: 'Take the game back (resume)', onclick: async () => { if (await confirmBox('Resume the game?', 'The game goes back to live with the market closed, and the results are sealed again. Open the market to let teams trade.', 'Resume')) act('host/resume', {}); } })));
  }
  return out;
}

function standingsTable(rows) {
  if (!rows.length) return h('p', { class: 'muted', text: 'No teams yet.' });
  return h('div', { class: 'scroll-x' }, h('table', { class: 'tbl' },
    h('thead', {}, h('tr', {}, ['Place', 'Team', 'Net worth', 'Total P&L'].map((x, i) => h('th', { class: i > 1 ? 'num' : '', text: x })))),
    h('tbody', {}, rows.map((x) => h('tr', { class: 'click', tabindex: '0', onclick: () => openTeam(x.id), onkeydown: (e) => { if (e.key === 'Enter') openTeam(x.id); } },
      h('td', { class: 'gold', style: { fontFamily: 'var(--font-display)' }, text: String(x.rank) }), h('td', { text: x.name }),
      h('td', { class: 'num', text: rs(x.nw) }), h('td', { class: `num ${dir(x.pnl)}`, text: `${arrow(x.pnl)} ${signedRs(x.pnl)} (${pct(x.pct)})` }))))));
}

async function renameTeam(t) {
  const input = h('input', { type: 'text', maxlength: '40' }); input.value = t.name;
  const err = h('p', { class: 'form-error', role: 'alert' });
  const form = h('form', { class: 'stack' }, h('label', { class: 'field' }, h('span', { text: 'Team name' }), input), err, h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn', type: 'submit', text: 'Rename' })));
  const close = sheet(`Rename ${t.name}`, form, { sub: 'Its code stays the same.' });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await post('host/team/rename', { id: t.id, name: input.value }, tokenH()).catch(() => null);
    if (!r?.ok) { set(err, r?.error || 'Could not reach the server.'); return; }
    close(); refresh();
  });
}
async function newCode(t) {
  if (!(await confirmBox(`New code for ${t.name}?`, 'The old code stops working at once. Members already signed in stay signed in. Give the new code to the team.', 'Make a new code'))) return;
  const r = await act('host/team/code', { id: t.id });
  if (r) toast(`${t.name}’s new code is ${r.code}.`, { sticky: true });
}
async function removeTeam(t) {
  if (!(await confirmBox(`Remove ${t.name}?`, 'The team and its code are removed; anyone signed in to its desk is signed out.', 'Remove', true))) return;
  act('host/team/remove', { id: t.id }, `${t.name} was removed.`);
}

// ======================= market control =======================

const DURS = [[0, 'Instantly'], [10, 'Over 10 s'], [30, 'Over 30 s'], [60, 'Over 1 min'], [300, 'Over 5 min'], [900, 'Over 15 min'], [1800, 'Over 30 min']];

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
      h('p', { class: 'muted small', style: { maxWidth: '62ch', margin: 0 }, text: 'Each stock wiggles a little on its own and averages to its listed price. Your moves shift it up or down from there and stay until you move it again. Every holding team’s money changes at once. Teams see only prices, never your moves.' })),
    grid,
    h('section', { class: 'card quiet', style: { marginTop: '24px' } }, h('div', { class: 'card-head' }, h('h3', { text: 'Your moves' }), h('span', { class: 'only-host', text: 'Only you can see this' })), log));
  let sigLog = '';
  function draw() {
    const d = H.data; if (!d) return;
    const sp = series('30m');
    const exposure = {};
    for (const t of d.teams) for (const x of t.h) { const e = (exposure[x.t] ||= { n: 0, q: 0 }); e.n++; e.q += x.q; }
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
      set(c.exp, e ? `${e.n} team${e.n > 1 ? 's' : ''} hold it · ${qty(e.q)} shares · ${compact(e.q * p)} at stake` : 'No team holds it yet.');
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
  const r = await act('host/move', { t, mode, value, secs });
  if (!r) return false;
  toast(`${t}: ${r.move.label}, ${secs ? `over ${ago(secs * 1000)}` : 'instantly'}. Level now ${pct((r.move.to - 1) * 100, 1)} from the listed price.`, { title: 'Move applied' });
  return true;
}

// ======================= dataset =======================

const COLS = [
  ['n', '#', (t) => t.n, true], ['name', 'Team', (t) => t.name.toLowerCase()], ['code', 'Code', (t) => t.code], ['members', 'Members signed in', (t) => t.members.length, true],
  ['cash', 'Cash', (t) => t.sum.cash, true], ['hv', 'Holdings value', (t) => t.sum.hv, true], ['liq', 'Total liquidable money', (t) => t.sum.liq, true],
  ['loan', 'Loans: due to / owed by', (t) => t.sum.rec - t.sum.pay, true], ['nw', 'Net worth', (t) => t.sum.nw, true], ['pnl', 'Total P&L', (t) => t.sum.pnl, true],
];

function DataView(el) {
  let sort = ['n', 1];
  const q = h('input', { type: 'search', placeholder: 'Search teams and members…', 'aria-label': 'Search' });
  const wrap = h('div', { class: 'scroll-x' }); const count = h('span', { class: 'muted small' });
  const peopleWrap = h('div', { class: 'scroll-x' }); const pcount = h('span', { class: 'muted small' });
  const loansWrap = h('div'); const lcount = h('span', { class: 'muted small' });
  el.append(
    h('div', { class: 'card-head' }, h('div', {}, h('p', { class: 'eyebrow', text: 'Only you can see this' }), h('h1', { text: 'Dataset', style: { marginTop: '6px' } })),
      h('p', { class: 'muted small', style: { maxWidth: '60ch', margin: 0 }, text: 'Every team and everyone who signed in, live. Total liquidable money is cash plus what the team’s shares would sell for now. Click a team to see its whole portfolio.' })),
    h('section', { class: 'card quiet host-sec' },
      h('div', { class: 'card-head' }, h('div', { class: 'row' }, h('h2', { text: 'Teams' }), count),
        h('div', { class: 'toolbar' }, q, h('button', { class: 'btn ghost sm', type: 'button', onclick: csvTeams, text: 'Download CSV' }))),
      wrap),
    h('section', { class: 'card quiet host-sec' },
      h('div', { class: 'card-head' }, h('div', { class: 'row' }, h('h2', { text: 'Everyone signed in' }), pcount),
        h('button', { class: 'btn ghost sm', type: 'button', onclick: csvPeople, text: 'Download CSV' })),
      peopleWrap),
    h('section', { class: 'card quiet host-sec' },
      h('div', { class: 'card-head' }, h('div', { class: 'row' }, h('h2', { text: 'Loans' }), lcount),
        h('div', { class: 'toolbar' }, h('a', { class: 'btn ghost sm', href: '#/host/loans', text: 'Arrange a loan' }), h('button', { class: 'btn ghost sm', type: 'button', onclick: csvLoans, text: 'Download CSV' }))),
      loansWrap));
  q.addEventListener('input', () => draw(true));
  let sig = ''; let psig = ''; let lsig = '';
  function draw(force) {
    const d = H.data; if (!d) return;
    const needle = q.value.trim().toLowerCase();
    const s = JSON.stringify([d.teams.map((t) => [t.id, t.sum, t.name, t.members.length]), sort]);
    if (force || s !== sig) {
      sig = s;
      const col = COLS.find((c) => c[0] === sort[0]);
      const rows = d.teams.filter((t) => !needle || `${t.name} ${t.code} ${t.members.map((m) => `${m.name} ${m.phone}`).join(' ')}`.toLowerCase().includes(needle))
        .sort((a, b) => { const x = col[2](a); const y = col[2](b); return (x > y ? 1 : x < y ? -1 : 0) * sort[1]; });
      set(count, `${d.teams.length} team${d.teams.length === 1 ? '' : 's'}`);
      if (!d.teams.length) swap(wrap, h('div', { class: 'empty' }, h('h3', { text: 'No teams yet' }), h('p', { style: { margin: 0 } }, 'Create them in the ', h('a', { href: '#/host/game', text: 'Game' }), ' tab.')));
      else {
        const head = h('tr', {}, COLS.map(([key, label, , numeric]) => {
          const th = h('th', { class: numeric ? 'num' : '' }, h('button', { type: 'button', text: label, onclick: () => { sort = [key, sort[0] === key ? -sort[1] : (numeric && key !== 'n' ? -1 : 1)]; draw(true); } }));
          if (sort[0] === key) th.setAttribute('aria-sort', sort[1] > 0 ? 'ascending' : 'descending');
          return th;
        }));
        swap(wrap, h('table', { class: 'tbl nowrap' }, h('thead', {}, head), h('tbody', {}, rows.map((t) => {
          const net = t.sum.rec - t.sum.pay;
          return h('tr', { class: 'click', tabindex: '0', onclick: () => openTeam(t.id), onkeydown: (e) => { if (e.key === 'Enter') openTeam(t.id); } },
            h('td', { class: 'num muted', text: String(t.n) }),
            h('td', {}, h('b', { text: t.name, style: { fontWeight: 600 } }), h('span', { class: 'sub', text: t.members.map((m) => m.name).join(', ') || 'nobody yet' })),
            h('td', { class: 'gold', style: { fontFamily: 'var(--font-display)', letterSpacing: '0.12em' }, text: t.code }),
            h('td', { class: 'num', text: String(t.members.length) }),
            h('td', { class: `num ${t.sum.cash < 0 ? 'down' : ''}`, text: rs(t.sum.cash) }), h('td', { class: 'num', text: rs(t.sum.hv) }),
            h('td', { class: 'num gold', style: { fontWeight: 600, fontSize: '18px' }, text: rs(t.sum.liq) }),
            h('td', { class: 'num', text: t.sum.rec || t.sum.pay ? `${t.sum.rec ? `+${amt(t.sum.rec)}` : ''}${t.sum.rec && t.sum.pay ? ' / ' : ''}${t.sum.pay ? `−${amt(t.sum.pay)}` : ''}` : '—', title: net ? `Net ${signedRs(net)}` : '' }),
            h('td', { class: 'num', text: rs(t.sum.nw) }),
            h('td', { class: `num ${dir(t.sum.pnl)}` }, `${arrow(t.sum.pnl)} ${signedRs(t.sum.pnl)}`, h('span', { class: `sub ${dir(t.sum.pct)}`, text: pct(t.sum.pct) })));
        }))));
      }
    }
    const people = d.teams.flatMap((t) => t.members.map((m) => ({ ...m, team: t.name, tid: t.id }))).sort((a, b) => a.joined - b.joined);
    const ps = JSON.stringify(people) + needle;
    if (force || ps !== psig) {
      psig = ps;
      const shown = people.filter((p) => !needle || `${p.name} ${p.phone} ${p.team}`.toLowerCase().includes(needle));
      set(pcount, `${people.length} ${people.length === 1 ? 'person' : 'people'}`);
      swap(peopleWrap, people.length ? h('table', { class: 'tbl nowrap' },
        h('thead', {}, h('tr', {}, ['#', 'Name', 'Phone', 'Team', 'First signed in', 'Last signed in'].map((x) => h('th', { text: x })))),
        h('tbody', {}, shown.map((p, i) => h('tr', { class: 'click', tabindex: '0', onclick: () => openTeam(p.tid) },
          h('td', { class: 'muted', text: String(i + 1) }), h('td', {}, h('b', { text: p.name, style: { fontWeight: 600 } })), h('td', { text: p.phone || '—' }),
          h('td', { text: p.team }), h('td', { text: when(p.joined) }), h('td', { text: when(p.last || p.joined) }))))) : h('p', { class: 'muted', style: { margin: 0 }, text: 'Nobody has signed in yet. Members join at Team Desk with their team’s code.' }));
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
  if (!(await confirmBox(`Cancel loan ${L.id}?`, `${rs(L.amount)} goes back from ${L.borrowerName} to ${L.lenderName}, with no interest. Both teams are told.`, 'Cancel the loan', true))) return;
  act('host/loan/cancel', { id: L.id }, `Loan ${L.id} cancelled.`);
}

const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
const csv = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\n');
const dt = (w) => (w ? new Date(w).toLocaleString('en-IN') : '');
function csvTeams() {
  const d = H.data; if (!d) return;
  const head = ['#', 'Team', 'Code', 'Members signed in', 'Members (name · phone)', 'Cash (₹)', 'Holdings value (₹)', 'Total liquidable money (₹)', 'Loans due to them (₹)', 'Loans they owe (₹)', 'Net worth (₹)', 'Total P&L (₹)', 'P&L %', 'Place', 'Orders', 'Holdings'];
  const place = Object.fromEntries(d.standings.map((x) => [x.id, x.rank]));
  download(`teams-${stamp()}.csv`, csv([head, ...d.teams.map((t) => [t.n, t.name, t.code, t.members.length, t.members.map((m) => `${m.name}${m.phone ? ` · ${m.phone}` : ''}`).join('; '),
    t.sum.cash / 100, t.sum.hv / 100, t.sum.liq / 100, t.sum.rec / 100, t.sum.pay / 100, t.sum.nw / 100, t.sum.pnl / 100, t.sum.pct, place[t.id], t.ntr, t.h.map((x) => `${x.t} ${x.q}`).join('; ')])]));
}
function csvPeople() {
  const d = H.data; if (!d) return;
  const rows = d.teams.flatMap((t) => t.members.map((m) => [m.name, m.phone || '', t.name, dt(m.joined), dt(m.last || m.joined), t.sum.liq / 100]));
  download(`signed-in-${stamp()}.csv`, csv([['Name', 'Phone', 'Team', 'First signed in', 'Last signed in', 'Team’s total liquidable money (₹)'], ...rows]));
}
function csvLoans() {
  const d = H.data; if (!d) return;
  const head = ['Loan', 'Lender', 'Borrower', 'Initial amount (₹)', 'Interest %', 'Final amount (₹)', 'Deadline set', 'Started', 'Due at', 'Status', 'Repaid / cancelled at', 'Shares sold to repay'];
  download(`loans-${stamp()}.csv`, csv([head, ...d.loans.slice().sort((a, b) => a.n - b.n).map((L) => [L.id, L.lenderName, L.borrowerName, L.amount / 100, L.rate, L.final / 100, mins(L.mins),
    dt(L.start), dt(L.due), L.status === 'ongoing' ? 'Ongoing' : L.status === 'elapsed' ? 'Elapsed' : 'Cancelled', dt(L.settledAt || L.cancelledAt), (L.sold || []).map(([t, q, p]) => `${q} ${t} @ ${p / 100}`).join('; ')])]));
}

// ---------- one team's whole portfolio ----------

function openTeam(id) {
  const body = h('div', {}, h('p', { class: 'muted', text: 'Loading…' }));
  const close = sheet('Team', body, { wide: true, autofocus: false });
  let chart = null; let timer = null; let first = true;
  const load = async () => {
    if (!body.isConnected) { clearInterval(timer); chart?.destroy(); return; }
    const r = await get(`host/team?id=${encodeURIComponent(id)}`, tokenH()).catch(() => null);
    if (!r?.ok) { if (first) swap(body, h('p', { class: 'form-error', text: r?.error || 'Could not load this team.' })); return; }
    const t = r.team; const d = H.data;
    const title = body.closest('.sheet')?.querySelector('.sheet-head h2');
    if (title) set(title, t.name);
    const kv = (label, v, cls = '') => h('div', { class: 'kpi' }, h('dt', { text: label }), h('dd', { class: `num ${cls}`, text: v }));
    const box = h('div', { class: 'chart-box short' });
    const hs = t.h.map((x) => { const p = d?.mk.p[x.t] ?? 0; return { ...x, p, val: x.q * p, pl: x.q * p - x.cost }; }).sort((a, b) => b.val - a.val);
    const scrollTop = body.closest('.sheet')?.scrollTop;
    swap(body,
      h('p', { class: 'muted', style: { marginTop: '-8px' } }, `Code ${t.code} · ${t.members.length} signed in${t.members.length ? `: ${t.members.map((m) => `${m.name}${m.phone ? ` (${m.phone})` : ''}`).join(', ')}` : ''}`),
      h('dl', { class: 'kpis k6', style: { margin: '0 0 16px' } },
        kv('Total liquidable money', rs(t.sum.liq), 'gold'), kv('Cash', rs(t.sum.cash), t.sum.cash < 0 ? 'down' : ''), kv('Holdings value', rs(t.sum.hv)),
        kv('Net worth', rs(t.sum.nw)), kv('Total P&L', `${arrow(t.sum.pnl)} ${signedRs(t.sum.pnl)}`, dir(t.sum.pnl)), kv('P&L %', pct(t.sum.pct), dir(t.sum.pct))),
      h('section', { class: 'card quiet tight' }, h('h3', { text: 'Net worth over time', style: { marginBottom: '8px' } }), box),
      h('div', { class: 'drawer-grid', style: { marginTop: '16px' } },
        h('section', { class: 'card quiet tight' }, h('h3', { text: `Holdings (${hs.length})`, style: { marginBottom: '8px' } }),
          hs.length ? h('div', { class: 'scroll-x' }, h('table', { class: 'tbl' },
            h('thead', {}, h('tr', {}, ['Stock', 'Qty', 'Avg', 'Now', 'Value', 'P&L'].map((x, i) => h('th', { class: i ? 'num' : '', text: x })))),
            h('tbody', {}, hs.map((x) => h('tr', {}, h('td', {}, h('span', { class: 'tk', text: x.t })), h('td', { class: 'num', text: qty(x.q) }),
              h('td', { class: 'num', text: amt(Math.round(x.cost / x.q)) }), h('td', { class: 'num', text: amt(x.p) }), h('td', { class: 'num', text: amt(x.val) }),
              h('td', { class: `num ${dir(x.pl)}`, text: `${arrow(x.pl)} ${signedRs(x.pl)}` })))))) : h('p', { class: 'muted', style: { margin: 0 }, text: 'No shares.' })),
        h('section', { class: 'card quiet tight' }, h('h3', { text: `Orders (${t.tr.length})`, style: { marginBottom: '8px' } }),
          t.tr.length ? h('ul', { class: 'list-plain', style: { maxHeight: '320px', overflowY: 'auto' } }, t.tr.slice(0, 300).map((x) => h('li', { class: 'trade-row' },
            h('span', { class: `side ${x.q > 0 ? 'b' : 's'}`, text: x.q > 0 ? 'BUY' : 'SELL' }),
            h('span', {}, `${qty(Math.abs(x.q))} ${x.t} at ${rs(x.p)}`, x.f ? h('span', { class: 'muted small', text: ' · loan repayment' }) : null),
            h('span', { class: 'muted tiny', text: when(x.w) })))) : h('p', { class: 'muted', style: { margin: 0 }, text: 'No orders.' }))),
      h('section', { class: 'card quiet tight', style: { marginTop: '16px' } }, h('h3', { text: 'Loans', style: { marginBottom: '8px' } }), loansTable(r.loans, r.now, false)));
    if (scrollTop) body.closest('.sheet').scrollTop = scrollTop;
    chart?.destroy();
    chart = lineChart(box, { fmtY: (v, full) => (full ? rs(v) : compact(v).replace('₹', '')), fmtX: hm, fmtTip: clock });
    chart.set({ xs: r.hist.ws, ws: r.hist.ws, ys: r.hist.nw, ref: START_CASH, refFit: true, refLabel: 'Started with ₹10,00,000', tone: dir(t.sum.nw - START_CASH), label: `${t.name}: net worth` });
    first = false;
  };
  load();
  timer = setInterval(load, 4000);
  return close;
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
    h('label', { class: 'field' }, h('span', { text: 'Lending team (money leaves its cash now)' }), lender),
    h('label', { class: 'field' }, h('span', { text: 'Borrowing team (money arrives now)' }), borrower),
    h('label', { class: 'field' }, h('span', { text: 'Amount (₹)' }), amount),
    h('label', { class: 'field' }, h('span', { text: 'Interest for the whole loan (%)' }), rate),
    h('label', { class: 'field' }, h('span', { text: 'Deadline: repaid automatically after' }), h('div', { class: 'deadline' }, dl, unit)),
    h('div', { class: 'field wide' }, preview), h('div', { class: 'wide' }, err, go));
  const listWrap = h('div');
  el.append(
    h('div', { class: 'card-head' }, h('div', {}, h('p', { class: 'eyebrow', text: 'Only you can arrange these' }), h('h1', { text: 'Loans', style: { marginTop: '6px' } })),
      h('p', { class: 'muted small', style: { maxWidth: '62ch', margin: 0 }, text: 'A loan needs no approval. The amount moves from the lending team to the borrowing team at once. At the deadline the website takes the amount plus interest from the borrower and pays it to the lender, and tells both teams. If the borrower is short of cash, its shares are sold to cover it.' })),
    h('section', { class: 'card host-sec' }, h('h2', { text: 'Arrange a loan', style: { marginBottom: '16px' } }), form),
    h('section', { class: 'card quiet host-sec' }, h('div', { class: 'card-head' }, h('h2', { text: 'All loans' }), h('button', { class: 'btn ghost sm', type: 'button', onclick: csvLoans, text: 'Download CSV' })), listWrap));
  const paise = () => { const n = Number(amount.value.replace(/[₹,\s]/g, '')); return Number.isFinite(n) ? Math.round(n * 100) : NaN; };
  const minutes = () => Number(dl.value) * Number(unit.value);
  function drawPreview() {
    const d = H.data; if (!d) return;
    const l = d.teams.find((t) => t.id === lender.value); const b = d.teams.find((t) => t.id === borrower.value);
    const a = paise(); const r = Number(rate.value); const m = minutes();
    if (!l || !b || !(a > 0) || !(r >= 0) || !(m > 0)) { set(preview, 'Choose the lending and the borrowing team, and type the amount, the interest and the deadline.'); return; }
    if (l.id === b.id) { set(preview, 'The lender and the borrower must be different teams.'); return; }
    const fin = Math.round(a * (1 + r / 100));
    set(preview, `Now: ${rs(a)} moves from ${l.name} (cash ${rs(l.sum.cash)}) to ${b.name}. At about ${hm(net.now() + m * 60000)} (after ${mins(m)}): ${rs(fin)} (${rs(fin - a)} interest) moves from ${b.name} back to ${l.name}.${l.sum.cash < a ? ` ${l.name} does not have enough cash.` : ''}`);
  }
  for (const x of [lender, borrower, amount, rate, dl, unit]) x.addEventListener('input', drawPreview);
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); set(err, '');
    const d = H.data;
    const l = d?.teams.find((t) => t.id === lender.value); const b = d?.teams.find((t) => t.id === borrower.value);
    if (!l || !b) { set(err, 'Choose both the lending and the borrowing team.'); return; }
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
    const us = JSON.stringify(d.teams.map((t) => [t.id, t.name, Math.floor(t.sum.cash / 100)]));
    if (us !== usig) {
      usig = us;
      for (const [sel, ph] of [[lender, 'Choose the lending team'], [borrower, 'Choose the borrowing team']]) {
        const cur = sel.value;
        swap(sel, h('option', { value: '', text: d.teams.length < 2 ? 'Create at least two teams first' : ph }),
          d.teams.map((t) => h('option', { value: t.id, text: `${t.name} · cash ${rs(t.sum.cash)}` })));
        sel.value = d.teams.some((t) => t.id === cur) ? cur : '';
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
  const text = h('textarea', { name: 'text', maxlength: '4000', placeholder: 'Type the update every team should read…', 'aria-label': 'Update text' });
  const err = h('p', { class: 'form-error', role: 'alert' });
  const go = h('button', { class: 'btn', type: 'submit', text: 'Post update' });
  const form = h('form', { novalidate: true }, text, err, h('div', { class: 'row between' }, h('span', { class: 'muted small', text: 'Every team sees it at once, numbered in order. The Big Screen shows the latest.' }), go));
  const list = h('ol', { class: 'up-list' });
  el.append(
    h('div', { class: 'card-head' }, h('div', {}, h('p', { class: 'eyebrow', text: 'Seen by every team' }), h('h1', { text: 'Updates', style: { marginTop: '6px' } }))),
    h('section', { class: 'card host-sec' }, h('h2', { text: 'Post an update', style: { marginBottom: '12px' } }), form),
    h('section', { class: 'card quiet host-sec' }, h('h2', { text: 'Posted', style: { marginBottom: '4px' } }), list));
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); set(err, '');
    if (!text.value.trim()) { set(err, 'Type the update first.'); return; }
    go.disabled = true;
    try {
      const r = await post('host/update', { text: text.value }, tokenH());
      if (!r.ok) { set(err, r.error); return; }
      text.value = ''; toast(`Update ${pad(r.update.n)} is live for every team.`, { title: 'Posted' }); refresh();
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
  if (!(await confirmBox(`Delete update ${pad(u.n)}?`, 'It disappears for every team. The other updates keep their numbers.', 'Delete', true))) return;
  act('host/update/delete', { id: u.id }, `Update ${pad(u.n)} deleted.`);
}

// ======================= tools =======================

function ToolsView(el) {
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
  const resetBtn = (mode, label, text) => h('button', { class: 'btn danger', type: 'button', id: `btn-reset-${mode}`, text: label, onclick: async () => {
    const typed = h('input', { type: 'text', autocomplete: 'off', id: 'reset-confirm', 'aria-label': 'Type RESET' });
    const err = h('p', { class: 'form-error', role: 'alert' });
    const form = h('form', {}, h('p', { text }), h('label', { class: 'field' }, h('span', { text: 'Type RESET to confirm' }), typed), err,
      h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '12px' } }, h('button', { class: 'btn danger', type: 'submit', text: label })));
    const close = sheet(label, form);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const r = await post('host/reset', { mode, confirm: typed.value.trim() }, tokenH()).catch(() => null);
      if (!r?.ok) { set(err, r?.error || 'Could not reach the server.'); return; }
      setToken('host', r.token); close();
      toast(mode === 'everything' ? 'Everything was deleted. Create the teams again in the Game tab.' : 'New game: every team is back to ₹10,00,000, with the same codes. Start it when ready.', { title: 'Done' });
      location.hash = '#/host/game';
      refresh();
    });
  } });
  const info = h('dl', { class: 'kv' });
  el.append(h('div', { class: 'stack', style: { maxWidth: '860px' } },
    h('div', {}, h('p', { class: 'eyebrow', text: 'Host' }), h('h1', { text: 'Tools', style: { marginTop: '6px' } })),
    h('section', { class: 'card quiet' }, h('h3', { text: 'Screens and links', style: { marginBottom: '10px' } }), info),
    h('section', { class: 'card quiet' }, h('div', { class: 'row between' }, h('h3', { text: 'Appearance' }), themeSwitch())),
    h('section', { class: 'card quiet' }, h('h3', { text: 'Host password', style: { marginBottom: '12px' } }), pform),
    h('section', { class: 'card quiet danger-zone' }, h('h3', { text: 'Start again', style: { marginBottom: '8px' } }),
      h('p', { class: 'muted small', text: 'New game keeps the game’s name, every team and its code, and gives every team ₹10,00,000 again, with no shares, orders, loans, updates or moves, and fresh price movements. Delete everything also removes the teams. Both go back to the lobby with the market closed. Use after a rehearsal.' }),
      h('div', { class: 'row' },
        resetBtn('keep', 'New game (keep the teams)', 'Every team keeps its name, code and members but goes back to ₹10,00,000 in cash. All shares, orders, loans, updates and your moves are cleared.'),
        resetBtn('everything', 'Delete everything', 'Every team, code, portfolio, loan and update is deleted, and the game loses its name. The host password stays.'))),
    h('button', { class: 'btn ghost', type: 'button', onclick: () => { setToken('host', ''); renderAuth(); }, text: 'Sign out of the console' })));
  let sig = '';
  subs.add(() => {
    const d = H.data; if (!d) return;
    const s = `${d.storage}:${d.env}`; if (s === sig) return; sig = s;
    const base = `${location.origin}/`;
    const link = (u) => h('a', { href: u, target: '_blank', text: u });
    swap(info,
      h('dt', { text: 'Team Desk' }), h('dd', {}, link(`${base}#/desk`), h('span', { class: 'muted small', text: ' (teams join here with their code)' })),
      h('dt', { text: 'Big Screen' }), h('dd', {}, link(`${base}#/display`), h('span', { class: 'muted small', text: ' (projector; press F11 for full screen)' })),
      h('dt', { text: 'Home' }), h('dd', {}, link(base)),
      h('dt', { text: 'Host console' }), h('dd', { text: `${base}#/host` }),
      h('dt', { text: 'Storage' }), h('dd', { text: d.storage === 'blobs' ? 'Netlify Blobs (saved online)' : d.storage === 'local' ? 'This computer (local server)' : d.storage }),
      h('dt', { text: 'Password' }), h('dd', { text: d.env ? 'Set on the server (HOST_PASSWORD)' : 'Chosen on first visit' }));
  });
  return {};
}

