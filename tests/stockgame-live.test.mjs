// The live stock game server (stockgame/live): joining, the trading window, short selling,
// Event Head releases, what the public can and cannot see. Uses a small made-up game.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle, useSealed } from '../stockgame/live/server/api.mjs';
import { sealGame, openSealed } from '../stockgame/live/server/sealing.mjs';
import { memoryStore } from '../stockgame/live/server/storage-memory.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const KEY = 'TEST-KEY2-3456-789A';
const GAME = {
  v: 1, capital: 100000, margin: 1,
  stocks: [{ t: 'AAAA', name: 'Alpha Ltd', sector: 'One', start: 100 }, { t: 'BBBB', name: 'Beta Ltd', sector: 'Two', start: 200 }],
  updates: [1, 2, 3, 4, 5, 6].map((i) => ({
    i, round: Math.ceil(i / 5), cat: 'Test', head: `SECRET HEADLINE ${i}`, body: [`Secret story ${i}.`],
    moves: [{ t: 'AAAA', pct: i % 2 ? 0.1 : -0.05, why: `secret reason A${i}` }, { t: 'BBBB', pct: -0.1, why: `secret reason B${i}` }],
  })),
};

async function server() {
  useSealed(await sealGame(GAME, KEY, 1000));
  const store = memoryStore();
  const call = async (path, body) => {
    const req = body === undefined ? new Request(`http://x/api/${path}`) : new Request(`http://x/api/${path}`, { method: 'POST', body: JSON.stringify(body) });
    return (await handle(req, store)).json();
  };
  const admin = (action, extra = {}) => call('admin', { key: KEY, action, ...extra });
  return { store, call, admin };
}

test('nothing works until the Event Head unlocks the game with the game key', async () => {
  const { call, admin } = await server();
  assert.equal((await call('health')).unlocked, false);
  assert.equal((await call('poll')).state, null);
  assert.equal((await call('join', { pin: '1234', name: 'A team' })).refused, true);
  assert.match((await call('admin', { key: 'WRONG', action: 'login' })).error, /wrong/);
  const ok = await admin('login');
  assert.ok(ok.ok);
  assert.equal(ok.game.updates.length, 6);
  assert.equal((await call('health')).unlocked, true);
  assert.match((await call('admin', { key: 'WRONG', action: 'state' })).error, /game key/);
  assert.ok((await call('admin', { key: KEY.toLowerCase(), action: 'login' })).ok, 'the key is not case-sensitive');
});

test('teams join with the PIN, get a team code, and sign in on another device', async () => {
  const { call, admin } = await server();
  const { state } = await admin('login');
  assert.match((await call('join', { pin: '0000', name: 'Bulls' })).error, /PIN/);
  const j = await call('join', { pin: state.pin, name: 'Bulls' });
  assert.ok(j.ok && j.token && j.me.code.length === 6);
  assert.equal(j.me.book.cash, 100000 * 100);
  assert.match((await call('join', { pin: state.pin, name: 'bulls' })).error, /taken/);
  const s = await call('signin', { code: j.me.code.toLowerCase() });
  assert.equal(s.me.id, j.me.id);
  assert.equal((await call(`poll?token=${encodeURIComponent(j.token)}`)).me.name, 'Bulls');
  assert.equal((await call('poll?token=abc.def')).refused, true);
  await admin('settings', { joinOpen: false });
  assert.match((await call('join', { pin: state.pin, name: 'Late' })).error, /closed/);
});

test('orders only while the window is open, at the prices on screen; buy, sell and short', async () => {
  const { call, admin } = await server();
  const { state } = await admin('login');
  const t = (await call('join', { pin: state.pin, name: 'Bears' })).token;
  const order = (o) => call('order', { token: t, p: 0, ...o });
  assert.match((await order({ k: 0, side: 'B', type: 'MKT', qty: 10 })).error, /closed/);
  await admin('step', { kind: 'N', from: 1, to: 1 }); // news opens the window (auto timer)
  let r = await order({ k: 0, side: 'B', type: 'MKT', qty: 100 });
  assert.ok(r.ok, r.error);
  r = await order({ k: 1, side: 'S', type: 'MKT', qty: 50 }); // a short
  assert.ok(r.ok, r.error);
  assert.equal(r.me.book.holdings[1].qty, -50);
  r = await order({ k: 1, side: 'S', type: 'MKT', qty: 1000 });
  assert.match(r.error, /margin/);
  r = await order({ k: 0, side: 'S', type: 'LMT', qty: 100, limit: 105 }); // waits for a rise
  assert.equal(r.order.status, 'OPEN');
  assert.match((await call('order', { token: t, p: 1, k: 0, side: 'B', type: 'MKT', qty: 1 })).error, /moved/);
  // prices move: the window closes, the limit fills at 110, the short gains 10%
  await admin('step', { kind: 'P', from: 1, to: 1 });
  assert.match((await call('order', { token: t, p: 1, k: 0, side: 'B', type: 'MKT', qty: 1 })).error, /closed/);
  const me = (await call(`poll?token=${encodeURIComponent(t)}`)).me;
  assert.equal(me.book.holdings[0], undefined);
  assert.equal(me.book.orders.find((o) => o.type === 'LMT').fill, 11000);
  const cash = 100000 * 100 - 100 * 10000 + 50 * 20000 + 100 * 11000;
  assert.equal(me.book.cash, cash);
  const st = await admin('state', { withTeams: true });
  assert.equal(st.standings[0].value, cash - 50 * 18000);
  assert.equal(st.standings[0].shorts, 1);
});

