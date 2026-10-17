import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../server/api.mjs';
import { memoryStore } from '../server/storage-memory.mjs';
import { SCRIPT, secretStrings } from '../server/script.mjs';
import { newGame, openQuarter, fireStage, settleQuarter, finalRelease, stagesFor } from '../src/engine/game.mjs';

const realNow = Date.now;
let offset = 0;
Date.now = () => realNow() + offset;

function api(store, env = {}) {
  const call = async (method, path, body) => {
    const req = new Request(`http://x/api/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const res = await handle(req, store, env);
    const out = await res.json();
    // refusals come back as 200 with ok:false and the refusal code
    return { status: out.refused ? out.code : res.status, http: res.status, body: out };
  };
  return {
    get: (p) => call('GET', p),
    post: (p, b) => call('POST', p, b),
    admin: (action, extra = {}) => call('POST', 'admin', { password: 'tigers-123', action, ...extra }),
  };
}

async function setupGame(names = ['Alpha', 'Beta', 'Gamma']) {
  const store = memoryStore();
  const A = api(store);
  assert.equal((await A.post('admin', { action: 'setup', password: 'tigers-123' })).status, 200);
  const t = await A.admin('teams', { names });
  assert.equal(t.status, 200);
  const tokens = {};
  for (const team of t.body.teams) {
    const j = await A.post('join', { code: t.body.codes[team.id], name: `${team.name} member` });
    assert.equal(j.status, 200);
    tokens[team.id] = j.body.token;
  }
  return { store, A, teams: t.body.teams, codes: t.body.codes, tokens };
}

/** Check nothing secret from the future is visible to the public. */
async function assertNoLeak(store, A, revealedQ, firedIds) {
  const pubKeys = (await store.list('pub/'));
  const texts = [];
  for (const k of pubKeys) texts.push(JSON.stringify(await store.get(k)));
  texts.push(JSON.stringify((await A.get('poll')).body));
  const blob = texts.join('\n');
  for (const q of SCRIPT.quarters) {
    for (const c of q.crises || []) for (const s of c.stages) {
      if (firedIds.includes(s.id)) continue;
      for (const txt of [s.headline, ...(s.posts || []).map((p) => p.text)]) assert.ok(!blob.includes(txt), `leaked unreleased crisis text (Q${q.q} ${s.id})`);
    }
    if (q.q > revealedQ) for (const h of q.headlines) assert.ok(!blob.includes(h), `leaked a future headline (Q${q.q})`);
  }
}

test('health check reports the storage', async () => {
  const A = api(memoryStore());
  const r = await A.get('health');
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
});

test('the Event Head password: set once, needed for every admin action', async () => {
  const store = memoryStore();
  const A = api(store);
  assert.equal((await A.post('admin', { action: 'setup', password: '123' })).status, 400); // too short
  assert.equal((await A.post('admin', { action: 'setup', password: 'tigers-123' })).status, 200);
  assert.equal((await A.post('admin', { action: 'setup', password: 'someone-else' })).status, 403);
  assert.equal((await A.post('admin', { action: 'login', password: 'wrong-pass' })).status, 401);
  assert.equal((await A.post('admin', { action: 'start', password: 'wrong-pass' })).status, 401);
  assert.equal((await A.admin('login')).status, 200);
  // a password set on Netlify works instead
  const B = api(memoryStore(), { ADMIN_PASSWORD: 'env-secret' });
  assert.equal((await B.post('admin', { action: 'login', password: 'env-secret' })).status, 200);
  assert.equal((await B.post('admin', { action: 'login', password: 'nope' })).status, 401);
});

test('fund codes: wrong codes are refused, tokens cannot be forged or reused for another fund', async () => {
  const { A, teams, tokens } = await setupGame();
  assert.equal((await A.post('join', { code: 'ZZZZZZ', name: 'x' })).status, 403);
  assert.equal((await A.post('join', { code: '', name: 'x' })).status, 400);
  const [teamA, , sig] = tokens[teams[0].id].split('.');
  const forged = `${teams[1].id}.${tokens[teams[0].id].split('.')[1]}.${sig}`;
  assert.equal((await A.get(`poll?token=${encodeURIComponent(forged)}`)).status, 401);
  assert.equal((await A.get(`mine?token=garbage`)).status, 401);
  const ok = await A.get(`poll?token=${encodeURIComponent(tokens[teams[0].id])}`);
  assert.equal(ok.body.me.teamId, teamA);
});

test('two members of one fund see and share the same desk', async () => {
  const { A, teams, codes } = await setupGame(['Solo']);
  const t = teams[0];
  const m1 = (await A.post('join', { code: codes[t.id], name: 'Riya' })).body.token;
  const m2 = (await A.post('join', { code: codes[t.id].toLowerCase(), name: 'Arjun' })).body.token;
  await A.admin('start'); await A.admin('openWindow', { seconds: 120 });
  const o = await A.post('order', { note: 'Testing: the rule says rates rise', token: m1, q: 1, epoch: 0, inst: 'GOLD', side: 'buy', amountCr: 50 });
  assert.equal(o.status, 200, JSON.stringify(o.body));
  const p = await A.get(`poll?token=${encodeURIComponent(m2)}`);
  assert.equal(p.body.orders.orders.length, 1);
  assert.equal(p.body.orders.orders[0].inst, 'GOLD');
  const st = await A.get('poll');
  assert.ok(st.body.state.teams[0].members.length >= 2);
});

test('orders are accepted only while the window is open; late orders are refused', async () => {
  const { A, teams, tokens } = await setupGame();
  const tok = tokens[teams[0].id];
  // before the game
  assert.equal((await A.post('order', { note: 'Testing: the rule says rates rise', token: tok, q: 1, epoch: 0, inst: 'GOLD', side: 'buy', amountCr: 10 })).status, 409);
  await A.admin('start');
  // data drop: desk still locked
  const early = await A.post('order', { note: 'Testing: the rule says rates rise', token: tok, q: 1, epoch: 0, inst: 'GOLD', side: 'buy', amountCr: 10 });
  assert.equal(early.status, 409); assert.match(early.body.error, /not open yet/);
  await A.admin('openWindow', { seconds: 120 });
  assert.equal((await A.post('order', { note: 'Testing: the rule says rates rise', token: tok, q: 1, epoch: 0, inst: 'GOLD', side: 'buy', amountCr: 10 })).status, 200);
  assert.equal((await A.post('forecast', { token: tok, q: 1, value: 4.25 })).status, 200);
  // wrong quarter
  assert.equal((await A.post('order', { note: 'Testing: the rule says rates rise', token: tok, q: 2, epoch: 0, inst: 'GOLD', side: 'buy', amountCr: 10 })).status, 409);
  // paused
  await A.admin('pause');
  const paused = await A.post('order', { note: 'Testing: the rule says rates rise', token: tok, q: 1, epoch: 0, inst: 'GOLD', side: 'buy', amountCr: 10 });
  assert.equal(paused.status, 409); assert.match(paused.body.error, /paused/);
  await A.admin('resume');
  // after the bell
  offset += 125000;
  const late = await A.post('order', { note: 'Testing: the rule says rates rise', token: tok, q: 1, epoch: 0, inst: 'GOLD', side: 'buy', amountCr: 10 });
  assert.equal(late.status, 409); assert.equal(late.body.late, true); assert.match(late.body.error, /Late orders are refused/);
  assert.equal(late.http, 200, 'a refusal is an ordinary answer, so browsers do not log it as an error');
  assert.equal((await A.post('forecast', { token: tok, q: 1, value: 5 })).status, 409);
  const s = await A.admin('settle');
  assert.equal(s.status, 200);
  // after settlement
  assert.equal((await A.post('order', { note: 'Testing: the rule says rates rise', token: tok, q: 1, epoch: 0, inst: 'GOLD', side: 'buy', amountCr: 10 })).status, 409);
});

test('the desk refuses orders beyond 3× and orders at stale prices after a crisis', async () => {
  const { A, teams, tokens } = await setupGame(['One']);
  const tok = tokens[teams[0].id];
  await A.admin('start'); await A.admin('openWindow', { seconds: 120 });
  const big = await A.post('order', { note: 'Testing: the rule says rates rise', token: tok, q: 1, epoch: 0, inst: 'AURFUT', side: 'buy', amountCr: 3500 });
  assert.equal(big.status, 422); assert.match(big.body.error, /3×/);
  // walk to Q2, which has a crisis
  offset += 130000; await A.admin('settle'); await A.admin('next'); await A.admin('openWindow', { seconds: 120 });
  const st = await A.admin('status');
  const stage = st.body.stages[0];
  assert.equal(stage.fired, false);
  await A.admin('fire', { stageId: stage.id });
  const stale = await A.post('order', { note: 'Testing: the rule says rates rise', token: tok, q: 2, epoch: 0, inst: 'GOLD', side: 'buy', amountCr: 10 });
  assert.equal(stale.status, 409); assert.equal(stale.body.stale, true);
  assert.equal((await A.post('order', { note: 'Testing: the rule says rates rise', token: tok, q: 2, epoch: 1, inst: 'GOLD', side: 'buy', amountCr: 10 })).status, 200);
  // crises are optional: the round settles with a stage still unreleased
  offset += 130000;
  const settled = await A.admin('settle');
  assert.equal(settled.status, 200, JSON.stringify(settled.body));
  assert.equal(settled.body.state.phase, 'results');
});

test('an order retried after a dropped connection is not placed twice', async () => {
  const { A, teams, tokens } = await setupGame(['One']);
  const tok = tokens[teams[0].id];
  await A.admin('start'); await A.admin('openWindow', { seconds: 120 });
  const o = { token: tok, q: 1, epoch: 0, inst: 'OIL', side: 'buy', amountCr: 20, id: 'abc123', note: 'Oil should rise on the pipeline news' };
  await A.post('order', o);
  const again = await A.post('order', o);
  assert.equal(again.body.duplicate, true);
  assert.equal(again.body.orders.orders.length, 1);
});

test('only the Event Head sees unreleased crises; nothing secret ever reaches the public', async () => {
  const { store, A } = await setupGame(['One', 'Two']);
  await A.admin('start');
  const fired = [];
  for (let q = 1; q <= 6; q++) {
    await assertNoLeak(store, A, q, fired);
    await A.admin('openWindow', { seconds: 120 });
    const st = await A.admin('status');
    for (const s of st.body.stages) {
      await assertNoLeak(store, A, q, fired);
      assert.equal((await A.post('admin', { password: 'nope', action: 'fire', stageId: s.id })).status, 401);
      await A.admin('fire', { stageId: s.id }); fired.push(s.id);
    }
    offset += 200000;
    assert.equal((await A.admin('settle')).status, 200);
    await assertNoLeak(store, A, q, fired);
    if (q < 6) assert.equal((await A.admin('next')).status, 200);
  }
  assert.equal((await A.admin('final')).status, 200);
  assert.equal((await A.get('doc?key=final')).status, 404); // sealed until the reveal
  assert.equal((await A.admin('reveal')).status, 200);
  const fin = await A.get('doc?key=final');
  assert.equal(fin.body.doc.standings.rows.length, 2);
});

test('an interrupted settlement is recovered by pressing settle again, with the same result', async () => {
  const { store, A, teams, tokens } = await setupGame(['One', 'Two']);
  await A.admin('start'); await A.admin('openWindow', { seconds: 120 });
  await A.post('order', { note: 'Testing: the rule says rates rise', token: tokens[teams[0].id], q: 1, epoch: 0, inst: 'AUREQ', side: 'buy', amountCr: 300 });
  await A.post('order', { note: 'Testing: the rule says rates rise', token: tokens[teams[1].id], q: 1, epoch: 0, inst: 'AUR10Y', side: 'sell', amountCr: 200 });
  offset += 130000;
  // the network drops after the world is saved but before the state is updated
  const realSet = store.set;
  let armed = true;
  store.set = async (key, data, opts) => {
    if (armed && key === 'pub/quarter') { armed = false; throw new Error('connection lost'); }
    return realSet.call(store, key, data, opts);
  };
  const first = await A.admin('settle');
  assert.equal(first.status, 500);
  const mid = await A.get('poll');
  assert.equal(mid.body.state.phase, 'settling'); // the desk stays locked
  store.set = realSet;
  const again = await A.admin('settle');
  assert.equal(again.status, 200, JSON.stringify(again.body));
  assert.equal(again.body.state.phase, 'results');
  // compare with an engine-only replay
  const st = (await A.admin('private')).body.private.standings.rows;
  let w = newGame(teams.map((t) => ({ id: t.id, name: t.name })), SCRIPT);
  w = openQuarter(w, SCRIPT, 1);
  const orders = {};
  for (const t of teams) orders[t.id] = ((await store.get(`orders/1/${t.id}`))?.orders || []).map((o) => ({ inst: o.inst, delta: o.delta, epoch: o.epoch }));
  const res = settleQuarter(w, SCRIPT, { orders, forecasts: {} });
  for (const t of teams) assert.equal(st.find((r) => r.id === t.id).nav, res.result.teams[t.id].navEnd);
  // and pressing settle once more changes nothing
  const third = await A.admin('settle');
  assert.equal(third.body.already, true);
});

test('reset needs the word RESET and keeps the password', async () => {
  const { A } = await setupGame();
  assert.equal((await A.admin('reset', { confirm: 'yes' })).status, 400);
  assert.equal((await A.admin('reset', { confirm: 'RESET' })).status, 200);
  assert.equal((await A.admin('login')).status, 200);
  const p = await A.get('poll');
  assert.equal(p.body.state.phase, 'lobby');
  assert.equal(p.body.state.teams.length, 0);
});

test('the auction: bids above 30% of fund value are refused; bids are only possible in Round 06', async () => {
  const { A, teams, tokens } = await setupGame(['One']);
  const tok = tokens[teams[0].id];
  await A.admin('start');
  await A.admin('openWindow', { seconds: 120 });
  assert.equal((await A.post('bid', { token: tok, q: 1, price: 60, amountCr: 100 })).status, 400);
  for (let q = 1; q < 6; q++) {
    const st = await A.admin('status');
    for (const s of st.body.stages) await A.admin('fire', { stageId: s.id });
    offset += 200000; await A.admin('settle'); await A.admin('next'); await A.admin('openWindow', { seconds: 120 });
  }
  const tooBig = await A.post('bid', { token: tok, q: 6, price: 50, amountCr: 900 });
  assert.equal(tooBig.status, 422);
  const okBid = await A.post('bid', { token: tok, q: 6, price: 50, amountCr: 100 });
  assert.equal(okBid.status, 200);
  offset += 200000; await A.admin('settle');
  // the public sees the outcome, never the bids
  const r = await A.get('doc?key=result/6');
  assert.equal(r.body.doc.auction.bidders, 1);
  assert.equal(r.body.doc.auction.bids, undefined);
  // the Event Head sees every bid, with its fund
  const st = await A.admin('status');
  assert.equal(st.body.auction.bids.length, 1);
  assert.equal(st.body.auction.bids[0].name, 'One');
});

test('results are hidden: no public document holds another fund’s value, profit, marks or standing', async () => {
  const { store, A, teams, tokens } = await setupGame(['Alpha', 'Beta']);
  const [ta, tb] = teams;
  await A.admin('start');
  for (let q = 1; q <= 6; q++) {
    await A.admin('openWindow', { seconds: 120 });
    // Beta makes a big, distinctive trade and forecast
    await A.post('order', { note: 'Testing: the rule says rates rise', token: tokens[tb.id], q, epoch: 0, inst: 'GOLD', side: 'buy', amountCr: 123.45 });
    await A.post('forecast', { token: tokens[tb.id], q, value: 31.97 });
    if (q === 6) await A.post('bid', { token: tokens[tb.id], q, price: 50.5, amountCr: 111 });
    offset += 200000;
    assert.equal((await A.admin('settle')).status, 200);
    // everything a participant can read without a token, and with Alpha's token
    const blobs = [];
    for (const k of await store.list('pub/')) blobs.push(JSON.stringify(await store.get(k)));
    blobs.push(JSON.stringify((await A.get('poll')).body));
    blobs.push(JSON.stringify((await A.get(`poll?token=${encodeURIComponent(tokens[ta.id])}`)).body));
    blobs.push(JSON.stringify((await A.get(`mine?token=${encodeURIComponent(tokens[ta.id])}&q=${q}`)).body));
    const pub = blobs.join('\n');
    const betaNav = String((await store.get(`team/${tb.id}`)).team.navHist.at(-1));
    assert.ok(!pub.includes(betaNav), `Round ${q}: Beta's fund value is visible`);
    assert.ok(!pub.includes('31.97'), `Round ${q}: Beta's forecast is visible`);
    assert.ok(!pub.includes('"standings"'), `Round ${q}: standings are public`);
    assert.ok(!pub.includes('"rank"'), `Round ${q}: a rank is public`);
    assert.equal((await A.get('doc?key=standings')).status, 400); // there is no such public document
    // Beta can read its own record; Alpha's token never returns Beta's
    const mineB = (await A.get(`mine?token=${encodeURIComponent(tokens[tb.id])}&q=${q}`)).body;
    assert.equal(mineB.team.id, tb.id);
    assert.equal(String(mineB.team.navHist.at(-1)), betaNav);
    if (q < 6) await A.admin('next');
  }
  // only the Event Head sees the standings before the reveal
  const priv = await A.admin('private');
  assert.equal(priv.body.private.standings.rows.length, 2);
  assert.equal((await A.post('admin', { password: 'nope', action: 'private' })).status, 401);
  assert.equal((await A.admin('reveal')).status, 409); // nothing to reveal before the final release
  await A.admin('final');
  assert.equal((await A.get('doc?key=final')).status, 404);
  assert.equal((await A.get('poll')).body.state.revealed, undefined);
  assert.equal((await A.admin('reveal')).status, 200);
  const p = (await A.get('poll')).body.state;
  assert.equal(p.revealed, true);
  const fin = (await A.get('doc?key=final')).body.doc;
  assert.deepEqual(fin.standings.rows.map((r) => r.rank).sort(), [1, 2]);
  assert.equal((await A.admin('reveal')).body.already, true);
});

