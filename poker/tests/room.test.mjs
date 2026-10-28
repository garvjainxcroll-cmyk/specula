// Tables: seats, turn order across hands, time-outs, leaving, waiting for the big blind,
// settings changes between hands, voiding a hand, and views that hide hole cards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, sit, tick, playerAct, leave, sitOut, topUp, setConfig, voidHand, checkBooks, addBot, playerShow, findSeat, DELAY } from '../src/room/room.mjs';
import { viewRoom } from '../src/room/view.mjs';
import { seeded } from '../src/engine/rng.mjs';
import { checkView } from '../scripts/simlib.mjs';

const rng = seeded('room-tests');
function cashRoom(cfg = {}) {
  const now = 1000;
  const room = createRoom({ id: 'r1', code: 'ABCD', kind: 'cash', name: 'Test', cfg: { sb: 10, bb: 20, seats: 6, minBuyIn: 400, maxBuyIn: 4000, actionSeconds: 20, ...cfg } }, now);
  return { room, now };
}
const T = (room) => room.tables[0];
const actAs = (room, acct, type, to, now) => { const h = T(room).hand; return playerAct(room, acct, { handId: h.id, seq: h.seq, type, to }, now, rng); };
const toActAcct = (room) => T(room).seats[T(room).hand.toAct].acct;

test('two players sit, the first hand starts by itself, blinds are posted', () => {
  let { room, now } = cashRoom();
  sit(room, { acct: 'a', name: 'Ann', stack: 2000 }, now);
  assert.throws(() => sit(room, { acct: 'a', name: 'Ann', stack: 2000 }, now), /already have a seat/);
  assert.throws(() => sit(room, { acct: 'b', name: 'Bob', stack: 100 }, now), /between 400 and 4000/);
  sit(room, { acct: 'b', name: 'Bob', stack: 2000, seat: 3 }, now);
  assert.equal(T(room).hand, null);
  now += 2000; tick(room, now, rng);
  const h = T(room).hand;
  assert.ok(h, 'hand started');
  assert.equal(h.players.length, 2);
  assert.equal(h.sbSeat, h.button, 'heads-up: the button is the small blind');
  checkBooks(room);
});

test('actions need the right hand and sequence number; stale or replayed clicks are refused', () => {
  let { room, now } = cashRoom();
  sit(room, { acct: 'a', name: 'Ann', stack: 2000 }, now); sit(room, { acct: 'b', name: 'Bob', stack: 2000 }, now);
  now += 2000; tick(room, now, rng);
  const h = T(room).hand;
  const who = toActAcct(room); const other = who === 'a' ? 'b' : 'a';
  assert.throws(() => playerAct(room, other, { handId: h.id, seq: h.seq, type: 'fold' }, now, rng), /not your turn/);
  assert.throws(() => playerAct(room, who, { handId: 'nope', seq: h.seq, type: 'fold' }, now, rng), /hand is over/);
  playerAct(room, who, { handId: h.id, seq: h.seq, type: 'call' }, now, rng);
  assert.throws(() => playerAct(room, who, { handId: h.id, seq: h.seq, type: 'call' }, now, rng), (e) => e.code === 'stale' || e.code === 'not-your-turn');
  assert.throws(() => playerAct(room, 'zed', { handId: h.id, seq: h.seq, type: 'call' }, now, rng), /not at this table/);
});

test('the button moves clockwise every hand', () => {
  let { room, now } = cashRoom();
  for (const [a, s] of [['a', 0], ['b', 2], ['c', 4]]) sit(room, { acct: a, name: a, stack: 2000, seat: s }, now);
  now += 2000; tick(room, now, rng);
  const buttons = [];
  for (let k = 0; k < 6; k++) {
    buttons.push(T(room).hand.button);
    // everyone folds to the big blind
    while (T(room).hand.status === 'betting') actAs(room, toActAcct(room), 'fold', undefined, now);
    now += DELAY.showdown + 10; tick(room, now, rng);
  }
  const order = [0, 2, 4];
  for (let k = 1; k < buttons.length; k++) assert.equal(buttons[k], order[(order.indexOf(buttons[k - 1]) + 1) % 3]);
  checkBooks(room);
});

