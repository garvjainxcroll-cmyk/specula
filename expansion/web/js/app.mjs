// The console shell: sign-in, session choice, navigation, status, and the act() helper
// every screen uses to change something. The server decides what is allowed; when it
// needs a reason, a confirmation or an acknowledged warning, act() asks the operator and
// sends the action again.
import { h, mount, toast, modal, confirmDialog, issuesList, setCurrency, closeModals, field, text, select, when } from './ui.mjs';
import { api, auth, whenSignedOut, onNet, net, Refused } from './api.mjs';

import * as dashboard from './views/dashboard.mjs';
import * as config from './views/config.mjs';
import * as setup from './views/setup.mjs';
import * as cvs from './views/cvs.mjs';
import * as auction from './views/auction.mjs';
import * as auctionResults from './views/auctionResults.mjs';
import * as expansion from './views/expansion.mjs';
import * as compliance from './views/compliance.mjs';
import * as financial from './views/financial.mjs';
import * as comparison from './views/comparison.mjs';
import * as rankings from './views/rankings.mjs';
import * as reports from './views/reports.mjs';
import * as audit from './views/audit.mjs';
import * as settings from './views/settings.mjs';
import { loginScreen } from './views/login.mjs';

export const ROUTES = [
  { grp: 'Overview' },
  { id: 'dashboard', n: 1, label: 'Control Dashboard', view: dashboard },
  { grp: 'Configure' },
  { id: 'config', n: 2, label: 'Event Configuration', view: config },
  { id: 'setup', n: 3, label: 'Team and Continent Setup', view: setup },
  { id: 'cvs', n: 4, label: 'Employee CV Repository', view: cvs },
  { grp: 'Round 1' },
  { id: 'auction', n: 5, label: 'CV Auction', view: auction },
  { id: 'auction-results', n: 6, label: 'Auction Results', view: auctionResults },
  { grp: 'Round 2' },
  { id: 'expansion', n: 7, label: 'Global Expansion', view: expansion },
  { id: 'compliance', n: 8, label: 'Legal and Compliance Engine', view: compliance },
  { id: 'financial', n: 9, label: 'Financial Calculation Engine', view: financial },
  { grp: 'Results' },
  { id: 'comparison', n: 10, label: 'Team Performance Comparison', view: comparison },
  { id: 'rankings', n: 11, label: 'Final Rankings', view: rankings },
  { id: 'reports', n: 12, label: 'Reports and Exports', view: reports },
  { grp: 'Control' },
  { id: 'audit', n: 13, label: 'Audit Log', view: audit },
  { id: 'settings', n: 14, label: 'Settings and Backup', view: settings },
];

const state = { me: null, perms: [], sessions: [], sid: null, view: null, route: 'dashboard', sub: {}, dirty: false, polling: null, offline: false };
const app = document.getElementById('app');

export const ctx = {
  get view() { return state.view; },
  get doc() { return state.view?.doc; },
  get res() { return state.view?.results; },
  get me() { return state.me; },
  get sessions() { return state.sessions; },
  get sid() { return state.sid; },
  sub: state.sub,
  can: (p) => (state.view?.me?.perms || state.perms).includes(p),
  markDirty() { state.dirty = true; },
  clean() { state.dirty = false; },
  go(route, sub = null) { if (sub) Object.assign(state.sub, { [route]: { ...(state.sub[route] || {}), ...sub } }); location.hash = `#/${route}`; if (location.hash === `#/${route}`) render(); },
  rerender: () => render(),
  refresh: () => loadSession(state.sid),
  reloadSessions: () => loadSessions(),
  chooseSession: (id) => chooseSession(id),
  act,
  setMe(me) { state.me = me; },
};

/**
 * Change something. payload may be completed interactively when the server asks for a
 * reason (REASON_REQUIRED, LIVE_ROUND), a confirmation (CONFIRM_REQUIRED) or an
 * acknowledged warning (BUDGET_ACK). Returns the new view, or null if refused/cancelled.
 */
