// The server: sign-in, accounts, permissions by role, confidentiality of hidden values and
// of sign-in data, and safe handling of simultaneous changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { server, PW, L, unzip } from './helpers.mjs';

test('first sign-in needs the setup code and a strong password', async () => {
  const h = server();
  assert.equal((await h.call('GET', 'setup')).json.setupCodeRequired, true);
  assert.equal((await h.call('POST', 'setup', { body: { setupCode: 'wrong', username: 'head', password: PW } })).json.code, 'SETUP_CODE');
  assert.equal((await h.call('POST', 'setup', { body: { setupCode: h.env.SETUP_CODE, username: 'head', password: 'short1' } })).json.code, 'WEAK_PASSWORD');
  assert.equal((await h.call('POST', 'setup', { body: { setupCode: h.env.SETUP_CODE, username: 'head', password: 'onlyletterslong' } })).json.code, 'WEAK_PASSWORD');
  await h.setup();
  assert.equal((await h.call('GET', 'setup')).json.needsSetup, false);
});

test('five wrong passwords lock the account for ten minutes; a Super Administrator can unlock it', async () => {
  const h = server(); const tok = await h.setup();
  await h.addUser(tok, 'operator1', 'operator');
  for (let i = 0; i < 5; i++) assert.equal((await h.call('POST', 'login', { body: { username: 'operator1', password: 'Wrong-pass-1' } })).status, 401);
  const locked = await h.call('POST', 'login', { body: { username: 'operator1', password: PW } });
  assert.equal(locked.status, 429);
  assert.equal(locked.json.code, 'LOCKED');
  // the same answer whether or not the username exists
  const ghost = await h.call('POST', 'login', { body: { username: 'nobody', password: PW } });
  assert.equal(ghost.json.error, (await h.call('POST', 'login', { body: { username: 'head', password: 'Wrong-pass-1' } })).json.error);
  const id = (await h.call('GET', 'users', { token: tok })).json.users.find((u) => u.username === 'operator1').id;
  await h.call('POST', 'users', { token: tok, body: { op: 'unlock', id } });
  assert.ok(await h.login('operator1'));
});

test('changing a password or a role signs the person out everywhere', async () => {
  const h = server(); const tok = await h.setup();
  const op = await h.addUser(tok, 'operator1', 'operator');
  const r = await h.call('POST', 'me/password', { token: op, body: { current: PW, next: 'New-password-2027' } });
  assert.equal(r.json.ok, true);
  assert.equal((await h.call('GET', 'me', { token: op })).status, 401);
  const fresh = r.json.token;
  assert.equal((await h.call('GET', 'me', { token: fresh })).status, 200);
  const id = (await h.call('GET', 'users', { token: tok })).json.users.find((u) => u.username === 'operator1').id;
  await h.call('POST', 'users', { token: tok, body: { op: 'update', id, role: 'viewer' } });
  assert.equal((await h.call('GET', 'me', { token: fresh })).status, 401);
  const again = await h.login('operator1', 'New-password-2027');
  assert.equal((await h.call('GET', 'me', { token: again })).json.user.role, 'viewer');
  await h.call('POST', 'logout', { token: again, body: { everywhere: true } });
  assert.equal((await h.call('GET', 'me', { token: again })).status, 401);
});

test('there is always at least one active Super Administrator', async () => {
  const h = server(); const tok = await h.setup();
  const me = (await h.call('GET', 'me', { token: tok })).json.user;
  for (const body of [{ op: 'update', id: me.id, role: 'operator' }, { op: 'update', id: me.id, active: false }]) {
    assert.equal((await h.call('POST', 'users', { token: tok, body })).json.code, 'LAST_SUPER');
  }
  assert.equal((await h.call('POST', 'users', { token: tok, body: { op: 'delete', id: me.id } })).json.code, 'SELF');
});

