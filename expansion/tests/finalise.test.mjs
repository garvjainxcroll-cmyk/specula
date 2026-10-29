// Finalisation, version history, backups, restore and reverting a draft edit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { server, officialEvent, readXlsx, L } from './helpers.mjs';

async function practiceToCalc(h, tok) {
  const id = await h.session(tok, 'practice');
  await h.must(tok, id, 'practice.loadSample', { stage: 'auction' });
  await h.must(tok, id, 'round1.lock', { confirm: true });
  await h.must(tok, id, 'practice.loadSample', { stage: 'round2' });
  return id;
}

test('Round 2 cannot be finalised while a blocking problem remains', async () => {
  const h = server(); const tok = await h.setup();
  const id = await practiceToCalc(h, tok);
  assert.equal((await h.act(tok, id, 'round2.finalise', {})).code, 'CONFIRM_REQUIRED');
  const j = await h.act(tok, id, 'round2.finalise', { confirm: true });
  assert.equal(j.code, 'VALIDATION');
  const codes = new Set(j.details.map((i) => i.code));
  for (const c of ['R2_NOT_APPROVED', 'R2_BLOCKED', 'R2_CALC']) assert.ok(codes.has(c), c);
  const v = await h.view(tok, id);
  assert.equal(v.doc.round2.status, 'open');
  assert.equal(v.doc.finals.length, 0);
});

test('finalising keeps a version; a correction makes a new version and keeps the old one', async () => {
  const h = server(); const tok = await h.setup();
  const id = await officialEvent(h, tok);
  let v = await h.view(tok, id);
  const v1 = v.doc.finals[0];
  assert.equal(v1.version, 1);
  assert.equal(v.doc.round2.status, 'finalised');
  // backups were taken automatically at the lock and at finalisation
  const reasons = (await h.call('GET', `session/${id}/backups`, { token: tok })).json.backups.map((b) => b.reason);
  assert.ok(reasons.includes('Round 1 locked'));
  assert.ok(reasons.includes('Round 2 finalised (version 1)'));
  // correct one salary
  await h.must(tok, id, 'round2.reopen', { reason: 'Team B salary was mistyped', confirm: true });
  v = await h.view(tok, id);
  const d = v.doc.deployments.find((x) => x.teamId === 'B');
  await h.must(tok, id, 'deploy.update', { id: d.id, patch: { salary: { amount: d.salary.amount + L(1), currency: 'base' } } });
  await h.must(tok, id, 'deploy.approve', { id: d.id });
  await h.must(tok, id, 'calc.run');
  await h.must(tok, id, 'round2.finalise', { confirm: true });
  v = await h.view(tok, id);
  assert.deepEqual(v.doc.finals.map((f) => f.version), [1, 2]);
  assert.equal(v.doc.finals[0].resultsHash, v1.resultsHash); // version 1 untouched
  assert.equal(v.doc.finals[0].reopened.reason, 'Team B salary was mistyped');
  assert.notEqual(v.doc.finals[1].resultsHash, v1.resultsHash);
  assert.ok(v.doc.finals[1].summary.teams.B.statement.totalCosts > v1.summary.teams.B.statement.totalCosts);
  assert.deepEqual(v.doc.finals[1].summary.teams.A.statement, v1.summary.teams.A.statement);
  // exports now carry version 2
  const x = readXlsx((await h.exportFile(tok, id, 'team', 'xlsx', '&team=B')).bytes)['Financial statement'];
  assert.match(x.A3.v, /OFFICIAL RESULT · version 2/);
});

test('an accidental draft edit can be reverted, once, with a reason', async () => {
  const h = server(); const tok = await h.setup();
  const id = await practiceToCalc(h, tok);
  let v = await h.view(tok, id);
  const d = v.doc.deployments[2];
  const j = await h.must(tok, id, 'deploy.update', { id: d.id, patch: { contractMonths: 4 } });
  const seq = j.lastEntry.seq;
  assert.equal((await h.act(tok, id, 'audit.revert', { seq })).code, 'REASON_REQUIRED');
  await h.must(tok, id, 'audit.revert', { seq, reason: 'Typed into the wrong row' });
  v = await h.view(tok, id);
  assert.equal(v.doc.deployments.find((x) => x.id === d.id).contractMonths, d.contractMonths);
  assert.equal((await h.act(tok, id, 'audit.revert', { seq, reason: 'again' })).code, 'NO_CHANGE');
  // a record changed again since cannot be silently rolled back over the newer change
  const j2 = await h.must(tok, id, 'deploy.update', { id: d.id, patch: { contractMonths: 5 } });
  await h.must(tok, id, 'deploy.update', { id: d.id, patch: { contractMonths: 6 } });
  assert.equal((await h.act(tok, id, 'audit.revert', { seq: j2.lastEntry.seq, reason: 'Undo the five-month edit' })).code, 'CHANGED_SINCE');
  // lock and finalisation entries are not "draft edits"
  const lockSeq = (await h.audit(tok, id)).entries.find((e) => e.action === 'round1.lock').seq;
  assert.equal((await h.act(tok, id, 'audit.revert', { seq: lockSeq, reason: 'x' })).code, 'NOT_REVERTIBLE');
});

