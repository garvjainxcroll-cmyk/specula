// The live random source (crypto) and the shuffle: in range, unbiased enough to see, and every
// shuffle a full deck. Also: bots and a whole practice table run on the live source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { secureRng } from '../server/rng.mjs';
import { shuffle, freshDeck } from '../src/engine/cards.mjs';
import { createRoom, sit, addBot, tick } from '../src/room/room.mjs';

test('secure random numbers stay in range', () => {
  for (let i = 0; i < 20000; i++) {
    const f = secureRng.float();
    assert.ok(f >= 0 && f < 1);
    const n = secureRng.int(52);
    assert.ok(Number.isInteger(n) && n >= 0 && n < 52);
  }
});

test('shuffles are full decks and every card turns up in every position about equally', () => {
  const counts = Array.from({ length: 52 }, () => new Array(52).fill(0));
  const N = 20000;
  for (let k = 0; k < N; k++) {
    const d = shuffle(freshDeck(), secureRng);
    assert.equal(new Set(d).size, 52);
    d.forEach((c, i) => { counts[i][c]++; });
  }
  const want = N / 52;
  // each cell ~ Binomial(N, 1/52): sd ≈ 19; allow a very wide band
  for (const row of counts) for (const x of row) assert.ok(Math.abs(x - want) < 140, `cell ${x} far from ${want}`);
});

test('a practice table with bots runs on the live random source', () => {
  let now = 1000;
  const room = createRoom({ id: 'r', code: 'R', kind: 'practice', name: 'P', cfg: { seats: 6 } }, now);
  sit(room, { acct: 'me', name: 'Me', stack: 2000 }, now);
  room.tables[0].seats[0].sittingOut = true;
  for (let i = 0; i < 5; i++) addBot(room, { level: ['easy', 'medium', 'hard'][i % 3], id: `b${i}` }, now, secureRng);
  for (let k = 0; k < 600; k++) { now += 1000; tick(room, now, secureRng); }
  assert.ok(room.tables[0].handNo >= 5, `hands: ${room.tables[0].handNo}`);
});
