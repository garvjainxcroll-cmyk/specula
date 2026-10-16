// The server's promises: the host creates the game and its teams, teams join with private
// codes and start with ₹10,00,000, trades are at the live price, host moves change every
// holder's money at once, loans pay out and come back with interest at the deadline,
// the session clock closes the market, and each team sees only its own account.
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
  const w = {
    store, get, post,
    tick: (ms) => { now += ms; },
    now: () => now,
    async host() {
      const r = await post('host/setup', { password: 'hostpass' });
      assert.ok(r.ok, r.error);
      return r.token;
    },
    /** Host + teams created; returns { h, teams: [{ id, name, code }] }. */
    async game(names = ['Alpha', 'Bravo', 'Charlie'], { start = true, secs = 0 } = {}) {
      const h = await w.host();
      const r = await post('host/teams', { names }, h);
      assert.ok(r.ok, r.error);
      if (start) assert.ok((await post('host/start', { secs }, h)).ok);
      return { h, teams: r.teams };
    },
    async join(code, name = 'Asha') {
      const r = await post('join', { code, name, phone: '+91 98765 43210' });
      assert.ok(r.ok, r.error);
      return r.token;
    },
  };
  return w;
}

test('creating the game: a name, the teams and a private code for each', async () => {
  const w = world();
  const h = await w.host();
  assert.ok((await w.post('host/game', { name: 'Bull Run 2026' }, h)).ok);
  const r = await w.post('host/teams', { names: ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'] }, h);
  assert.ok(r.ok, r.error);
  assert.equal(r.teams.length, 5);
  const codes = r.teams.map((t) => t.code);
  assert.equal(new Set(codes).size, 5, 'every code is different');
  for (const c of codes) assert.match(c, /^[A-HJ-NP-Z2-9]{6}$/, 'six letters and numbers, none easily confused');
  // a line keeps the team with that name; fewer lines remove the teams left out
  const r2 = await w.post('host/teams', { names: ['Alpha', 'Bravo', 'Charlie'] }, h);
  assert.deepEqual(r2.teams.map((t) => t.code), codes.slice(0, 3));
  // Rename keeps the code
  assert.ok((await w.post('host/team/rename', { id: r2.teams[0].id, name: 'Alpha Capital' }, h)).ok);
  assert.equal((await w.get('host/poll', h)).teams[0].code, codes[0]);
  assert.equal((await w.post('host/teams', { names: ['Same', 'same'] }, h)).ok, false, 'names must differ');
  assert.equal((await w.post('host/teams', { names: [] }, h)).ok, false);
  const hp = await w.get('host/poll', h);
  assert.equal(hp.game.name, 'Bull Run 2026');
  assert.equal(hp.game.phase, 'lobby');
  assert.equal(hp.teams.length, 3);
  assert.ok(hp.teams.every((t) => t.sum.liq === START_CASH), 'every team starts with ₹10,00,000');
  // the game cannot start without teams
  const w2 = world(); const h2 = await w2.host();
  assert.equal((await w2.post('host/start', {}, h2)).ok, false);
});

test('joining a team with its code; members share the team’s desk', async () => {
  const w = world();
  const { teams } = await w.game(['Alpha', 'Bravo'], { start: false });
  assert.equal((await w.post('join', { code: 'ZZZZZZ', name: 'Asha' })).ok, false, 'a wrong code is refused');
  assert.equal((await w.post('join', { code: teams[0].code, name: '' })).ok, false, 'a name is needed');
  const a = await w.join(teams[0].code.toLowerCase(), 'Asha'); // codes are not case-sensitive
  const b = await w.join(` ${teams[0].code} `, 'Ravi');
  const p = await w.get('poll', a);
  assert.equal(p.me.name, 'Alpha');
  assert.equal(p.me.cash, START_CASH);
  assert.equal(p.me.member.name, 'Asha');
  assert.deepEqual(p.me.members, ['Asha', 'Ravi']);
  assert.equal(p.game.phase, 'lobby');
  // joining again with the same name is the same member
  await w.join(teams[0].code, 'asha');
  assert.equal((await w.get('poll', b)).me.members.length, 2);
  assert.equal((await w.get('poll')).status, 401);
});

test('the lobby: orders wait until the host starts the game', async () => {
  const w = world();
  const { h, teams } = await w.game(['Alpha'], { start: false });
  const a = await w.join(teams[0].code);
  const p1 = (await w.get('market')).mk.p;
  w.tick(60000);
  assert.deepEqual((await w.get('market')).mk.p, p1, 'prices are paused in the lobby');
  const r = await w.post('trade', { t: 'AURI', side: 'buy', q: 1 }, a);
  assert.equal(r.ok, false);
  assert.match(r.error, /not started/);
  assert.ok((await w.post('host/start', {}, h)).ok);
  assert.ok((await w.post('trade', { t: 'AURI', side: 'buy', q: 1 }, a)).ok);
  assert.equal((await w.post('host/start', {}, h)).ok, false, 'only once');
});

test('exactly the ten listed stocks, at their listed prices on average', async () => {
  const w = world();
  await w.game(['Alpha']);
  const m = (await w.get('market')).mk;
  assert.deepEqual(Object.keys(m.p), STOCKS.map((s) => s.t));
  const sums = Object.fromEntries(STOCKS.map((s) => [s.t, 0]));
  let n = 0;
  for (let k = 0; k < 3600; k += 2) {
    const p = (await w.get('market')).mk.p;
    for (const s of STOCKS) {
      sums[s.t] += p[s.t];
      assert.ok(Math.abs(p[s.t] / s.base - 1) < 0.05, `${s.t} stays within 5% without the host`);
      assert.equal(p[s.t] % 5, 0, 'prices move in steps of ₹0.05');
    }
    n++;
    w.tick(2000);
  }
  for (const s of STOCKS) assert.ok(Math.abs(sums[s.t] / n / s.base - 1) < 0.008, `${s.t} averages to its listed price`);
});

test('the session clock closes the market by itself; the host can add time or reopen', async () => {
  const w = world();
  const { h, teams } = await w.game(['Alpha'], { secs: 60 });
  const a = await w.join(teams[0].code);
  const g = (await w.get('poll', a)).game;
  assert.equal(g.endsAt, w.now() + 60000);
  assert.ok((await w.post('trade', { t: 'NEXO', side: 'buy', q: 10 }, a)).ok);
  w.tick(30000);
  assert.ok((await w.post('host/timer', { add: 60 }, h)).ok, 'add a minute');
  w.tick(60000);
  assert.equal((await w.get('market')).mk.open, true, 'still open after the extra minute was added');
  w.tick(31000);
  const p = await w.get('poll', a);
  assert.equal(p.mk.open, false, 'closed at the end of the session');
  assert.equal(p.game.endsAt, null);
  const frozen = p.mk.p;
  w.tick(20000);
  assert.deepEqual((await w.get('market')).mk.p, frozen, 'prices stand still while closed');
  assert.match((await w.post('trade', { t: 'NEXO', side: 'buy', q: 1 }, a)).error, /closed/);
  assert.ok((await w.post('host/market', { open: true, secs: 0 }, h)).ok, 'reopen with no time limit');
  assert.ok((await w.post('trade', { t: 'NEXO', side: 'buy', q: 1 }, a)).ok);
  assert.ok((await w.post('host/market', { open: false }, h)).ok);
  assert.equal((await w.get('market')).mk.open, false);
});

test('buying and selling at the live price; no overspending or overselling', async () => {
  const w = world();
  const { teams } = await w.game(['Alpha']);
  const a = await w.join(teams[0].code, 'Asha');
  const r2 = await w.join(teams[0].code, 'Ravi');
  const b = await w.post('trade', { t: 'NEXO', side: 'buy', q: 100 }, a);
  assert.ok(b.ok, b.error);
  assert.equal(b.fill.p, b.mk.p.NEXO);
  assert.equal(b.fill.by, 'Asha');
  assert.equal(b.me.cash, START_CASH - 100 * b.fill.p);
  assert.deepEqual(b.me.h, [{ t: 'NEXO', q: 100, cost: 100 * b.fill.p }]);
  assert.equal(b.me.sum.liq, START_CASH, 'buying does not change what the team is worth');
  // a team-mate sees the same holding and can sell it
  assert.equal((await w.get('poll', r2)).me.h[0].q, 100);
  assert.equal((await w.post('trade', { t: 'NEXO', side: 'sell', q: 101 }, r2)).ok, false);
  assert.equal((await w.post('trade', { t: 'AURI', side: 'buy', q: 100000 }, a)).ok, false);
  assert.equal((await w.post('trade', { t: 'ZZZZ', side: 'buy', q: 1 }, a)).ok, false);
  assert.equal((await w.post('trade', { t: 'NEXO', side: 'buy', q: 1.5 }, a)).ok, false);
  w.tick(20000);
  const s = await w.post('trade', { t: 'NEXO', side: 'sell', q: 40 }, r2);
  assert.ok(s.ok, s.error);
  assert.equal(s.me.sum.rpl, 40 * (s.fill.p - b.fill.p));
  assert.equal(s.me.h[0].q, 60);
  assert.equal(s.me.cash, START_CASH - 100 * b.fill.p + 40 * s.fill.p);
});

test('a host dip takes money from every holding team at once; a rise adds it', async () => {
  const w = world();
  const { h, teams } = await w.game(['Alpha', 'Bravo']);
  const a = await w.join(teams[0].code);
  const c = await w.join(teams[1].code);
  await w.post('trade', { t: 'VANT', side: 'buy', q: 500 }, a);
  await w.post('trade', { t: 'VANT', side: 'buy', q: 200 }, c);
  const before = await w.get('poll', a);
  const pc0 = (await w.get('poll', c)).me.sum.liq;
  assert.ok((await w.post('host/move', { t: 'VANT', mode: 'pct', value: -10, secs: 0 }, h)).ok);
  const after = await w.get('poll', a);
  const pc1 = (await w.get('poll', c)).me.sum.liq;
  const drop = before.mk.p.VANT - after.mk.p.VANT;
  assert.ok(drop / before.mk.p.VANT > 0.09 && drop / before.mk.p.VANT < 0.11, 'about 10% lower');
  assert.equal(before.me.sum.liq - after.me.sum.liq, 500 * drop);
  assert.equal(pc0 - pc1, 200 * drop);
  await w.post('host/move', { t: 'VANT', mode: 'price', value: 700, secs: 60 }, h);
  w.tick(30000);
  const mid = (await w.get('market')).mk.p.VANT;
  assert.ok(mid > after.mk.p.VANT * 1.1 && mid < 70000 * 0.97, `part-way at 30 s (${mid})`);
  w.tick(30000);
  const end = await w.get('poll', a);
  assert.ok(Math.abs(end.mk.p.VANT / 70000 - 1) < 0.04);
  assert.ok(end.me.sum.pnl > 0);
  await w.post('host/move', { t: 'VANT', mode: 'base', secs: 0 }, h);
  assert.ok(Math.abs((await w.get('market')).mk.p.VANT / 58000 - 1) < 0.04);
});

test('teams never see the host’s moves, the seed, codes or another team’s account', async () => {
  const w = world();
  const { h, teams } = await w.game(['Alpha', 'Bravo']);
  const a = await w.join(teams[0].code, 'Asha');
  const c = await w.join(teams[1].code, 'Chirag');
  await w.post('trade', { t: 'HELX', side: 'buy', q: 77 }, c);
  await w.post('host/move', { t: 'HELX', mode: 'pct', value: 12, secs: 0 }, h);
  await w.post('host/update', { text: 'Results season begins.' }, h);
  const docs = [await w.get('poll', a), await w.get('poll?uv=-1', a), await w.get('me/history?r=1h', a)];
  const pub = [await w.get('history?t=all&r=1h'), await w.get('market'), await w.get('board?uv=-1')];
  for (const d of [...docs, ...pub]) {
    const txt = JSON.stringify(d);
    for (const bad of ['Chirag', '"lv"', 'moves', 'level', 'seed', 'secret', 'salt', 'hash', '+12%', 'label', teams[1].code, teams[0].code]) {
      assert.ok(!txt.includes(bad), `"${bad}" must not reach a team or the Big Screen`);
    }
  }
  for (const d of docs) assert.ok(!JSON.stringify(d).includes('Bravo'), 'a desk never names another team (without a loan)');
  const board = await w.get('board?uv=-1');
  assert.deepEqual(board.teams, [{ name: 'Alpha', members: 1 }, { name: 'Bravo', members: 1 }], 'the Big Screen shows team names and sign-ins only');
  assert.equal(board.standings, null, 'standings are sealed');
  assert.equal(board.updates[0].text, 'Results season begins.');
  for (const p of ['host/poll', `host/team?id=${teams[1].id}`]) assert.equal((await w.get(p, a)).status, 401);
  for (const p of ['host/move', 'host/loan', 'host/update', 'host/market', 'host/reset', 'host/teams', 'host/start', 'host/end', 'host/reveal']) assert.equal((await w.post(p, {}, a)).status, 401);
  const hp = await w.get('host/poll', h);
  assert.ok(hp.moves.some((m) => m.t === 'HELX' && m.label === '+12%'));
  assert.ok(hp.teams.find((t) => t.name === 'Bravo').h.some((x) => x.t === 'HELX' && x.q === 77));
  assert.equal(hp.teams.find((t) => t.name === 'Bravo').members[0].name, 'Chirag');
  assert.equal(hp.teams[0].code, teams[0].code, 'the host sees the codes');
});

test('loans between teams: money moves at once, and comes back with interest at the deadline', async () => {
  const w = world();
  const { h, teams } = await w.game(['Alpha', 'Bravo']);
  const a = await w.join(teams[0].code);
  const c = await w.join(teams[1].code);
  const r = await w.post('host/loan', { lender: teams[0].id, borrower: teams[1].id, amount: '2,00,000', rate: 10, mins: 30 }, h);
  assert.ok(r.ok, r.error);
  assert.equal(r.loan.final, 22000000);
  let pa = await w.get('poll', a); let pc = await w.get('poll', c);
  assert.equal(pa.me.cash, START_CASH - 20000000);
  assert.equal(pc.me.cash, START_CASH + 20000000);
  assert.equal(pa.me.loans[0].other, 'Bravo');
  assert.equal(pc.me.loans[0].other, 'Alpha');
  assert.equal(pa.me.sum.pnl, 0);
  w.tick(15 * 60000);
  pa = await w.get('poll', a); pc = await w.get('poll', c);
  assert.equal(pa.me.sum.pnl, 1000000, 'half the interest has built up');
  assert.equal(pc.me.sum.pnl, -1000000);
  w.tick(15 * 60000 + 1000);
  pa = await w.get('poll', a); pc = await w.get('poll', c);
  assert.equal(pa.me.cash, START_CASH + 2000000);
  assert.equal(pc.me.cash, START_CASH - 2000000);
  assert.equal(pa.me.loans[0].status, 'elapsed');
  assert.equal((await w.get('host/poll', h)).loans[0].mins, 30);
  assert.equal((await w.post('host/loan', { lender: teams[0].id, borrower: teams[0].id, amount: 100, rate: 1, mins: 5 }, h)).ok, false);
  assert.equal((await w.post('host/loan', { lender: teams[0].id, borrower: teams[1].id, amount: 1e9, rate: 1, mins: 5 }, h)).ok, false);
  // renaming a team renames it in its loans
  await w.post('host/team/rename', { id: teams[1].id, name: 'Bravo Partners' }, h);
  assert.equal((await w.get('poll', a)).me.loans[0].other, 'Bravo Partners');
});

test('a borrower short of cash at the deadline has shares sold to repay', async () => {
  const w = world();
  const { h, teams } = await w.game(['Alpha', 'Bravo']);
  const a = await w.join(teams[0].code);
  const c = await w.join(teams[1].code);
  await w.post('host/loan', { lender: teams[0].id, borrower: teams[1].id, amount: 500000, rate: 20, mins: 2 }, h);
  const px = (await w.get('market')).mk.p.AURI;
  const q = Math.floor((START_CASH + 50000000) / px) - 2;
  assert.ok((await w.post('trade', { t: 'AURI', side: 'buy', q }, c)).ok);
  w.tick(2 * 60000 + 500);
  const pc = await w.get('poll', c);
  const L = pc.me.loans[0];
  assert.equal(L.status, 'elapsed');
  assert.ok(L.sold.length === 1 && L.sold[0][0] === 'AURI' && L.sold[0][1] > 0);
  assert.ok(pc.me.cash >= 0);
  assert.ok(pc.me.tr.some((t) => t.f === 1));
  assert.equal((await w.get('poll', a)).me.cash, START_CASH + 10000000);
});

test('cancelling a loan returns the money without interest', async () => {
  const w = world();
  const { h, teams } = await w.game(['Alpha', 'Bravo']);
  const a = await w.join(teams[0].code);
  const r = await w.post('host/loan', { lender: teams[0].id, borrower: teams[1].id, amount: 1000, rate: 50, mins: 60 }, h);
  assert.ok((await w.post('host/loan/cancel', { id: r.loan.id }, h)).ok);
  assert.equal((await w.get('poll', a)).me.cash, START_CASH);
  assert.equal((await w.get('poll', a)).me.loans[0].status, 'cancelled');
});

test('updates come in serial order and reach every team', async () => {
  const w = world();
  const { h, teams } = await w.game(['Alpha']);
  const a = await w.join(teams[0].code);
  for (const t of ['First news', 'Second news', 'Third news']) assert.ok((await w.post('host/update', { text: t }, h)).ok);
  let p = await w.get('poll?uv=-1', a);
  assert.deepEqual(p.updates.map((u) => [u.n, u.text]), [[1, 'First news'], [2, 'Second news'], [3, 'Third news']]);
  assert.equal((await w.get(`poll?uv=${p.uv}`, a)).updates, undefined);
  await w.post('host/update/delete', { id: p.updates[1].id }, h);
  p = await w.get('poll?uv=-1', a);
  assert.deepEqual(p.updates.map((u) => u.n), [1, 3]);
});

test('ending the game: orders stop, loans are repaid, and the results stay sealed until revealed', async () => {
  const w = world();
  const { h, teams } = await w.game(['Alpha', 'Bravo', 'Charlie']);
  const a = await w.join(teams[0].code);
  const b = await w.join(teams[1].code);
  await w.post('trade', { t: 'GRVT', side: 'buy', q: 5000 }, a);
  await w.post('trade', { t: 'TCOR', side: 'buy', q: 1000 }, b);
  await w.post('host/move', { t: 'GRVT', mode: 'pct', value: 20, secs: 0 }, h);
  await w.post('host/loan', { lender: teams[2].id, borrower: teams[1].id, amount: 100000, rate: 10, mins: 60 }, h);
  assert.equal((await w.post('host/reveal', {}, h)).ok, false, 'no reveal before the end');
  assert.ok((await w.post('host/end', {}, h)).ok);
  const pb = await w.get('poll', b);
  assert.equal(pb.game.phase, 'ended');
  assert.equal(pb.mk.open, false);
  assert.equal(pb.me.loans[0].status, 'elapsed', 'the open loan was repaid at the end');
  assert.match((await w.post('trade', { t: 'AURI', side: 'buy', q: 1 }, a)).error, /over/);
  assert.equal(pb.place, null, 'sealed');
  assert.equal((await w.get('board')).standings, null);
  assert.ok((await w.post('host/reveal', {}, h)).ok);
  const board = await w.get('board');
  assert.equal(board.standings.length, 3);
  assert.equal(board.standings[0].name, 'Alpha', 'GRVT +20% wins it');
  assert.equal(board.standings[0].rank, 1);
  assert.ok(board.standings.every((x, i) => i === 0 || x.rank >= board.standings[i - 1].rank), 'best first');
  assert.ok(board.standings.every((x) => !('id' in x)));
  assert.deepEqual((await w.get('poll', a)).place, { rank: 1, of: 3 });
  // the host can take the game back if it was ended by mistake
  assert.ok((await w.post('host/resume', {}, h)).ok);
  assert.equal((await w.get('board')).standings, null);
});

test('teams with the same net worth share a place', async () => {
  const w = world();
  const { h, teams } = await w.game(['Alpha', 'Bravo', 'Charlie']);
  const a = await w.join(teams[0].code);
  await w.post('trade', { t: 'GRVT', side: 'buy', q: 1000 }, a);
  await w.post('host/move', { t: 'GRVT', mode: 'pct', value: 10, secs: 0 }, h);
  await w.post('host/end', {}, h);
  await w.post('host/reveal', {}, h);
  const st = (await w.get('board')).standings;
  assert.deepEqual(st.map((x) => [x.name, x.rank]), [['Alpha', 1], ['Bravo', 2], ['Charlie', 2]]);
});

test('teams that have traded cannot be removed; others can', async () => {
  const w = world();
  const { h, teams } = await w.game(['Alpha', 'Bravo', 'Charlie']);
  const a = await w.join(teams[2].code);
  await w.post('trade', { t: 'MERB', side: 'buy', q: 5 }, a);
  assert.equal((await w.post('host/teams', { names: ['Alpha', 'Bravo'] }, h)).ok, false);
  assert.equal((await w.post('host/team/remove', { id: teams[2].id }, h)).ok, false);
  assert.ok((await w.post('host/team/remove', { id: teams[1].id }, h)).ok);
  assert.ok((await w.post('host/team/add', { name: 'Delta' }, h)).ok, 'teams can join late');
  assert.equal((await w.post('host/team/add', { name: 'delta' }, h)).ok, false);
  const hp = await w.get('host/poll', h);
  assert.deepEqual(hp.teams.map((t) => t.name), ['Alpha', 'Charlie', 'Delta']);
  // a new code for a leaked one: everyone signed in with the old code is signed out
  const nc = await w.post('host/team/code', { id: teams[2].id }, h);
  assert.notEqual(nc.code, teams[2].code);
  assert.equal((await w.get('poll', a)).status, 401, 'the old sign-in no longer works');
  assert.equal((await w.post('join', { code: teams[2].code, name: 'Spy' })).ok, false, 'the old code no longer works');
  const back = await w.join(nc.code);
  assert.equal((await w.get('poll', back)).me.name, 'Charlie', 'the team joins again with the new code');
});

test('many people trading at the same moment: no order is lost', async () => {
  const w = world();
  const { teams } = await w.game(['A', 'B', 'C', 'D', 'E', 'F']);
  const people = [];
  for (const t of teams) people.push(await w.join(t.code));
  const orders = [];
  for (const p of people) for (let k = 0; k < 5; k++) orders.push(w.post('trade', { t: 'MERB', side: 'buy', q: 3 }, p));
  const res = await Promise.all(orders);
  assert.ok(res.every((r) => r.ok), res.find((r) => !r.ok)?.error);
  for (const p of people) {
    const me = (await w.get('poll', p)).me;
    assert.equal(me.h[0].q, 15);
    assert.equal(me.cash, START_CASH - me.h[0].cost);
  }
});

test('the host password: first visit chooses it, then it is needed', async () => {
  const w = world();
  assert.equal((await w.get('host/status')).setup, false);
  const t = await w.host();
  assert.equal((await w.get('host/status')).setup, true);
  assert.equal((await w.post('host/setup', { password: 'another' })).ok, false);
  assert.equal((await w.post('host/login', { password: 'nope' })).ok, false);
  assert.ok((await w.post('host/login', { password: 'hostpass' })).token);
  const r = await w.post('host/password', { old: 'hostpass', password: 'newpass1' }, t);
  assert.ok(r.ok, r.error);
  assert.equal((await w.get('host/poll', t)).status, 401);
  assert.equal((await w.get('host/poll', r.token)).ok, true);
});

test('ten wrong host passwords lock the console for ten minutes, even when sent all at once', async () => {
  const w = world();
  await w.game(['Alpha']);
  const before = (await w.store.getMeta('state')).etag;
  const said = [];
  for (let i = 0; i < 11; i++) said.push((await w.post('host/login', { password: `guess${i}` })).error);
  assert.deepEqual(said.map((e) => (e.startsWith('Too many') ? 'L' : 'W')).join(''), 'WWWWWWWWWWL');
  assert.equal((await w.post('host/login', { password: 'hostpass' })).ok, false, 'locked even for the right password');
  assert.equal((await w.store.getMeta('state')).etag, before, 'wrong passwords never touch the game');
  w.tick(9 * 60000);
  assert.match((await w.post('host/login', { password: 'hostpass' })).error, /Try again in 1 minute\./, 'ten tries in any ten minutes');
  w.tick(60000 + 1);
  assert.ok((await w.post('host/login', { password: 'hostpass' })).ok, 'open again ten minutes after the first of them');
  // 200 guesses at the same moment, the right one last: only ten are ever checked
  const burst = await Promise.all([...Array(200).keys()].map((i) => w.post('host/login', { password: i === 199 ? 'hostpass' : `x${i}` })));
  assert.equal(burst.filter((r) => r.error === 'Wrong host password.').length, 10);
  assert.equal(burst[199].ok, false);
  assert.equal((await w.store.getMeta('state')).etag, before);
});

test('the lock counts each connection apart (an IPv6 /48 is one), and forgets tries after ten minutes', async () => {
  const store = memoryStore();
  let now = Date.UTC(2026, 9, 14, 9, 0, 0);
  const login = async (password, ip) => (await handle(new Request('http://x/api/host/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }),
  }), store, { now: () => now, ip })).json();
  await handle(new Request('http://x/api/host/setup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'hostpass' }) }), store, { now: () => now });
  for (let i = 0; i < 10; i++) await login(`guess${i}`, '10.0.0.66');
  assert.match((await login('hostpass', '10.0.0.66')).error, /Too many/, 'the guesser is locked out');
  assert.ok((await login('hostpass', '10.0.0.7')).ok, 'the host on another connection is not');
  for (let i = 0; i < 10; i++) await login(`v6${i}`, `2001:db8:1:${i}::1`);
  assert.match((await login('hostpass', '2001:db8:1:ffff::9')).error, /Too many/, 'new addresses in the same /48 share the count');
  // a table full of other connections never wipes a count: newcomers share one instead
  const full = { c: Object.fromEntries([...Array(2000).keys()].map((i) => [`k${i}`, [now]])), id: 'seed0000' };
  full.c.any = [now, now, now];
  await store.set('hostlock', full);
  assert.equal((await login('nope', '203.0.113.50')).error, 'Wrong host password.');
  const after = (await store.getMeta('hostlock')).data.c;
  assert.equal(after.any.length, 3, 'a live count is never dropped');
  assert.equal(after['*'].length, 1, 'the newcomer was counted in the shared count');
  // a record saved by the previous version does not break the sign-in
  await store.set('hostlock', { c: { old1: { t: [now], until: 0 }, old2: { t: [], until: now + 60000 } }, id: 'oldform0' });
  assert.ok((await login('hostpass', '10.0.0.9')).ok);
  // nine typos, then a quarter of an hour later more tries: the old ones no longer count
  for (let i = 0; i < 9; i++) await login(`typo${i}`, '10.0.0.8');
  now += 11 * 60000;
  for (let i = 0; i < 9; i++) assert.equal((await login(`typo${i}`, '10.0.0.8')).error, 'Wrong host password.');
  assert.ok((await login('hostpass', '10.0.0.8')).ok);
});

test('pressing Buy, Send or Post again after a lost answer is not a second order, loan or update', async () => {
  const w = world();
  const { h, teams } = await w.game(['Alpha', 'Bravo']);
  const a = await w.join(teams[0].code, 'Asha');
  const o1 = await w.post('trade', { t: 'NEXO', side: 'buy', q: 100, rid: 'press-0001' }, a);
  const o2 = await w.post('trade', { t: 'NEXO', side: 'buy', q: 100, rid: 'press-0001' }, a);
  assert.ok(o1.ok && o2.ok && o2.again && !o1.again);
  assert.equal(o2.me.h.find((x) => x.t === 'NEXO').q, 100, 'bought once');
  assert.ok((await w.post('trade', { t: 'NEXO', side: 'buy', q: 100, rid: 'press-0002' }, a)).me.h.find((x) => x.t === 'NEXO').q === 200, 'a new press is a new order');
  const L = { lender: teams[0].id, borrower: teams[1].id, amount: '1000', rate: 10, mins: 5, rid: 'loan-0001' };
  assert.equal((await w.post('host/loan', L, h)).loan.id, 'L1');
  assert.equal((await w.post('host/loan', L, h)).loan.id, 'L1');
  assert.equal((await w.get('host/poll', h)).loans.length, 1);
  const U = { text: 'Rates rise', rid: 'upd-00001' };
  await w.post('host/update', U, h); await w.post('host/update', U, h);
  assert.equal((await w.get('host/poll', h)).updates.length, 1);
});

test('moves made while closed line up from the opening bell; a gradual move changes only at whole seconds', async () => {
  const w = world();
  const { h } = await w.game(['Alpha']);
  w.tick(4321);
  const lv = async (t) => (await w.get('host/poll', h)).mk.lv[t];
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  await w.post('host/market', { open: false }, h);
  await w.post('host/move', { t: 'AURI', mode: 'pct', value: -10, secs: 0 }, h);
  await w.post('host/move', { t: 'AURI', mode: 'pct', value: 5, secs: 600 }, h);
  await w.post('host/move', { t: 'NEXO', mode: 'pct', value: 10, secs: 600 }, h);
  await w.post('host/move', { t: 'NEXO', mode: 'pct', value: 5, secs: 0 }, h);
  await w.post('host/market', { open: true }, h);
  w.tick(1);
  assert.ok(near(await lv('AURI'), 0.9), 'the crash happens at the bell');
  assert.ok(near(await lv('NEXO'), 1), 'the glide starts at the bell');
  w.tick(300000);
  assert.ok(Math.abs((await lv('AURI')) - 0.9225) < 1e-3 && Math.abs((await lv('NEXO')) - 1.05) < 1e-3, 'both glide');
  w.tick(301000);
  assert.ok(near(await lv('AURI'), 0.945) && near(await lv('NEXO'), 1.155), 'and the +5% comes after the glide');
  // two quick clicks add up even before the first is in effect
  await w.post('host/move', { t: 'HELX', mode: 'pct', value: 2, secs: 0 }, h);
  w.tick(300);
  await w.post('host/move', { t: 'HELX', mode: 'pct', value: 2, secs: 0 }, h);
  w.tick(1000);
  assert.ok(near(await lv('HELX'), 1.0404));
  // a gradual move: the price is the same all through each second
  await w.post('host/move', { t: 'GRVT', mode: 'pct', value: 10, secs: 60 }, h);
  w.tick(10000 - (w.now() % 1000));
  const seen = new Set(); for (let i = 0; i < 8; i++) { seen.add((await w.get('market')).mk.p.GRVT); w.tick(110); }
  assert.ok(seen.size <= 2, 'at most one change in 0.9 s');
});

test('a repeated press is recognised however many other orders came between; Leave this desk signs the person out', async () => {
  const w = world();
  const names = [...Array(12).keys()].map((i) => `T${i}`);
  const { h, teams } = await w.game(names);
  const a = await w.join(teams[0].code, 'Asha');
  const others = await Promise.all(teams.slice(1).map((t, i) => w.join(t.code, `P${i}`)));
  assert.ok((await w.post('trade', { t: 'NEXO', side: 'buy', q: 5, rid: 'mine-0001' }, a)).ok);
  for (let k = 0; k < 25; k++) for (const o of others) await w.post('trade', { t: 'MERB', side: 'buy', q: 1, rid: `o${k}-${o.slice(-6)}` }, o);
  const again = await w.post('trade', { t: 'NEXO', side: 'buy', q: 5, rid: 'mine-0001' }, a);
  assert.ok(again.again); assert.equal(again.me.h.find((x) => x.t === 'NEXO').q, 5);
  // leaving: signed out on the server, kept in the Dataset; the name is free for someone else
  assert.ok((await w.post('leave', {}, a)).ok);
  assert.equal((await w.get('poll', a)).status, 401);
  const m = (await w.get('host/poll', h)).teams[0].members;
  assert.deepEqual(m.map((x) => [x.name, x.why]), [['Asha', 'left']]);
  assert.equal((await w.get('board')).teams[0].members, 0);
  const r1 = await w.post('join', { code: teams[0].code, name: 'Rahul', phone: '9811111111' });
  const rid1 = (await w.get('host/poll', h)).teams[0].members.find((x) => x.name === 'Rahul').id;
  await w.post('host/member/remove', { team: teams[0].id, member: rid1 }, h);
  assert.ok((await w.post('join', { code: teams[0].code, name: 'Rahul', phone: '9822222222' })).ok, 'a different Rahul can join');
  assert.equal((await w.get('poll', r1.token)).status, 401);
  assert.equal((await w.get('host/poll', h)).teams[0].members.filter((x) => x.name === 'Rahul').length, 2);
});

test('two sign-ins with HOST_PASSWORD at the same moment both stay signed in', async () => {
  const store = memoryStore();
  const now = Date.UTC(2026, 9, 14, 9, 0, 0);
  const env = { now: () => now, HOST_PASSWORD: 'the-real-host' };
  const call = async (path, body, token) => (await handle(new Request(`http://x/api/${path}`, {
    method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(token ? { 'x-token': token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }), store, env)).json();
  const early = (await call('host/login', { password: 'the-real-host' })).token;
  const [x, y] = await Promise.all([call('host/login', { password: 'the-real-host' }), call('host/login', { password: 'the-real-host' })]);
  for (const t of [early, x.token, y.token]) assert.ok((await call('host/poll', null, t)).ok);
});

test('HOST_PASSWORD on the server replaces a password someone else chose, and signs them out', async () => {
  const store = memoryStore();
  const now = Date.UTC(2026, 9, 14, 9, 0, 0);
  const call = async (path, body, token, env) => (await handle(new Request(`http://x/api/${path}`, {
    method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(token ? { 'x-token': token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }), store, { now: () => now, ...env })).json();
  const theirs = (await call('host/setup', { password: 'grabbed' })).token;
  assert.ok((await call('host/poll', null, theirs)).ok);
  const env = { HOST_PASSWORD: 'the-real-host' };
  assert.equal((await call('host/poll', null, theirs, env)).ok, false, 'their session ends');
  assert.equal((await call('host/login', { password: 'grabbed' }, null, env)).ok, false);
  const mine = (await call('host/login', { password: 'the-real-host' }, null, env)).token;
  assert.ok((await call('host/poll', null, mine, env)).ok);
  // for good: with HOST_PASSWORD removed later, the grabbed password and its sessions do not come back
  assert.equal((await call('host/poll', null, theirs)).ok, false);
  assert.equal((await call('host/login', { password: 'grabbed' })).ok, false);
  assert.ok((await call('host/login', { password: 'the-real-host' })).ok);
});

test('a team’s value over time is rebuilt from its trades', async () => {
  const w = world();
  const { h, teams } = await w.game(['Alpha']);
  const a = await w.join(teams[0].code);
  w.tick(60000);
  await w.post('trade', { t: 'GRVT', side: 'buy', q: 4000 }, a);
  w.tick(120000);
  await w.post('host/move', { t: 'GRVT', mode: 'pct', value: 20, secs: 0 }, h);
  w.tick(5000);
  const hist = await w.get('me/history?r=1h', a);
  const p = await w.get('poll', a);
  assert.equal(hist.nw.at(-1), p.me.sum.nw);
  assert.equal(hist.nw[0], START_CASH);
});

test('starting again: a new game keeps the teams and codes; delete everything removes them', async () => {
  const w = world();
  const { h, teams } = await w.game(['Alpha', 'Bravo']);
  await w.post('host/game', { name: 'Round One' }, h);
  const a = await w.join(teams[0].code);
  await w.post('trade', { t: 'TCOR', side: 'buy', q: 10 }, a);
  assert.equal((await w.post('host/reset', { mode: 'keep', confirm: 'nope' }, h)).ok, false);
  const r = await w.post('host/reset', { mode: 'keep', confirm: 'RESET' }, h);
  assert.ok(r.ok, r.error);
  const p = await w.get('poll', a);
  assert.equal(p.me.cash, START_CASH);
  assert.deepEqual(p.me.h, []);
  assert.equal(p.game.phase, 'lobby');
  assert.equal(p.game.name, 'Round One');
  assert.equal(p.mk.open, false);
  const hp = await w.get('host/poll', r.token);
  assert.deepEqual(hp.teams.map((t) => t.code), teams.map((t) => t.code), 'same codes');
  const r2 = await w.post('host/reset', { mode: 'everything', confirm: 'RESET' }, r.token);
  assert.ok(r2.ok);
  assert.equal((await w.get('poll', a)).status, 401);
  const hp2 = await w.get('host/poll', r2.token);
  assert.equal(hp2.teams.length, 0);
  assert.equal(hp2.game.name, '');
});

test('a crafted stock name or range is refused and changes nothing', async () => {
  const w = world();
  const { teams } = await w.game(['Alpha']);
  const a = await w.join(teams[0].code);
  for (const t of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
    const r = await w.post('trade', { t, side: 'buy', q: 1 }, a);
    assert.equal(r.ok, false, `${t} refused`);
  }
  assert.equal((await w.get('poll', a)).me.cash, START_CASH);
  assert.equal([][0], undefined, 'nothing polluted');
  for (const p of ['history?r=__proto__', 'history?t=constructor', 'me/history?r=__proto__']) {
    const r = await w.get(p, a);
    assert.notEqual(r.status, 500, p);
  }
  assert.ok((await w.get('me/history?r=__proto__', a)).nw.every(Number.isFinite));
});

test('the team list keeps teams by name: a deleted line removes that team, a new line adds one, never moving a code', async () => {
  const w = world();
  const h = await w.host();
  const r = await w.post('host/teams', { names: ['A', 'B', 'C', 'D'] }, h);
  const code = Object.fromEntries(r.teams.map((t) => [t.name, t.code]));
  const d = await w.join(code.D, 'Dev');
  // B does not turn up: delete its line
  const r2 = await w.post('host/teams', { names: ['A', 'C', 'D'] }, h);
  assert.deepEqual(r2.teams.map((t) => [t.name, t.code]), [['A', code.A], ['C', code.C], ['D', code.D]]);
  assert.equal((await w.get('poll', d)).me.name, 'D', 'D’s member is still on D');
  // a changed line is a new team with a new code; the old one is removed
  const r3 = await w.post('host/teams', { names: ['A', 'Cee', 'D'] }, h);
  assert.equal(r3.teams[1].name, 'Cee'); assert.notEqual(r3.teams[1].code, code.C);
  assert.equal((await w.post('join', { code: code.C, name: 'Late' })).ok, false, 'C’s code no longer works');
  // only the capitals changed: the same team
  const r4 = await w.post('host/teams', { names: ['a', 'Cee', 'D'] }, h);
  assert.deepEqual(r4.teams.map((t) => t.code), r3.teams.map((t) => t.code));
  // inserting a line, moving lines, deleting one: every kept team keeps its code
  const r5 = await w.post('host/teams', { names: ['New', 'D', 'a'] }, h);
  assert.deepEqual(r5.teams.slice(1).map((t) => [t.name, t.code]), [['D', code.D], ['a', code.A]]);
  // a team with members signed in is never dropped by the list
  const r6 = await w.post('host/teams', { names: ['New', 'a'] }, h);
  assert.equal(r6.ok, false); assert.match(r6.error, /members signed in/);
  // after a new code nobody is signed in, so the team can go; its people stay in the Dataset
  assert.ok((await w.post('host/team/code', { id: r5.teams[1].id }, h)).ok);
  const hp = await w.get('host/poll', h);
  assert.equal(hp.teams[1].members[0].out > 0, true, 'Dev is listed as signed out');
  assert.equal((await w.get('board')).teams[1].members, 0, 'the Big Screen counts nobody');
  assert.ok((await w.post('host/teams', { names: ['New', 'a'] }, h)).ok);
  const hp2 = await w.get('host/poll', h);
  assert.deepEqual(hp2.gone.map((m) => [m.name, m.team]), [['Dev', 'D']]);
});

test('two people with the same name and different phones stay two people', async () => {
  const w = world();
  const { h, teams } = await w.game(['Alpha'], { start: false });
  assert.ok((await w.post('join', { code: teams[0].code, name: 'Priya', phone: '+91 90000 00001' })).ok);
  const r = await w.post('join', { code: teams[0].code, name: 'priya', phone: '+91 90000 00002' });
  assert.equal(r.ok, false);
  assert.match(r.error, /surname|initial/);
  assert.ok((await w.post('join', { code: teams[0].code, name: 'Priya', phone: '+91 90000 00001' })).ok, 'the same person can sign in again');
  assert.ok((await w.post('join', { code: teams[0].code, name: 'Priya', phone: '090000-00001' })).ok, 'however the number is written');
  const m = (await w.get('host/poll', h)).teams[0].members;
  assert.deepEqual(m.map((x) => [x.name, x.phone]), [['Priya', '+91 90000 00001']]);
  // the host can sign one member out
  const me = await w.join(teams[0].code, 'Spy');
  const spy = (await w.get('host/poll', h)).teams[0].members.find((x) => x.name === 'Spy');
  assert.ok((await w.post('host/member/remove', { team: teams[0].id, member: spy.id }, h)).ok);
  assert.equal((await w.get('poll', me)).status, 401);
  const kept = (await w.get('host/poll', h)).teams[0].members.find((x) => x.name === 'Spy');
  assert.equal(kept.why, 'host', 'still in the Dataset, marked signed out');
  const again = await w.join(teams[0].code, 'Spy');
  assert.equal((await w.get('poll', again)).ok, true, 'they can join again with the code');
  assert.equal((await w.get('poll', me)).status, 401, 'but the old sign-in stays ended');
});

test('after the end prices are final; while closed, a move happens at the opening bell', async () => {
  const w = world();
  const { h } = await w.game(['Alpha']);
  await w.post('host/market', { open: false }, h);
  const p0 = (await w.get('market')).mk.p.SKYF;
  const r = await w.post('host/move', { t: 'SKYF', mode: 'pct', value: -10, secs: 0 }, h);
  assert.ok(r.ok && r.move.atOpen);
  assert.equal((await w.get('market')).mk.p.SKYF, p0, 'paused prices stay paused');
  await w.post('host/market', { open: true }, h);
  w.tick(3000);
  assert.ok((await w.get('market')).mk.p.SKYF < p0 * 0.93, 'the move happened at the open');
  // while closed, percent moves add up: +10% twice is +21%, −50% then +100% is back to 1
  await w.post('host/market', { open: false }, h);
  for (const [t, v] of [['NEXO', 10], ['NEXO', 10], ['VANT', -50], ['VANT', 100]]) assert.ok((await w.post('host/move', { t, mode: 'pct', value: v, secs: 0 }, h)).ok);
  await w.post('host/market', { open: true }, h);
  w.tick(3000);
  const lv = (await w.get('host/poll', h)).mk.lv;
  assert.ok(Math.abs(lv.NEXO - 1.21) < 1e-9 && Math.abs(lv.VANT - 1) < 1e-9, `${lv.NEXO} ${lv.VANT}`);
  // an instant move queued while closed is complete the moment the market opens
  await w.post('host/market', { open: false }, h);
  await w.post('host/move', { t: 'TCOR', mode: 'pct', value: 20, secs: 0 }, h);
  await w.post('host/market', { open: true }, h);
  w.tick(250);
  assert.ok(Math.abs((await w.get('host/poll', h)).mk.lv.TCOR - 1.2) < 1e-9, 'no ramp to buy into');
  // a gradual move the market closed in the middle of: a −5% made while closed is −5% from where it stands
  await w.post('host/move', { t: 'HELX', mode: 'pct', value: 10, secs: 1800 }, h);
  w.tick(300000);
  await w.post('host/market', { open: false }, h);
  const mid = (await w.get('host/poll', h)).mk.lv.HELX;
  await w.post('host/move', { t: 'HELX', mode: 'pct', value: -5, secs: 0 }, h);
  await w.post('host/market', { open: true }, h);
  w.tick(1000);
  assert.ok(Math.abs((await w.get('host/poll', h)).mk.lv.HELX - mid * 0.95) < 1e-9);
  await w.post('host/end', {}, h);
  const r2 = await w.post('host/move', { t: 'SKYF', mode: 'pct', value: 50, secs: 0 }, h);
  assert.equal(r2.ok, false);
});

test('the game opens exactly at the listed prices', async () => {
  const w = world();
  const { h } = await w.game(['Alpha'], { start: false });
  const p = (await w.get('market')).mk;
  for (const s of STOCKS) assert.equal(p.p[s.t], s.base, `${s.t} opens at its listed price`);
  await w.post('host/start', {}, h);
  w.tick(300000);
  const later = (await w.get('market')).mk.p;
  assert.ok(STOCKS.some((s) => later[s.t] !== s.base), 'and then moves');
});

test('cancelling a spent loan sells shares to give it back; resets never reuse an updates version', async () => {
  const w = world();
  const { h, teams } = await w.game(['Alpha', 'Bravo']);
  const b = await w.join(teams[1].code);
  const L = await w.post('host/loan', { lender: teams[0].id, borrower: teams[1].id, amount: 500000, rate: 5, mins: 60 }, h);
  const px = (await w.get('market')).mk.p.AURI;
  await w.post('trade', { t: 'AURI', side: 'buy', q: Math.floor((START_CASH + 50000000) / px) }, b);
  await w.post('host/loan/cancel', { id: L.loan.id }, h);
  const pb = await w.get('poll', b);
  assert.ok(pb.me.cash >= 0, 'shares were sold, so cash is not below zero');
  assert.ok(pb.me.loans[0].sold.length > 0);
  await w.post('host/update', { text: 'one' }, h);
  const uv1 = (await w.get('poll', b)).uv;
  const r = await w.post('host/reset', { mode: 'keep', confirm: 'RESET' }, h);
  await w.post('host/update', { text: 'new game news' }, r.token);
  const p2 = await w.get(`poll?uv=${uv1}`, b);
  assert.notEqual(p2.uv, uv1);
  assert.deepEqual(p2.updates.map((u) => [u.n, u.text]), [[1, 'new game news']]);
});

test('a save whose reply was lost is not applied twice', async () => {
  const { memoryStore: ms } = await import('../server/storage-memory.mjs');
  const inner = ms();
  let lose = 0;
  const store = { ...inner, kind: 'memory', getMeta: (k) => inner.getMeta(k), del: (k) => inner.del(k),
    async set(k, d, o) { const r = await inner.set(k, d, o); if (lose > 0 && r.modified && d.teams?.some((t) => t.tr.length)) { lose--; throw new Error('reply lost'); } return r; } };
  let now = Date.UTC(2026, 9, 14, 9);
  const call = async (method, path, body, token) => (await handle(new Request(`http://x/api/${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { 'x-token': token } : {}) }, body: body ? JSON.stringify(body) : undefined }), store, { now: () => now })).json();
  const h = (await call('POST', 'host/setup', { password: 'hostpass' })).token;
  const t = (await call('POST', 'host/teams', { names: ['Alpha'] }, h)).teams[0];
  await call('POST', 'host/start', {}, h);
  const a = (await call('POST', 'join', { code: t.code, name: 'Asha' })).token;
  lose = 1;
  const r = await call('POST', 'trade', { t: 'NEXO', side: 'buy', q: 10 }, a);
  assert.ok(r.ok, r.error);
  assert.equal((await call('GET', 'poll', null, a)).me.h[0].q, 10, 'bought once, not twice');
});
