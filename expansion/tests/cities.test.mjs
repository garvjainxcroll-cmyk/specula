// The event rule "one employee of a team per city", and the benefits each city adds to its
// continent's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { server, recordAuction } from './helpers.mjs';
import { practiceDoc, blankDoc } from '../scripts/sim.mjs';
import { computeAll } from '../src/engine/index.mjs';
import { effectiveCity } from '../src/engine/regions.mjs';
import { PRACTICE_DEPLOYMENTS } from '../src/data/practice.mjs';

async function lockedPractice(h, tok) {
  const id = await h.session(tok, 'practice');
  await h.must(tok, id, 'practice.loadSample', { stage: 'auction' });
  await h.must(tok, id, 'round1.lock', { confirm: true });
  return id;
}
const base = (teamId, i) => ({ teamId, ...PRACTICE_DEPLOYMENTS[teamId][i] });

test('a team cannot place a second employee in a city it already uses', async () => {
  const h = server(); const tok = await h.setup();
  const id = await lockedPractice(h, tok);
  await h.must(tok, id, 'deploy.create', base('A', 0)); // E06 to Kingsport
  const j = await h.act(tok, id, 'deploy.create', { ...base('A', 1), cityId: 'SOL-KIN' }); // E16 to Kingsport too
  assert.equal(j.code, 'CITY_TAKEN');
  assert.match(j.error, /already has E06 .* in Kingsport/);
  // another team may still use the same city
  await h.must(tok, id, 'deploy.create', { ...base('B', 4), cityId: 'SOL-KIN' });
  // headquarters counts as a city too
  await h.must(tok, id, 'deploy.create', base('A', 3)); // E19 at Crestford, Team A's headquarters
  assert.equal((await h.act(tok, id, 'deploy.create', { ...base('A', 4), cityId: 'AST-CRE' })).code, 'CITY_TAKEN');
  // moving a deployment into a used city is refused as well
  const d16 = await h.must(tok, id, 'deploy.create', base('A', 1)); // E16 to Northbridge
  const dep = d16.doc.deployments.find((d) => d.employeeId === 'E16');
  assert.equal((await h.act(tok, id, 'deploy.update', { id: dep.id, patch: { cityId: 'SOL-KIN' } })).code, 'CITY_TAKEN');
  // the same employee may come back to the same city later (still one employee there)
  const d06 = d16.doc.deployments.find((d) => d.employeeId === 'E06');
  await h.must(tok, id, 'deploy.update', { id: d06.id, patch: { contractMonths: 6 } });
  await h.must(tok, id, 'deploy.create', { ...base('A', 0), startMonth: '2027-07', contractMonths: 6 });
});

test('a deleted deployment cannot be brought back into a city that is now taken', async () => {
  const h = server(); const tok = await h.setup();
  const id = await lockedPractice(h, tok);
  const v = await h.must(tok, id, 'deploy.create', base('A', 0));
  const d = v.doc.deployments[0];
  const del = await h.must(tok, id, 'deploy.delete', { id: d.id });
  await h.must(tok, id, 'deploy.create', { ...base('A', 1), cityId: 'SOL-KIN' });
  assert.equal((await h.act(tok, id, 'audit.revert', { seq: del.lastEntry.seq, reason: 'Deleted by mistake' })).code, 'CITY_TAKEN');
});

test('only a Super Administrator can allow several employees per city, as a logged decision', async () => {
  const h = server(); const tok = await h.setup();
  const cfgOp = await h.addUser(tok, 'operator2', 'operator', ['config']);
  const id = await lockedPractice(h, tok);
  const v = await h.view(tok, id);
  const value = { ...v.doc.config.deployment, allowSameCity: true };
  assert.equal(v.doc.config.deployment.allowSameCity, false); // the event rule is on from the start
  assert.equal((await h.act(cfgOp, id, 'config.section', { section: 'deployment', value, reason: 'x' })).code, 'LIVE_ROUND');
  await h.must(tok, id, 'config.section', { section: 'deployment', value, reason: 'Event Head allows a shared office this year' });
  await h.must(tok, id, 'deploy.create', base('A', 0));
  await h.must(tok, id, 'deploy.create', { ...base('A', 1), cityId: 'SOL-KIN' });
  const log = (await h.audit(tok, id)).entries.find((e) => e.action === 'config.section');
  assert.equal(log.kind, 'scenario-change');
  assert.equal(log.reason, 'Event Head allows a shared office this year');
});