test('what each role may do is decided by the server', async () => {
  const h = server(); const tok = await h.setup();
  const op = await h.addUser(tok, 'operator1', 'operator');
  const cfgOp = await h.addUser(tok, 'operator2', 'operator', ['config']);
  const viewer = await h.addUser(tok, 'officer1', 'viewer');
  const id = await h.session(tok, 'practice');
  const v = await h.view(tok, id);
  const period = v.doc.config.period;
  // configuration: Super Administrator, or an operator given the configuration grant (before the event goes live)
  assert.equal((await h.act(op, id, 'config.section', { section: 'period', value: period })).code, 'FORBIDDEN');
  assert.equal((await h.act(viewer, id, 'config.section', { section: 'period', value: period })).code, 'FORBIDDEN');
  assert.equal((await h.act(cfgOp, id, 'config.section', { section: 'period', value: period })).ok, true);
  assert.equal((await h.act(cfgOp, id, 'config.section', { section: 'ranking', value: v.doc.config.ranking })).code, 'FORBIDDEN'); // a formula setting needs the formula grant
  assert.equal((await h.act(cfgOp, id, 'config.section', { section: 'visibility', value: v.doc.config.visibility })).code, 'FORBIDDEN');
  // recording: operators yes, read-only officers no
  assert.equal((await h.act(op, id, 'auction.start', { employeeId: 'E01' })).ok, true);
  assert.equal((await h.act(viewer, id, 'auction.close', { employeeId: 'E01' })).code, 'FORBIDDEN');
  await h.must(op, id, 'auction.sell', { employeeId: 'E01', teamId: 'A', amount: L(20), confirm: true, ackBudget: true });
  // once live, configuration changes are Super Administrator scenario changes
  assert.equal((await h.act(cfgOp, id, 'config.section', { section: 'period', value: period })).code, 'LIVE_ROUND');
  // Super Administrator only
  for (const [type, payload] of [['round1.lock', { confirm: true }], ['auction.correct', { employeeId: 'E01', teamId: 'B', amount: L(1), reason: 'x', confirm: true }], ['audit.revert', { seq: 1, reason: 'x' }], ['session.rename', { name: 'x' }], ['rule.approve', { all: true }], ['config.formulasLock', { locked: true }]]) {
    assert.equal((await h.act(op, id, type, payload)).code, 'FORBIDDEN', type);
  }
  // read-only officers can read, export and see the audit log, but not download a full backup
  assert.equal((await h.call('GET', `session/${id}/audit`, { token: viewer })).status, 200);
  assert.equal((await h.exportFile(viewer, id, 'cvs', 'xlsx')).status, 200);
  assert.equal(JSON.parse((await h.exportFile(viewer, id, 'backup', 'json')).bytes.toString()).code, 'FORBIDDEN');
  assert.equal((await h.call('POST', 'sessions', { token: op, body: { op: 'create', mode: 'practice', name: 'x' } })).status, 403);
});

test('formula settings cannot change while the formulas are locked', async () => {
  const h = server(); const tok = await h.setup();
  const id = await h.session(tok, 'practice');
  const v = await h.view(tok, id);
  await h.must(tok, id, 'config.formulasLock', { locked: true });
  assert.equal((await h.act(tok, id, 'config.section', { section: 'ranking', value: v.doc.config.ranking })).code, 'FORMULAS_LOCKED');
  assert.equal((await h.act(tok, id, 'config.formulasLock', { locked: false })).code, 'REASON_REQUIRED');
  await h.must(tok, id, 'config.formulasLock', { locked: false, reason: 'Adjusting the weights before the event' });
  await h.must(tok, id, 'config.section', { section: 'ranking', value: { ...v.doc.config.ranking, weights: { financial: 55, deployment: 25, compliance: 15, budget: 5 } } });
  assert.equal((await h.act(tok, id, 'config.section', { section: 'ranking', value: { ...v.doc.config.ranking, weights: { financial: 50, deployment: 25, compliance: 15, budget: 5 } } })).ok, false); // must total 100
});

test('hidden regional values never reach operators, their exports or their audit view', async () => {
  const h = server(); const tok = await h.setup();
  const op = await h.addUser(tok, 'operator1', 'operator');
  const cfgOp = await h.addUser(tok, 'operator2', 'operator', ['config']);
  const id = await h.session(tok, 'practice');
  const v0 = await h.view(tok, id);
  const city = v0.doc.cities.find((c) => c.id === 'AST-AUR');
  await h.must(tok, id, 'city.update', { id: city.id, patch: { baseRevenueOpportunity: city.baseRevenueOpportunity + L(1) } });
  await h.must(tok, id, 'config.section', { section: 'visibility', value: { operators: { revenue: false, tax: false }, reports: {}, hiddenRegions: ['CAL'] } });
  const secret = city.baseRevenueOpportunity + L(1);
  const vs = await h.view(tok, id);
  assert.equal(vs.doc.cities.find((c) => c.id === city.id).baseRevenueOpportunity, secret); // the Super Administrator sees it
  const vo = await h.view(op, id);
  assert.ok(vo.doc.cities.every((c) => c.baseRevenueOpportunity === null));
  assert.ok(vo.doc.continents.every((c) => c.attrs.taxRate === null));
  assert.ok(Object.values(vo.results.regions).every((r) => r.attrs.taxRate === null && r.baseRevenueOpportunity === null));
  const cal = vo.doc.continents.find((c) => c.id === 'CAL');
  assert.ok(Object.values(cal.attrs).every((x) => x === null || typeof x !== 'number')); // a hidden region: everything
  // even an operator allowed to edit the configuration cannot save a region form (it would overwrite values they cannot see)
  assert.equal((await h.act(cfgOp, id, 'city.update', { id: city.id, patch: { name: city.name } })).code, 'CONFIDENTIAL');
  // nor read the old and new values in the audit log
  const log = (await h.audit(op, id)).entries;
  const e = log.find((x) => x.action === 'city.update');
  assert.ok(e.changes.every((c) => c.before === '•••' && c.after === '•••'));
  // nor in an export
  const files = unzip((await h.exportFile(op, id, 'config', 'xlsx')).bytes);
  const all = Object.values(files).map((b) => b.toString()).join('');
  assert.ok(!all.includes(String(secret / 100)));
  const superFiles = unzip((await h.exportFile(tok, id, 'config', 'xlsx')).bytes);
  assert.ok(Object.values(superFiles).map((b) => b.toString()).join('').includes(String(secret / 100)));
});

