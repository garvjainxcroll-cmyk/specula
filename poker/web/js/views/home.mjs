// Home: the crest, the name, and the ways to play.
import { h, mount, icon } from '../ui.mjs';
import { net } from '../net.mjs';

export default async function home(app, { band }) {
  const mode = (glyph, title, text, href, cta) => h('a', { class: 'card mode', href }, h('div', { class: 'glyph' }, icon(glyph)), h('div', { class: 'eyebrow' }, cta), h('h3', {}, title), h('p', { class: 'muted', style: { margin: 0 } }, text));
  mount(app, band(''),
    h('section', { class: 'hero' }, h('div', { class: 'art' }), h('div', { class: 'inner' },
      h('div', { class: 'eyebrow' }, 'JACO CORP · No-Limit Texas Hold’em'),
      h('h1', {}, 'Artha Vyūha'),
      h('p', { class: 'lead' }, 'Two cards. Five on the board. One pot. Read the table, size your bet, back your judgement.'),
      h('div', { class: 'row', style: { marginTop: '24px' } },
        h('a', { class: 'btn lg', href: '#/lobby?quick=1' }, 'Quick Play'),
        h('a', { class: 'btn lg ghost', href: '#/practice' }, 'Practice against bots'),
        h('a', { class: 'btn lg ghost', href: '#/learn' }, 'How to play')))),
    h('main', { class: 'wrap page' },
      h('div', { class: 'grid g3' },
        mode('bolt', 'Quick Play', 'Straight to an open table at the stakes you choose. Real players only.', '#/lobby?quick=1', 'Play now'),
        mode('lock', 'Private Table', 'Make a room for friends and share its code or link. You set the blinds, stacks and timer.', '#/lobby?create=1', 'Invite friends'),
        mode('trophy', 'Tournaments', 'Everyone starts with the same stack; the blinds rise on a clock until one player has every chip.', '#/lobby#tournaments', 'Register'),
        mode('users', 'Cash-Style Tables', 'Sit with the virtual chips you choose, leave whenever you like between hands.', '#/lobby', 'Lobby'),
        mode('target', 'Practice', 'Easy, medium or hard computer opponents — clearly marked as bots. Free practice chips.', '#/practice', 'Practise'),
        mode('duel', 'Heads-Up', 'One against one, with the proper heads-up blinds: the button posts the small blind.', '#/lobby?quick=1&seats=2', 'Play heads-up')),
      h('div', { class: 'notice', style: { marginTop: '28px' } },
        h('b', {}, 'Virtual chips only. '), 'Artha Vyūha has no real money: no deposits, no withdrawals, no wagering and no prizes of cash value. Tournament prizes are points or virtual chips. Play for the game.'),
      h('div', { class: 'row', style: { marginTop: '28px' } },
        h('span', { class: 'muted small' }, 'For the organisers:'),
        h('a', { href: '#/host' }, 'Event Head desk'), h('span', { class: 'muted' }, '·'),
        h('span', { class: 'muted small' }, 'Big Screen: open a table, then “Invite” → “Open the Big Screen”'),
        net.mode === 'single' ? h('span', { class: 'badge alert' }, 'Single device') : null)));
  return null;
}
