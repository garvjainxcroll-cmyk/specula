// Profile: sign in / create an account / play as a guest; your chips, statistics, tournament
// results and recent hands; sound, animation, card and table preferences; your bet buttons.
import { h, mount, fmt, toast, avatar, seg, ordinal, ago, chips, sheet } from '../ui.mjs';
import { auth, send, session, onSession, refreshMe, setMe, net } from '../net.mjs';
import { prefs, setPrefs, presets, setPresets } from '../prefs.mjs';
import { avatarPicker } from '../identity.mjs';
import { handSheet } from './hand.mjs';

export default async function profile(app, { band }) {
  const body = h('main', { class: 'wrap page' });
  mount(app, band('profile'), body);
  const draw = () => (session.me ? drawMe(session.me) : drawSignIn());

  function drawSignIn() {
    if (net.mode === 'single') { mount(body, h('h1', {}, 'Profile'), h('div', { class: 'notice' }, 'This copy of the site has no server, so there are no accounts. Practice works on this device.')); return; }
    const err = h('div', { class: 'err' });
    let av = { glyph: 'eagle', tone: 'gold' };
    const go = async (path, payload) => {
      err.textContent = '';
      const r = await send(path, payload);
      if (!r.ok) { err.textContent = r.error; return; }
      auth.set(r.token); setMe(r.me); toast(`Welcome, ${r.me.name}`, 'good');
    };
    const form = (title, fields, button, onsubmit, note) => h('form', { class: 'card stack', onsubmit: (e) => { e.preventDefault(); onsubmit(new FormData(e.target)); } },
      h('h3', { style: { marginTop: 0 } }, title), fields, h('button', { class: 'btn', type: 'submit' }, button), note ? h('p', { class: 'tiny muted' }, note) : null);
    const f = (name, label, type = 'text', extra = {}) => h('label', { class: 'field' }, h('span', {}, label), h('input', { name, type, ...extra }));
    mount(body,
      h('div', { class: 'eyebrow' }, 'Players'), h('h1', {}, 'Sign in or play as a guest'),
      h('p', { class: 'lead' }, 'Every player starts with 10,000 virtual chips. They have no money value.'),
      err,
      h('div', { class: 'grid g3' },
        form('Play as a guest', [f('name', 'Name', 'text', { maxlength: 20, autocomplete: 'nickname' }), h('div', {}, h('div', { class: 'muted small', style: { marginBottom: '6px' } }, 'Picture'), avatarPicker(av, (a) => { av = a; }))], 'Play as guest', (d) => go('auth/guest', { name: d.get('name'), avatar: av }), 'Add a password later to keep your chips and history on any device.'),
        form('Sign in', [f('name', 'Name', 'text', { autocomplete: 'username' }), f('password', 'Password', 'password', { autocomplete: 'current-password' })], 'Sign in', (d) => go('auth/login', { name: d.get('name'), password: d.get('password') })),
        form('Create an account', [f('name', 'Name (2–20 letters or numbers)', 'text', { maxlength: 20, autocomplete: 'username' }), f('password', 'Password (at least 6 characters)', 'password', { autocomplete: 'new-password', minlength: 6 })], 'Create account', (d) => go('auth/register', { name: d.get('name'), password: d.get('password'), avatar: av }), 'Passwords are stored only as a secure scrambled code (scrypt), never as text.')));
  }

  function drawMe(me) {
    const st = me.stats;
    const p = prefs();
    const winRate = st.hands ? Math.round((100 * st.won) / st.hands) : 0;
    const sdRate = st.showdowns ? Math.round((100 * st.wonShowdown) / st.showdowns) : 0;
    mount(body,
      h('div', { class: 'row' }, avatar(me.avatar, { size: 'lg' }), h('div', {}, h('div', { class: 'eyebrow' }, me.guest ? 'Guest account' : 'Account'), h('h1', { style: { margin: 0 } }, me.name)),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn ghost', onclick: () => changeAvatar(me) }, 'Change picture'),
        h('button', { class: 'btn ghost', onclick: async () => { await send('auth/logout'); auth.clear(); toast('Signed out'); } }, 'Sign out')),
      me.guest ? h('div', { class: 'notice', style: { margin: '16px 0' } }, h('b', {}, 'Keep this account: '), 'add a password and you can sign in on any device with your name. ', h('button', { class: 'linkish', onclick: claim }, 'Add a password')) : null,
      h('div', { class: 'kpis', style: { marginTop: '18px' } },
        kpi('Chips in your account', fmt(me.bankroll), me.inTransit ? `${fmt(me.inTransit)} on the way` : 'virtual chips'),
        kpi('Hands played', fmt(st.hands), `${fmt(st.practiceHands)} in practice`),
        kpi('Hands won', fmt(st.won), `${winRate}% · lost ${fmt(st.lost)}`),
        kpi('Showdowns won', `${fmt(st.wonShowdown)}/${fmt(st.showdowns)}`, `${sdRate}%`),
        kpi('Cash tables', h('span', { class: st.net > 0 ? 'up' : st.net < 0 ? 'down' : '' }, st.net > 0 ? `+${fmt(st.net)}` : fmt(st.net)), 'chips won or lost'),
        kpi('Biggest pot won', fmt(st.biggestPot), ''),
        kpi('Tournaments', fmt(st.tournaments), st.bestFinish ? `best ${ordinal(st.bestFinish)}` : '—'),
        kpi('Points', fmt(st.points), `${fmt(st.cashes)} prize finishes`)),
      h('div', { class: 'row', style: { marginTop: '12px' } },
        me.canReload ? h('button', { class: 'btn', onclick: async () => { const r = await send('me/reload'); if (r.ok) { setMe(r.me); toast(`Your account has ${fmt(r.me.bankroll)} chips again`, 'good'); } else toast(r.error, 'bad'); } }, `Free chips: top up to ${fmt(me.reloadTo)}`)
          : h('span', { class: 'muted small' }, `Free chips: if your account drops below ${fmt(me.reloadBelow)} (and you are not at a cash table) you can top it up to ${fmt(me.reloadTo)}${me.reloadAt > Date.now() ? ` again from ${new Date(me.reloadAt).toLocaleTimeString()}` : ''}.`)),
      Object.keys(me.at || {}).length ? h('div', { class: 'card tight', style: { marginTop: '16px' } }, h('h4', { style: { marginTop: 0 } }, 'Your tables'), h('div', { class: 'row' }, Object.entries(me.at).map(([, x]) => h('a', { class: 'btn sm', href: `#/t/${x.code}` }, x.name)))) : null,
      h('div', { class: 'grid g2', style: { marginTop: '24px' } },
        h('section', { class: 'card' }, h('h3', { style: { marginTop: 0 } }, 'Settings'),
          row('Sound', seg([[true, 'On'], [false, 'Off']], p.sound, (v) => setPrefs({ sound: v }))),
          row('Volume', h('input', { type: 'range', min: 0, max: 100, value: p.volume, style: { maxWidth: '220px' }, onchange: (e) => setPrefs({ volume: Number(e.target.value) }) })),
          row('Animations', seg([['normal', 'Normal'], ['fast', 'Fast'], ['off', 'Off']], p.animations, (v) => setPrefs({ animations: v }))),
          row('Cards', seg([['two', 'Two colours'], ['four', 'Four colours']], p.cardStyle, (v) => setPrefs({ cardStyle: v }))),
          row('Felt', seg([['green', 'Green'], ['charcoal', 'Charcoal']], p.felt, (v) => setPrefs({ felt: v }))),
          row('Table layout', seg([['expanded', 'Expanded'], ['compact', 'Compact']], p.layout, (v) => setPrefs({ layout: v }))),
          row('Losing hands', seg([[true, 'Muck them'], [false, 'Show them']], p.autoMuck, (v) => setPrefs({ autoMuck: v })), 'At showdown. Applies when you next sit down; at the table use the Table tab.'),
          row('Fold when you could check', seg([[true, 'Ask first'], [false, 'Just fold']], p.confirmFold, (v) => setPrefs({ confirmFold: v }))),
          row('Break reminder', seg([[30, '30 min'], [60, '60 min'], [90, '90 min'], [0, 'Off']], p.reminderMinutes, (v) => setPrefs({ reminderMinutes: v })))),
        h('section', { class: 'card' }, h('h3', { style: { marginTop: 0 } }, 'Your bet buttons'), presetEditor(),
          h('p', { class: 'small muted' }, 'These are shortcuts for choosing an amount in No-Limit; they are not different rules. Pot sizes count the amount you must call first, like a dealer would.'))),
      h('h2', {}, 'Tournament results'),
      me.tourResults.length ? h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Tournament', 'Place', 'Players', 'Prize', 'When'].map((x) => h('th', {}, x)))), me.tourResults.map((r) => h('tr', {}, h('td', {}, r.name), h('td', {}, ordinal(r.place)), h('td', { class: 'num' }, r.entrants), h('td', { class: 'num' }, r.prize ? `${fmt(r.prize)} ${r.prizeType === 'chips' ? 'chips' : 'points'}` : '—'), h('td', { class: 'muted' }, ago(r.at))))) : h('p', { class: 'muted' }, 'No tournaments yet.'),
      h('h2', {}, 'Your recent hands'),
      me.recent.length ? h('div', { class: 'scroll-x' }, h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Table', 'Result', 'Hand', 'When', ''].map((x) => h('th', {}, x)))),
        me.recent.map((r) => h('tr', { class: 'click', onclick: () => handSheet({ id: r.handId }) }, h('td', {}, r.roomName, r.kind === 'practice' ? h('span', { class: 'badge dim', style: { marginLeft: '6px' } }, 'Practice') : null), h('td', {}, chips(r.net, { signed: true })), h('td', { class: 'muted' }, r.hand || (r.won ? 'won without a showdown' : '')), h('td', { class: 'muted' }, ago(r.at)), h('td', { class: 'r' }, h('span', { class: 'linkish' }, 'Replay')))))) : h('p', { class: 'muted' }, 'Hands you play appear here, with a step-by-step replay.'),
      !me.guest ? h('p', { style: { marginTop: '24px' } }, h('button', { class: 'linkish', onclick: changePassword }, 'Change your password')) : null);
  }

  const kpi = (k, v, s) => h('div', { class: 'kpi' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v), h('div', { class: 's' }, s));
  const row = (label, control, note) => h('div', { style: { margin: '10px 0' } }, h('div', { class: 'muted small', style: { marginBottom: '4px' } }, label), control, note ? h('div', { class: 'tiny muted', style: { marginTop: '4px' } }, note) : null);

  function presetEditor() {
    const p = presets();
    const one = (key, title) => {
      const mode = h('select', { 'aria-label': `${title} type` }, [['pot', '% of the pot'], ['bb', 'big blinds']].map(([v, l]) => h('option', { value: v, selected: p[key].mode === v ? true : null }, l)));
      const val = h('input', { type: 'number', min: 1, step: 'any', value: p[key].value, 'aria-label': `${title} amount` });
      const save = () => setPresets({ ...presets(), [key]: { mode: mode.value, value: Number(val.value) } });
      mode.onchange = save; val.onchange = save;
      return h('div', { class: 'formgrid' }, h('label', { class: 'field' }, h('span', {}, title), mode), h('label', { class: 'field' }, h('span', {}, 'Amount'), val));
    };
    return h('div', {}, one('small', 'Small Bet'), one('big', 'Big Bet'), h('button', { class: 'btn sm ghost', style: { marginTop: '8px' }, onclick: () => { setPresets({ small: { mode: 'pot', value: 25 }, big: { mode: 'pot', value: 75 } }); draw(); } }, 'Back to 25% / 75%'));
  }

  function changeAvatar(me) {
    let av = me.avatar;
    sheet('Your picture', (close) => h('div', { class: 'stack' }, avatarPicker(av, (a) => { av = a; }), h('button', { class: 'btn', onclick: async () => { const r = await send('me/settings', { avatar: av }); if (r.ok) { setMe(r.me); close(); } else toast(r.error, 'bad'); } }, 'Save')));
  }
  function claim() {
    const pw = h('input', { type: 'password', minlength: 6, autocomplete: 'new-password' });
    sheet('Add a password', (close) => h('form', { class: 'stack', onsubmit: async (e) => { e.preventDefault(); const r = await send('auth/claim', { password: pw.value }); if (r.ok) { setMe(r.me); close(); toast('Saved — sign in with your name and this password on any device', 'good'); } else toast(r.error, 'bad'); } },
      h('p', {}, `Your name stays “${session.me.name}”.`), h('label', { class: 'field' }, h('span', {}, 'Password (at least 6 characters)'), pw), h('button', { class: 'btn', type: 'submit' }, 'Save')));
  }
  function changePassword() {
    const old = h('input', { type: 'password', autocomplete: 'current-password' }); const pw = h('input', { type: 'password', minlength: 6, autocomplete: 'new-password' });
    sheet('Change your password', (close) => h('form', { class: 'stack', onsubmit: async (e) => { e.preventDefault(); const r = await send('auth/password', { old: old.value, password: pw.value }); if (r.ok) { auth.set(r.token); close(); toast('Password changed; other devices are signed out', 'good'); } else toast(r.error, 'bad'); } },
      h('label', { class: 'field' }, h('span', {}, 'Current password'), old), h('label', { class: 'field' }, h('span', {}, 'New password'), pw), h('button', { class: 'btn', type: 'submit' }, 'Change')));
  }

  draw();
  refreshMe();
  return onSession(draw);
}
