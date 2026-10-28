// How to Play (#/learn): No-Limit Texas Hold'em explained for first-timers, with worked
// examples taken from the rules the engine follows (the same numbers are in the tests).
import { h, mount } from '../ui.mjs';
import { cardEl } from '../cards.mjs';

const C = (s) => h('span', { class: 'cs' }, s.split(' ').map((c) => cardEl(c)));

export default async function learn(app, { band }) {
  const theme = document.documentElement.dataset.theme;
  const sec = (id, title, ...kids) => h('section', {}, h('h2', { id }, title), ...kids);
  const ex = (title, ...kids) => h('div', { class: 'example' }, h('div', { class: 'eyebrow' }, title), ...kids);
  const rank = (n, name, cards, desc, odds) => h('div', { class: 'r' }, h('span', { class: 'n' }, String(n).padStart(2, '0')), h('b', {}, name), C(cards), h('span', { class: 'd' }, desc, h('span', { class: 'muted' }, ` · ${odds}`)));
  mount(app, band('learn'), h('main', { class: 'narrow page learn' },
    h('div', { class: 'row between' }, h('div', { class: 'eyebrow' }, 'How to play'), h('button', { class: 'btn sm ghost', onclick: () => { const n = theme === 'light' ? 'dark' : 'light'; localStorage.setItem('artha-theme-learn', n); document.documentElement.dataset.theme = n; } }, 'Night / Parchment')),
    h('h1', {}, 'No-Limit Texas Hold’em'),
    h('p', { class: 'lead' }, 'Everyone gets two private cards. Five shared cards come out in the middle. The best five-card hand — or the last player who has not folded — wins the pot.'),
    h('nav', { class: 'toc' }, [['flow', 'A hand'], ['ranks', 'Hand rankings'], ['blinds', 'Button & blinds'], ['actions', 'Actions'], ['raise', 'Minimum raise'], ['allin', 'All-in & side pots'], ['sizing', 'Bet sizes'], ['showdown', 'Showdown'], ['tourney', 'Tournaments'], ['fair', 'Fair play'], ['words', 'Words']].map(([id, l]) => h('a', { href: `#/learn`, onclick: (e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); } }, l))),

    sec('flow', 'One hand, start to finish',
      h('ol', {},
        h('li', {}, h('b', {}, 'Blinds. '), 'The two players left of the dealer button post the small and big blind, so there is something to win.'),
        h('li', {}, h('b', {}, 'Pre-flop. '), 'Everyone is dealt two cards face down. Betting starts with the player left of the big blind.'),
        h('li', {}, h('b', {}, 'Flop. '), 'Three shared cards are turned up. Betting starts with the first player still in, left of the button.'),
        h('li', {}, h('b', {}, 'Turn. '), 'A fourth shared card, and another round of betting.'),
        h('li', {}, h('b', {}, 'River. '), 'The fifth and last shared card, and the last round of betting.'),
        h('li', {}, h('b', {}, 'Showdown. '), 'Players still in show their cards. Each makes the best five cards from their two plus the five on the board — any combination, even all five from the board.')),
      h('p', {}, 'If everyone else folds, the last player wins at once without showing. If all remaining players are all-in, the rest of the board is dealt straight away with no more betting.')),

    sec('ranks', 'The ten hand rankings',
      h('p', {}, 'Highest first. The odds are for any five cards dealt at random (counted over all 2,598,960 possible hands).'),
      h('div', { class: 'ranks' },
        rank(1, 'Royal Flush', 'As Ks Qs Js Ts', 'A, K, Q, J, 10 of one suit', '1 in 649,740'),
        rank(2, 'Straight Flush', '9h 8h 7h 6h 5h', 'five in a row, one suit', '1 in 72,193'),
        rank(3, 'Four of a Kind', 'Qc Qd Qh Qs 2c', 'four cards of one rank', '1 in 4,165'),
        rank(4, 'Full House', 'Jc Jd Jh 4s 4c', 'three of a kind and a pair', '1 in 694'),
        rank(5, 'Flush', 'Ad Jd 8d 6d 2d', 'five of one suit', '1 in 509'),
        rank(6, 'Straight', 'Tc 9d 8h 7s 6c', 'five in a row, any suits', '1 in 255'),
        rank(7, 'Three of a Kind', '7c 7d 7h Ks 2c', 'three cards of one rank', '1 in 47'),
        rank(8, 'Two Pair', 'Kc Kd 5h 5s 9c', 'two different pairs', '1 in 21'),
        rank(9, 'One Pair', 'Ac Ad 9h 6s 3c', 'two cards of one rank', '1 in 2.4'),
        rank(10, 'High Card', 'Ac Qd 9h 6s 3c', 'none of the above', '1 in 2')),
      ex('Kickers break ties', h('p', {}, 'Two players both have a pair of aces. The next-highest cards (the kickers) decide: A-A-K-7-3 beats A-A-Q-J-10. Only five cards ever count — a sixth or seventh card never breaks a tie. Suits never break a tie either: equal hands split the pot.')),
      ex('The wheel', h('p', {}, 'A-2-3-4-5 is a straight (the lowest one, “five high”). The ace can be high (10-J-Q-K-A) or low, but a straight cannot wrap round: Q-K-A-2-3 is not a straight.'))),

    sec('blinds', 'The button and the blinds',
      h('p', {}, 'The dealer button moves one seat clockwise after every hand. The player on its left posts the small blind; the next player posts the big blind (normally twice the small blind). Blinds are posted automatically before the cards are dealt.'),
      h('p', {}, h('b', {}, 'Heads-up (two players): '), 'the button posts the small blind and acts first before the flop; after the flop the big blind acts first.'),
      h('p', {}, 'A player who joins a table in the middle of a game waits until the big blind reaches them, unless the table’s host has chosen to deal new players in at once.')),

    sec('actions', 'What you can do',
      h('ul', {},
        h('li', {}, h('b', {}, 'Fold — '), 'give up your hand and any claim to the pot.'),
        h('li', {}, h('b', {}, 'Check — '), 'pass without betting. Only when there is nothing to call.'),
        h('li', {}, h('b', {}, 'Call — '), 'match the bet. If you have fewer chips, you call all-in for what you have.'),
        h('li', {}, h('b', {}, 'Bet — '), 'the first wager in a round. The smallest bet is the big blind.'),
        h('li', {}, h('b', {}, 'Raise — '), 'increase the bet. See the minimum raise below.'),
        h('li', {}, h('b', {}, 'All-in — '), 'put in every chip you have. No-limit means you may bet all your chips at any time, but never more than you have.')),
      h('p', {}, 'The buttons only offer what is legal right now, and the server checks every action again. You have a set time to act (shown as a gold ring around your picture); then a time bank; then you check if you can, or fold.')),

    sec('raise', 'The minimum raise',
      h('p', {}, 'A raise must add at least as much as the last full bet or raise in that round.'),
      ex('Worked example', h('p', {}, 'Blinds 50/100. The first player raises to 400 — a raise of 300. The next player who wants to re-raise must go to at least 400 + 300 = 700. If they raise to 1,000 (a raise of 600), the next minimum is 1,600.')),
      ex('A short all-in does not reopen the betting', h('p', {}, 'Blinds 50/100. Ann raises to 300. Bob goes all-in for 450 — only 150 more, less than a full raise of 200. Everyone after Bob may still raise, but when the action comes back to Ann she may only call the extra 150 or fold. If several short all-ins together add up to a full raise over what Ann last faced, she may raise again.'))),

    sec('allin', 'All-in and side pots',
      h('p', {}, 'You can only win from each player as much as you put in. When players with different stacks are all-in, the chips are split into a main pot and side pots.'),
      ex('Worked example', h('p', {}, 'Ana is all-in for 200, Bilal for 500, Chen for 1,000.'),
        h('ul', {},
          h('li', {}, h('b', {}, 'Main pot: '), '200 from each of the three = 600. Ana, Bilal and Chen can win it.'),
          h('li', {}, h('b', {}, 'Side pot: '), '300 more from Bilal and Chen = 600. Only Bilal and Chen can win it.'),
          h('li', {}, h('b', {}, 'Returned: '), 'Chen’s last 500 was not called by anyone, so it goes back to Chen.')),
        h('p', {}, 'If Ana has the best hand she wins 600 (not more); the side pot goes to the better of Bilal and Chen.')),
      h('p', {}, 'Chips from a player who folds stay in the pot, but a folded player can never win it.')),

    sec('sizing', 'Bet sizes and the bet buttons',
      h('p', {}, 'Small Bet, Big Bet, ½ Pot, ⅔ Pot, ¾ Pot, Pot, Min Raise and All-In are shortcuts that fill in an amount. You can also drag the slider or type any legal amount. Before you confirm, the panel shows the amount, what you put in, your stack after, and your total in the pot.'),
      ex('How a “pot” raise is worked out', h('p', {}, 'A pot-size raise counts the call first: you call, then raise by the size of the pot after your call.'),
        h('div', { class: 'calc' }, 'raise to = current bet + (pot + amount to call)'),
        h('p', {}, 'Blinds 50/100, you act first: pot 150, to call 100 → raise to 100 + (150 + 100) = 350. Facing a bet of 200 into a pot of 300 (so 500 in the middle): raise to 200 + (500 + 200) = 900.')),
      h('p', {}, 'Small Bet is 25% of the pot and Big Bet 75% unless you change them in your profile (as a percentage of the pot, or a number of big blinds).')),

    sec('showdown', 'Showdown, mucking and split pots',
      h('p', {}, 'The last player to bet or raise on the river shows first; if everyone checked, the first player left of the button. Winning hands are always shown. A losing hand may be mucked (thrown away face down) — that is the default, which you can turn off. Some tables show every hand at showdown.'),
      h('p', {}, 'Tied hands split the pot. If the chips do not divide evenly, the odd chip goes to the first tied winner to the left of the button.'),
      h('p', {}, 'In the hand history you see your own cards and any cards that were shown — never a folded hand, unless the table is set up for teaching (practice tables are).')),

    sec('tourney', 'Tournaments',
      h('p', {}, 'Everyone starts with the same number of tournament chips. The blinds go up on a clock (the blind schedule). When you lose all your chips you are out; your finishing place is the number of players left when you went out. Tables are kept even by moving players, and merge into a final table.'),
      h('p', {}, 'Prizes are points or virtual chips only — never money. Late registration lets players join during the first levels.')),

    sec('fair', 'Fair play',
      h('ul', {},
        h('li', {}, 'Cards are shuffled on the server with a cryptographically secure random generator. Every card is used once.'),
        h('li', {}, 'Your cards are sent only to you. Nobody — not other players, not the Big Screen, not the Event Head — sees them unless you show them.'),
        h('li', {}, 'The server decides everything: whose turn it is, what is legal, and who wins. A double click or a delayed click from an old screen is refused.'),
        h('li', {}, 'Chips are virtual and are counted to the chip: the Event Head’s chip audit checks that every chip is in an account, on its way, or on a table.'))),

    sec('words', 'Words you will hear',
      h('table', { class: 'tbl' }, [
        ['Button', 'The dealer position; it moves clockwise each hand.'], ['Blinds', 'Forced bets that start the pot.'], ['Ante', 'A small forced bet from every player (some tournaments).'],
        ['Board', 'The shared cards in the middle.'], ['Kicker', 'A card that breaks a tie between equal hands.'], ['Muck', 'To throw your hand away without showing it.'],
        ['Side pot', 'A pot only some players can win, because others were all-in for less.'], ['Heads-up', 'Two players.'], ['Stack', 'The chips in front of you.'], ['Time bank', 'Extra seconds you can use once your normal time runs out.'],
      ].map(([a, b]) => h('tr', {}, h('td', {}, h('b', {}, a)), h('td', {}, b))))),
    h('div', { class: 'notice', style: { marginTop: '28px' } }, 'Artha Vyūha uses virtual chips only. If a game stops being fun, take a break — the reminder in your profile can tell you when an hour has gone by.'),
    h('div', { class: 'row', style: { marginTop: '20px' } }, h('a', { class: 'btn', href: '#/practice' }, 'Practise now'), h('a', { class: 'btn ghost', href: '#/lobby' }, 'To the lobby'))));
  return null;
}
