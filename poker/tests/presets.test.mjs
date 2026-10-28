// Bet-size buttons: pot sizes account for the amount to call; everything stays legal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { presetAmount, betSummary, cleanPresets, potTo } from '../src/engine/presets.mjs';
import { legalActions, act } from '../src/engine/hand.mjs';
import { quickHand } from './helpers.mjs';

test('pot raise before the flop: blinds 50/100, first to act → raise to 350', () => {
  const h = quickHand({ stacks: { 0: 10000, 1: 10000, 2: 10000 }, button: 0 });
  const l = legalActions(h, 0);
  assert.equal(presetAmount(l, 'pot', undefined, 50).to, 350);
  assert.equal(presetAmount(l, 'half', undefined, 50).to, 250); // 100 + ½×(150+100) = 225 → rounds to 250
  assert.equal(presetAmount(l, 'min').to, 200);
  assert.equal(presetAmount(l, 'allin').to, 10000);
});

test('facing a bet after the flop: pot raise = bet + (pot + call)', () => {
  let h = quickHand({ stacks: { 0: 10000, 1: 10000, 2: 10000 }, button: 0 });
  h = act(h, 0, { type: 'call' }); h = act(h, 1, { type: 'call' }); h = act(h, 2, { type: 'check' });
  // pot 300. Seat 1 bets 200 → pot 500, seat 2 to call 200
  h = act(h, 1, { type: 'bet', to: 200 });
  const l = legalActions(h, 2);
  assert.equal(l.pot, 500); assert.equal(l.toCall, 200);
  assert.equal(potTo(l, 1), 900); // 200 + (500 + 200)
  assert.equal(presetAmount(l, 'pot').to, 900);
  assert.equal(presetAmount(l, 'threequarters').to, 725);
  assert.equal(presetAmount(l, 'twothirds', undefined, 1).to, 667);
});

test('Small Bet and Big Bet default to 25% and 75% of the pot and can be changed', () => {
  let h = quickHand({ stacks: { 0: 10000, 1: 10000 }, button: 0 });
  h = act(h, 0, { type: 'call' }); h = act(h, 1, { type: 'check' });
  const l = legalActions(h, 1); // pot 200, no bet
  assert.equal(presetAmount(l, 'small').to, 100, '25% of 200 = 50, raised to the minimum bet of 100');
  assert.equal(presetAmount(l, 'small').clamped, true);
  assert.equal(presetAmount(l, 'big').to, 150);
  const mine = cleanPresets({ small: { mode: 'pot', value: 60 }, big: { mode: 'bb', value: 4 } });
  assert.equal(presetAmount(l, 'small', mine).to, 120);
  assert.equal(presetAmount(l, 'big', mine).to, 400, '4 big blinds');
});

test('presets never go below the minimum or above the stack', () => {
  const h = quickHand({ stacks: { 0: 260, 1: 10000, 2: 10000 }, button: 0 });
  const l = legalActions(h, 0);
  assert.equal(presetAmount(l, 'pot').to, 260, 'pot (350) is more than the stack: all-in');
  assert.equal(presetAmount(l, 'pot').allIn, true);
  assert.equal(presetAmount(l, 'small').to, 200);
});

test('the summary shows the call, stack after and total committed', () => {
  const h = quickHand({ stacks: { 0: 10000, 1: 10000, 2: 10000 }, button: 0 });
  const l = legalActions(h, 1); // not their turn
  assert.equal(l, null);
  const s = betSummary(legalActions(h, 0), 600);
  assert.deepEqual(s, { to: 600, add: 600, stackAfter: 9400, committedAfter: 600, potAfter: 750, allIn: false, isRaise: true });
  assert.equal(betSummary(legalActions(h, 0), 50).to, 200, 'clamped up to the minimum raise');
});

test('bad preset settings are cleaned', () => {
  assert.deepEqual(cleanPresets({ small: { mode: 'pot', value: -3 }, big: { mode: 'weird', value: 'x' } }), { small: { mode: 'pot', value: 25 }, big: { mode: 'pot', value: 75 } });
});
