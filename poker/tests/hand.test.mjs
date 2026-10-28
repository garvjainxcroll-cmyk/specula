// The hand state machine: blinds, turn order, legal actions, minimum raises, short all-ins,
// side pots, folded contributors, split pots and odd chips.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, legalActions, checkChips, autoAction, showCards, middlePots, positions } from '../src/engine/hand.mjs';
import { quickHand, stackOf, sumStacks } from './helpers.mjs';

const A = (h, seat, type, to) => { const n = act(h, seat, { type, to }); checkChips(n); return n; };
const evs = (h, t) => h.events.filter((e) => e.t === t);

test('three-handed: button, small blind, big blind; first to act is left of the big blind', () => {
  const h = quickHand({ stacks: { 0: 1000, 1: 1000, 2: 1000 }, button: 0 });
  assert.equal(h.sbSeat, 1); assert.equal(h.bbSeat, 2);
  assert.equal(stackOf(h, 1), 950); assert.equal(stackOf(h, 2), 900);
  assert.equal(h.toAct, 0);
  assert.equal(h.currentBet, 100);
  const l = legalActions(h, 0);
  assert.equal(l.canCheck, false); assert.equal(l.toCall, 100); assert.equal(l.minTo, 200); assert.equal(l.maxTo, 1000);
  assert.equal(legalActions(h, 1), null, 'not your turn');
  assert.throws(() => act(h, 1, { type: 'fold' }), /not your turn/i);
  assert.throws(() => act(h, 0, { type: 'check' }), /cannot check/i);
});

test('the big blind keeps the option: checks or raises when everyone just calls', () => {
  let h = quickHand({ stacks: { 0: 1000, 1: 1000, 2: 1000 }, button: 0 });
  h = A(h, 0, 'call'); h = A(h, 1, 'call');
  assert.equal(h.toAct, 2);
  const l = legalActions(h, 2);
  assert.equal(l.canCheck, true); assert.equal(l.canRaise, true); assert.equal(l.minTo, 200);
  const raised = A(h, 2, 'raise', 300);
  assert.equal(raised.street, 'preflop'); assert.equal(raised.toAct, 0);
  h = A(h, 2, 'check');
  assert.equal(h.street, 'flop'); assert.equal(h.board.length, 3);
  assert.equal(h.toAct, 1, 'after the flop the first player left of the button acts');
  assert.equal(h.currentBet, 0);
  assert.equal(legalActions(h, 1).minTo, 100, 'minimum opening bet is the big blind');
});

test('heads-up: the button is the small blind, acts first before the flop and last after it', () => {
  let h = quickHand({ stacks: { 3: 1000, 7: 1000 }, button: 7 });
  assert.equal(h.sbSeat, 7); assert.equal(h.bbSeat, 3);
  assert.equal(stackOf(h, 7), 950); assert.equal(stackOf(h, 3), 900);
  assert.equal(h.toAct, 7);
  h = A(h, 7, 'call');
  assert.equal(h.toAct, 3); assert.ok(legalActions(h, 3).canCheck);
  h = A(h, 3, 'check');
  assert.equal(h.street, 'flop'); assert.equal(h.toAct, 3, 'big blind acts first after the flop');
  h = A(h, 3, 'check'); assert.equal(h.toAct, 7);
  assert.deepEqual(positions([3, 7], 3), { button: 3, sb: 3, bb: 7 });
});

test('minimum raise: the last full raise sets the next minimum; bets beyond the stack are refused', () => {
  let h = quickHand({ stacks: { 0: 5000, 1: 5000, 2: 5000, 3: 5000 }, button: 0 });
  assert.equal(h.toAct, 3);
  assert.throws(() => act(h, 3, { type: 'raise', to: 150 }), /minimum is 200/);
  h = A(h, 3, 'raise', 400); // raise of 300
  let l = legalActions(h, 0);
  assert.equal(l.minTo, 700, 'must raise by at least 300 more');
  assert.throws(() => act(h, 0, { type: 'raise', to: 600 }), /minimum is 700/);
  assert.throws(() => act(h, 0, { type: 'raise', to: 5001 }), /only 5000/);
  assert.throws(() => act(h, 0, { type: 'raise', to: 750.5 }), /whole number/);
  h = A(h, 0, 'raise', 1000); // raise of 600
  l = legalActions(h, 1);
  assert.equal(l.minTo, 1600);
  assert.equal(l.toCall, 950);
});

