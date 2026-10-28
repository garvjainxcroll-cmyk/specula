// Practice: a table against computer opponents (always shown as bots). On the live site it
// runs on the server like any table; on a copy without a server it runs on this device.
import { h, mount, toast, seg } from '../ui.mjs';
import { send, net, session } from '../net.mjs';
import { ensureSignedIn } from '../identity.mjs';
import { newLocalPractice, hasLocal, clearLocal } from '../local.mjs';

export default async function practice(app, { band }) {
  let seats = 6; let bots = 5; let level = 'medium'; let stakes = [10, 20]; let timer = 30;
  const body = h('main', { class: 'narrow page' });
  mount(app, band('practice'), body);
  const draw = () => mount(body,
    h('div', { class: 'eyebrow' }, 'Practice mode'), h('h1', {}, 'Practice against bots'),
    h('p', { class: 'lead' }, 'Learn the game without pressure. Practice chips are free and separate from your account; the bots are clearly marked and play by the same rules.'),
    h('div', { class: 'card stack' },
      h('div', {}, h('h4', { style: { marginTop: 0 } }, 'Table size'), seg([[2, 'Heads-up'], [6, '6 seats'], [9, '9 seats']], seats, (v) => { seats = v; bots = v - 1; draw(); })),
      h('div', {}, h('h4', {}, 'How many bots'), h('div', { class: 'row' }, h('input', { type: 'range', min: 1, max: seats - 1, value: bots, style: { maxWidth: '260px' }, oninput: (e) => { bots = Number(e.target.value); e.target.nextSibling.textContent = `${bots} bot${bots > 1 ? 's' : ''}`; } }), h('span', {}, `${bots} bot${bots > 1 ? 's' : ''}`))),
      h('div', {}, h('h4', {}, 'Difficulty'), seg([['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']], level, (v) => { level = v; }),
        h('p', { class: 'small muted', style: { marginTop: '6px' } }, 'Easy bots call a lot. Medium bots weigh their chances against the price of a call. Hard bots size their bets, use position and sometimes bluff.')),
      h('div', {}, h('h4', {}, 'Blinds'), seg([[5, '5/10'], [10, '10/20'], [25, '25/50'], [50, '50/100']], stakes[0], (v) => { stakes = [v, v * 2]; })),
      h('div', {}, h('h4', {}, 'Time to act'), seg([[15, '15 s'], [30, '30 s'], [60, '60 s'], [180, 'Relaxed']], timer, (v) => { timer = v; })),
      h('div', { class: 'row' }, h('button', { class: 'btn lg', onclick: start }, 'Deal me in'),
        net.mode === 'single' && hasLocal() ? h('a', { class: 'btn ghost', href: '#/t/local' }, 'Back to my practice table') : null)),
    net.mode === 'single' ? h('p', { class: 'muted small', style: { marginTop: '12px' } }, 'This copy of the site has no server: practice runs on this device only.') : null);
  async function start() {
    const [sb, bb] = stakes;
    if (net.mode !== 'live') {
      clearLocal();
      newLocalPractice({ name: session.me?.name || 'You', avatar: session.me?.avatar, seats, bots, level, sb, bb, stack: 100 * bb, actionSeconds: timer });
      location.hash = '#/t/local';
      return;
    }
    const me = await ensureSignedIn('Choose a name for practice');
    if (!me) return;
    const r = await send('rooms/create', { kind: 'practice', name: `${me.name}’s practice`, cfg: { seats, sb, bb, minBuyIn: 20 * bb, maxBuyIn: 100 * bb, actionSeconds: timer, timeBankSeconds: 30, botLevel: level }, bots: { count: bots, level } });
    if (!r.ok) { toast(r.error, 'bad'); return; }
    location.hash = `#/t/${r.code}`;
  }
  draw();
  return null;
}
