// Thousands of random hands with random (legal and illegal) actions. After every action the
// chips must balance; at the end every pot must go to its best eligible hand, nobody may win
// more than they could, and no card may appear twice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startHand, act, legalActions, checkChips, HandError } from '../src/engine/hand.mjs';
import { evaluate } from '../src/engine/evaluator.mjs';
import { freshDeck, shuffle } from '../src/engine/cards.mjs';
import { seeded } from '../src/engine/rng.mjs';

export function randomAction(rng, l) {
  const r = rng.float();
  if (r < 0.12) return { type: 'fold' };
  if (r < 0.45) return l.canCheck ? { type: 'check' } : { type: 'call' };
  if (r < 0.55) return { type: 'allin' };
  if ((l.canBet || l.canRaise) && r < 0.85) {
    const span = l.maxTo - l.minTo;
    return { type: l.canBet ? 'bet' : 'raise', to: l.minTo + (span > 0 ? rng.int(Math.min(span, 4 * l.bb) + 1) : 0) };
  }
  return l.canCheck ? { type: 'check' } : { type: 'call' };
}

function playRandomHand(rng, k) {
  const n = 2 + rng.int(9);
  const seats = shuffle(Array.from({ length: 10 }, (_, i) => i), rng).slice(0, n).sort((a, b) => a - b);
  const bb = [2, 10, 20, 50, 100][rng.int(5)];
  const players = seats.map((seat) => ({ seat, id: `p${seat}`, name: `P${seat}`, stack: 1 + rng.int(rng.float() < 0.3 ? 3 * bb : 80 * bb), autoMuck: rng.float() < 0.7 }));
  const ante = rng.float() < 0.3 ? Math.max(1, Math.floor(bb / 10)) : 0;
  let h = startHand({ id: `r${k}`, no: k, players, button: seats[rng.int(n)], sb: bb / 2, bb, ante, deck: shuffle(freshDeck(), rng) });
  checkChips(h);
  let guard = 0;
  while (h.status === 'betting') {
    if (++guard > 500) throw new Error('hand did not end');
    const seat = h.toAct;
    const p = h.players.find((x) => x.seat === seat);
    assert.ok(!p.folded && !p.allIn, 'only a player who can act is asked to act');
    const l = legalActions(h, seat);
    // illegal attempts are refused and change nothing
    if (rng.float() < 0.1) {
      const bad = [{ type: 'check' }, { type: 'raise', to: l.minTo - 1 }, { type: 'raise', to: l.maxTo + 1 }, { type: 'bet', to: 0 }][rng.int(4)];
      const legalBad = (bad.type === 'check' && l.canCheck);
      if (!legalBad) assert.throws(() => act(h, seat, bad), HandError);
    }
    const other = h.players.find((x) => x.seat !== seat);
    assert.throws(() => act(h, other.seat, { type: 'fold' }), HandError);
    let next;
    try { next = act(h, seat, randomAction(rng, l)); } catch (e) {
      if (!(e instanceof HandError)) throw e;
      next = act(h, seat, l.canCheck ? { type: 'check' } : { type: 'call' });
    }
    checkChips(next);
    h = next;
  }
  // books balance
  assert.equal(h.players.reduce((a, p) => a + p.stack, 0), h.players.reduce((a, p) => a + p.start, 0));
  // cards: all 52 accounted for exactly once
  const all = [...h.deck, ...h.burned, ...h.board, ...h.players.flatMap((p) => p.cards)];
  assert.equal(new Set(all).size, 52); assert.equal(all.length, 52);
  // nobody wins more than they were eligible for
  const won = new Map();
  for (const pot of h.result.pots) for (const w of pot.winners) won.set(w.seat, (won.get(w.seat) || 0) + w.amount);
  for (const p of h.players) {
    const cap = h.players.reduce((a, q) => a + Math.min(q.committed, p.committed), 0);
    assert.ok((won.get(p.seat) || 0) <= cap, `seat ${p.seat} won ${won.get(p.seat)} > eligible ${cap}`);
    if (p.folded) assert.equal(won.get(p.seat) || 0, 0, 'a folded player never wins');
  }
  if (h.result.showdown) {
    assert.equal(h.board.length, 5);
    for (const pot of h.result.pots) {
      const scores = pot.eligible.map((s) => evaluate([...h.players.find((p) => p.seat === s).cards, ...h.board]).score);
      const best = Math.max(...scores);
      const should = pot.eligible.filter((_, i) => scores[i] === best).sort();
      assert.deepEqual(pot.winners.map((w) => w.seat).sort(), should);
      const amounts = pot.winners.map((w) => w.amount);
      assert.ok(Math.max(...amounts) - Math.min(...amounts) <= 1, 'split pots differ by at most one odd chip');
      assert.equal(amounts.reduce((a, b) => a + b, 0), pot.amount);
    }
  }
  return h;
}

test('5,000 random hands: chips balance, pots go to the right hands, no duplicate cards', () => {
  const rng = seeded('random-hands');
  let showdowns = 0; let sidePots = 0; let splits = 0;
  for (let k = 1; k <= 5000; k++) {
    const h = playRandomHand(rng, k);
    if (h.result.showdown) showdowns++;
    if (h.result.pots.length > 1) sidePots++;
    if (h.result.pots.some((p) => p.winners.length > 1)) splits++;
  }
  // the random play really did reach the interesting cases
  assert.ok(showdowns > 1000, `showdowns ${showdowns}`);
  assert.ok(sidePots > 300, `hands with side pots ${sidePots}`);
  assert.ok(splits > 30, `split pots ${splits}`);
});