test('a short all-in raise does not reopen the betting for players who already acted', () => {
  // blinds 50/100. Seat 3 raises to 300 (+200). Seat 0 all-in for 450 (+150, short). Seat 1, 2 fold.
  let h = quickHand({ stacks: { 0: 450, 1: 5000, 2: 5000, 3: 5000 }, button: 0 });
  h = A(h, 3, 'raise', 300);
  h = A(h, 0, 'allin');
  assert.equal(h.currentBet, 450); assert.equal(h.minRaise, 200, 'the short all-in does not change the minimum raise');
  // seat 1 (small blind) has not acted: may raise, to at least 650
  let l = legalActions(h, 1);
  assert.equal(l.canRaise, true); assert.equal(l.minTo, 650);
  h = A(h, 1, 'fold');
  l = legalActions(h, 2);
  assert.equal(l.canRaise, true, 'the big blind has not acted yet (posting is not acting)');
  h = A(h, 2, 'fold');
  l = legalActions(h, 3);
  assert.equal(l.canRaise, false, 'seat 3 already acted and faces only 150 more, less than a full raise');
  assert.equal(l.canCall, true); assert.equal(l.toCall, 150);
  assert.throws(() => act(h, 3, { type: 'raise', to: 900 }), /not open to you again/);
  assert.throws(() => act(h, 3, { type: 'allin' }), /./);
  h = A(h, 3, 'call');
  assert.equal(h.status, 'complete', 'all-in called: the board is dealt out');
  assert.equal(h.board.length, 5);
});

test('an all-in that is a full raise does reopen the betting', () => {
  let h = quickHand({ stacks: { 0: 500, 1: 5000, 2: 5000, 3: 5000 }, button: 0 });
  h = A(h, 3, 'raise', 300);
  h = A(h, 0, 'allin'); // to 500: +200, a full raise
  h = A(h, 1, 'fold'); h = A(h, 2, 'fold');
  const l = legalActions(h, 3);
  assert.equal(l.canRaise, false, 'no one left who could call a raise');
  // same with a player still behind who can act
  let g = quickHand({ stacks: { 0: 500, 1: 5000, 2: 5000, 3: 5000 }, button: 0 });
  g = A(g, 3, 'raise', 300); g = A(g, 0, 'allin'); g = A(g, 1, 'call');
  g = A(g, 2, 'fold');
  const m = legalActions(g, 3);
  assert.equal(m.canRaise, true); assert.equal(m.minTo, 700);
});

test('several short all-ins that add up to a full raise reopen the betting', () => {
  // postflop: seat 1 bets 100; seat 2 all-in 150 (+50); seat 3 all-in 220 (+70): seat 1 faces +120 ≥ 100
  let h = quickHand({ stacks: { 0: 5000, 1: 5000, 2: 250, 3: 320 }, button: 0 });
  h = A(h, 3, 'call'); h = A(h, 0, 'call'); h = A(h, 1, 'call'); h = A(h, 2, 'check');
  assert.equal(h.street, 'flop'); assert.equal(h.toAct, 1);
  h = A(h, 1, 'bet', 100);
  h = A(h, 2, 'allin'); assert.equal(h.currentBet, 150);
  h = A(h, 3, 'allin'); assert.equal(h.currentBet, 220);
  h = A(h, 0, 'call');
  const l = legalActions(h, 1);
  assert.equal(l.canRaise, true); assert.equal(l.minTo, 320);
});

