// The hand evaluator: all 2,598,960 five-card hands, known edge cases, and a cross-check of
// 7-card hands against an independent brute-force evaluator.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, CAT, CAT_NAME } from '../src/engine/evaluator.mjs';
import { parseCards, rankOf, suitOf, cardsStr } from '../src/engine/cards.mjs';
import { seeded } from '../src/engine/rng.mjs';

const E = (s) => evaluate(parseCards(s));

test('every five-card hand: the ten categories occur exactly as often as they should', () => {
  const counts = new Array(10).fill(0);
  const c = [0, 0, 0, 0, 0];
  for (c[0] = 0; c[0] < 48; c[0]++) for (c[1] = c[0] + 1; c[1] < 49; c[1]++) for (c[2] = c[1] + 1; c[2] < 50; c[2]++)
    for (c[3] = c[2] + 1; c[3] < 51; c[3]++) for (c[4] = c[3] + 1; c[4] < 52; c[4]++) counts[evaluate(c).cat]++;
  assert.deepEqual(counts, [1302540, 1098240, 123552, 54912, 10200, 5108, 3744, 624, 36, 4]);
});

test('names of all ten rankings, highest to lowest', () => {
  assert.deepEqual([...CAT_NAME].reverse(), ['Royal Flush', 'Straight Flush', 'Four of a Kind', 'Full House', 'Flush', 'Straight', 'Three of a Kind', 'Two Pair', 'One Pair', 'High Card']);
  const ladder = ['As Ks Qs Js Ts', '9h 8h 7h 6h 5h', 'Qc Qd Qh Qs 2c', 'Jc Jd Jh 4s 4c', 'Ad Jd 8d 6d 2d', 'Tc 9d 8h 7s 6c', '7c 7d 7h Ks 2c', 'Kc Kd 5h 5s 9c', 'Ac Ad 9h 6s 3c', 'Ac Qd 9h 6s 3c'];
  for (let i = 1; i < ladder.length; i++) assert.ok(E(ladder[i - 1]).score > E(ladder[i]).score, `${ladder[i - 1]} beats ${ladder[i]}`);
  assert.equal(E(ladder[0]).name, 'Royal Flush');
});

test('wheel straights: A-2-3-4-5 is the lowest straight; a steel wheel is a straight flush', () => {
  const wheel = E('Ah 2c 3d 4s 5h');
  assert.equal(wheel.cat, CAT.STRAIGHT);
  assert.equal(wheel.desc, 'Straight, Five high');
  assert.ok(E('2c 3d 4s 5h 6c').score > wheel.score, 'six-high straight beats the wheel');
  assert.ok(wheel.score > E('Ah Ac Kd Qs Jh').score, 'the wheel beats any three of a kind or less');
  const steel = E('Ad 2d 3d 4d 5d');
  assert.equal(steel.cat, CAT.STRAIGHT_FLUSH);
  assert.ok(E('2d 3d 4d 5d 6d').score > steel.score);
  // A-K-Q-J-T plus a wheel card: the best is broadway, not the wheel
  assert.equal(E('Ah Kc Qd Js Th 2c 3d').ranks[0], 12);
  // no wrap-around: Q-K-A-2-3 is not a straight
  assert.equal(E('Qh Kc Ad 2s 3h').cat, CAT.HIGH);
});

test('kickers decide, and only five cards count', () => {
  assert.ok(E('Ah Ad Kc 7s 3h').score > E('As Ac Qd Js Th').score, 'pair of aces, king kicker beats queen kicker');
  assert.equal(E('Ah Ad Kc 7s 5h 2c 3d').score, E('As Ac Kd 7c 5s 2h 4c').score, 'sixth and seventh cards never count');
  assert.ok(E('Kh Kd 9c 9s Ah').score > E('Kc Ks 9h 9d Qh').score, 'two pair, ace kicker');
  assert.equal(E('Kh Kd 9c 9s Ah').desc, 'Two Pair, Kings and Nines');
  // three pairs: the best two count, the third pair's rank can be the kicker
  const three = E('Ah Ad Kc Ks 5h 5d 4c');
  assert.equal(three.cat, CAT.TWO_PAIR);
  assert.deepEqual(three.ranks, [12, 11, 3]);
  assert.ok(E('Ah Ad Kc Ks Qh 5d 5c').score > three.score, 'queen kicker beats the five pair as kicker');
  // two sets: full house with the lower set as the pair
  const fh = E('9h 9d 9c 4s 4h 4d Kc');
  assert.equal(fh.desc, 'Full House, Nines full of Fours');
  // quads take the best kicker from anywhere
  assert.deepEqual(E('7h 7d 7c 7s 2h Kd Ac').ranks, [5, 12]);
  // flush uses its top five cards of the suit
  assert.deepEqual(E('Ah 9h 7h 5h 3h 2h Kd').ranks, [12, 7, 5, 3, 1]);
});