test('time-outs check or fold; two in a row sit the player out; they can sit back in', () => {
  let { room, now } = cashRoom();
  for (const a of ['a', 'b', 'c']) sit(room, { acct: a, name: a, stack: 2000 }, now);
  now += 2000; tick(room, now, rng);
  const t = T(room);
  const first = toActAcct(room);
  now = t.deadline + 1; tick(room, now, rng);
  const ev = t.hand.events.find((e) => e.t === 'act' && e.auto === 'timeout');
  assert.ok(ev, 'a time-out was recorded');
  assert.equal(findSeat(room, first).seat.timeouts, 1);
  // keep timing out the same player until they are sat out
  for (let k = 0; k < 40 && !findSeat(room, first).seat.sittingOut; k++) {
    if (t.hand?.status === 'betting') { if (toActAcct(room) === first) now = t.deadline + 1; else actAs(room, toActAcct(room), 'fold', undefined, now); }
    else now += DELAY.showdown + 10;
    tick(room, now, rng);
  }
  assert.ok(findSeat(room, first).seat.sittingOut, 'sat out after two time-outs');
  sitOut(room, first, false, now);
  assert.equal(findSeat(room, first).seat.sittingOut, false);
  checkBooks(room);
});

test('leaving in the middle of a hand folds it; the chips go back to the account when the hand ends', () => {
  let { room, now } = cashRoom();
  for (const a of ['a', 'b', 'c']) sit(room, { acct: a, name: a, stack: 2000 }, now);
  now += 2000; tick(room, now, rng);
  const t = T(room);
  const notToAct = t.seats.find((x) => x && x.acct !== toActAcct(room)).acct;
  const r = leave(room, notToAct, now, rng);
  assert.equal(r.pending, true);
  while (t.hand.status === 'betting') {
    const who = toActAcct(room);
    actAs(room, who, t.hand.currentBet > 0 && t.hand.players.find((p) => p.id === who).bet < t.hand.currentBet ? 'call' : 'check', undefined, now);
  }
  assert.ok(t.hand.players.find((p) => p.id === notToAct).folded, 'their hand was folded');
  now += DELAY.showdown + 10; tick(room, now, rng);
  assert.equal(findSeat(room, notToAct), null, 'gone from the table');
  const out = room.outbox.find((o) => o.kind === 'cashout' && o.acct === notToAct);
  assert.ok(out && out.amount > 0);
  checkBooks(room);
});

test('a new player waits for the big blind, then is dealt in', () => {
  let { room, now } = cashRoom();
  for (const [a, s] of [['a', 0], ['b', 1], ['c', 2]]) sit(room, { acct: a, name: a, stack: 2000, seat: s }, now);
  now += 2000; tick(room, now, rng);
  sit(room, { acct: 'd', name: 'd', stack: 2000, seat: 4 }, now);
  assert.equal(findSeat(room, 'd').seat.waitBB, true);
  let dealtAsBB = false;
  for (let k = 0; k < 8 && !dealtAsBB; k++) {
    const h = T(room).hand;
    if (h.players.some((p) => p.id === 'd')) { assert.equal(T(room).seats[h.bbSeat].acct, 'd', 'first hand is as the big blind'); dealtAsBB = true; break; }
    while (T(room).hand.status === 'betting') actAs(room, toActAcct(room), 'fold', undefined, now);
    now += DELAY.showdown + 10; tick(room, now, rng);
  }
  assert.ok(dealtAsBB);
});

test('settings changed during a hand wait for the next hand', () => {
  let { room, now } = cashRoom();
  for (const a of ['a', 'b']) sit(room, { acct: a, name: a, stack: 2000 }, now);
  now += 2000; tick(room, now, rng);
  setConfig(room, { sb: 25, bb: 50 }, now);
  assert.equal(T(room).hand.blinds.bb, 20, 'this hand keeps its blinds');
  assert.equal(room.pendingCfg.bb, 50);
  while (T(room).hand.status === 'betting') actAs(room, toActAcct(room), 'fold', undefined, now);
  now += DELAY.showdown + 10; tick(room, now, rng);
  assert.equal(T(room).hand.blinds.bb, 50);
  assert.equal(room.pendingCfg, null);
});

