// The Event Head desk (#/host). Password-protected. Create and run tables and tournaments,
// manage players' chips, choose what players may create, and check the chip audit.
// Like everyone else, the Event Head never sees hole cards while a hand is in play.
import { h, mount, fmt, fmtClock, toast, sheet, confirmSheet, seg, ordinal, ago, avatar } from '../ui.mjs';
import { get, send, auth, remoteRoom, left, net } from '../net.mjs';
import { tableSettingsForm, tournamentForm, stakesLabel } from './forms.mjs';
import { Felt } from '../felt.mjs';

const hostGet = (p) => get(p, { host: true }).catch(() => ({ ok: false, error: 'No connection' }));
const hostSend = (p, b) => send(p, b, { host: true });

export default async function host(app, { band }) {
  const body = h('main', { class: 'wrap page' });
  mount(app, band('host'), body);
  let tab = 'tables';
  let timer = null;

  async function start() {
    if (net.mode === 'single') { mount(body, h('h1', {}, 'Event Head desk'), h('div', { class: 'notice' }, 'This copy of the site has no live game server. Deploy it with its server function (see DEPLOY.md) to run games.')); return; }
    if (!auth.host) return signIn();
    const r = await hostGet('host/overview');
    if (!r.ok) { auth.clearHost(); return signIn(); }
    draw();
  }

  async function signIn() {
    const st = await get('host/status').catch(() => ({ ok: false }));
    const pw = h('input', { type: 'password', autocomplete: st.setup ? 'current-password' : 'new-password', minlength: 6 });
    const err = h('div', { class: 'err' });
    mount(body, h('div', { class: 'narrow' }, h('div', { class: 'eyebrow' }, 'Artha Vyūha'), h('h1', {}, 'Event Head desk'),
      h('form', { class: 'card stack', onsubmit: async (e) => {
        e.preventDefault(); err.textContent = '';
        const r = await send(st.setup ? 'host/login' : 'host/setup', { password: pw.value });
        if (!r.ok) { err.textContent = r.error; return; }
        auth.setHost(r.token); draw();
      } },
      h('p', {}, st.setup ? 'Sign in with the Event Head password.' : 'First visit: choose the Event Head password (at least 6 characters). Write it down — only someone with it can run games.'),
      h('label', { class: 'field' }, h('span', {}, 'Password'), pw), err, h('button', { class: 'btn', type: 'submit' }, st.setup ? 'Sign in' : 'Set the password'))));
  }

  function draw() {
    clearInterval(timer);
    const tabs = [['tables', 'Tables'], ['new', 'New game'], ['players', 'Players'], ['settings', 'Settings'], ['audit', 'Chip audit'], ['tools', 'Tools']];
    const pane = h('div', {});
    mount(body,
      h('div', { class: 'row between' }, h('div', {}, h('div', { class: 'eyebrow' }, 'Artha Vyūha · JACO CORP'), h('h1', { style: { margin: 0 } }, 'Event Head desk')), h('button', { class: 'btn ghost sm', onclick: () => { auth.clearHost(); signIn(); } }, 'Sign out')),
      h('div', { class: 'hosttabs', role: 'tablist' }, tabs.map(([k, l]) => h('button', { role: 'tab', class: k === tab ? 'on' : '', 'aria-selected': k === tab ? 'true' : 'false', onclick: () => { tab = k; draw(); } }, l))),
      pane);
    ({ tables: tablesTab, new: newTab, players: playersTab, settings: settingsTab, audit: auditTab, tools: toolsTab })[tab](pane);
  }

  // ---------------- tables ----------------
  async function tablesTab(pane) {
    const load = async () => {
      const r = await hostGet('host/overview');
      if (!r.ok) { mount(pane, h('p', { class: 'err' }, r.error)); return; }
      const rooms = r.rooms.filter((x) => x.status === 'open');
      mount(pane,
        h('div', { class: 'kpis' }, kpi('Open tables', rooms.filter((x) => x.kind === 'cash').length), kpi('Tournaments', rooms.filter((x) => x.kind === 'tournament').length), kpi('Practice tables', rooms.filter((x) => x.kind === 'practice').length), kpi('Players seated', rooms.reduce((a, x) => a + x.humans, 0)), kpi('Accounts', r.accounts)),
        rooms.length ? h('div', { class: 'grid g2', style: { marginTop: '16px' } }, rooms.map((x) => roomCard(x))) : h('p', { class: 'muted', style: { marginTop: '16px' } }, 'No games yet. Make one in “New game”.'));
    };
    await load();
    timer = setInterval(load, 4000);
  }

  function roomCard(x) {
    const kind = x.kind === 'tournament' ? 'Tournament' : x.kind === 'practice' ? 'Practice' : 'Cash table';
    return h('div', { class: 'card tight roomcard' },
      h('div', { class: 'head' }, h('span', { class: 'nm' }, x.name), h('span', { class: 'badge' }, kind), x.private ? h('span', { class: 'badge dim' }, 'Private') : null, h('span', { class: 'spacer' }), h('span', { class: 'mono gold' }, x.code)),
      h('div', { class: 'muted small' }, x.tour ? `${({ registering: 'Registering', running: 'Running', paused: 'Paused', finished: 'Finished' })[x.tour.status]} · ${x.tour.entrants} players · level ${x.tour.level} (${fmt(x.tour.blinds.sb)}/${fmt(x.tour.blinds.bb)})` : `${stakesLabel(x)} · ${x.seated}/${x.seats} seated (${x.humans} people) · ${x.actionSeconds}s timer`, ` · by ${x.ownerName}`),
      h('div', { class: 'row tight' },
        h('button', { class: 'btn sm', onclick: () => roomDetail(x) }, 'Manage'),
        h('a', { class: 'btn sm ghost', href: `#/screen/${x.code}`, target: '_blank', rel: 'noopener' }, 'Big Screen'),
        h('a', { class: 'btn sm ghost', href: `#/t/${x.code}`, target: '_blank', rel: 'noopener' }, 'Player view')));
  }

  /** A live, managed view of one room. */
  function roomDetail(x) {
    const content = h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'Loading…'));
    const felt = new Felt({ big: true });
    let conn = null;
    const s = sheet(x.name, content, { wide: true, eyebrow: `Code ${x.code}`, onClose: () => { conn?.stop(); felt.destroy(); } });
    let tIdx = 0;
    const manage = async (op, args = {}) => {
      const r = await hostSend('room/manage', { id: x.id, op, ...args });
      if (!r.ok) toast(r.error, 'bad'); else { toast('Done', 'good'); conn.refresh(); }
      return r;
    };
    conn = remoteRoom({ id: x.id }, (v) => {
      const tables = v.tables;
      const t = tables.find((y) => y.i === tIdx) || tables[0];
      if (t) felt.update(v, t);
      const tr = v.tour;
      mount(content,
        v.books ? h('div', { class: 'muted small' }, `Books: ${fmt(v.books.in)} chips brought in, ${fmt(v.books.out)} taken out${v.books.outbox ? ` · ${v.books.outbox} deliveries pending` : ''}${v.pendingCfg ? ' · new settings wait for the next hand' : ''}${v.paused ? ' · PAUSED' : ''}`) : null,
        tr ? h('div', { class: 'tclock' },
          h('span', {}, h('span', { class: 'eyebrow' }, `Level ${tr.level}/${tr.levels}`), ' ', h('b', { class: 'num' }, `${fmt(tr.blinds.sb)}/${fmt(tr.blinds.bb)}${tr.blinds.ante ? ` · ${fmt(tr.blinds.ante)}` : ''}`)),
          h('span', { class: 'big' }, tr.status === 'paused' ? fmtClock(tr.pausedLeft) : tr.status === 'running' ? fmtClock(left(tr.levelEndsAt)) : tr.status),
          h('span', {}, `${tr.left}/${tr.entrants} left · avg ${fmt(tr.avgStack)} · ${tr.tables} table${tr.tables === 1 ? '' : 's'}`)) : null,
        h('div', { class: 'row tight' },
          tr && tr.status === 'registering' ? h('button', { class: 'btn sm', onclick: () => manage('start') }, 'Start the tournament') : null,
          tr && tr.status === 'running' ? h('button', { class: 'btn sm ghost', onclick: () => manage('tpause') }, 'Pause') : null,
          tr && tr.status === 'paused' ? h('button', { class: 'btn sm', onclick: () => manage('tresume') }, 'Resume') : null,
          tr && ['running', 'paused'].includes(tr.status) ? h('button', { class: 'btn sm ghost', onclick: () => manage('level') }, 'Next level now') : null,
          tr && ['running', 'paused'].includes(tr.status) ? h('button', { class: 'btn sm ghost', onclick: () => manage('addtime', { minutes: 2 }) }, '+2 minutes') : null,
          !tr ? h('button', { class: 'btn sm ghost', onclick: () => manage(v.paused ? 'resume' : 'pause') }, v.paused ? 'Resume' : 'Pause after this hand') : null,
          h('button', { class: 'btn sm ghost', onclick: () => manage('bot-add', { count: 1, level: 'medium' }) }, 'Add a bot'),
          !tr ? h('button', { class: 'btn sm ghost', onclick: () => sheet('Table settings', (close) => tableSettingsForm(v.cfg, { kind: v.kind, submitLabel: 'Save', onSubmit: async (cfg) => { const r = await manage('config', { cfg }); if (r.ok) close(); } }), { wide: true, eyebrow: 'Applied between hands, never during one' }) }, 'Settings') : null,
          t && t.hand && t.hand.status === 'betting' ? h('button', { class: 'btn sm danger', onclick: async () => { if (await confirmSheet('Cancel this hand?', 'Everyone gets back the chips they started the hand with. Use this only for a real problem (a crash, a dispute).', 'Cancel the hand')) manage('void', { table: t.i }); } }, 'Cancel this hand') : null,
          !tr ? h('button', { class: 'btn sm danger', onclick: async () => { if (await confirmSheet('Close the table?', 'Players are stood up and their chips go back to their accounts. Finish or cancel the hand in play first.', 'Close')) { const r = await manage('close'); if (r.ok) s.close(); } } }, 'Close table') : null),
        tables.length > 1 ? h('div', { class: 'row tight' }, h('span', { class: 'muted small' }, 'Show table'), tables.map((y) => h('button', { class: `btn sm ${y.i === (t?.i ?? 0) ? '' : 'ghost'}`, onclick: () => { tIdx = y.i; conn.refresh(); felt.state.handId = null; } }, String(y.i + 1)))) : null,
        felt.el,
        t ? h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Seat', 'Player', 'Chips', 'Status', ''].map((c) => h('th', {}, c)))), t.seats.map((st, i) => (st ? h('tr', {},
          h('td', { class: 'num muted' }, i + 1), h('td', {}, avatar(st.avatar, { size: 'sm', bot: !!st.bot }), ' ', st.name, st.bot ? h('span', { class: 'badge bot', style: { marginLeft: '6px' } }, `Bot · ${st.bot}`) : null),
          h('td', { class: 'num' }, fmt(st.stack)), h('td', { class: 'muted small' }, [st.sittingOut ? 'sitting out' : null, st.away ? 'away' : null, st.waitBB ? 'waits for BB' : null, st.leaving ? 'leaving' : null, st.inHand ? (st.folded ? 'folded' : 'in the hand') : null].filter(Boolean).join(', ')),
          h('td', { class: 'r' }, st.bot ? h('button', { class: 'btn sm ghost', onclick: () => manage('bot-remove', { acct: st.botId }) }, 'Remove') : h('button', { class: 'btn sm ghost', onclick: async () => { if (await confirmSheet(`Remove ${st.name}?`, v.kind === 'tournament' ? 'They will be sat out; their chips stay in play.' : 'Their hand is folded and their chips go back to their account.', 'Remove')) manage('kick', { acct: st.acct }); } }, 'Remove'))) : null))) : null,
        tr ? h('div', { class: 'grid g2' },
          h('div', {}, h('h4', {}, 'Chip counts'), h('table', { class: 'tbl' }, tr.standings.slice(0, 15).map((p, i) => h('tr', {}, h('td', { class: 'num muted' }, i + 1), h('td', {}, p.name), h('td', { class: 'r num' }, fmt(p.chips)), h('td', { class: 'r muted' }, `T${p.table}`))))),
          h('div', {}, h('h4', {}, tr.results.length ? 'Results' : 'Registered'), tr.results.length ? h('table', { class: 'tbl' }, tr.results.map((p) => h('tr', {}, h('td', {}, ordinal(p.place)), h('td', {}, p.name), h('td', { class: 'r num' }, p.prize ? fmt(p.prize) : '')))) : h('div', { class: 'row tight' }, tr.registered.map((e) => h('span', { class: `badge ${e.bot ? 'bot' : ''}` }, e.name))))) : null,
        v.notes?.length ? h('div', {}, h('h4', {}, 'Table news'), h('div', { class: 'log', style: { maxHeight: '180px' } }, v.notes.map((n) => h('div', { class: 'l' }, n.text)))) : null);
    }, { host: true });
  }

  // ---------------- new game ----------------
  function newTab(pane) {
    let kind = 'cash';
    const holder = h('div', {});
    const drawForm = () => mount(holder, kind === 'cash'
      ? tableSettingsForm({ sb: 10, bb: 20, seats: 9, minBuyIn: 800, maxBuyIn: 4000 }, { kind: 'cash', name: true, defaultName: 'Main Table', isPrivate: false, bots: true, botCount: 0, submitLabel: 'Open the table', onSubmit: async (cfg, extra) => {
        const r = await hostSend('host/room', { kind: 'cash', name: extra.name, private: extra.private, cfg, bots: extra.bots });
        if (!r.ok) return toast(r.error, 'bad');
        toast(`Table open — code ${r.code}`, 'good'); tab = 'tables'; draw();
      } })
      : h('div', { class: 'stack' },
        h('div', { class: 'formgrid' },
          h('label', { class: 'field' }, h('span', {}, 'Tournament name'), h('input', { type: 'text', id: 'hn', maxlength: 40, value: 'Artha Vyūha Championship' })),
          h('label', { class: 'field' }, h('span', {}, 'Seats per table'), h('select', { id: 'hs' }, [[9, '9'], [6, '6'], [2, '2 (heads-up)'], [8, '8'], [10, '10']].map(([v, l]) => h('option', { value: v }, l)))),
          h('label', { class: 'field' }, h('span', {}, 'Seconds to act'), h('input', { type: 'number', id: 'ha', value: 25, min: 5, max: 600 })),
          h('label', { class: 'field' }, h('span', {}, 'Who can find it'), h('select', { id: 'hp' }, [['public', 'Public — in the lobby'], ['private', 'Private — by code']].map(([v, l]) => h('option', { value: v }, l)))),
          h('label', { class: 'field' }, h('span', {}, 'Test bots (0 for a real event)'), h('input', { type: 'number', id: 'hb', value: 0, min: 0, max: 200 }))),
        tournamentForm({}, { submitLabel: 'Create the tournament', onSubmit: async (tour) => {
          const $ = (i) => document.getElementById(i).value;
          const r = await hostSend('host/room', { kind: 'tournament', name: $('hn'), private: $('hp') === 'private', cfg: { seats: Number($('hs')), actionSeconds: Number($('ha')) }, tour, bots: { count: Number($('hb')), level: 'medium' } });
          if (!r.ok) return toast(r.error, 'bad');
          toast(`Tournament created — code ${r.code}. Players register from the lobby; press Start when ready.`, 'good'); tab = 'tables'; draw();
        } })));
    mount(pane, h('div', { class: 'card stack' }, seg([['cash', 'Cash-style table'], ['tournament', 'Tournament']], kind, (k) => { kind = k; drawForm(); }), holder));
    drawForm();
  }

  // ---------------- players ----------------
  async function playersTab(pane) {
    const r = await hostGet('host/accounts');
    if (!r.ok) { mount(pane, h('p', { class: 'err' }, r.error)); return; }
    const q = h('input', { type: 'search', placeholder: 'Find a player', style: { maxWidth: '320px' } });
    const list = h('div', {});
    const drawList = () => {
      const f = q.value.trim().toLowerCase();
      const rows = r.accounts.filter((a) => !f || a.name.toLowerCase().includes(f));
      mount(list, h('div', { class: 'scroll-x' }, h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Player', 'Chips', 'Hands', 'Cash result', 'Points', 'At', 'Last seen', ''].map((x) => h('th', {}, x)))),
        rows.map((a) => h('tr', {}, h('td', {}, a.name, a.guest ? h('span', { class: 'badge dim', style: { marginLeft: '6px' } }, 'Guest') : null), h('td', { class: 'num' }, fmt(a.bankroll), a.inTransit ? h('span', { class: 'muted' }, ` (+${fmt(a.inTransit)} moving)`) : null), h('td', { class: 'num' }, fmt(a.hands)), h('td', { class: `num ${a.net > 0 ? 'up' : a.net < 0 ? 'down' : ''}` }, a.net > 0 ? `+${fmt(a.net)}` : fmt(a.net)), h('td', { class: 'num' }, fmt(a.points)), h('td', { class: 'small' }, a.at.join(', ')), h('td', { class: 'muted small' }, ago(a.lastLogin)),
          h('td', { class: 'r' }, h('button', { class: 'btn sm ghost', onclick: () => grant(a) }, 'Chips')))))));
    };
    q.addEventListener('input', drawList);
    mount(pane, h('p', { class: 'muted' }, `${r.accounts.length} accounts. Chips are virtual. Giving or taking chips is recorded in the account’s books and the chip audit.`), q, list);
    drawList();
  }
  function grant(a) {
    const amt = h('input', { type: 'number', value: 1000, step: 100 });
    sheet(`Chips for ${a.name}`, (close) => h('form', { class: 'stack', onsubmit: async (e) => {
      e.preventDefault();
      const r = await hostSend('host/grant', { acct: a.id, amount: Number(amt.value) });
      if (!r.ok) return toast(r.error, 'bad');
      toast(`${a.name} now has ${fmt(r.bankroll)} chips`, 'good'); close(); draw();
    } }, h('p', {}, `${a.name} has ${fmt(a.bankroll)} chips in their account (not counting chips at tables). Use a negative number to take chips away.`), h('label', { class: 'field' }, h('span', {}, 'Chips to add'), amt), h('button', { class: 'btn', type: 'submit' }, 'Apply')));
  }

  // ---------------- settings ----------------
  async function settingsTab(pane) {
    const r = await hostGet('host/overview');
    if (!r.ok) { mount(pane, h('p', { class: 'err' }, r.error)); return; }
    const s = r.settings;
    const box = (k, label, val) => h('label', { class: 'check', style: { display: 'flex', margin: '6px 0' } }, h('input', { type: 'checkbox', name: k, checked: val ? true : null }), label);
    const n = (k, label, val) => h('label', { class: 'field' }, h('span', {}, label), h('input', { type: 'number', name: k, value: val, min: 0 }));
    mount(pane, h('form', { class: 'card stack', onsubmit: async (e) => {
      e.preventDefault();
      const f = e.target;
      const formats = Object.fromEntries(['quickPlay', 'cash', 'private', 'tournament', 'practice', 'headsUp'].map((k) => [k, f[`f_${k}`].checked]));
      const res = await hostSend('host/settings', { settings: { formats, guests: f.guests.checked, registration: f.registration.checked, startingChips: Number(f.startingChips.value), reloadTo: Number(f.reloadTo.value), reloadBelow: Number(f.reloadBelow.value), reloadMinutes: Number(f.reloadMinutes.value), reminderMinutes: Number(f.reminderMinutes.value), maxTables: Number(f.maxTables.value), maxBotsPerPractice: Number(f.maxBotsPerPractice.value) } });
      if (res.ok) toast('Settings saved', 'good'); else toast(res.error, 'bad');
    } },
    h('h3', { style: { marginTop: 0 } }, 'What players may play'),
    box('f_quickPlay', 'Quick Play (public cash tables made on demand)', s.formats.quickPlay), box('f_private', 'Private tables made by players', s.formats.private),
    box('f_tournament', 'Private tournaments made by players', s.formats.tournament), box('f_practice', 'Practice against bots', s.formats.practice), box('f_headsUp', 'Heads-up (2-seat) tables', s.formats.headsUp),
    box('f_cash', 'Cash-style tables (the Event Head can always open them)', s.formats.cash),
    h('h3', {}, 'Accounts'), box('guests', 'Allow guests (a name, no password)', s.guests), box('registration', 'Allow new accounts with a password', s.registration),
    h('div', { class: 'formgrid' }, n('startingChips', 'Chips for a new account', s.startingChips), n('reloadBelow', 'Free chips when below', s.reloadBelow), n('reloadTo', 'Free chips top up to', s.reloadTo), n('reloadMinutes', 'Minutes between free chips', s.reloadMinutes),
      n('reminderMinutes', 'Break reminder (minutes, 0 = off)', s.reminderMinutes), n('maxTables', 'Most tables per player', s.maxTables), n('maxBotsPerPractice', 'Most bots per practice table', s.maxBotsPerPractice)),
    h('p', { class: 'small muted' }, 'Rules at a table (blinds, stacks, timer, bet buttons, showdown) are set per table under “Tables → Manage → Settings”, and change only between hands.'),
    h('button', { class: 'btn', type: 'submit' }, 'Save settings')));
  }

  // ---------------- audit ----------------
  async function auditTab(pane) {
    mount(pane, h('p', { class: 'muted' }, 'Checking every account and every table…'));
    const r = await hostGet('host/audit');
    if (!r.ok) { mount(pane, h('p', { class: 'err' }, r.error)); return; }
    const s = r.summary;
    const mark = (ok, yes = 'Balanced', no = 'Check') => h('span', { class: `mark ${ok ? 'up' : 'down'}` }, ok ? yes : no);
    mount(pane,
      h('div', { class: 'card stack' },
        h('h3', { style: { marginTop: 0 } }, 'Chip audit'),
        h('p', { class: 'muted small' }, 'Every chip is accounted for: chips given out (starting chips, free chips, Event Head grants, tournament chip prizes) are in accounts, on the way, or at tables. Bots bring their own chips, counted separately.'),
        h('div', { class: 'okline' }, mark(s.accountsBalanced), 'Every account’s chips match its books'),
        h('div', { class: 'okline' }, mark(s.tablesBalanced), 'Every table’s chips match chips brought in minus chips taken out'),
        h('div', { class: 'okline' }, mark(s.buyInsMatch), `Buy-ins: accounts paid ${fmt(s.boughtIn + s.holdsApplied)}, tables received ${fmt(s.humanIn)}`),
        h('div', { class: 'okline' }, mark(s.cashOutsMatch), `Cash-outs: tables paid out ${fmt(s.humanOut)}, accounts received ${fmt(s.cashedOut)} (+${fmt(s.pendingCashouts)} on the way)`),
        h('div', { class: 'kpis' }, kpi('Chips given out', fmt(s.issued)), kpi('In accounts', fmt(s.bankrolls)), kpi('On the way', fmt(s.inTransit + s.pendingCashouts)), kpi('At tables', fmt(s.onTables)))),
      r.acctProblems.length ? h('div', { class: 'card' }, h('h4', {}, 'Accounts to check'), h('table', { class: 'tbl' }, r.acctProblems.map((p) => h('tr', {}, h('td', {}, p.name), h('td', { class: 'num' }, fmt(p.bankroll)), h('td', { class: 'num' }, fmt(p.books)))))) : null,
      h('h3', {}, 'Tables'),
      h('div', { class: 'scroll-x' }, h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Table', 'Status', 'In', 'Out', 'Bots in/out', 'On the table', ''].map((x) => h('th', {}, x)))),
        r.tables.map((t) => h('tr', {}, h('td', {}, t.name), h('td', {}, t.status), h('td', { class: 'num' }, fmt(t.in)), h('td', { class: 'num' }, fmt(t.out)), h('td', { class: 'num muted' }, `${fmt(t.botIn)} / ${fmt(t.botOut)}`), h('td', { class: 'num' }, fmt(t.onTable)), h('td', {}, mark(t.ok)))))),
      h('button', { class: 'btn ghost', style: { marginTop: '12px' }, onclick: () => auditTab(pane) }, 'Check again'));
  }

  // ---------------- tools ----------------
  function toolsTab(pane) {
    const conf = h('input', { type: 'text', placeholder: 'Type RESET', style: { maxWidth: '200px' } });
    const keep = h('input', { type: 'checkbox', checked: true });
    const pw = h('input', { type: 'password', minlength: 6, autocomplete: 'new-password', style: { maxWidth: '260px' } });
    mount(pane, h('div', { class: 'grid g2' },
      h('div', { class: 'card stack' }, h('h3', { style: { marginTop: 0 } }, 'Backup'), h('p', { class: 'muted small' }, 'Download every table, tournament result, hand history and account (without passwords) as one file.'),
        h('button', { class: 'btn', onclick: async (e) => {
          // the server sends the backup in parts so no single request runs too long
          const btn = e.currentTarget; btn.disabled = true;
          const docs = {}; let from = 0; let total = 0; let at = null;
          for (let k = 0; k < 500 && from !== null; k++) {
            const r = await hostGet(`host/backup?from=${from}`);
            if (!r.ok) { btn.disabled = false; return toast(r.error || 'The backup stopped — try again', 'bad'); }
            Object.assign(docs, r.docs); from = r.next; total = r.total; at = r.at;
            btn.textContent = from === null ? 'Download backup' : `Collecting… ${from}/${total}`;
          }
          btn.disabled = false; btn.textContent = 'Download backup';
          const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify({ ok: true, at, docs }, null, 1)], { type: 'application/json' })), download: `artha-backup-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json` });
          document.body.appendChild(a); a.click(); a.remove();
          toast(`Backup saved: ${Object.keys(docs).length} records`, 'good');
        } }, 'Download backup')),
      h('div', { class: 'card stack' }, h('h3', { style: { marginTop: 0 } }, 'Reset everything'), h('p', { class: 'muted small' }, 'Deletes all tables, tournaments and hand histories. With “keep accounts”, players keep their names and chips (chips at cash tables are returned first).'),
        h('label', { class: 'check' }, keep, 'Keep accounts'), conf,
        h('button', { class: 'btn danger', onclick: async (e) => {
          if (conf.value !== 'RESET') return toast('Type RESET first', 'bad');
          // the server works in steps (so no request runs too long): ask again until it is done
          const btn = e.currentTarget; btn.disabled = true;
          let deleted = 0;
          for (let k = 0; k < 300; k++) {
            const r = await hostSend('host/reset', { confirm: 'RESET', keepAccounts: keep.checked });
            if (!r.ok) { btn.disabled = false; btn.textContent = 'Reset'; return toast(`${r.error || 'The reset stopped'} — press Reset again to continue`, 'bad'); }
            deleted += r.deleted || 0;
            btn.textContent = r.more ? `Resetting… ${deleted} deleted` : 'Reset';
            if (!r.more) break;
          }
          btn.disabled = false; btn.textContent = 'Reset';
          conf.value = '';
          toast(`Reset done: ${deleted} records deleted`, 'good');
        } }, 'Reset')),
      h('div', { class: 'card stack' }, h('h3', { style: { marginTop: 0 } }, 'Server check'), h('p', { class: 'muted small' }, 'Tests the connection to the server and its storage, with timings, in plain words. Use it whenever something seems wrong.'),
        h('a', { class: 'btn ghost', href: '#/status' }, 'Run the server check')),
      h('div', { class: 'card stack' }, h('h3', { style: { marginTop: 0 } }, 'Event Head password'), h('label', { class: 'field' }, h('span', {}, 'New password'), pw),
        h('button', { class: 'btn ghost', onclick: async () => { const r = await hostSend('host/password', { password: pw.value }); if (r.ok) { auth.setHost(r.token); toast('Password changed', 'good'); } else toast(r.error, 'bad'); } }, 'Change password'))));
  }

  const kpi = (k, v) => h('div', { class: 'kpi' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v));

  await start();
  return () => clearInterval(timer);
}