export async function act(type, payload = {}, { quiet = false, confirm = null } = {}) {
  if (confirm) {
    const ok = await confirmDialog(confirm.title, confirm);
    if (!ok) return null;
    payload = { ...payload, confirm: true, ...(ok.reason ? { reason: ok.reason } : {}) };
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const v = await api.act(state.sid, type, payload);
      state.view = v; state.dirty = false;
      setCurrency(v.doc.config.currency);
      render();
      if (!quiet) toast(v.lastEntry?.summary || 'Saved.', 'good');
      return v;
    } catch (e) {
      if (!(e instanceof Refused)) throw e;
      if (e.code === 'REASON_REQUIRED' || (e.code === 'LIVE_ROUND' && /scenario change/.test(e.message) && payload.reason === undefined && state.view?.me?.user?.role === 'super')) {
        const r = await confirmDialog(e.code === 'LIVE_ROUND' ? 'Authorise a scenario change' : 'A reason is needed', { message: e.message, reason: 'required', confirmLabel: 'Continue' });
        if (!r) return null;
        payload = { ...payload, reason: r.reason };
        continue;
      }
      if (e.code === 'CONFIRM_REQUIRED') {
        const r = await confirmDialog('Please confirm', { message: e.message, confirmLabel: 'Confirm' });
        if (!r) return null;
        payload = { ...payload, confirm: true };
        continue;
      }
      if (e.code === 'BUDGET_ACK') {
        const r = await confirmDialog('Budget warning', { message: e.message, ack: 'I have seen this warning; record the sale anyway', confirmLabel: 'Record the sale', danger: true });
        if (!r) return null;
        payload = { ...payload, ackBudget: true, confirm: true };
        continue;
      }
      if (e.code === 'STALE') { await loadSession(state.sid); toast(e.message, 'bad', 7000); return null; }
      if (Array.isArray(e.details) && e.details.length && e.details[0].code) {
        modal('This cannot be done yet', [h('p', {}, e.message), issuesList(e.details)]);
      } else toast(e.message, 'bad', 8000);
      return null;
    }
  }
  return null;
}

async function loadSessions() {
  const r = await api.get('sessions');
  state.sessions = r.sessions; state.me = r.me.user; state.perms = r.me.perms;
  return r;
}
async function loadSession(id) {
  if (!id) { state.view = null; render(); return; }
  try {
    const v = await api.get(`session/${id}`);
    state.view = v; state.sid = id; auth.setSession(id);
    setCurrency(v.doc.config.currency);
  } catch (e) {
    if (e.code === 'NOT_FOUND') { state.sid = null; state.view = null; auth.setSession(null); }
    else toast(e.message, 'bad');
  }
  render();
}
async function chooseSession(id) { closeModals(); state.dirty = false; await loadSession(id); }

function statusChips(v) {
  if (!v) return null;
  const s = v.session; const calc = v.calc;
  const chip = (label, tone) => h('span', { class: `pill ${tone}` }, label);
  return h('div', { class: 'row' },
    chip(`Round 1 ${s.round1 === 'locked' ? 'locked' : 'open'}`, s.round1 === 'locked' ? 'good' : 'warn'),
    chip(`Round 2 ${s.round2 === 'finalised' ? 'finalised' : 'open'}`, s.round2 === 'finalised' ? 'good' : 'neutral'),
    chip(!calc.draft ? 'Not calculated' : calc.current ? 'Calculation current' : 'Calculation outdated', !calc.draft ? 'neutral' : calc.current ? 'info' : 'bad'),
    v.doc.finals?.length ? chip(`Official result v${v.doc.finals.at(-1).version}${v.doc.finals.at(-1).reopened ? ' (reopened)' : ''}`, 'gold') : chip('Draft results', 'neutral'));
}

function shell(content) {
  const v = state.view;
  const route = ROUTES.find((r) => r.id === state.route) || ROUTES[1];
  const blocking = v?.results?.validation?.blocking;
  const sessionSelect = select(state.sessions.filter((x) => !x.archived || x.id === state.sid).map((x) => [x.id, `${x.mode === 'official' ? 'OFFICIAL' : 'Practice'} · ${x.name}`]), state.sid || '', { empty: 'Choose a session…' });
  sessionSelect.setAttribute('aria-label', 'Event session');
  sessionSelect.addEventListener('change', () => chooseSession(sessionSelect.value));
  const nav = h('nav', { class: 'nav', 'aria-label': 'Sections' }, ROUTES.map((r) => (r.grp ? h('div', { class: 'grp' }, r.grp) : h('a', { href: `#/${r.id}`, class: r.id === route.id ? 'on' : '', 'aria-current': r.id === route.id ? 'page' : null }, h('span', { class: 'n' }, String(r.n)), r.label))));
  return h('div', { class: 'shell' },
    h('aside', { class: 'side' },
      h('div', { class: 'brand' }, h('img', { src: 'img/crest.png', alt: '' }), h('div', {}, h('div', { class: 't1' }, 'JACO CORP 2026'), h('div', { class: 't2' }, 'Round 4 · Event Control'))),
      nav,
      h('div', { class: 'foot' }, h('div', {}, state.me?.name || ''), h('div', {}, state.me?.roleName || ''), h('div', { class: 'tiny' }, 'Organiser-only · not for participants or judges'))),
    h('div', { class: 'main' },
      !net.online ? h('div', { class: 'offline', role: 'alert' }, 'The control server cannot be reached. Changes will not be saved until the connection returns.') : null,
      v ? h('div', { class: `modebar ${v.session.mode}` }, h('span', { class: 'tag' }, v.session.mode === 'official' ? 'OFFICIAL EVENT' : 'PRACTICE'), v.session.mode === 'official' ? 'Official event data. Every change is recorded in the audit log.' : 'Practice session with test data. Nothing here can affect the official event.') : null,
      h('header', { class: 'top' },
        sessionSelect,
        statusChips(v),
        blocking ? h('span', { class: 'blk', title: 'Blocking validation issues: configuration · Round 1 · Round 2' }, `Blocking ${blocking.config} · ${blocking.round1} · ${blocking.round2}`) : null,
        h('div', { class: 'grow' }),
        h('button', { class: 'btn sm', onclick: () => loadSession(state.sid), title: 'Load the latest data' }, 'Refresh'),
        h('span', { class: 'small nowrap' }, state.me?.username || ''),
        h('button', { class: 'btn sm', onclick: signOut }, 'Sign out')),
      h('main', { class: 'content', id: 'content' }, content)));
}