test('a player can call all-in for less; uncalled chips go back to the bettor', () => {
  let h = quickHand({ stacks: { 0: 3000, 1: 300, 2: 3000 }, button: 0, holes: { 0: '2c 7d', 1: 'Ah Ad', 2: '3c 8d' }, board: 'Kc Qd 9h 5s 4c' });
  h = A(h, 0, 'raise', 1000);
  const l = legalActions(h, 1);
  assert.equal(l.toCall, 250); assert.equal(l.callIsAllIn, true); assert.equal(l.canRaise, false);
  h = A(h, 1, 'call');
  h = A(h, 2, 'fold');
  // seat 0's 1000 is called only by seat 1's 300 (and the folded big blind's 100)
  assert.equal(evs(h, 'return')[0].amount, 700);
  assert.equal(h.status, 'complete');
  assert.equal(stackOf(h, 1), 700, 'the short stack wins 300 + 300 + 100');
  assert.equal(stackOf(h, 0), 2700);
  assert.equal(sumStacks(h), 6300);
});

test('side pots: three all-ins of different sizes, the short stack has the best hand', () => {
  // seat 1: 200 (best hand), seat 2: 500 (second), seat 3: 1000 (worst); seat 0 folds after limping
  let h = quickHand({
    stacks: { 0: 2000, 1: 200, 2: 500, 3: 1000 }, button: 0,
    holes: { 0: '2c 3d', 1: 'Ah As', 2: 'Kh Ks', 3: 'Qh Qs' }, board: '9c 8d 4h 5s Jc',
  });
  h = A(h, 3, 'allin'); // 1000
  h = A(h, 0, 'fold');
  h = A(h, 1, 'allin'); // 200 (call for less)
  h = A(h, 2, 'allin'); // 500
  assert.equal(h.status, 'complete');
  const pots = evs(h, 'pot');
  assert.deepEqual(pots.map((p) => p.amount), [600, 600], 'main 3×200, side 2×300; seat 3’s extra 500 was returned');
  assert.deepEqual(pots[0].eligible, [1, 2, 3]); assert.deepEqual(pots[1].eligible, [2, 3]);
  assert.equal(evs(h, 'return')[0].amount, 500);
  assert.equal(stackOf(h, 1), 600); assert.equal(stackOf(h, 2), 600); assert.equal(stackOf(h, 3), 500); assert.equal(stackOf(h, 0), 2000);
  assert.equal(sumStacks(h), 3700);
  assert.ok(evs(h, 'reveal').length === 3, 'all-in hands are turned face up before the run-out');
});

test('folded players’ chips stay in the pot, but they cannot win it', () => {
  // seat 0 raises to 600 then folds to a re-raise; seat 1 (short, all-in) and seat 2 contest the pot
  let h = quickHand({
    stacks: { 0: 3000, 1: 400, 2: 3000 }, button: 0,
    holes: { 0: 'Ah Ad', 1: '7c 7d', 2: 'Kc Qd' }, board: '2c 5d 9h Js 3c',
  });
  h = A(h, 0, 'raise', 600);
  h = A(h, 1, 'allin'); // 400, call for less
  h = A(h, 2, 'raise', 1500);
  h = A(h, 0, 'fold');
  assert.equal(h.status, 'complete');
  const pots = evs(h, 'pot');
  // main: 400 × 3 = 1200 (seats 1, 2); side: seat 0's other 200 + seat 2's 200 = 400 (seat 2 only)
  assert.deepEqual(pots.map((p) => [p.amount, p.eligible]), [[1200, [1, 2]], [400, [2]]]);
  assert.equal(evs(h, 'return')[0].amount, 900);
  assert.equal(stackOf(h, 0), 2400, 'the folded raiser loses 600 and wins nothing even with aces');
  assert.equal(stackOf(h, 1), 1200, 'sevens win the main pot');
  assert.equal(stackOf(h, 2), 3000 - 600 + 400, 'the side pot (the raiser’s extra 200 and its match)');
  assert.equal(sumStacks(h), 6400);
});