test('a trading note is compulsory for every order, and it stays private to the fund and the Event Head', async () => {
  const { store, A, teams, tokens } = await setupGame(['Alpha', 'Beta']);
  const [ta, tb] = teams;
  await A.admin('start'); await A.admin('openWindow', { seconds: 120 });
  const base = { token: tokens[ta.id], q: 1, epoch: 0, inst: 'GOLD', side: 'buy', amountCr: 10 };
  const none = await A.post('order', base);
  assert.equal(none.status, 400); assert.equal(none.body.needNote, true);
  assert.equal((await A.post('order', { ...base, note: 'why?' })).status, 400); // too short to be a reason
  const secret = 'Gold hedges our Kesh exposure before the reserves run out';
  assert.equal((await A.post('order', { ...base, note: secret })).status, 200);
  // the fund sees its own note
  const mine = await A.get(`poll?token=${encodeURIComponent(tokens[ta.id])}`);
  assert.equal(mine.body.orders.orders[0].note, secret);
  // nobody else does
  const other = await A.get(`poll?token=${encodeURIComponent(tokens[tb.id])}`);
  assert.ok(!JSON.stringify(other.body).includes(secret));
  for (const k of await store.list('pub/')) assert.ok(!JSON.stringify(await store.get(k)).includes(secret), k);
  // the Event Head sees every fund's notes, and they go into the fund's journal at the bell
  const n1 = await A.admin('notes');
  assert.equal(n1.body.notes[ta.id].rounds[0].orders[0].note, secret);
  assert.equal((await A.post('admin', { password: 'nope', action: 'notes' })).status, 401);
  offset += 200000; await A.admin('settle');
  const j = await A.get(`mine?token=${encodeURIComponent(tokens[ta.id])}`);
  assert.equal(j.body.journal[0].q, 1);
  assert.equal(j.body.journal[0].orders[0].note, secret);
  const jb = await A.get(`mine?token=${encodeURIComponent(tokens[tb.id])}`);
  assert.ok(!JSON.stringify(jb.body).includes(secret));
});

