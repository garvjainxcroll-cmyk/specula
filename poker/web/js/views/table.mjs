// The Player Desk: one table (or a tournament) live. #/t/CODE, or #/t/local for offline practice.
import { h, mount, fmt, fmtClock, sheet, toast, confirmSheet, icon, ordinal, chips, sstore, avatar } from '../ui.mjs';
import { remoteRoom, session, refreshMe, net, left } from '../net.mjs';
import { localRoom } from '../local.mjs';
import { Felt } from '../felt.mjs';
import { BetPanel } from '../betpanel.mjs';
import { logEl } from '../handlog.mjs';
import { miniCards } from '../cards.mjs';
import { prefs, setPrefs, onPrefs } from '../prefs.mjs';
import { ensureSignedIn } from '../identity.mjs';
import { handSheet } from './hand.mjs';
import { tableSettingsForm } from './forms.mjs';

export default async function table(app, { band, args, query }) {
  const ref = args[0];
  if (!ref) { location.hash = '#/lobby'; return null; }
  const isLocal = ref === 'local';
  let view = null; let tIndex = Number(query.get('t')) || null; let sideTab = 'hand';
  const felt = new Felt({ onSit: (s) => sitDialog(s) });
  const panel = new BetPanel({ onAct: async (type, to, legal) => {
    const r = await conn.act(legal.handId, legal.seq, type, to);
    if (!r.ok) { toast(r.error || 'That did not go through', 'bad'); conn.refresh(); return false; }
    return true;
  } });
  const top = h('div', { class: 'ttop' });
  const tstrip = h('div', {});
  const side = h('aside', { class: 'side' });
  const grid = h('div', { class: `tgrid ${prefs().layout}` }, h('div', {}, felt.el, panel.el), side);
  mount(app, band('t'), h('div', { class: 'tview' }, top, tstrip, grid));

  const conn = isLocal ? localRoom(render) : remoteRoom({ code: ref }, render, { onError: (r) => {
    if (r.code === 'no-room') mount(app, band('t'), h('div', { class: 'narrow page' }, h('h2', {}, 'Table not found'), h('p', {}, 'Check the code, or ask the host for a new link.'), h('a', { class: 'btn', href: '#/lobby' }, 'To the lobby')));
  } });
  const offPrefs = onPrefs(() => { grid.className = `tgrid ${prefs().layout}`; if (view) render(view); });
  const clock = setInterval(() => { drawStrip(); reminder(); }, 500);

  function myTable(v) {
    const tables = v.tables;
    if (!tables.length) return null;
    if (v.you) return tables.find((t) => t.i === v.you.table) || tables[0];
    if (tIndex !== null) return tables.find((t) => t.i === tIndex) || tables[0];
    return tables[0];
  }

  function render(v) {
    view = v;
    const t = myTable(v);
    drawTop(v, t);
    drawStrip();
    if (t) felt.update(v, t);
    else mount(felt.center);
    drawPanel(v, t);
    drawSide(v, t);
  }

  // ---------------- the bar above the table ----------------
  function drawTop(v, t) {
    const blinds = v.tour ? v.tour.blinds : v.cfg;
    const you = v.you;
    const isCash = v.kind === 'cash';
    mount(top,
      h('div', {}, h('div', { class: 'title' }, v.name), h('div', { class: 'meta' },
        v.kind === 'tournament' ? 'Tournament' : v.kind === 'practice' ? 'Practice' : v.private ? 'Private table' : 'Cash table',
        ` · blinds ${fmt(blinds.sb)}/${fmt(blinds.bb)}${blinds.ante ? ` · ante ${fmt(blinds.ante)}` : ''}`,
        t && t.handNo ? ` · hand #${t.handNo}` : '',
        v.kind !== 'tournament' ? ` · ${v.cfg.seats} seats` : '',
        v.paused ? ' · paused' : '')),
      h('span', { class: 'spacer' }),
      v.code && !isLocal ? h('button', { class: 'btn sm ghost', onclick: () => share(v) }, 'Invite') : null,
      v.tables.length > 1 && !you ? h('select', { 'aria-label': 'Which table', style: { width: 'auto', minHeight: '34px' }, onchange: (e) => { tIndex = Number(e.target.value); render(view); } }, v.tables.map((x) => h('option', { value: x.i, selected: t && x.i === t.i ? true : null }, `Table ${x.i + 1}`))) : null,
      h('button', { class: 'iconbtn', title: prefs().sound ? 'Sound on (click to mute)' : 'Muted (click for sound)', 'aria-label': 'Sound', 'aria-pressed': prefs().sound ? 'true' : 'false', onclick: () => setPrefs({ sound: !prefs().sound }) }, icon(prefs().sound ? 'sound' : 'mute')),
      h('input', { type: 'range', min: 0, max: 100, value: prefs().volume, 'aria-label': 'Volume', title: 'Volume', class: 'hide-sm', style: { width: '90px' }, onchange: (e) => setPrefs({ volume: Number(e.target.value), sound: true }) }),
      h('button', { class: 'iconbtn', title: prefs().layout === 'expanded' ? 'Compact table' : 'Expanded table (with the hand log)', 'aria-label': 'Layout', onclick: () => setPrefs({ layout: prefs().layout === 'expanded' ? 'compact' : 'expanded' }) }, icon('layout')),
      prefs().layout === 'compact' ? h('button', { class: 'iconbtn', title: 'Hand log and history', 'aria-label': 'Hand log', 'aria-pressed': grid.classList.contains('show-side') ? 'true' : 'false', onclick: () => grid.classList.toggle('show-side') }, icon('history')) : null,
      you && (isCash || v.kind === 'practice' || v.kind === 'tournament') && v.tour?.status !== 'registering' ? h('button', { class: 'btn sm ghost', onclick: () => sitOutToggle(v) }, you.sittingOut || you.busted ? 'Sit back in' : 'Sit out') : null,
      you && v.kind !== 'tournament' ? h('button', { class: 'btn sm ghost', onclick: () => topUp(v) }, v.kind === 'practice' ? 'Reload' : 'Add chips') : null,
      you || (v.tour?.you && v.tour.you.status === 'registered') ? h('button', { class: 'btn sm danger', onclick: () => leaveTable(v) }, v.kind === 'tournament' ? (v.tour.status === 'registering' ? 'Unregister' : 'Sit out & leave') : 'Leave table') : h('a', { class: 'btn sm ghost', href: '#/lobby' }, 'Lobby'));
  }

  function drawStrip() {
    const v = view;
    if (!v?.tour) { mount(tstrip); return; }
    const tr = v.tour;
    const ms = tr.status === 'paused' ? tr.pausedLeft : left(tr.levelEndsAt);
    const me = tr.you;
    const place = me && tr.standings.findIndex((s) => s.isYou);
    mount(tstrip, h('div', { class: 'tclock' },
      h('span', {}, h('span', { class: 'eyebrow' }, `Level ${String(tr.level).padStart(2, '0')}`), ' ', h('b', { class: 'num' }, `${fmt(tr.blinds.sb)}/${fmt(tr.blinds.bb)}${tr.blinds.ante ? ` · ${fmt(tr.blinds.ante)}` : ''}`)),
      tr.status === 'running' || tr.status === 'paused' ? h('span', {}, tr.status === 'paused' ? 'Paused · ' : 'Next level in ', h('span', { class: 'big' }, fmtClock(ms)), tr.next ? h('span', { class: 'muted' }, ` → ${fmt(tr.next.sb)}/${fmt(tr.next.bb)}`) : null) : null,
      h('span', {}, `${tr.left} of ${tr.entrants} left`), h('span', {}, 'Average ', chips(tr.avgStack)),
      me && me.status === 'playing' && place >= 0 ? h('span', {}, 'You: ', h('b', {}, `${ordinal(place + 1)} in chips`)) : null,
      me && me.place ? h('span', { class: 'gold' }, `You finished ${ordinal(me.place)}`) : null,
      tr.status === 'registering' ? h('span', { class: 'badge' }, 'Registration open') : tr.lateRegOpen ? h('span', { class: 'badge' }, 'Late registration open') : null));
  }

  // ---------------- the action panel / what you can do now ----------------
  function drawPanel(v, t) {
    const hand = t?.hand;
    const you = v.you && t && v.you.table === t.i ? v.you : null;
    if (hand && hand.legal && you) { panel.update(hand.legal); return; }
    let msg;
    if (v.kind === 'tournament' && v.tour.status === 'registering') msg = tourLobby(v);
    else if (v.kind === 'tournament' && v.tour.status === 'finished') msg = h('div', { class: 'waitline' }, h('span', {}, `The tournament is over. ${v.tour.results[0] ? `${v.tour.results[0].name} won.` : ''}`), h('a', { class: 'btn sm', href: '#/lobby' }, 'Back to the lobby'));
    else if (!you) {
      if (v.kind === 'tournament') msg = h('div', { class: 'waitline' }, h('span', { class: 'muted' }, v.tour.you?.place ? `You finished ${ordinal(v.tour.you.place)}. You are watching.` : 'You are watching.'), v.tour.lateRegOpen && !v.tour.you ? h('button', { class: 'btn sm', onclick: () => register() }, 'Register (late)') : null);
      else msg = h('div', { class: 'waitline' }, h('span', { class: 'muted' }, v.status !== 'open' ? 'This table is closed.' : 'You are watching. Choose an empty seat to sit down.'), v.status === 'open' && t && t.seats.some((x) => !x) ? h('button', { class: 'btn sm', onclick: () => sitDialog(t.seats.findIndex((x) => !x)) }, 'Take a seat') : null);
    } else if (you.busted) msg = h('div', { class: 'waitline' }, h('span', {}, 'You are out of chips.'), h('button', { class: 'btn sm', onclick: () => topUp(v) }, v.kind === 'practice' ? 'Reload' : 'Add chips'), h('button', { class: 'btn sm ghost', onclick: () => leaveTable(v) }, 'Leave'));
    else if (you.sittingOut) msg = h('div', { class: 'waitline' }, h('span', {}, v.kind === 'tournament' ? 'You are sitting out: your blinds are still posted and your hands folded.' : 'You are sitting out — you will not be dealt in.'), h('button', { class: 'btn sm', onclick: () => sitOutToggle(v) }, 'Sit back in'));
    else if (you.leaving) msg = h('div', { class: 'waitline muted' }, 'You will leave the table when this hand ends. Your chips go back to your account.');
    else if (you.waitBB && !hand?.legal) msg = h('div', { class: 'waitline muted' }, 'You will be dealt in when the big blind reaches you.');
    else if (hand && hand.status === 'betting') {
      const actor = t.seats[hand.toAct];
      const me = t.seats[you.seat];
      msg = h('div', { class: 'waitline' }, h('span', { class: 'muted' }, me?.folded ? 'You folded. ' : '', actor ? `Waiting for ${actor.isYou ? 'you' : actor.name}${actor.bot ? ' (bot)' : ''}…` : 'Waiting…'), me && me.inHand && !me.folded && me.myHand ? h('span', {}, 'You have ', h('b', {}, me.myHand)) : null);
    } else if (hand && hand.status === 'complete') {
      const me = t.seats[you.seat];
      const canShow = me && me.inHand && !me.shown;
      msg = h('div', { class: 'waitline' }, h('span', { class: 'muted' }, v.paused ? 'The host has paused the table.' : 'Next hand in a moment…'), canShow ? h('button', { class: 'btn sm ghost', onclick: () => conn.show() }, 'Show my cards') : null);
    } else msg = h('div', { class: 'waitline muted' }, v.paused ? 'The host has paused the table.' : t && t.seats.filter(Boolean).length < 2 ? 'Waiting for another player. Share the invite link, or add bots in practice.' : 'The next hand starts in a moment…');
    panel.update(null, msg);
  }

  function tourLobby(v) {
    const tr = v.tour;
    const mine = tr.you;
    return h('div', { class: 'stack' },
      h('div', { class: 'waitline' }, h('span', {}, h('b', {}, `${tr.entrants} registered`), ` · starting stack ${fmt(tr.startingStack)} · ${tr.levels} levels · prizes in ${tr.prize === 'chips' ? 'virtual chips' : 'points'}`),
        mine ? h('button', { class: 'btn sm ghost', onclick: () => leaveTable(v) }, 'Unregister') : h('button', { class: 'btn', onclick: () => register() }, 'Register')),
      h('div', { class: 'muted small' }, 'The Event Head (or the table’s host) starts the tournament. Keep this page open: you will be seated automatically.'),
      h('div', { class: 'row tight' }, tr.registered.map((e) => h('span', { class: `badge ${e.bot ? 'bot' : e.isYou ? '' : 'dim'}` }, e.name))));
  }

  // ---------------- side panel ----------------
  function drawSide(v, t) {
    const hand = t?.hand;
    const tabs = [['hand', 'This hand'], ['prev', 'Previous'], ['table', v.kind === 'tournament' ? 'Tournament' : 'Table']];
    const youSeat = v.you && t && v.you.table === t.i ? v.you.seat : null;
    let body;
    if (sideTab === 'hand') body = hand ? logEl(hand.log, { youSeat }) : h('p', { class: 'muted' }, 'No hand yet.');
    else if (sideTab === 'prev') body = t && t.recent.length ? h('div', { class: 'prevhands' }, t.recent.map((r) => h('button', { onclick: () => openHand(r) },
      h('span', { class: 'num muted' }, `#${r.no}`),
      h('span', {}, r.voided ? 'Cancelled' : r.winners.map((w) => `${w.name} +${fmt(w.amount)}`).join(', '), r.winners[0]?.hand ? h('span', { class: 'muted' }, ` · ${r.winners[0].hand}`) : null),
      miniCards(r.board)))) : h('p', { class: 'muted' }, 'Finished hands appear here.');
    else body = tableInfo(v);
    mount(side, h('div', { class: 'card tight' },
      h('div', { class: 'tabs2', role: 'tablist' }, tabs.map(([k, l]) => h('button', { role: 'tab', class: k === sideTab ? 'on' : '', 'aria-selected': k === sideTab ? 'true' : 'false', onclick: () => { sideTab = k; drawSide(view, myTable(view)); } }, l))),
      body));
  }

  function tableInfo(v) {
    const c = v.cfg;
    const rows = [
      ['Blinds', `${fmt(c.sb)} / ${fmt(c.bb)}${c.ante ? `, ante ${fmt(c.ante)}` : ''}`],
      v.kind === 'cash' ? ['Buy-in', `${fmt(c.minBuyIn)} – ${fmt(c.maxBuyIn)}`] : null,
      ['Time to act', `${c.actionSeconds} s + ${c.timeBankSeconds} s time bank`],
      ['Small / Big Bet', `${c.presets.small.value}${c.presets.small.mode === 'pot' ? '% pot' : ' BB'} / ${c.presets.big.value}${c.presets.big.mode === 'pot' ? '% pot' : ' BB'} (your own sizes are in your profile)`],
      ['Showdown', c.showdownReveal === 'all' ? 'every hand at showdown is shown' : 'losing hands are mucked unless a player turns auto-muck off'],
      ['New players', c.newPlayers === 'wait-bb' ? 'wait for the big blind' : 'dealt in at once'],
      v.pendingCfg ? ['Waiting', 'new settings apply from the next hand'] : null,
    ].filter(Boolean);
    const isOwner = v.isOwner || isLocal;
    const kids = [h('table', { class: 'tbl' }, rows.map(([k, val]) => h('tr', {}, h('td', { class: 'muted' }, k), h('td', {}, val))))];
    if (view.you) kids.push(h('label', { class: 'check small', style: { marginTop: '8px' } }, h('input', { type: 'checkbox', checked: view.you.autoMuck ? true : null, onchange: (e) => conn.autoMuck(e.target.checked) }), 'Auto-muck my losing hands at showdown'));
    if (v.tour) {
      const tr = v.tour;
      kids.push(h('h4', {}, 'Chip counts'), h('table', { class: 'tbl' }, tr.standings.slice(0, 12).map((s, i) => h('tr', { class: s.isYou ? 'you' : '' }, h('td', { class: 'num muted' }, i + 1), h('td', {}, s.name, s.bot ? ' ' : '', s.bot ? h('span', { class: 'badge bot' }, 'Bot') : null), h('td', { class: 'r num' }, fmt(s.chips)), h('td', { class: 'r muted' }, `T${s.table}`)))));
      kids.push(h('h4', {}, 'Prizes'), h('p', { class: 'small' }, tr.prizes.map((p, i) => `${ordinal(i + 1)}: ${fmt(p)}`).join(' · '), ` ${tr.prize === 'chips' ? 'virtual chips' : 'points'} (no money value)`));
      if (tr.results.length) kids.push(h('h4', {}, 'Results'), h('table', { class: 'tbl' }, tr.results.slice(0, 20).map((r) => h('tr', {}, h('td', {}, ordinal(r.place)), h('td', {}, r.name), h('td', { class: 'r num' }, r.prize ? fmt(r.prize) : '')))));
    }
    if (v.notes?.length) kids.push(h('h4', {}, 'Table news'), h('div', { class: 'log', style: { maxHeight: '160px' } }, v.notes.map((n) => h('div', { class: 'l' }, n.text))));
    if (isOwner && v.kind !== 'tournament') {
      kids.push(h('h4', {}, 'Host controls'), h('div', { class: 'row tight' },
        h('button', { class: 'btn sm ghost', onclick: () => editSettings(v) }, 'Settings'),
        v.kind === 'practice' ? h('button', { class: 'btn sm ghost', onclick: async () => { const r = await conn.manage('bot-add', { count: 1, level: v.cfg.botLevel }); if (!r.ok) toast(r.error, 'bad'); } }, 'Add a bot') : null,
        v.kind === 'practice' ? botRemover(v) : null,
        h('button', { class: 'btn sm ghost', onclick: () => conn.manage(v.paused ? 'resume' : 'pause') }, v.paused ? 'Resume' : 'Pause'),
        h('button', { class: 'btn sm danger', onclick: async () => { if (await confirmSheet('Close this table?', 'Everyone is stood up and their chips go back to their accounts.', 'Close the table')) { const r = await conn.manage('close'); if (r.ok) location.hash = '#/lobby'; else toast(r.error, 'bad'); } } }, 'Close')));
    }
    if (isOwner && v.kind === 'tournament' && v.tour.status === 'registering') kids.push(h('div', { class: 'row tight', style: { marginTop: '8px' } }, h('button', { class: 'btn sm', onclick: async () => { const r = await conn.manage('start'); if (!r.ok) toast(r.error, 'bad'); } }, 'Start the tournament')));
    return h('div', {}, kids);
  }

  function botRemover(v) {
    const t = myTable(v);
    const bots = t.seats.filter((x) => x && x.bot);
    if (!bots.length) return null;
    return h('button', { class: 'btn sm ghost', onclick: async () => {
      const r = await conn.manage('bot-remove', { acct: bots.at(-1).botId });
      if (!r.ok) toast(r.error, 'bad');
    } }, 'Remove a bot');
  }

  // ---------------- dialogs ----------------
  async function sitDialog(seat) {
    if (!isLocal) { const me = await ensureSignedIn('Choose a name to sit down'); if (!me) return; }
    const v = view;
    if (v.kind === 'practice') { const r = await conn.sit(seat, v.cfg.maxBuyIn); if (!r.ok) toast(r.error, 'bad'); return; }
    const me = session.me;
    const max = Math.min(v.cfg.maxBuyIn, me.bankroll);
    if (max < v.cfg.minBuyIn) { sheet('Not enough chips', h('div', { class: 'stack' }, h('p', {}, `This table needs at least ${fmt(v.cfg.minBuyIn)} chips. You have ${fmt(me.bankroll)} in your account.`), h('a', { class: 'btn', href: '#/profile' }, 'Get free chips in your profile'))); return; }
    let amount = Math.min(max, Math.max(v.cfg.minBuyIn, 100 * v.cfg.bb));
    const out = h('b', { class: 'num' }, fmt(amount));
    const range = h('input', { type: 'range', min: v.cfg.minBuyIn, max, step: v.cfg.bb, value: amount, oninput: (e) => { amount = Number(e.target.value); out.textContent = fmt(amount); } });
    sheet('Take a seat', (close) => h('div', { class: 'stack' },
      h('p', {}, `How many chips do you bring to the table? Between ${fmt(v.cfg.minBuyIn)} and ${fmt(v.cfg.maxBuyIn)}. You have ${fmt(me.bankroll)} in your account.`),
      range, h('p', {}, 'Bring ', out, ' chips'),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: async () => { const r = await conn.sit(seat, amount); if (!r.ok) toast(r.error, 'bad'); else { close(); refreshMe(); startSession(); } } }, 'Sit down'), h('button', { class: 'btn ghost', onclick: close }, 'Cancel'))), { eyebrow: `Seat ${seat + 1}` });
  }

  async function topUp(v) {
    const you = v.you;
    if (v.kind === 'practice') { const add = v.cfg.maxBuyIn - you.stack; if (add <= 0) return toast('You already have the most chips allowed here'); const r = await conn.topUp(add); if (!r.ok) toast(r.error, 'bad'); return; }
    const me = session.me;
    const room = v.cfg.maxBuyIn - you.stack;
    const max = Math.min(room, me?.bankroll || 0);
    if (max <= 0) { toast(room <= 0 ? 'You already have the most chips allowed at this table' : 'Your account has no chips left — get free chips in your profile'); return; }
    let amount = max;
    const out = h('b', { class: 'num' }, fmt(amount));
    sheet('Add chips', (close) => h('div', { class: 'stack' },
      h('p', {}, `Add chips from your account between hands (up to ${fmt(v.cfg.maxBuyIn)} at the table).`),
      h('input', { type: 'range', min: 1, max, value: amount, oninput: (e) => { amount = Number(e.target.value); out.textContent = fmt(amount); } }), h('p', {}, 'Add ', out),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: async () => { const r = await conn.topUp(amount); if (!r.ok) toast(r.error, 'bad'); else { close(); refreshMe(); } } }, 'Add'), h('button', { class: 'btn ghost', onclick: close }, 'Cancel'))));
  }

  async function sitOutToggle(v) {
    const on = !(v.you.sittingOut || v.you.busted);
    if (!on && v.you.busted) return topUp(v);
    const r = await conn.sitOut(on);
    if (!r.ok) toast(r.error, 'bad');
  }

  async function leaveTable(v) {
    const tour = v.kind === 'tournament';
    const text = tour ? (v.tour.status === 'registering' ? 'Take your name off the list?' : 'In a tournament your chips stay in play: you will be sat out and your blinds posted until you come back or are knocked out.') : 'If you are in a hand it is folded. Your chips go back to your account.';
    if (!(await confirmSheet(tour && v.tour.status === 'registering' ? 'Unregister?' : 'Leave the table?', text, 'Yes', 'Stay'))) return;
    const r = tour && v.tour.status === 'registering' ? await conn.unregister() : await conn.leave();
    if (!r.ok) { toast(r.error, 'bad'); return; }
    sstore('artha-session-start', null);
    if (tour) { toast(r.note || 'Done'); return; }
    if (r.pending) toast('You will leave when this hand ends — your chips go back to your account.');
    else { toast(v.kind === 'practice' ? 'You left the practice table' : `You left the table with ${fmt(r.amount || 0)} chips — back in your account`, 'good'); setTimeout(() => { refreshMe(); location.hash = '#/lobby'; }, 400); }
  }

  async function register() {
    const me = await ensureSignedIn('Choose a name to register'); if (!me) return;
    const r = await conn.register();
    if (!r.ok) toast(r.error, 'bad'); else { toast('You are registered', 'good'); startSession(); }
  }

  function share(v) {
    const link = `${location.origin}${location.pathname}#/t/${v.code}`;
    sheet('Invite players', h('div', { class: 'stack' },
      h('p', {}, 'Send this link, or tell them the table code. They join from the Lobby with “Join by code”.'),
      h('div', { class: 'code', style: { fontFamily: 'var(--font-mono)', fontSize: '34px', letterSpacing: '0.16em', color: 'var(--gold-text)' } }, v.code),
      h('input', { type: 'text', readonly: true, value: link, onfocus: (e) => e.target.select() }),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: async () => { try { await navigator.clipboard.writeText(link); toast('Link copied', 'good'); } catch { toast('Select the link and copy it'); } } }, 'Copy link'),
        h('a', { class: 'btn ghost', href: `#/screen/${v.code}`, target: '_blank', rel: 'noopener' }, 'Open the Big Screen'))));
  }

  function editSettings(v) {
    sheet('Table settings', (close) => tableSettingsForm(v.cfg, { kind: v.kind, submitLabel: 'Save', onSubmit: async (cfg) => {
      const r = await conn.manage('config', { cfg });
      if (!r.ok) { toast(r.error, 'bad'); return; }
      toast(view?.pendingCfg ? 'Saved — the new settings apply from the next hand' : 'Saved', 'good'); close();
    } }), { wide: true, eyebrow: 'Applied between hands, never during one' });
  }

  async function openHand(r) {
    if (isLocal) { handSheet({ summary: r }); return; }
    handSheet({ id: r.id });
  }

  // ---------------- a gentle break reminder ----------------
  function startSession() { if (!sstore('artha-session-start')) sstore('artha-session-start', Date.now()); }
  function reminder() {
    const mins = session.me?.prefs?.reminderMinutes ?? prefs().reminderMinutes;
    if (!view?.you || !mins) return;
    startSession();
    const since = sstore('artha-session-start');
    const nextAt = sstore('artha-remind-at') || since + mins * 60000;
    if (Date.now() < nextAt) return;
    sstore('artha-remind-at', Date.now() + mins * 60000);
    const played = Math.round((Date.now() - since) / 60000);
    sheet('Time for a break?', (close) => h('div', { class: 'stack' },
      h('p', {}, `You have been at the table for ${played} minutes. Stretch, drink some water — the game will wait.`),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: close }, 'Keep playing'), h('button', { class: 'btn ghost', onclick: () => { close(); leaveTable(view); } }, 'Leave the table'))), { eyebrow: 'Session reminder' });
  }

  return () => { conn.stop(); felt.destroy(); offPrefs(); clearInterval(clock); };
}
