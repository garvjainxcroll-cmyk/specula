// The Lobby: Quick Play, join by code, private tables, cash tables, tournaments, your tables.
import { h, mount, fmt, sheet, toast, seg, store } from '../ui.mjs';
import { get, send, session, onSession, net } from '../net.mjs';
import { ensureSignedIn } from '../identity.mjs';
import { tableSettingsForm, tournamentForm, stakesLabel } from './forms.mjs';

export default async function lobby(app, { band, query }) {
  const body = h('main', { class: 'wrap page' });
  mount(app, band('lobby'), body);
  let data = null;
  let stakes = store('artha-qp-stakes') || '10-20';
  let seats = Number(query.get('seats')) || store('artha-qp-seats') || 6;

  async function load() {
    try { data = await get('lobby'); } catch { data = null; }
    draw();
  }

  async function quick() {
    const me = await ensureSignedIn('Choose a name for Quick Play');
    if (!me) return;
    store('artha-qp-stakes', stakes); store('artha-qp-seats', seats);
    const r = await send('quickplay', { stakes, seats });
    if (!r.ok) { toast(r.error, 'bad'); return; }
    location.hash = `#/t/${r.code}`;
  }

  function joinByCode() {
    const input = h('input', { type: 'text', maxlength: 8, placeholder: 'e.g. KX7M2Q', style: { textTransform: 'uppercase', fontFamily: 'var(--font-mono)', letterSpacing: '0.14em' } });
    sheet('Join by code', (close) => h('form', { class: 'stack', onsubmit: (e) => { e.preventDefault(); const c = input.value.trim().toUpperCase(); if (c) { close(); location.hash = `#/t/${c}`; } } },
      h('p', {}, 'Type the table code your host gave you.'), input, h('button', { class: 'btn', type: 'submit' }, 'Open the table')));
  }

  async function createPrivate() {
    const me = await ensureSignedIn('Choose a name to host a table');
    if (!me) return;
    let kind = 'cash';
    const holder = h('div', {});
    const drawForm = (close) => mount(holder, kind === 'cash'
      ? tableSettingsForm({}, { kind: 'cash', name: true, defaultName: `${me.name}’s table`, submitLabel: 'Create the table', onSubmit: async (cfg, extra) => {
        const r = await send('rooms/create', { kind: 'cash', name: extra.name, cfg });
        if (!r.ok) return toast(r.error, 'bad');
        close(); location.hash = `#/t/${r.code}`;
      } })
      : h('div', { class: 'stack' }, h('label', { class: 'field' }, h('span', {}, 'Tournament name'), h('input', { type: 'text', id: 'tn', maxlength: 40, value: `${me.name}’s tournament` })),
        h('label', { class: 'field' }, h('span', {}, 'Seats per table'), h('select', { id: 'ts' }, [[6, '6'], [9, '9'], [2, '2 (heads-up)']].map(([v, l]) => h('option', { value: v }, l)))),
        tournamentForm({}, { submitLabel: 'Create the tournament', onSubmit: async (tour) => {
          const r = await send('rooms/create', { kind: 'tournament', name: document.getElementById('tn').value, cfg: { seats: Number(document.getElementById('ts').value), actionSeconds: 25 }, tour });
          if (!r.ok) return toast(r.error, 'bad');
          close(); location.hash = `#/t/${r.code}`;
        } })));
    sheet('Host a private game', (close) => {
      const wrap = h('div', { class: 'stack' }, seg([['cash', 'Cash-style table'], ['tournament', 'Tournament']], kind, (k) => { kind = k; drawForm(close); }), holder,
        h('p', { class: 'tiny muted' }, 'Private games are not listed in the lobby: share the code or link. You can change the settings between hands, never during one.'));
      drawForm(close);
      return wrap;
    }, { wide: true });
  }

  async function register(r) {
    const me = await ensureSignedIn('Choose a name to register');
    if (!me) return;
    const res = await send('room/register', { id: r.id });
    if (!res.ok) { toast(res.error, 'bad'); return; }
    toast('Registered — opening the tournament', 'good');
    location.hash = `#/t/${r.code}`;
  }

  function draw() {
    if (net.mode === 'single') {
      mount(body, h('h1', {}, 'Lobby'), h('div', { class: 'notice' }, 'This copy of Artha Vyūha has no live server, so there are no shared tables. ', h('a', { href: '#/practice' }, 'Practice against bots'), ' works on this device.'));
      return;
    }
    const rooms = data?.rooms || [];
    const cash = rooms.filter((r) => r.kind === 'cash');
    const tours = rooms.filter((r) => r.kind === 'tournament');
    const stakesList = data?.stakes || [{ id: '5-10', label: '5 / 10' }, { id: '10-20', label: '10 / 20' }, { id: '25-50', label: '25 / 50' }, { id: '50-100', label: '50 / 100' }];
    const f = data?.formats || {};
    const mine = data?.mine || [];
    mount(body,
      h('div', { class: 'row between' }, h('div', {}, h('div', { class: 'eyebrow' }, 'Player Desk'), h('h1', {}, 'Lobby')), h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: joinByCode }, 'Join by code'), f.private !== false ? h('button', { class: 'btn ghost', onclick: createPrivate }, 'Host a private game') : null)),
      session.me ? null : h('p', { class: 'muted' }, 'You can watch any table. To sit down you need a name — play as a guest or sign in.'),
      mine.length ? h('div', { class: 'card tight', style: { marginBottom: '16px' } }, h('h4', { style: { marginTop: 0 } }, 'Your tables'), h('div', { class: 'row' }, mine.map((r) => h('a', { class: 'btn sm', href: `#/t/${r.code || ''}` }, r.name)))) : null,
      f.quickPlay !== false ? h('section', { class: 'card' },
        h('div', { class: 'eyebrow' }, 'Quick Play'), h('h3', { style: { marginTop: '4px' } }, 'An open table, right now'),
        h('div', { class: 'row', style: { margin: '12px 0' } },
          h('span', { class: 'muted small' }, 'Blinds'), seg(stakesList.map((s) => [s.id, s.label]), stakes, (v) => { stakes = v; }),
          h('span', { class: 'muted small' }, 'Seats'), seg([[2, 'Heads-up'], [6, '6'], [9, '9']].filter(([v]) => v !== 2 || f.headsUp !== false), seats, (v) => { seats = v; })),
        h('button', { class: 'btn lg', onclick: quick }, 'Play now'),
        h('p', { class: 'tiny muted', style: { marginTop: '8px' } }, 'You choose how many chips to bring when you sit. Quick Play tables have real players only.')) : null,
      h('h2', { id: 'tournaments' }, 'Tournaments'),
      tours.length ? h('div', { class: 'scroll-x' }, h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Name', 'Status', 'Players', 'Starting stack', 'Blinds now', ''].map((x) => h('th', {}, x)))),
        tours.map((r) => h('tr', {},
          h('td', {}, r.name, r.private ? h('span', { class: 'badge dim', style: { marginLeft: '6px' } }, 'Private') : null),
          h('td', {}, { registering: 'Registering', running: 'Running', paused: 'Paused', finished: 'Finished' }[r.tour.status]),
          h('td', { class: 'num' }, r.tour.entrants), h('td', { class: 'num' }, fmt(r.tour.startingStack)), h('td', { class: 'num' }, `${fmt(r.tour.blinds.sb)}/${fmt(r.tour.blinds.bb)}`),
          h('td', { class: 'r' }, h('div', { class: 'row tight', style: { justifyContent: 'flex-end' } },
            r.tour.lateRegOpen && r.tour.status !== 'finished' ? h('button', { class: 'btn sm', onclick: () => register(r) }, r.tour.status === 'registering' ? 'Register' : 'Register late') : null,
            h('a', { class: 'btn sm ghost', href: `#/t/${r.code}` }, r.tour.status === 'running' ? 'Watch' : 'Open'))))))) : h('p', { class: 'muted' }, 'No tournaments are open. The Event Head can start one, or host your own private tournament.'),
      h('h2', {}, 'Cash-style tables'),
      cash.length ? h('div', { class: 'scroll-x' }, h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Table', 'Blinds', 'Seats', 'Buy-in', 'Timer', ''].map((x) => h('th', {}, x)))),
        cash.map((r) => h('tr', { class: 'click', onclick: () => { location.hash = `#/t/${r.code}`; } },
          h('td', {}, r.name), h('td', { class: 'num' }, stakesLabel(r)), h('td', { class: 'num' }, `${r.seated}/${r.seats}`), h('td', { class: 'num' }, `${fmt(r.minBuyIn)}–${fmt(r.maxBuyIn)}`), h('td', { class: 'num' }, `${r.actionSeconds}s`),
          h('td', { class: 'r' }, h('a', { class: 'btn sm ghost', href: `#/t/${r.code}` }, r.seated < r.seats ? 'Open' : 'Watch')))))) : h('p', { class: 'muted' }, 'No public tables yet — Quick Play makes one.'),
      h('p', { class: 'tiny muted', style: { marginTop: '24px' } }, 'Virtual chips only. Nothing here can be exchanged for money.'));
  }

  draw();
  await load();
  const t = setInterval(load, 5000);
  const off = onSession(draw);
  if (query.get('quick')) quick();
  if (query.get('create')) createPrivate();
  return () => { clearInterval(t); off(); };
}