test('no export, backup or archive contains passwords, password hashes or signing keys', async () => {
  const h = server(); const tok = await h.setup();
  const id = await h.session(tok, 'practice');
  await h.must(tok, id, 'practice.loadSample', { stage: 'auction' });
  await h.must(tok, id, 'round1.lock', { confirm: true });
  await h.must(tok, id, 'practice.loadSample', { stage: 'round2' });
  await h.must(tok, id, 'calc.run');
  const users = await h.store.get('users');
  const sys = await h.store.get('system');
  const forbidden = [PW, users.list[0].hash, users.list[0].salt, sys.signingKey, h.env.TOKEN_SECRET, tok.split('.')[1]];
  const outputs = [];
  outputs.push((await h.exportFile(tok, id, 'backup', 'json')).bytes);
  outputs.push((await h.call('GET', `session/${id}/backup`, { token: tok, raw: true })).bytes);
  outputs.push((await h.exportFile(tok, id, 'config', 'json')).bytes);
  outputs.push((await h.exportFile(tok, id, 'audit', 'csv')).bytes);
  const arc = (await h.exportFile(tok, id, 'archive', 'zip', '&source=draft')).bytes;
  outputs.push(...Object.values(unzip(arc)));
  for (const k of ['allocation', 'compliance', 'deployments']) outputs.push(...Object.values(unzip((await h.exportFile(tok, id, k, 'xlsx')).bytes)));
  outputs.push(Buffer.from(JSON.stringify((await h.call('GET', 'users', { token: tok })).json)));
  outputs.push(Buffer.from(JSON.stringify(await h.view(tok, id))));
  for (const b of outputs) {
    const s = b.toString('latin1');
    for (const f of forbidden) assert.ok(!s.includes(f), 'a secret appeared in an output');
  }
});

test('simultaneous changes are all kept, each with its own audit entry', async () => {
  const h = server(); const tok = await h.setup();
  const op = await h.addUser(tok, 'operator1', 'operator');
  const id = await h.session(tok, 'practice');
  const rev0 = (await h.view(tok, id)).session.rev;
  const ids = ['E01', 'E02', 'E03', 'E04', 'E05', 'E06', 'E07', 'E08'];
  const out = await Promise.all(ids.map((e, i) => h.act(i % 2 ? tok : op, id, 'auction.note', { employeeId: e, notes: `note ${e}` })));
  assert.ok(out.every((j) => j.ok));
  const v = await h.view(tok, id);
  assert.equal(v.session.rev, rev0 + ids.length);
  for (const e of ids) assert.equal(v.doc.auction.records.find((r) => r.employeeId === e).notes, `note ${e}`);
  const log = (await h.audit(tok, id)).entries.filter((x) => x.action === 'auction.note');
  assert.equal(log.length, ids.length);
  // a stale screen cannot overwrite someone else's newer change
  await h.must(tok, id, 'auction.start', { employeeId: 'E09' });
  await h.must(tok, id, 'auction.sell', { employeeId: 'E09', teamId: 'A', amount: L(9), confirm: true, ackBudget: true });
  const cfgRev = (await h.view(tok, id)).doc.configRev || 0;
  await h.must(tok, id, 'config.section', { section: 'thresholds', value: { profitMarginWarnPct: 1, riskWarn: 60 }, reason: 'first', expectRev: cfgRev });
  assert.equal((await h.act(tok, id, 'config.section', { section: 'thresholds', value: { profitMarginWarnPct: 2, riskWarn: 60 }, reason: 'second', expectRev: cfgRev })).code, 'STALE');
});

test('a refused change leaves the session exactly as it was', async () => {
  const h = server(); const tok = await h.setup();
  const id = await h.session(tok, 'practice');
  const before = await h.store.get(`sessions/${id}/doc`);
  for (const [type, payload] of [['auction.sell', { employeeId: 'E01', teamId: 'Z', amount: L(1), confirm: true }], ['round1.lock', { confirm: true }], ['deploy.create', { teamId: 'A', employeeId: 'E01' }], ['nonsense.action', {}]]) {
    assert.equal((await h.act(tok, id, type, payload)).ok, false, type);
  }
  assert.deepEqual(await h.store.get(`sessions/${id}/doc`), before);
});

test('responses are never cached and unknown sessions are not found', async () => {
  const h = server(); const tok = await h.setup();
  const r = await h.call('GET', 'sessions', { token: tok });
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await h.call('GET', 'session/abcdef1234', { token: tok })).status, 404);
  assert.equal((await h.call('GET', 'session/../../users', { token: tok })).status, 404);
  assert.equal((await h.call('GET', 'health')).json.ok, true);
});