test('two employees in one city block finalisation, whatever the check severity says', () => {
  const doc = practiceDoc();
  doc.config.validationSeverity = { R2_SAME_CITY: 'warning' };
  doc.deployments.find((d) => d.employeeId === 'E16').cityId = 'SOL-KIN'; // next to E06
  const res = computeAll(doc);
  const i = res.validation.round2.find((x) => x.code === 'R2_SAME_CITY');
  assert.ok(i);
  assert.equal(i.severity, 'blocking');
  assert.match(i.message, /Team A: 2 employees in Kingsport \(E06, E16\)/);
});

test('the sample allocations obey the rule', () => {
  for (const [t, list] of Object.entries(PRACTICE_DEPLOYMENTS)) {
    const cities = list.map((d) => d.cityId);
    assert.equal(new Set(cities).size, cities.length, `Team ${t}`);
  }
  assert.ok(!computeAll(practiceDoc()).validation.round2.some((i) => i.code === 'R2_SAME_CITY'));
});

test('within each continent, every city has benefits of its own', () => {
  const doc = blankDoc();
  for (const k of doc.continents) {
    const cs = doc.cities.filter((c) => c.continentId === k.id);
    assert.equal(cs.length, 5, k.id);
    const favoured = cs.map((c) => Object.keys(c.functionBonus).filter((f) => c.functionBonus[f] > 0));
    for (const [i, f] of favoured.entries()) assert.equal(f.length, 1, `${cs[i].id} favours one job area`);
    assert.equal(new Set(favoured.flat()).size, 5, `${k.id}: five cities, five different job areas`);
    for (const c of cs) assert.ok(c.benefits.length >= 1, `${c.id} lists its benefits`);
    assert.ok(k.benefits.length >= 1 && Object.keys(k.functionBonus).length >= 1, `${k.id} has continent-wide benefits`);
  }
});

test('a city’s role bonus adds to its continent’s, within the cap', () => {
  const doc = blankDoc();
  const cap = doc.config.productivity.functionBonusCap;
  for (const c of doc.cities) {
    const k = doc.continents.find((x) => x.id === c.continentId);
    const eff = effectiveCity(c, k);
    for (const f of new Set([...Object.keys(k.functionBonus), ...Object.keys(c.functionBonus)])) {
      assert.equal(eff.functionBonus[f], (k.functionBonus[f] || 0) + (c.functionBonus[f] || 0), `${c.id} ${f}`);
    }
  }
  // the deployment engine caps the total: Aurum City finance = Asteria +10 and the city +10 → +20
  const res = computeAll(practiceDoc());
  const d = Object.values(res.deployments).find((x) => x.employeeId === 'E01'); // Team B, Aurum City, business development
  assert.equal(d.productivity.fnPct, 0); // Aurum City favours finance, not business development
  const fin = practiceDoc();
  fin.deployments.find((x) => x.employeeId === 'E01').roleId = 'finance';
  const r2 = computeAll(fin);
  assert.equal(Object.values(r2.deployments).find((x) => x.employeeId === 'E01').productivity.fnPct, Math.min(cap, 20));
});

test('changing one city’s benefit changes only the deployment in that city', () => {
  const a = computeAll(practiceDoc());
  const doc = practiceDoc();
  doc.cities.find((c) => c.id === 'VES-HIG').functionBonus = { operations: 5 }; // Highcrest: +15% → +5%
  const b = computeAll(doc);
  const id = Object.values(a.deployments).find((d) => d.cityId === 'VES-HIG').id; // Team D's operations manager
  assert.ok(b.deployments[id].productivity.value < a.deployments[id].productivity.value);
  for (const d of Object.values(a.deployments)) if (d.cityId !== 'VES-HIG' && d.valid) assert.equal(b.deployments[d.id].productivity.value, d.productivity.value, d.id);
});

test('a full auction recorded through the server still allows every team five cities', async () => {
  const h = server(); const tok = await h.setup();
  const id = await h.session(tok, 'practice');
  await recordAuction(h, tok, id);
  await h.must(tok, id, 'round1.lock', { confirm: true });
  await h.must(tok, id, 'practice.loadSample', { stage: 'round2' });
  const v = await h.view(tok, id);
  for (const t of v.doc.teams) {
    const cities = v.doc.deployments.filter((d) => d.teamId === t.id).map((d) => d.cityId);
    assert.equal(cities.length, 5);
    assert.equal(new Set(cities).size, 5, t.id);
  }
});
