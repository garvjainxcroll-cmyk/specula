// The server's promises: ₹10,00,000 to start, trades at the live price, host moves change
// everyone's money at once, loans pay out and come back with interest at the deadline,
// and each investor sees only their own account.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../server/api.mjs';
import { memoryStore } from '../server/storage-memory.mjs';
import { STOCKS, START_CASH } from '../src/stocks.mjs';

function world() {
  const store = memoryStore();
  let now = Date.UTC(2026, 9, 14, 9, 0, 0);
  const env = { now: () => now };
  const call = async (method, path, body, token) => {
    const r = await handle(new Request(`http://x/api/${path}`, {
      method, headers: { 'content-type': 'application/json', ...(token ? { 'x-token': token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }), store, env);
    return { status: r.status, ...(await r.json()) };
  };
  const get = (p, t) => call('GET', p, null, t);
  const post = (p, b, t) => call('POST', p, b, t);
  return {
    store, get, post,
    tick: (ms) => { now += ms; },
    now: () => now,
    async host() {
      const r = await post('host/setup', { password: 'hostpass' });
      assert.ok(r.ok, r.error);
      return r.token;
    },
    async investor(name, email) {
      const r = await post('signup', { name, email, phone: '+91 98765 43210', org: 'St. Xavier’s', password: 'secret1' });
      assert.ok(r.ok, r.error);
      return { token: r.token, id: r.me.id };
    },
  };
}

test('sign up: ₹10,00,000 of paper money, own details only', async () => {
  const w = world();
  const a = await w.investor('Asha Rao', 'asha@example.com');
  const p = await w.get('poll', a.token);
  assert.equal(p.me.cash, START_CASH);
  assert.equal(p.me.sum.liq, START_CASH);
  assert.equal(p.me.sum.pnl, 0);
  assert.equal(p.me.name, 'Asha Rao');
  // the same email cannot sign up twice; the password signs in
  assert.equal((await w.post('signup', { name: 'X Y', email: 'ASHA@example.com', phone: '9876543210', password: 'secret1' })).ok, false);
  assert.equal((await w.post('login', { email: 'asha@example.com', password: 'wrong!!' })).ok, false);
  assert.ok((await w.post('login', { email: 'Asha@Example.com', password: 'secret1' })).token);
  // no token, no account
  assert.equal((await w.get('poll')).status, 401);
});

test('exactly the ten listed stocks, at their listed prices on average', async () => {
  const w = world();
  const h = await w.host();
  await w.post('host/market', { open: true }, h);
  const m = (await w.get('market')).mk;
  assert.deepEqual(Object.keys(m.p), STOCKS.map((s) => s.t));
  const sums = Object.fromEntries(STOCKS.map((s) => [s.t, 0]));
  let n = 0;
  for (let k = 0; k < 3600; k += 2) { // one hour, sampled every 2 s
    const p = (await w.get('market')).mk.p;
    for (const s of STOCKS) {
      sums[s.t] += p[s.t];
      assert.ok(Math.abs(p[s.t] / s.base - 1) < 0.05, `${s.t} stays within 5% without the host`);
      assert.equal(p[s.t] % 5, 0, 'prices move in steps of ₹0.05');
    }
    n++;
    w.tick(2000);
  }
  for (const s of STOCKS) assert.ok(Math.abs(sums[s.t] / n / s.base - 1) < 0.004, `${s.t} averages to its listed price`);
});

test('prices freeze while the market is closed, and orders are refused', async () => {
  const w = world();
  const h = await w.host();
  const a = await w.investor('Asha Rao', 'asha@example.com');
  const p1 = (await w.get('market')).mk.p;
  w.tick(60000);
  assert.deepEqual((await w.get('market')).mk.p, p1);
  const r = await w.post('trade', { t: 'AURI', side: 'buy', q: 1 }, a.token);
  assert.equal(r.ok, false);
  assert.match(r.error, /closed/);
  await w.post('host/market', { open: true }, h);
  w.tick(30000);
  assert.notDeepEqual((await w.get('market')).mk.p, p1);
});

test('buying and selling at the live price; no overspending or overselling', async () => {
  const w = world();
  const h = await w.host();
  const a = await w.investor('Asha Rao', 'asha@example.com');
  await w.post('host/market', { open: true }, h);
  const b = await w.post('trade', { t: 'NEXO', side: 'buy', q: 100 }, a.token);
  assert.ok(b.ok, b.error);
  assert.equal(b.fill.p, b.mk.p.NEXO);
  assert.equal(b.me.cash, START_CASH - 100 * b.fill.p);
  assert.deepEqual(b.me.h, [{ t: 'NEXO', q: 100, cost: 100 * b.fill.p }]);
  assert.equal(b.me.sum.liq, START_CASH, 'buying does not change what you are worth');
  assert.equal((await w.post('trade', { t: 'NEXO', side: 'sell', q: 101 }, a.token)).ok, false);
  assert.equal((await w.post('trade', { t: 'AURI', side: 'buy', q: 100000 }, a.token)).ok, false);
  assert.equal((await w.post('trade', { t: 'ZZZZ', side: 'buy', q: 1 }, a.token)).ok, false);
  assert.equal((await w.post('trade', { t: 'NEXO', side: 'buy', q: 1.5 }, a.token)).ok, false);
  w.tick(20000);
  const s = await w.post('trade', { t: 'NEXO', side: 'sell', q: 40 }, a.token);
  assert.ok(s.ok, s.error);
  const realised = 40 * (s.fill.p - b.fill.p);
  assert.equal(s.me.sum.rpl, realised);
  assert.equal(s.me.h[0].q, 60);
  assert.equal(s.me.cash, START_CASH - 100 * b.fill.p + 40 * s.fill.p);
});

test('a host dip takes money from every holder at once; a rise adds it', async () => {
  const w = world();
  const h = await w.host();
  const a = await w.investor('Asha Rao', 'asha@example.com');
  const c = await w.investor('Chirag Shah', 'chirag@example.com');
  await w.post('host/market', { open: true }, h);
  await w.post('trade', { t: 'VANT', side: 'buy', q: 500 }, a.token);
  await w.post('trade', { t: 'VANT', side: 'buy', q: 200 }, c.token);
  const before = (await w.get('poll', a.token));
  const pc0 = (await w.get('poll', c.token)).me.sum.liq;
  const r = await w.post('host/move', { t: 'VANT', mode: 'pct', value: -10, secs: 0 }, h);
  assert.ok(r.ok, r.error);
  const after = await w.get('poll', a.token);
  const pc1 = (await w.get('poll', c.token)).me.sum.liq;
  const drop = before.mk.p.VANT - after.mk.p.VANT;
  assert.ok(drop / before.mk.p.VANT > 0.09 && drop / before.mk.p.VANT < 0.11, 'about 10% lower');
  assert.equal(before.me.sum.liq - after.me.sum.liq, 500 * drop, 'Asha loses exactly 500 × the fall');
  assert.equal(pc0 - pc1, 200 * drop, 'Chirag loses exactly 200 × the fall');
  // a rise over 60 seconds: half-way there after 30 s, all of it after 60 s
  await w.post('host/move', { t: 'VANT', mode: 'price', value: 700, secs: 60 }, h);
  w.tick(30000);
  const mid = (await w.get('market')).mk.p.VANT;
  assert.ok(mid > after.mk.p.VANT * 1.1 && mid < 70000 * 0.97, `part-way at 30 s (${mid})`);
  w.tick(30000);
  const end = (await w.get('poll', a.token));
  assert.ok(Math.abs(end.mk.p.VANT / 70000 - 1) < 0.04, 'settles around the target price');
  assert.ok(end.me.sum.pnl > 0, 'Asha is now in profit');
  // back to the listed price
  await w.post('host/move', { t: 'VANT', mode: 'base', secs: 0 }, h);
  assert.ok(Math.abs((await w.get('market')).mk.p.VANT / 58000 - 1) < 0.04);
});

test('investors never see the host’s moves, levels, the seed or anyone else’s account', async () => {
  const w = world();
  const h = await w.host();
  const a = await w.investor('Asha Rao', 'asha@example.com');
  const c = await w.investor('Chirag Shah', 'chirag@example.com');
  await w.post('host/market', { open: true }, h);
  await w.post('trade', { t: 'HELX', side: 'buy', q: 77 }, c.token);
  await w.post('host/move', { t: 'HELX', mode: 'pct', value: 12, secs: 0 }, h);
  await w.post('host/update', { text: 'Results season begins.' }, h);
  const docs = [
    await w.get('poll', a.token), await w.get('poll?uv=-1', a.token), await w.get('me/history?r=1h', a.token),
    await w.get('history?t=all&r=1h'), await w.get('history?t=HELX&r=5m'), await w.get('market'),
  ];
  for (const d of docs) {
    const txt = JSON.stringify(d);
    for (const bad of ['chirag', 'Chirag', '"lv"', 'moves', 'level', 'seed', 'secret', 'salt', 'hash', '+12%', 'label']) {
      assert.ok(!txt.includes(bad), `"${bad}" must not reach an investor`);
    }
  }
  // host-only reads refuse an investor's token
  for (const p of ['host/poll', `host/user?id=${c.id}`]) assert.equal((await w.get(p, a.token)).status, 401);
  for (const p of ['host/move', 'host/loan', 'host/update', 'host/market', 'host/reset']) assert.equal((await w.post(p, {}, a.token)).status, 401);
  // the host sees everything
  const hp = await w.get('host/poll', h);
  assert.equal(hp.users.length, 2);
  assert.ok(hp.moves.some((m) => m.t === 'HELX' && m.label === '+12%'));
  assert.ok(hp.users.find((u) => u.name === 'Chirag Shah').h.some((x) => x.t === 'HELX' && x.q === 77));
});

test('loans: money moves at once, and comes back with interest at the deadline', async () => {
  const w = world();
  const h = await w.host();
  const a = await w.investor('Asha Rao', 'asha@example.com');
  const c = await w.investor('Chirag Shah', 'chirag@example.com');
  const r = await w.post('host/loan', { lender: a.id, borrower: c.id, amount: '2,00,000', rate: 10, mins: 30 }, h);
  assert.ok(r.ok, r.error);
  assert.equal(r.loan.amount, 20000000);
  assert.equal(r.loan.final, 22000000);
  let pa = await w.get('poll', a.token); let pc = await w.get('poll', c.token);
  assert.equal(pa.me.cash, START_CASH - 20000000);
  assert.equal(pc.me.cash, START_CASH + 20000000);
  assert.equal(pa.me.loans[0].other, 'Chirag Shah');
  assert.equal(pc.me.loans[0].other, 'Asha Rao');
  assert.equal(pa.me.loans[0].status, 'ongoing');
  assert.equal(pa.me.sum.pnl, 0, 'no interest has built up yet');
  w.tick(15 * 60000); // half-way: half the interest has built up
  pa = await w.get('poll', a.token); pc = await w.get('poll', c.token);
  assert.equal(pa.me.sum.pnl, 1000000);
  assert.equal(pc.me.sum.pnl, -1000000);
  w.tick(15 * 60000 + 1000); // past the deadline: repaid automatically
  pa = await w.get('poll', a.token); pc = await w.get('poll', c.token);
  assert.equal(pa.me.cash, START_CASH + 2000000, 'lender gets the loan + ₹20,000 interest');
  assert.equal(pc.me.cash, START_CASH - 2000000, 'borrower pays it');
  assert.equal(pa.me.loans[0].status, 'elapsed');
  assert.equal(pc.me.loans[0].status, 'elapsed');
  const hp = await w.get('host/poll', h);
  assert.equal(hp.loans[0].status, 'elapsed');
  assert.equal(hp.loans[0].mins, 30);
  // refusals
  assert.equal((await w.post('host/loan', { lender: a.id, borrower: a.id, amount: 100, rate: 1, mins: 5 }, h)).ok, false);
  assert.equal((await w.post('host/loan', { lender: a.id, borrower: c.id, amount: 1e9, rate: 1, mins: 5 }, h)).ok, false);
});

test('a borrower short of cash at the deadline has shares sold to repay', async () => {
  const w = world();
  const h = await w.host();
  const a = await w.investor('Asha Rao', 'asha@example.com');
  const c = await w.investor('Chirag Shah', 'chirag@example.com');
  await w.post('host/market', { open: true }, h);
  await w.post('host/loan', { lender: a.id, borrower: c.id, amount: 500000, rate: 20, mins: 2 }, h);
  // Chirag spends almost everything on AURI
  const px = (await w.get('market')).mk.p.AURI;
  const q = Math.floor((START_CASH + 50000000) / px) - 2;
  const b = await w.post('trade', { t: 'AURI', side: 'buy', q }, c.token);
  assert.ok(b.ok, b.error);
  w.tick(2 * 60000 + 500);
  const pc = await w.get('poll', c.token);
  const L = pc.me.loans[0];
  assert.equal(L.status, 'elapsed');
  assert.ok(L.sold.length === 1 && L.sold[0][0] === 'AURI' && L.sold[0][1] > 0, 'AURI was sold to cover it');
  assert.ok(pc.me.cash >= 0);
  assert.ok(pc.me.tr.some((t) => t.f === 1), 'the forced sale is in the trade list');
  const pa = await w.get('poll', a.token);
  assert.equal(pa.me.cash, START_CASH + 10000000, 'lender gets ₹6,00,000 back');
});

test('cancelling a loan returns the money without interest', async () => {
  const w = world();
  const h = await w.host();
  const a = await w.investor('Asha Rao', 'asha@example.com');
  const c = await w.investor('Chirag Shah', 'chirag@example.com');
  const r = await w.post('host/loan', { lender: a.id, borrower: c.id, amount: 1000, rate: 50, mins: 60 }, h);
  assert.ok((await w.post('host/loan/cancel', { id: r.loan.id }, h)).ok);
  assert.equal((await w.get('poll', a.token)).me.cash, START_CASH);
  assert.equal((await w.get('poll', c.token)).me.cash, START_CASH);
  assert.equal((await w.get('poll', a.token)).me.loans[0].status, 'cancelled');
});

test('updates come in serial order and reach every investor', async () => {
  const w = world();
  const h = await w.host();
  const a = await w.investor('Asha Rao', 'asha@example.com');
  for (const t of ['First news', 'Second news', 'Third news']) assert.ok((await w.post('host/update', { text: t }, h)).ok);
  let p = await w.get('poll?uv=-1', a.token);
  assert.deepEqual(p.updates.map((u) => [u.n, u.text]), [[1, 'First news'], [2, 'Second news'], [3, 'Third news']]);
  // not re-sent while nothing changed
  assert.equal((await w.get(`poll?uv=${p.uv}`, a.token)).updates, undefined);
  await w.post('host/update/delete', { id: p.updates[1].id }, h);
  p = await w.get('poll?uv=-1', a.token);
  assert.deepEqual(p.updates.map((u) => u.n), [1, 3]);
});

test('the host password: first visit chooses it, then it is needed', async () => {
  const w = world();
  assert.equal((await w.get('host/status')).setup, false);
  const t = await w.host();
  assert.equal((await w.get('host/status')).setup, true);
  assert.equal((await w.post('host/setup', { password: 'another' })).ok, false);
  assert.equal((await w.post('host/login', { password: 'nope' })).ok, false);
  assert.ok((await w.post('host/login', { password: 'hostpass' })).token);
  // changing it signs out the old sessions
  const r = await w.post('host/password', { old: 'hostpass', password: 'newpass1' }, t);
  assert.ok(r.ok, r.error);
  assert.equal((await w.get('host/poll', t)).status, 401);
  assert.equal((await w.get('host/poll', r.token)).ok, true);
});

test('portfolio history rebuilds the value over time', async () => {
  const w = world();
  const h = await w.host();
  const a = await w.investor('Asha Rao', 'asha@example.com');
  await w.post('host/market', { open: true }, h);
  w.tick(60000);
  await w.post('trade', { t: 'GRVT', side: 'buy', q: 4000 }, a.token);
  w.tick(120000);
  await w.post('host/move', { t: 'GRVT', mode: 'pct', value: 20, secs: 0 }, h);
  w.tick(5000);
  const hist = await w.get('me/history?r=1h', a.token);
  const p = await w.get('poll', a.token);
  assert.equal(hist.nw.at(-1), p.me.sum.nw, 'the last point is the value now');
  assert.equal(hist.nw[0], START_CASH, 'it starts at ₹10,00,000');
});

test('reset: a new game keeps accounts and gives everyone ₹10,00,000 again', async () => {
  const w = world();
  const h = await w.host();
  const a = await w.investor('Asha Rao', 'asha@example.com');
  await w.post('host/market', { open: true }, h);
  await w.post('trade', { t: 'TCOR', side: 'buy', q: 10 }, a.token);
  assert.equal((await w.post('host/reset', { mode: 'portfolios', confirm: 'nope' }, h)).ok, false);
  const r = await w.post('host/reset', { mode: 'portfolios', confirm: 'RESET' }, h);
  assert.ok(r.ok, r.error);
  const p = await w.get('poll', a.token);
  assert.equal(p.me.cash, START_CASH);
  assert.deepEqual(p.me.h, []);
  assert.equal(p.mk.open, false, 'the new game starts with the market closed');
  const r2 = await w.post('host/reset', { mode: 'everything', confirm: 'RESET' }, r.token);
  assert.ok(r2.ok);
  assert.equal((await w.get('poll', a.token)).status, 401);
  assert.equal((await w.get('host/poll', r2.token)).users.length, 0);
});

test('many people trading at the same moment: no order is lost', async () => {
  const w = world();
  const h = await w.host();
  await w.post('host/market', { open: true }, h);
  const people = [];
  for (let k = 0; k < 6; k++) people.push(await w.investor(`Person ${k}`, `p${k}@example.com`));
  const orders = [];
  for (const p of people) for (let k = 0; k < 5; k++) orders.push(w.post('trade', { t: 'MERB', side: 'buy', q: 3 }, p.token));
  const res = await Promise.all(orders);
  assert.ok(res.every((r) => r.ok), res.find((r) => !r.ok)?.error);
  for (const p of people) {
    const me = (await w.get('poll', p.token)).me;
    assert.equal(me.h[0].q, 15, 'all five orders landed');
    assert.equal(me.cash, START_CASH - me.h[0].cost);
  }
});