test('split pot when the board plays, with the odd chip to the first winner left of the button', () => {
  // Royal flush on the board: everyone still in ties. Button 2 → small blind 0, big blind 1.
  let h = quickHand({
    stacks: { 0: 1000, 1: 1000, 2: 1000 }, button: 2, sb: 5, bb: 10, ante: 1,
    holes: { 0: '2c 3d', 1: '4c 5d', 2: '6c 7d' }, board: 'As Ks Qs Js Ts',
  });
  assert.equal(h.sbSeat, 0); assert.equal(h.bbSeat, 1); assert.equal(h.toAct, 2);
  h = A(h, 2, 'call'); h = A(h, 0, 'fold'); h = A(h, 1, 'check');
  for (let s = 0; s < 3; s++) { h = A(h, h.toAct, 'check'); h = A(h, h.toAct, 'check'); }
  assert.equal(h.status, 'complete');
  // pot: antes 3 + folded small blind 5 + 10 + 10 = 28 → 14 each; the folded player gets nothing
  assert.deepEqual(evs(h, 'award').map((a) => [a.seat, a.amount]), [[1, 14], [2, 14]]);
  assert.equal(h.result.pots[0].hand, 'Royal Flush');

  // An odd pot: 3 antes + 3 × 10 = 33 between two tied hands → 17 + 16
  let g = quickHand({
    stacks: { 0: 1000, 1: 1000, 2: 1000 }, button: 2, sb: 5, bb: 10, ante: 1,
    holes: { 0: 'Ah 3d', 1: 'Ac 5d', 2: '2h 2d' }, board: 'Kd Kh Qs Qc Jd',
  });
  g = A(g, 2, 'call'); g = A(g, 0, 'call'); g = A(g, 1, 'check');
  for (let s = 0; s < 3; s++) for (let k = 0; k < 3; k++) g = A(g, g.toAct, 'check');
  assert.equal(g.status, 'complete');
  // seats 0 and 1 tie with A-K-K-Q-Q; the odd chip goes to seat 0, the first winner left of the button (seat 2)
  assert.deepEqual(evs(g, 'award').map((a) => [a.seat, a.amount]), [[0, 17], [1, 16]]);
  assert.equal(sumStacks(g), 3000);
});

test('everyone folds: the last player wins without showing', () => {
  let h = quickHand({ stacks: { 0: 1000, 1: 1000, 2: 1000 }, button: 0 });
  h = A(h, 0, 'raise', 300); h = A(h, 1, 'fold'); h = A(h, 2, 'fold');
  assert.equal(h.status, 'complete');
  assert.equal(h.result.showdown, false);
  assert.equal(stackOf(h, 0), 1150);
  assert.equal(evs(h, 'show').length, 0);
  const shown = showCards(h, 0);
  assert.equal(evs(shown, 'show').length, 1, 'the winner may choose to show');
});

test('when the big blind folds to a small-blind complete, the small blind wins the blinds', () => {
  let h = quickHand({ stacks: { 0: 1000, 1: 1000 }, button: 0 });
  h = A(h, 0, 'raise', 300); h = A(h, 1, 'fold');
  assert.equal(stackOf(h, 0), 1100); assert.equal(stackOf(h, 1), 900);
});

test('a short all-in big blind still makes others call the full big blind', () => {
  let h = quickHand({ stacks: { 0: 1000, 1: 1000, 2: 40 }, button: 0 });
  assert.equal(stackOf(h, 2), 0); assert.ok(h.players.find((p) => p.seat === 2).allIn);
  assert.equal(h.currentBet, 100);
  assert.equal(legalActions(h, 0).toCall, 100);
});

test('blinds and antes that put a player all-in', () => {
  let h = quickHand({ stacks: { 0: 1000, 1: 30, 2: 1000 }, button: 0, sb: 50, bb: 100, ante: 10 });
  const p1 = h.players.find((p) => p.seat === 1);
  assert.equal(p1.committed, 30); assert.ok(p1.allIn);
  assert.equal(h.toAct, 0);
  h = A(h, 0, 'call'); h = A(h, 2, 'check');
  assert.equal(h.street, 'flop');
});

