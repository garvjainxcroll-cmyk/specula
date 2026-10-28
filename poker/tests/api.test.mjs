// The server, end to end through handle(): accounts, chips, tables, the Event Head, and the
// security rules — hidden cards never leave the server, replayed or racing actions are
// applied once, interrupted transfers are finished or refunded, and the books always balance.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { handle, resetLimits } from '../server/api.mjs';
import { memoryStore } from '../server/storage-memory.mjs';
import { seeded } from '../src/engine/rng.mjs';

let store; let clock; let rng;
beforeEach(() => { store = memoryStore(); clock = 1_700_000_000_000; rng = seeded('api'); resetLimits(); });

async function api(method, path, body, token, env = {}) {
  const headers = { 'content-type': 'application/json', 'x-forwarded-for': '10.0.0.1' };
  if (token) headers.authorization = `Bearer ${token}`;
  const r = await handle(new Request(`http://x/api/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined }), store, env, { now: () => clock, rng });
  return { status: r.status, ...(await r.json()) };
}
const get = (p, t) => api('GET', p, null, t);
const post = (p, b, t) => api('POST', p, b, t);
async function guest(name) { const r = await post('auth/guest', { name }); assert.ok(r.ok, r.error); return r; }
async function host() {
  await post('host/setup', { password: 'event-head-pass' });
  return (await post('host/login', { password: 'event-head-pass' })).token;
}
const roomDoc = async (id) => store.get(`room/${id}`);
const viewOf = async (id, token) => (await get(`room?id=${id}`, token)).view;
async function seatedTable(players = ['Ann', 'Bob'], buyIn = 2000) {
  const toks = [];
  let id;
  for (const n of players) {
    const g = await guest(n);
    const q = await post('quickplay', { stakes: '10-20', seats: 6 }, g.token);
    id = q.id;
    const s = await post('room/sit', { id, buyIn }, g.token);
    assert.ok(s.ok, s.error);
    toks.push(g.token);
  }
  clock += 2000;
  await get(`room?id=${id}`, toks[0]);
  return { id, toks };
}
async function whoActs(id, toks) {
  for (const t of toks) { const v = await viewOf(id, t); if (v.tables[0].hand?.legal) return { t, v }; }
  return null;
}

test('health', async () => {
  const r = await get('health');
  assert.equal(r.ok, true); assert.equal(r.app, 'artha');
});

test('accounts: register, unique names, hashed passwords, login, lockout', async () => {
  const a = await post('auth/register', { name: 'Riya', password: 'secret12' });
  assert.ok(a.ok); assert.equal(a.me.bankroll, 10000);
  const dup = await post('auth/register', { name: 'riya', password: 'another1' });
  assert.equal(dup.code, 'name-taken');
  const doc = await store.get(`acct/${a.me.id}`);
  assert.ok(doc.pass.hash && doc.pass.salt); assert.ok(!JSON.stringify(doc).includes('secret12'), 'no plaintext password');
  assert.equal((await post('auth/login', { name: 'Riya', password: 'wrong' })).code, 'bad-login');
  const ok = await post('auth/login', { name: 'RIYA', password: 'secret12' });
  assert.ok(ok.ok && ok.token);
  for (let i = 0; i < 8; i++) await post('auth/login', { name: 'Riya', password: 'nope' });
  assert.equal((await post('auth/login', { name: 'Riya', password: 'secret12' })).code, 'locked');
  clock += 16 * 60000;
  assert.ok((await post('auth/login', { name: 'Riya', password: 'secret12' })).ok);
  assert.equal((await post('auth/register', { name: 'X', password: 'secret12' })).code, 'name');
  assert.equal((await post('auth/register', { name: 'Okay', password: '123' })).code, 'password');
});

test('guests can claim their account; logging out ends old tokens', async () => {
  const g = await guest('Kabir');
  assert.equal(g.me.guest, true);
  const c = await post('auth/claim', { password: 'kabir-pass' }, g.token);
  assert.equal(c.me.guest, false);
  assert.ok((await post('auth/login', { name: 'Kabir', password: 'kabir-pass' })).ok);
  await post('auth/logout', {}, g.token);
  assert.equal((await get('me', g.token)).status, 401);
  const g2 = await guest('Kabir');
  assert.notEqual(g2.me.name, 'Kabir', 'a taken name gets a number');
});

test('quick play finds an open table; buying in moves chips from the account, within the limits', async () => {
  const a = await guest('Ann'); const b = await guest('Bob');
  const qa = await post('quickplay', { stakes: '10-20', seats: 6 }, a.token);
  const qb = await post('quickplay', { stakes: '10-20', seats: 6 }, b.token);
  assert.equal(qa.id, qb.id, 'both sent to the same table');
  assert.equal((await post('room/sit', { id: qa.id, buyIn: 100 }, a.token)).code, 'amount');
  assert.equal((await get('me', a.token)).me.bankroll, 10000, 'refused buy-in is refunded');
  assert.equal((await post('room/sit', { id: qa.id, buyIn: 50000 }, a.token)).code, 'chips');
  assert.ok((await post('room/sit', { id: qa.id, buyIn: 2000 }, a.token)).ok);
  assert.equal((await get('me', a.token)).me.bankroll, 8000);
  assert.equal((await post('room/sit', { id: qa.id, buyIn: 2000 }, a.token)).code, 'seated');
  assert.equal((await get('me', a.token)).me.bankroll, 8000);
  const lobby = await get('lobby');
  assert.equal(lobby.rooms.find((r) => r.id === qa.id).seated, 1);
});

test('a hand over the API: only the player to act may act; replays and stale clicks are refused', async () => {
  const { id, toks } = await seatedTable();
  const { t, v } = await whoActs(id, toks);
  const other = toks.find((x) => x !== t);
  const h = v.tables[0].hand;
  const wrong = await post('room/act', { id, handId: h.id, seq: h.seq, type: 'call' }, other);
  assert.equal(wrong.code, 'not-your-turn');
  const ok = await post('room/act', { id, handId: h.id, seq: h.seq, type: 'call' }, t);
  assert.ok(ok.ok, ok.error);
  const replay = await post('room/act', { id, handId: h.id, seq: h.seq, type: 'call' }, t);
  assert.ok(['stale', 'not-your-turn'].includes(replay.code));
  const illegal = await post('room/act', { id, handId: h.id, seq: h.seq + 1, type: 'raise', to: 21 }, other);
  assert.equal(illegal.refused, true);
});

test('hidden cards: nobody — not even the Event Head or the Big Screen — sees another player’s cards or the deck', async () => {
  const { id, toks } = await seatedTable(['Ann', 'Bob', 'Cat']);
  const ht = await host();
  const room = await roomDoc(id);
  const h = room.tables[0].hand;
  const secret = (acctId) => h.players.filter((p) => p.id !== acctId).flatMap((p) => p.cards).concat(h.deck, h.burned);
  for (const [tok, acctId] of [[toks[0], h.players[0].id], [ht, null], [null, null]]) {
    const raw = await get(`room?id=${id}`, tok);
    const v = raw.view;
    assert.ok(!JSON.stringify(raw).includes('"deck"'));
    const cardsShown = v.tables[0].seats.filter(Boolean).flatMap((s) => (s.cards || []).filter((c) => c !== 'back'));
    const mine = acctId ? h.players.find((p) => p.id === acctId)?.cards || [] : [];
    for (const c of cardsShown) assert.ok(mine.includes(c), 'only your own cards are face up');
    const logCards = v.tables[0].hand.log.flatMap((e) => (e.t === 'deal' ? e.cards || [] : []));
    for (const c of logCards) assert.ok(mine.includes(c));
    void secret;
  }
});

test('racing: twenty identical clicks at once are applied once', async () => {
  const { id, toks } = await seatedTable();
  const { t, v } = await whoActs(id, toks);
  const h = v.tables[0].hand;
  const results = await Promise.all(Array.from({ length: 20 }, () => post('room/act', { id, handId: h.id, seq: h.seq, type: 'call' }, t)));
  assert.equal(results.filter((r) => r.ok).length, 1, 'exactly one succeeded');
  const room = await roomDoc(id);
  assert.equal(room.tables[0].hand.seq, h.seq + 1);
});

test('racing: two players for one seat — one gets it, the other is refunded', async () => {
  const a = await guest('Ann'); const b = await guest('Bob');
  const q = await post('quickplay', { stakes: '10-20', seats: 6 }, a.token);
  const [ra, rb] = await Promise.all([post('room/sit', { id: q.id, seat: 3, buyIn: 2000 }, a.token), post('room/sit', { id: q.id, seat: 3, buyIn: 2000 }, b.token)]);
  assert.equal([ra, rb].filter((r) => r.ok).length, 1);
  const loser = ra.ok ? b : a;
  assert.equal((await get('me', loser.token)).me.bankroll, 10000);
});

test('leaving returns the chips to the account; the audit balances', async () => {
  const { id, toks } = await seatedTable();
  // play one hand: whoever acts folds
  const { t, v } = await whoActs(id, toks);
  await post('room/act', { id, handId: v.tables[0].hand.id, seq: v.tables[0].hand.seq, type: 'fold' }, t);
  clock += 7000; await get(`room?id=${id}`, toks[0]);
  for (const tok of toks) { const r = await post('room/leave', { id }, tok); assert.ok(r.ok, r.error); }
  clock += 7000; await get(`room?id=${id}`, toks[0]);
  const m1 = (await get('me', toks[0])).me; const m2 = (await get('me', toks[1])).me;
  assert.equal(m1.bankroll + m2.bankroll, 20000, 'all chips are back in the accounts');
  assert.equal(Object.keys(m1.at).length, 0);
  assert.ok(m1.stats.hands >= 1, 'hands are counted in the profile');
  const ht = await host();
  const audit = await get('host/audit', ht);
  assert.ok(audit.summary.accountsBalanced && audit.summary.tablesBalanced && audit.summary.buyInsMatch && audit.summary.cashOutsMatch, JSON.stringify(audit.summary));
});

test('an interrupted buy-in is finished or refunded when the account is next loaded', async () => {
  const g = await guest('Dev');
  const q = await post('quickplay', { stakes: '10-20', seats: 6 }, g.token);
  // a hold the room never applied (the request died half way): refunded
  await store.set(`acct/${g.me.id}`, { ...(await store.get(`acct/${g.me.id}`)), bankroll: 7000, holds: { xlost: { room: q.id, amount: 3000, at: clock } } });
  // a hold the room did apply: finished
  const room = await roomDoc(q.id); room.applied.push('xkept'); await store.set(`room/${q.id}`, room);
  const a = await store.get(`acct/${g.me.id}`); a.holds.xkept = { room: q.id, amount: 1000, at: clock }; a.bankroll -= 1000; await store.set(`acct/${g.me.id}`, a);
  clock += 60000;
  const me = (await get('me', g.token)).me;
  assert.equal(me.bankroll, 9000); assert.equal(me.inTransit, 0); assert.equal(me.ledger.boughtIn, 1000);
});

test('time-outs happen on the server clock, with nobody clicking', async () => {
  const { id, toks } = await seatedTable();
  const before = (await roomDoc(id)).tables[0].hand;
  clock += 60000; // past the action timer and the time bank
  await get(`room?id=${id}`); // the Big Screen polling is enough
  const after = (await roomDoc(id)).tables[0];
  assert.ok(after.hand.events.some((e) => e.auto === 'timeout') || after.hand.id !== before.id);
  void toks;
});

test('practice with bots; players may only manage their own private tables', async () => {
  const g = await guest('Zoe'); const other = await guest('Ivy');
  const r = await post('rooms/create', { kind: 'practice', name: 'My practice', cfg: { seats: 6, sb: 10, bb: 20 }, bots: { count: 5, level: 'hard' } }, g.token);
  assert.ok(r.ok, r.error);
  const v = await viewOf(r.id, g.token);
  assert.equal(v.tables[0].seats.filter((s) => s && s.bot).length, 5);
  assert.equal((await get('me', g.token)).me.bankroll, 10000, 'practice chips are free');
  assert.ok((await post('room/sitout', { id: r.id, on: true }, g.token)).ok);
  for (let k = 0; k < 120; k++) { clock += 2500; await get(`room?id=${r.id}`, g.token); }
  assert.ok((await roomDoc(r.id)).tables[0].handNo >= 2, 'bots played on');
  const priv = await post('rooms/create', { kind: 'cash', name: 'Friends', cfg: { sb: 25, bb: 50, seats: 6 } }, g.token);
  assert.equal((await post('room/manage', { id: priv.id, op: 'config', cfg: { sb: 50, bb: 100 } }, other.token)).code, 'not-owner');
  assert.ok((await post('room/manage', { id: priv.id, op: 'config', cfg: { sb: 50, bb: 100 } }, g.token)).ok);
  assert.equal((await post('room/manage', { id: priv.id, op: 'bot-add' }, g.token)).code, 'host-only');
  const lobby = await get('lobby');
  assert.ok(!lobby.rooms.some((x) => x.id === priv.id), 'private tables are not listed');
  const byCode = await get(`room?code=${priv.code}`, other.token);
  assert.ok(byCode.ok && byCode.view.private, 'but anyone with the code can open it');
});

test('the Event Head: password set once, tournaments, chip grants, settings', async () => {
  assert.equal((await get('host/status')).setup, false);
  const ht = await host();
  assert.equal((await post('host/setup', { password: 'another-pass' })).code, 'exists');
  assert.equal((await post('host/login', { password: 'wrong-pass' })).code, 'bad-login');
  assert.equal((await get('host/overview')).status, 401);
  const players = [await guest('P1'), await guest('P2')];
  assert.ok((await post('host/grant', { acct: players[0].me.id, amount: 500 }, ht)).ok);
  assert.equal((await get('me', players[0].token)).me.bankroll, 10500);
  const tr = await post('host/room', { kind: 'tournament', name: 'Artha Vyūha Cup', cfg: { seats: 6, actionSeconds: 10 }, tour: { startingStack: 500, schedule: [{ sb: 25, bb: 50, minutes: 1 }, { sb: 100, bb: 200, minutes: 1 }, { sb: 250, bb: 500, minutes: 1 }], payouts: [70, 30], perEntrant: 100 }, bots: { count: 2, level: 'easy' } }, ht);
  assert.ok(tr.ok, tr.error);
  for (const p of players) assert.ok((await post('room/register', { id: tr.id }, p.token)).ok);
  assert.equal((await post('room/manage', { id: tr.id, op: 'start' }, players[0].token)).code, 'not-owner');
  assert.ok((await post('room/manage', { id: tr.id, op: 'start' }, ht)).ok);
  // nobody clicks: time-outs and bots play it to the end
  for (let k = 0; k < 3000; k++) {
    clock += 3000;
    const v = await viewOf(tr.id, ht);
    if (v.tour.status === 'finished') break;
  }
  const v = await viewOf(tr.id, ht);
  assert.equal(v.tour.status, 'finished');
  assert.equal(v.tour.results.length, 4);
  clock += 1000; await get(`room?id=${tr.id}`, ht);
  const me1 = (await get('me', players[0].token)).me;
  assert.equal(me1.stats.tournaments, 1);
  assert.equal(me1.tourResults[0].entrants, 4);
  assert.ok((await post('host/settings', { settings: { formats: { practice: false } } }, ht)).ok);
  assert.equal((await post('rooms/create', { kind: 'practice' }, players[1].token)).code, 'closed');
});

test('hand history: your own cards and shown cards; private tables only for those who played', async () => {
  const { id, toks } = await seatedTable();
  const { t, v } = await whoActs(id, toks);
  await post('room/act', { id, handId: v.tables[0].hand.id, seq: v.tables[0].hand.seq, type: 'fold' }, t);
  clock += 7000; await get(`room?id=${id}`, toks[0]);
  const handId = v.tables[0].hand.id;
  const rec = await store.get(`hist/${handId}`);
  assert.ok(rec, 'the hand was recorded');
  const mine = await get(`hand?id=${handId}`, t);
  const meP = mine.hand.players.find((p) => p.cards);
  assert.equal(mine.hand.players.filter((p) => p.cards).length, 1, 'only my own cards (the other player did not show)');
  assert.ok(meP);
  const ht = await host();
  const audit = await get(`hand?id=${handId}`, ht);
  assert.equal(audit.hand.players.filter((p) => p.cards).length, 2, 'the Event Head’s audit of a finished hand shows all cards');
});

test('rate limits: a flood of actions is slowed down', async () => {
  const { id, toks } = await seatedTable();
  let limited = 0;
  for (let i = 0; i < 40; i++) { const r = await post('room/act', { id, handId: 'x', seq: 0, type: 'fold' }, toks[0]); if (r.status === 429) limited++; }
  assert.ok(limited > 0);
});