test('the public sees only what has been released, and standings only as revealed', async () => {
  const { call, admin } = await server();
  const { state } = await admin('login');
  for (const n of ['One', 'Two', 'Three']) await call('join', { pin: state.pin, name: n });
  await admin('settings', { mode: 'round' });
  await admin('step', { kind: 'N', from: 1, to: 2 });
  await admin('step', { kind: 'P', from: 1, to: 1 });
  const pub = JSON.stringify(await call('poll')) + JSON.stringify(await call('news?from=0'));
  assert.ok(pub.includes('SECRET HEADLINE 2'));
  assert.ok(!pub.includes('SECRET HEADLINE 3'), 'no unreleased story');
  assert.ok(!pub.includes('secret reason'), 'no reasons ever');
  assert.equal((await call('poll')).state.moves.length, 1, 'only applied price moves');
  assert.match((await call('admin', { key: KEY, action: 'step', kind: 'P', from: 3, to: 3 })).error, /next price move is update 2/);
  assert.match((await call('admin', { key: KEY, action: 'step', kind: 'N', from: 5, to: 5 })).error, /update 3/);
  await admin('show', { show: 'leaders', reveal: 1 });
  const board = (await call('poll')).state.board;
  assert.equal(board.length, 3);
  assert.equal(board.filter((r) => r.hidden).length, 2);
  assert.ok(board[2].name && !board[0].name);
  assert.equal((await call('poll')).state.teams, 3, 'the public sees how many teams, not who');
});

test('news can be undone, price moves cannot; reset clears teams', async () => {
  const { call, admin } = await server();
  const { state } = await admin('login');
  await call('join', { pin: state.pin, name: 'Solo' });
  await admin('step', { kind: 'N', from: 1, to: 1 });
  await admin('undo');
  assert.equal((await call('poll')).state.a, 0);
  assert.equal((await call('news?from=0')).news.length, 0);
  await admin('step', { kind: 'N', from: 1, to: 1 });
  await admin('step', { kind: 'P', from: 1, to: 1 });
  assert.match((await admin('undo')).error, /Only a news release/);
  assert.match((await admin('reset')).error, /RESET/);
  await admin('reset', { confirm: 'RESET' });
  const s = (await call('poll')).state;
  assert.equal(s.a + s.p + s.teams, 0);
});

test('a newly sealed game replaces the old one at the next sign-in; team sign-ins survive', async () => {
  const { call, admin, store } = await server();
  const { state } = await admin('login');
  const j = await call('join', { pin: state.pin, name: 'Keeper' });
  const changed = structuredClone(GAME);
  changed.updates[0].head = 'A CHANGED HEADLINE';
  useSealed(await sealGame(changed, 'NEW0-KEY0-2345-6789', 1000));
  assert.match((await call('admin', { key: KEY, action: 'login' })).error, /wrong/, 'the old key no longer opens the new game');
  const r = await call('admin', { key: 'NEW0-KEY0-2345-6789', action: 'login' });
  assert.equal(r.game.updates[0].head, 'A CHANGED HEADLINE');
  assert.equal((await call(`poll?token=${encodeURIComponent(j.token)}`)).me.name, 'Keeper');
  assert.ok(store);
});

const secretKey = join(root, 'stockgame', 'secret', 'live-key.txt');
test('with the secret key: the deployed sealed game opens and matches the game data', { skip: !existsSync(secretKey) && 'no secret key here' }, async () => {
  const sealed = (await import('../stockgame/live/server/game-sealed.mjs')).default;
  const g = await openSealed(readFileSync(secretKey, 'utf8'), sealed);
  const src = JSON.parse(readFileSync(join(root, 'stockgame', 'secret', 'game.json'), 'utf8'));
  assert.equal(g.updates.length, 45);
  assert.deepEqual(g.updates.map((u) => u.moves), src.updates.map((u) => u.moves));
  assert.equal(await openSealed('NOT-THE-KEY', sealed), null);
});
