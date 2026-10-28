// Long simulations through the room layer (the code the server runs): thousands of hands at
// cash tables with players timing out, leaving and coming back, and whole multi-table
// tournaments with balancing, eliminations and prizes. Books must balance at every step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateCash, simulateTournament } from '../scripts/simlib.mjs';
import { prizeTable } from '../src/room/config.mjs';

test('2,000 hands at a 6-seat cash table with chaotic players: books balance throughout', () => {
  const r = simulateCash({ seed: 'cash-6', hands: 2000, seats: 6, humans: 4, bots: 2 });
  assert.equal(r.hands, 2000);
  assert.ok(r.showdowns > 300, `showdowns: ${r.showdowns}`);
  assert.ok(r.sidePots > 20, `side pots: ${r.sidePots}`);
});

test('1,000 heads-up hands', () => {
  const r = simulateCash({ seed: 'hu', hands: 1000, seats: 2, humans: 1, bots: 1 });
  assert.equal(r.hands, 1000);
});

test('1,000 hands at a full 9-seat table, humans only', () => {
  const r = simulateCash({ seed: 'nine', hands: 1000, seats: 9, humans: 9, bots: 0, sb: 25, bb: 50 });
  assert.equal(r.hands, 1000);
});

test('a 30-player tournament on four tables runs to the end: tables stay balanced, every place is awarded', () => {
  const r = simulateTournament({ seed: 'cup', entrants: 30, seats: 9, humans: 8 });
  const tour = r.room.tour;
  assert.equal(tour.status, 'finished');
  assert.ok(r.startSpread <= 1, `a hand started at a table ${r.startSpread} players above the emptiest table`);
  assert.ok(r.maxSpread <= 3, `busts can leave tables uneven for a moment, never by more than 3 (${r.maxSpread})`);
  const places = tour.results.map((x) => x.place);
  assert.equal(places.length, 30, 'every entrant has a place');
  assert.equal(places.filter((p) => p === 1).length, 1, 'exactly one winner');
  const pool = 30 * 100;
  assert.equal(tour.results.reduce((a, x) => a + x.prize, 0), pool, 'the whole prize pool is paid, no more');
  assert.deepEqual(prizeTable([50, 30, 20], 30, 100), [1500, 900, 600]);
  assert.ok(r.hands > 100, `hands played: ${r.hands}`);
});

test('a 45-player tournament on five tables: no hand starts at a table two above the emptiest', () => {
  const r = simulateTournament({ seed: 'tsim-1', entrants: 45, seats: 9, humans: 8 });
  assert.equal(r.room.tour.status, 'finished');
  assert.ok(r.startSpread <= 1, `spread ${r.startSpread}`);
});

test('a heads-up tournament and a 6-max tournament', () => {
  const a = simulateTournament({ seed: 'hu-cup', entrants: 2, seats: 2, humans: 1 });
  assert.equal(a.room.tour.status, 'finished');
  const b = simulateTournament({ seed: 'six', entrants: 13, seats: 6, humans: 4 });
  assert.equal(b.room.tour.status, 'finished');
  assert.equal(b.room.tour.results.length, 13);
});