test('the Event Head can cancel a hand: everyone gets back what they started with', () => {
  let { room, now } = cashRoom();
  for (const a of ['a', 'b', 'c']) sit(room, { acct: a, name: a, stack: 2000 }, now);
  now += 2000; tick(room, now, rng);
  actAs(room, toActAcct(room), 'raise', 200, now);
  voidHand(room, 0, now);
  for (const x of T(room).seats.filter(Boolean)) assert.equal(x.stack, 2000);
  checkBooks(room);
});

test('top up between hands only, up to the maximum', () => {
  let { room, now } = cashRoom();
  for (const a of ['a', 'b']) sit(room, { acct: a, name: a, stack: 2000 }, now);
  assert.throws(() => topUp(room, 'a', 5000, now), /most you can have/);
  topUp(room, 'a', 1000, now, 'x1');
  topUp(room, 'a', 1000, now, 'x1'); // the same transfer twice is applied once
  assert.equal(findSeat(room, 'a').seat.stack, 3000);
  now += 2000; tick(room, now, rng);
  assert.throws(() => topUp(room, 'a', 100, now), /between hands/);
  checkBooks(room);
});

test('views: you see your own cards, never anyone else’s; the board shows only what is dealt', () => {
  let { room, now } = cashRoom();
  for (const a of ['a', 'b', 'c']) sit(room, { acct: a, name: a, stack: 2000 }, now);
  now += 2000; tick(room, now, rng);
  const va = viewRoom(room, { acct: 'a' }, now);
  const mine = va.tables[0].seats.find((s) => s && s.isYou);
  assert.equal(mine.cards.length, 2); assert.ok(mine.cards.every((c) => Number.isInteger(c)));
  for (const s of va.tables[0].seats.filter((x) => x && !x.isYou)) assert.deepEqual(s.cards, ['back', 'back']);
  const host = viewRoom(room, { host: true }, now);
  for (const s of host.tables[0].seats.filter(Boolean)) assert.deepEqual(s.cards, ['back', 'back'], 'not even the Event Head sees hole cards in play');
  assert.equal(va.tables[0].hand.board.length, 0);
  assert.ok(!JSON.stringify(host).includes('"deck"'));
  checkView(room, { acct: 'b' }, now); checkView(room, {}, now);
  // only the player to act gets legal actions
  const who = toActAcct(room);
  assert.ok(viewRoom(room, { acct: who }, now).tables[0].hand.legal);
  for (const a of ['a', 'b', 'c'].filter((x) => x !== who)) assert.equal(viewRoom(room, { acct: a }, now).tables[0].hand.legal, null);
});

test('after a hand you may show your cards', () => {
  let { room, now } = cashRoom();
  for (const a of ['a', 'b']) sit(room, { acct: a, name: a, stack: 2000 }, now);
  now += 2000; tick(room, now, rng);
  const winner = T(room).seats[T(room).hand.bbSeat].acct;
  actAs(room, toActAcct(room), 'fold', undefined, now);
  playerShow(room, winner, now);
  const v = viewRoom(room, { acct: winner === 'a' ? 'b' : 'a' }, now);
  const w = v.tables[0].seats.find((s) => s && s.name === winner);
  assert.ok(w.cards.every((c) => Number.isInteger(c)), 'the other player now sees the shown cards');
});

test('practice: bots fill the table and play; bots buy back in when they bust', () => {
  let now = 1000;
  const room = createRoom({ id: 'p', code: 'P', kind: 'practice', name: 'Practice', cfg: { sb: 10, bb: 20, seats: 6, maxBuyIn: 2000, minBuyIn: 400 } }, now);
  sit(room, { acct: 'me', name: 'Me', stack: 2000 }, now);
  for (let i = 0; i < 5; i++) addBot(room, { level: ['easy', 'medium', 'hard'][i % 3], id: `b${i}` }, now, rng);
  assert.equal(T(room).seats.filter((x) => x && x.bot).length, 5);
  let hands = 0;
  for (let k = 0; k < 4000 && hands < 40; k++) {
    now += 700; tick(room, now, rng);
    const h = T(room).hand;
    if (h && h.status === 'betting' && toActAcct(room) === 'me') actAs(room, 'me', 'fold', undefined, now);
    hands = T(room).handNo;
    checkBooks(room);
  }
  assert.ok(hands >= 40, `played ${hands} hands`);
  assert.ok(room.cfg.revealFoldedInHistory, 'practice tables show folded hands in the history');
});
