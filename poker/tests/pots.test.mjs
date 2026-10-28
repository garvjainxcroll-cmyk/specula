// Pot building and awarding, directly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPots, awardPots } from '../src/engine/pots.mjs';

test('no all-ins: one pot for everyone still in', () => {
  const pots = buildPots([{ seat: 0, committed: 100 }, { seat: 1, committed: 100, folded: true }, { seat: 2, committed: 100 }]);
  assert.deepEqual(pots, [{ amount: 300, eligible: [0, 2] }]);
});

test('three side pots from four different stacks', () => {
  const pots = buildPots([
    { seat: 0, committed: 50, allIn: true }, { seat: 1, committed: 150, allIn: true },
    { seat: 2, committed: 400, allIn: true }, { seat: 3, committed: 400 },
  ]);
  assert.deepEqual(pots, [
    { amount: 200, eligible: [0, 1, 2, 3] },
    { amount: 300, eligible: [1, 2, 3] },
    { amount: 500, eligible: [2, 3] },
  ]);
  assert.equal(pots.reduce((a, p) => a + p.amount, 0), 1000);
});

test('a folded player’s chips are split across the layers they reached', () => {
  const pots = buildPots([
    { seat: 0, committed: 300, folded: true }, { seat: 1, committed: 100, allIn: true }, { seat: 2, committed: 300 },
    { seat: 3, committed: 300 },
  ]);
  assert.deepEqual(pots, [{ amount: 400, eligible: [1, 2, 3] }, { amount: 600, eligible: [2, 3] }]);
});

test('equal all-ins make one layer, not two', () => {
  const pots = buildPots([{ seat: 0, committed: 200, allIn: true }, { seat: 1, committed: 200, allIn: true }, { seat: 2, committed: 500 }, { seat: 3, committed: 500 }]);
  assert.deepEqual(pots, [{ amount: 800, eligible: [0, 1, 2, 3] }, { amount: 600, eligible: [2, 3] }]);
});

test('awards: each pot to its best eligible hand; three-way split with odd chips in seat order', () => {
  const pots = [{ amount: 100, eligible: [0, 1, 2] }, { amount: 50, eligible: [1, 2] }];
  const scores = new Map([[0, 900], [1, 500], [2, 500]]);
  const a = awardPots(pots, scores, [2, 0, 1]);
  assert.deepEqual(a[0].winners, [{ seat: 0, amount: 100 }]);
  assert.deepEqual(a[1].winners, [{ seat: 2, amount: 25 }, { seat: 1, amount: 25 }]);
  const odd = awardPots([{ amount: 100, eligible: [0, 1, 2] }], new Map([[0, 1], [1, 1], [2, 1]]), [1, 2, 0]);
  assert.deepEqual(odd[0].winners, [{ seat: 1, amount: 34 }, { seat: 2, amount: 33 }, { seat: 0, amount: 33 }]);
});

test('a player never wins more than they were eligible for', () => {
  const players = [{ seat: 0, committed: 10, allIn: true }, { seat: 1, committed: 1000 }, { seat: 2, committed: 1000 }];
  const pots = buildPots(players);
  const a = awardPots(pots, new Map([[0, 99], [1, 1], [2, 2]]), [0, 1, 2]);
  const won0 = a.flatMap((x) => x.winners).filter((w) => w.seat === 0).reduce((s, w) => s + w.amount, 0);
  assert.equal(won0, 30);
});