test('a backup restores the session exactly, and the replaced state is kept too', async () => {
  const h = server(); const tok = await h.setup();
  const id = await practiceToCalc(h, tok);
  const mk = await h.call('POST', `session/${id}/backups`, { token: tok, body: { op: 'create', reason: 'Before lunch' } });
  const key = mk.json.key;
  const saved = await h.view(tok, id);
  const d = saved.doc.deployments[0];
  await h.must(tok, id, 'deploy.delete', { id: d.id });
  assert.equal((await h.call('POST', `session/${id}/backups`, { token: tok, body: { op: 'restore', key, confirmText: 'restore' } })).json.code, 'CONFIRM_REQUIRED');
  const r = await h.call('POST', `session/${id}/backups`, { token: tok, body: { op: 'restore', key, confirmText: 'RESTORE' } });
  assert.equal(r.json.ok, true);
  const back = await h.view(tok, id);
  assert.equal(back.results.inputHash, saved.results.inputHash);
  assert.ok(back.doc.deployments.some((x) => x.id === d.id));
  const list = (await h.call('GET', `session/${id}/backups`, { token: tok })).json.backups.map((b) => b.reason);
  assert.ok(list.includes('Before restoring a backup'));
  // the audit log survives the restore and records it
  assert.ok((await h.audit(tok, id)).entries.some((e) => e.action === 'backup.restore'));
  // an official backup cannot be uploaded into a practice session as if it were one
  const off = await h.session(tok, 'official');
  const offDoc = await h.store.get(`sessions/${off}/doc`);
  assert.equal((await h.call('POST', `session/${id}/backups`, { token: tok, body: { op: 'restore', doc: offDoc, confirmText: 'RESTORE' } })).json.code, 'MODE');
});

test('a downloaded backup can be loaded as a new practice session, never as the official one', async () => {
  const h = server(); const tok = await h.setup();
  const off = await officialEvent(h, tok);
  const file = JSON.parse((await h.call('GET', `session/${off}/backup`, { token: tok, raw: true })).bytes.toString());
  const r = await h.call('POST', 'sessions', { token: tok, body: { op: 'import', name: 'Replay of the event', doc: file } });
  assert.equal(r.json.ok, true);
  assert.equal(r.json.session.mode, 'practice');
  const v = await h.view(tok, r.json.session.id);
  assert.equal(v.doc.round2.status, 'open'); // finalised status is not carried over
  assert.equal(v.doc.finals.length, 0);
  assert.equal(v.doc.deployments.length, 20);
});

test('reset and delete need typed confirmation; the official session must be archived first', async () => {
  const h = server(); const tok = await h.setup();
  const off = await h.session(tok, 'official');
  assert.equal((await h.call('POST', 'sessions', { token: tok, body: { op: 'reset', id: off, confirmText: 'RESET' } })).json.code, 'CONFIRM_REQUIRED');
  assert.equal((await h.call('POST', 'sessions', { token: tok, body: { op: 'reset', id: off, confirmText: 'RESET OFFICIAL' } })).json.ok, true);
  assert.equal((await h.call('POST', 'sessions', { token: tok, body: { op: 'delete', id: off, confirmText: 'Official event' } })).json.code, 'ARCHIVE_FIRST');
  await h.call('POST', 'sessions', { token: tok, body: { op: 'archive', id: off, archived: true } });
  assert.equal((await h.call('POST', 'sessions', { token: tok, body: { op: 'delete', id: off, confirmText: 'Official event' } })).json.ok, true);
  assert.equal((await h.call('GET', `session/${off}`, { token: tok })).status, 404);
  assert.ok((await h.store.list(`backups/${off}/`)).length >= 1); // a last backup is kept
});

test('draft exports refuse to run on an outdated calculation', async () => {
  const h = server(); const tok = await h.setup();
  const id = await practiceToCalc(h, tok);
  assert.equal(JSON.parse((await h.exportFile(tok, id, 'rankings', 'xlsx')).bytes.toString()).code, 'NO_CALC');
  await h.must(tok, id, 'calc.run');
  assert.equal((await h.exportFile(tok, id, 'rankings', 'xlsx')).status, 200);
  const v = await h.view(tok, id);
  await h.must(tok, id, 'deploy.update', { id: v.doc.deployments[0].id, patch: { contractMonths: 7 } });
  assert.equal(JSON.parse((await h.exportFile(tok, id, 'rankings', 'xlsx')).bytes.toString()).code, 'OUTDATED');
  // Round 1 and CV exports do not depend on the calculation
  assert.equal((await h.exportFile(tok, id, 'auction', 'pdf')).status, 200);
});
