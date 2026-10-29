// The Netlify storage path, for real: Netlify's own Blobs client library talking to Netlify's
// reference Blobs server (the one Netlify's tools run locally), through server/storage-blobs.mjs.
// The in-memory store used by the other tests cannot prove this part.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BlobsServer } from '@netlify/blobs/server';
import { blobsStore } from '../server/storage-blobs.mjs';
import { handle, resetLimits } from '../server/api.mjs';
import { seeded } from '../src/engine/rng.mjs';

// Netlify's reference server tags a record by its file's modified time. The clock behind that
// time moves in steps of a few milliseconds here, so two quick writes can get the same tag and
// the server cannot tell an old copy from a new one. Production storage does not work that way,
// so the test gives the reference server content-based tags, which keep races honest.
BlobsServer.generateETag = async (path) => {
  try { return `"${createHash('sha256').update(await readFile(path)).digest('hex')}"`; } catch { return ''; }
};

// It also checks the tag and writes the file as two separate steps, so two writes arriving at the
// same moment can both pass the check. Production storage applies a conditional write as one step
// (that is what the feature is for); the test makes the reference server take writes one at a
// time to behave the same way.
const realPut = BlobsServer.prototype.put;
let queue = Promise.resolve();
BlobsServer.prototype.put = function put(req) { const run = queue.then(() => realPut.call(this, req)); queue = run.catch(() => null); return run; };

let server; let dir; let store;
before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'artha-blobs-'));
  server = new BlobsServer({ directory: dir, token: 'test-token' });
  const { port } = await server.start();
  const url = `http://localhost:${port}`;
  globalThis.netlifyBlobsContext = Buffer.from(JSON.stringify({ edgeURL: url, uncachedEdgeURL: url, siteID: 'artha-test', token: 'test-token' })).toString('base64');
  store = blobsStore('artha-test');
});
after(async () => { await server.stop(); rmSync(dir, { recursive: true, force: true }); delete globalThis.netlifyBlobsContext; });

test('the storage adapter keeps the rules the game depends on', async () => {
  const k = `t/${Date.now()}`;
  assert.equal((await store.set(k, { a: 1 }, { onlyIfNew: true })).modified, true);
  assert.equal((await store.set(k, { a: 2 }, { onlyIfNew: true })).modified, false, 'create-only refuses an existing record');
  const m = await store.getMeta(k);
  assert.deepEqual(m.data, { a: 1 });
  assert.ok(m.etag, 'every read carries a version tag');
  assert.equal((await store.set(k, { a: 3 }, { onlyIfMatch: '"stale"' })).modified, false, 'a write from an out-of-date copy is refused');
  assert.equal((await store.set(k, { a: 4 }, { onlyIfMatch: m.etag })).modified, true);
  assert.equal((await store.set(k, { a: 5 }, { onlyIfMatch: m.etag })).modified, false, 'the same old tag cannot be used twice');
  assert.deepEqual(await store.get(k), { a: 4 });
  assert.ok((await store.list('t/')).includes(k));
  await store.del(k);
  assert.equal(await store.get(k), null);
});

// ---- the game, end to end, on Netlify storage ----
let clock = 1_800_000_000_000;
const rng = seeded('blobs');
async function api(method, path, body, token) {
  const headers = { 'content-type': 'application/json', 'x-forwarded-for': '10.1.1.1' };
  if (token) headers.authorization = `Bearer ${token}`;
  const r = await handle(new Request(`http://x/api/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined }), store, {}, { now: () => clock, rng });
  return { status: r.status, ...(await r.json()) };
}

test('on Netlify storage: the server check passes', async () => {
  resetLimits();
  const r = await api('GET', 'selftest');
  assert.equal(r.ok, true, JSON.stringify(r.steps));
});

test('on Netlify storage: two players play; racing clicks and a seat race are each applied once; the books balance', async () => {
  resetLimits();
  const a = await api('POST', 'auth/guest', { name: 'Ira' });
  const b = await api('POST', 'auth/guest', { name: 'Om' });
  const c = await api('POST', 'auth/guest', { name: 'Zia' });
  const q = await api('POST', 'quickplay', { stakes: '10-20', seats: 6 }, a.token);
  // two players race for seat 2: one wins, the other is refunded
  const [ra, rc] = await Promise.all([api('POST', 'room/sit', { id: q.id, seat: 2, buyIn: 2000 }, a.token), api('POST', 'room/sit', { id: q.id, seat: 2, buyIn: 2000 }, c.token)]);
  assert.equal([ra, rc].filter((x) => x.ok).length, 1, 'one seat, one winner');
  const loser = ra.ok ? c : a; const winner = ra.ok ? a : c;
  assert.equal((await api('GET', 'me', null, loser.token)).me.bankroll, 10000, 'the loser is refunded');
  assert.ok((await api('POST', 'room/sit', { id: q.id, seat: 4, buyIn: 2000 }, b.token)).ok);
  clock += 2000;
  let view = (await api('GET', `room?id=${q.id}`, null, winner.token)).view;
  assert.ok(view.tables[0].hand, 'a hand started');
  // play some hands; at one point twenty identical clicks arrive at once
  let raced = false;
  for (let k = 0; k < 40; k++) {
    for (const t of [winner.token, b.token]) {
      const v = (await api('GET', `room?id=${q.id}`, null, t)).view;
      const hd = v.tables[0].hand;
      if (!hd?.legal) continue;
      const type = hd.legal.canCheck ? 'check' : 'call';
      if (!raced) {
        const rs = await Promise.all(Array.from({ length: 20 }, () => api('POST', 'room/act', { id: q.id, handId: hd.id, seq: hd.seq, type }, t)));
        assert.equal(rs.filter((x) => x.ok).length, 1, 'twenty identical clicks: applied once');
        raced = true;
      } else await api('POST', 'room/act', { id: q.id, handId: hd.id, seq: hd.seq, type }, t);
    }
    clock += 2500;
  }
  assert.ok(raced);
  const room = await store.get(`room/${q.id}`);
  assert.ok(room.tables[0].handNo >= 2, `hands played: ${room.tables[0].handNo}`);
  // both leave; chips go back; the audit balances
  for (const t of [winner.token, b.token]) assert.ok((await api('POST', 'room/leave', { id: q.id }, t)).ok);
  for (let k = 0; k < 6; k++) { clock += 7000; await api('GET', `room?id=${q.id}`, null, winner.token); }
  const m1 = (await api('GET', 'me', null, winner.token)).me; const m2 = (await api('GET', 'me', null, b.token)).me;
  assert.equal(m1.bankroll + m2.bankroll, 20000, 'every chip is back in the two accounts');
  await api('POST', 'host/setup', { password: 'event-head-pass' });
  const ht = (await api('POST', 'host/login', { password: 'event-head-pass' })).token;
  const audit = await api('GET', 'host/audit', null, ht);
  assert.ok(audit.summary.accountsBalanced && audit.summary.tablesBalanced && audit.summary.buyInsMatch && audit.summary.cashOutsMatch, JSON.stringify(audit.summary));
  // the stepwise reset finishes and keeps the accounts' chips
  let more = true; let guard = 0;
  while (more && guard++ < 20) { const r = await api('POST', 'host/reset', { confirm: 'RESET', keepAccounts: true }, ht); assert.ok(r.ok, r.error); more = r.more; }
  assert.equal((await api('GET', 'me', null, winner.token)).me.bankroll, m1.bankroll);
  assert.equal((await store.list('room/')).length, 0);
});