test('everybody all-in before the river: the rest of the board is dealt automatically', () => {
  let h = quickHand({ stacks: { 0: 1000, 1: 1000 }, button: 0, holes: { 0: 'Ah Kh', 1: 'Qc Qd' }, board: '2h 7h 9c 3s Jh' });
  h = A(h, 0, 'allin'); h = A(h, 1, 'call');
  assert.equal(h.status, 'complete');
  assert.deepEqual(evs(h, 'street').map((e) => e.street), ['flop', 'turn', 'river']);
  assert.equal(stackOf(h, 0), 2000, 'ace-high flush wins');
  assert.equal(h.result.pots[0].hand, 'Flush, Ace high');
});

test('one player all-in and one with chips: betting stops, no option to bet into nobody', () => {
  let h = quickHand({ stacks: { 0: 300, 1: 2000 }, button: 0 });
  h = A(h, 0, 'allin');
  const l = legalActions(h, 1);
  assert.equal(l.canRaise, false); assert.equal(l.toCall, 200);
  h = A(h, 1, 'call');
  assert.equal(h.status, 'complete');
});

test('timeouts check when free and fold otherwise', () => {
  let h = quickHand({ stacks: { 0: 1000, 1: 1000, 2: 1000 }, button: 0 });
  h = autoAction(h, 0);
  assert.equal(h.players.find((p) => p.seat === 0).folded, true);
  assert.equal(h.events.at(-1).auto, 'timeout');
  h = A(h, 1, 'call');
  h = autoAction(h, 2);
  assert.equal(h.street, 'flop', 'big blind timed out with a free check');
});

test('showdown: losing hands are mucked unless the player turns auto-muck off; winners always show', () => {
  let h = quickHand({ stacks: { 0: 1000, 1: 1000 }, button: 0, holes: { 0: 'Ah Ad', 1: '7c 2d' }, board: 'Kc 9d 4h 3s Jc' });
  h = A(h, 0, 'call'); h = A(h, 1, 'check');
  for (let i = 0; i < 6; i++) h = A(h, h.toAct, 'check');
  assert.deepEqual(evs(h, 'show').map((e) => e.seat), [0]);
  assert.deepEqual(evs(h, 'muck').map((e) => e.seat), [1]);
  let g = quickHand({ stacks: { 0: 1000, 1: 1000 }, button: 0, holes: { 0: 'Ah Ad', 1: '7c 2d' }, board: 'Kc 9d 4h 3s Jc', revealAll: true });
  g = A(g, 0, 'call'); g = A(g, 1, 'check');
  for (let i = 0; i < 6; i++) g = A(g, g.toAct, 'check');
  assert.equal(evs(g, 'show').length, 2);
});

test('middle pots show chips from finished rounds, side pots appear when a player is all-in', () => {
  let h = quickHand({ stacks: { 0: 3000, 1: 300, 2: 3000 }, button: 0 });
  h = A(h, 0, 'call'); h = A(h, 1, 'call'); h = A(h, 2, 'check');
  assert.deepEqual(middlePots(h).map((p) => p.amount), [300]);
  h = A(h, 1, 'allin'); // bets 200 more (all-in)
  h = A(h, 2, 'call'); h = A(h, 0, 'raise', 1000); h = A(h, 2, 'call');
  assert.equal(h.street, 'turn');
  assert.deepEqual(middlePots(h).map((p) => [p.amount, p.eligible]), [[900, [0, 1, 2]], [1600, [0, 2]]]);
});

test('acting twice, acting out of turn and acting after the hand are refused', () => {
  let h = quickHand({ stacks: { 0: 1000, 1: 1000, 2: 1000 }, button: 0 });
  const h2 = A(h, 0, 'fold');
  assert.throws(() => act(h2, 0, { type: 'call' }), /not your turn/i);
  const done = A(h2, 1, 'fold');
  assert.equal(done.status, 'complete', 'the big blind wins when the others fold');
  assert.throws(() => act(done, 2, { type: 'check' }), /hand is over/);
  assert.throws(() => act(h, 0, { type: 'dance' }), /Unknown action/);
});