function noSession() {
  return [h('div', { class: 'pagehead' }, h('h1', { class: 'page' }, 'Choose an event session')),
    h('div', { class: 'card' }, h('p', {}, 'Pick the official event session or a practice session from the list at the top. A Super Administrator creates sessions under Settings and Backup.'),
      state.sessions.length ? h('div', { class: 'stack' }, state.sessions.filter((x) => !x.archived).map((x) => h('button', { class: 'btn', onclick: () => chooseSession(x.id) }, `${x.mode === 'official' ? 'OFFICIAL' : 'Practice'} · ${x.name}`))) : h('p', { class: 'muted' }, 'There are no sessions yet.'),
      ctx.can('session.manage') ? h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { class: 'btn primary', onclick: () => ctx.go('settings') }, 'Go to Settings and Backup')) : null)];
}

export function render() {
  if (!state.me) return;
  const hash = (location.hash || '#/dashboard').replace(/^#\//, '').split('?')[0];
  state.route = ROUTES.some((r) => r.id === hash) ? hash : 'dashboard';
  const route = ROUTES.find((r) => r.id === state.route);
  let content;
  try {
    content = state.view || state.route === 'settings' ? route.view.render(ctx) : noSession();
  } catch (e) {
    console.error(e);
    content = h('div', { class: 'note bad' }, `This screen could not be drawn: ${e.message}. Use Refresh; nothing was changed.`);
  }
  const scroll = document.getElementById('content')?.scrollTop;
  mount(app, shell(content));
  if (scroll) document.getElementById('content').scrollTop = scroll;
  document.title = `${route.label} · Round 4 Control`;
}

async function signOut() {
  try { await api.post('logout', {}); } catch { /* signing out anyway */ }
  auth.set(null); state.me = null; state.view = null;
  stopPolling();
  start();
}

function startPolling() {
  stopPolling();
  state.polling = setInterval(async () => {
    if (document.hidden || !state.sid || !state.view) return;
    try {
      const hd = await api.get(`session/${state.sid}/head`);
      if (hd.rev !== state.view.session.rev) {
        if (state.dirty || document.querySelector('.scrim')) {
          if (!document.getElementById('stalebar')) document.getElementById('content')?.prepend(h('div', { class: 'note info', id: 'stalebar' }, `${hd.updatedBy || 'Another operator'} changed this session. `, h('button', { class: 'btn sm', onclick: () => loadSession(state.sid) }, 'Load the latest data')));
        } else await loadSession(state.sid);
      }
    } catch { /* the offline bar shows */ }
  }, 8000);
}
function stopPolling() { if (state.polling) clearInterval(state.polling); state.polling = null; }

async function start() {
  whenSignedOut(() => { state.me = null; stopPolling(); start(); toast('Your sign-in has ended. Please sign in again.', 'bad'); });
  if (!auth.token) { mount(app, await loginScreen(onSignedIn)); return; }
  try { await loadSessions(); } catch { auth.set(null); mount(app, await loginScreen(onSignedIn)); return; }
  const want = auth.session && state.sessions.some((x) => x.id === auth.session) ? auth.session : (state.sessions.find((x) => x.mode === 'official' && !x.archived) || state.sessions.find((x) => !x.archived))?.id || null;
  state.sid = want;
  if (want) await loadSession(want); else render();
  startPolling();
}
async function onSignedIn() { await start(); }

onNet(() => render());
window.addEventListener('hashchange', () => { state.dirty = false; render(); });
document.addEventListener('input', (e) => { if (e.target.closest('#content') && !e.target.closest('.tbar')) state.dirty = true; });
start();

export { field, text, when };