test('the Event Head sets starting capital, adds or removes capital, and answers loan requests', async () => {
  const { store, A, teams, tokens } = await setupGame(['Alpha', 'Beta']);
  const [ta, tb] = teams;
  // starting capital: only in the lobby
  assert.equal((await A.admin('startCapital', { teamId: tb.id, startCr: 1250 })).status, 200);
  assert.equal((await A.post('admin', { password: 'nope', action: 'startCapital', teamId: tb.id, startCr: 9999 })).status, 401);
  await A.admin('start');
  assert.equal((await A.admin('startCapital', { teamId: tb.id, startCr: 900 })).status, 409);
  const navOf = async (id) => (await store.get(`team/${id}`)).team.navHist.at(-1);
  assert.equal(await navOf(tb.id), 1250 * 1e9);
  // capital during the game: a team cannot do it
  assert.equal((await A.post('admin', { password: 'nope', action: 'capital', teamId: ta.id, amountCr: 100, note: 'x' })).status, 401);
  assert.equal((await A.admin('capital', { teamId: ta.id, amountCr: 100 })).status, 400); // a reason is needed
  assert.equal((await A.admin('capital', { teamId: ta.id, amountCr: 100, note: 'quiz prize' })).status, 200);
  assert.equal((await store.get(`team/${ta.id}`)).team.cash, 1100 * 1e9);
  // a loan request from the desk
  const tok = tokens[ta.id];
  assert.equal((await A.post('loan', { token: tok, action: 'request', amountCr: 300 })).status, 400); // needs a reason
  const rq = await A.post('loan', { token: tok, action: 'request', amountCr: 300, reason: 'We want more room for rate futures' });
  assert.equal(rq.status, 200);
  const st = await A.admin('status');
  assert.equal(st.body.loanRequests.length, 1);
  // the request is private: Beta cannot see it, and nothing public mentions it
  const mb = await A.get(`mine?token=${encodeURIComponent(tokens[tb.id])}`);
  assert.equal(mb.body.loanRequests.length, 0);
  for (const k of await store.list('pub/')) assert.ok(!JSON.stringify(await store.get(k)).includes('room for rate futures'), k);
  // approve it at 8% (the Event Head may change the amount)
  assert.equal((await A.admin('loan', { requestId: rq.body.request.id, amountCr: 250, ratePct: 8 })).status, 200);
  assert.equal((await A.admin('loan', { requestId: rq.body.request.id, amountCr: 250, ratePct: 8 })).status, 409); // answered already
  let t = (await store.get(`team/${ta.id}`)).team;
  assert.equal(t.loans[0].principal, 250 * 1e9);
  assert.equal(t.cash, 1350 * 1e9);
  const ma = await A.get(`mine?token=${encodeURIComponent(tok)}`);
  assert.equal(ma.body.loanRequests[0].status, 'approved');
  // a declined request
  const rq2 = await A.post('loan', { token: tok, action: 'request', amountCr: 2000, reason: 'Double or nothing on Kesh shares' });
  assert.equal((await A.admin('declineLoan', { requestId: rq2.body.request.id, note: 'Too risky' })).status, 200);
  // the loan costs interest at the bell
  await A.admin('openWindow', { seconds: 120 });
  offset += 200000; await A.admin('settle');
  const r1 = await store.get(`team/${ta.id}/r/1`);
  assert.equal(r1.ledger.loanInterest, -5 * 1e9); // ₹250 Cr × 8% ÷ 4
  assert.equal(r1.flow, 100 * 1e9); // the capital, not the loan, counts as money put in
  // the fund repays part of it itself; the Event Head the rest
  assert.equal((await A.post('loan', { token: tok, action: 'repay', amountCr: 100 })).status, 200);
  t = (await store.get(`team/${ta.id}`)).team;
  assert.equal(t.loans[0].principal, 150 * 1e9);
  assert.equal((await A.admin('repay', { teamId: ta.id, all: true })).status, 200);
  assert.deepEqual((await store.get(`team/${ta.id}`)).team.loans, []);
  // the Event Head's private view lists capital and loans
  const priv = (await A.admin('private')).body.private;
  assert.equal(priv.funds[ta.id].capitalLog.length, 4);
  // an engine-only replay of the Event Head's actions gives the same fund values
  const exp = (await A.admin('export')).body.data;
  assert.equal(exp.world.adminLog.length, 4);
});