test('ties are exact: suits never break a tie', () => {
  assert.equal(E('Ah Kh Qh Jh 9h').score, E('As Ks Qs Js 9s').score);
  assert.equal(E('Tc 9d 8h 7s 6c').score, E('Th 9s 8c 7d 6h').score);
});

test('best five cards are reported correctly', () => {
  const r = E('Ah Kh 2h 7h 9h Kd Ks');
  assert.equal(r.cat, CAT.FLUSH);
  assert.equal(r.best.length, 5);
  assert.ok(r.best.every((c) => suitOf(c) === 2));
  const s = E('5c 6d 7h 8s 9c 9d 2h');
  assert.deepEqual(s.best.map(rankOf).sort((a, b) => b - a), [7, 6, 5, 4, 3]);
  const fh = E('Qc Qd Qh 3s 3c 3d 2h');
  assert.equal(fh.best.filter((c) => rankOf(c) === 10).length, 3);
  assert.equal(fh.best.filter((c) => rankOf(c) === 1).length, 2);
});

// ---- an independent brute-force evaluator (5 cards, then best of 21) ----
function ref5(cards) {
  const rs = cards.map(rankOf).sort((a, b) => b - a);
  const flush = cards.every((c) => suitOf(c) === suitOf(cards[0]));
  const uniq = [...new Set(rs)];
  let straightHi = -1;
  if (uniq.length === 5) {
    if (rs[0] - rs[4] === 4) straightHi = rs[0];
    else if (rs.join() === [12, 3, 2, 1, 0].join()) straightHi = 3;
  }
  const groups = uniq.map((r) => [rs.filter((x) => x === r).length, r]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const shape = groups.map((g) => g[0]).join('');
  const order = groups.map((g) => g[1]);
  if (straightHi >= 0 && flush) return [straightHi === 12 ? 9 : 8, straightHi];
  if (shape === '41') return [7, ...order];
  if (shape === '32') return [6, ...order];
  if (flush) return [5, ...rs];
  if (straightHi >= 0) return [4, straightHi];
  if (shape === '311') return [3, ...order];
  if (shape === '221') return [2, ...order];
  if (shape === '2111') return [1, ...order];
  return [0, ...rs];
}
const cmpTuple = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] ?? -1) - (b[i] ?? -1); if (d) return d; } return 0; };
function ref7(cards) {
  let best = null;
  for (let a = 0; a < cards.length; a++) for (let b = a + 1; b < cards.length; b++) {
    const five = cards.filter((_, i) => i !== a && i !== b);
    const t = ref5(five);
    if (!best || cmpTuple(t, best) > 0) best = t;
  }
  return best;
}
function deal(rng, n) {
  const d = Array.from({ length: 52 }, (_, i) => i);
  for (let i = 0; i < n; i++) { const j = i + rng.int(52 - i); [d[i], d[j]] = [d[j], d[i]]; }
  return d.slice(0, n);
}

test('20,000 random 7-card hands agree with the brute-force evaluator (category, ranks and order)', () => {
  const rng = seeded('eval-7');
  let prev = null;
  for (let k = 0; k < 20000; k++) {
    const cards = deal(rng, 7);
    const e = evaluate(cards);
    const r = ref7(cards);
    assert.equal(e.cat, r[0], `category of ${cardsStr(cards)}`);
    assert.deepEqual(e.ranks, r.slice(1), `ranks of ${cardsStr(cards)}`);
    assert.equal(ref5(e.best)[0], e.cat, `the best five of ${cardsStr(cards)} make the hand`);
    if (prev) assert.equal(Math.sign(e.score - prev.e.score), Math.sign(cmpTuple(r, prev.r)), `ordering ${cardsStr(cards)} vs ${cardsStr(prev.cards)}`);
    prev = { e, r, cards };
  }
});

test('six-card hands work too', () => {
  const rng = seeded('eval-6');
  for (let k = 0; k < 3000; k++) {
    const cards = deal(rng, 6);
    const e = evaluate(cards);
    assert.deepEqual([e.cat, ...e.ranks], best6(cards), cardsStr(cards));
  }
  function best6(cards) {
    let best = null;
    for (let a = 0; a < 6; a++) { const t = ref5(cards.filter((_, i) => i !== a)); if (!best || cmpTuple(t, best) > 0) best = t; }
    return best;
  }
});
