// The 25 acceptance tests from the development brief (section 16), in its order and with
// its numbers. Most run through the real server exactly as an operator's console would;
// the purely numerical ones call the calculation engine directly.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { server, officialEvent, recordAuction, L, readXlsx, rowValue, unzip } from './helpers.mjs';
import { practiceDoc, blankDoc } from '../scripts/sim.mjs';
import { computeAll, buildContext } from '../src/engine/index.mjs';
import { configIssues } from '../src/engine/validate.mjs';
import { effectiveCity } from '../src/engine/regions.mjs';
import { evaluateRule } from '../src/engine/compliance.mjs';
import { rankTeams } from '../src/engine/ranking.mjs';
import { money, clamp } from '../src/engine/money.mjs';
import { contractedSalary } from '../src/engine/round1.mjs';
import { PRACTICE_AUCTION, PRACTICE_DEPLOYMENTS } from '../src/data/practice.mjs';
import { defaultConfig } from '../src/data/defaults.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sumOf = (xs) => xs.reduce((s, x) => s + x, 0);
const codes = (j) => (j?.details || []).map((i) => i.code);

/** A practice session with the sample auction (and, unless told otherwise, the sample allocations). */
async function practice(h, tok, { round2 = true, lock = true } = {}) {
  const id = await h.session(tok, 'practice');
  await h.must(tok, id, 'practice.loadSample', { stage: 'auction' });
  if (lock) await h.must(tok, id, 'round1.lock', { confirm: true });
  if (lock && round2) await h.must(tok, id, 'practice.loadSample', { stage: 'round2' });
  return id;
}
const depOf = (v, employeeId) => v.doc.deployments.find((d) => d.employeeId === employeeId);

describe('Acceptance tests (brief section 16)', () => {
  // one complete official event, run through the server, shared by the tests that inspect it
  const ev = {};
  before(async () => {
    ev.h = server();
    ev.tok = await ev.h.setup();
    ev.id = await officialEvent(ev.h, ev.tok);
    ev.v = await ev.h.view(ev.tok, ev.id);
  });

  test('AT01 exactly twenty CVs are available for auction', async () => {
    const h = server(); const tok = await h.setup();
    const id = await h.session(tok, 'official');
    const v = await h.view(tok, id);
    assert.equal(v.doc.employees.length, 20);
    assert.equal(new Set(v.doc.employees.map((e) => e.id)).size, 20);
    assert.equal(v.doc.auction.records.length, 20);
    assert.ok(v.doc.auction.records.every((r) => r.status === 'available'));
    assert.equal(v.doc.config.auction.poolSize, 20);
    assert.ok(!v.results.validation.config.some((i) => i.code === 'CFG_CVS'));
    // a pool of nineteen, or a duplicated ID, is a blocking configuration problem
    const short = blankDoc(); short.employees.pop(); short.auction.records.pop();
    assert.ok(configIssues(buildContext(short)).some((i) => i.code === 'CFG_CVS' && i.severity === 'blocking'));
    const dup = blankDoc(); dup.employees[1].id = dup.employees[0].id;
    assert.ok(configIssues(buildContext(dup)).some((i) => i.code === 'CFG_CVS' && i.severity === 'blocking'));
  });

  test('AT02 four teams can each hire exactly five employees', () => {
    const { v } = ev;
    assert.equal(v.doc.teams.length, 4);
    for (const t of v.doc.teams) assert.equal(v.results.roster[t.id].length, 5, `${t.id} roster`);
    assert.equal(new Set(Object.values(v.results.roster).flat()).size, 20);
    assert.equal(v.doc.round1.status, 'locked');
    assert.equal(v.doc.round1.snapshot.records.filter((r) => r.status === 'sold').length, 20);
  });

  test('AT03 a CV cannot be sold to two teams', async () => {
    const h = server(); const tok = await h.setup();
    const id = await h.session(tok, 'practice');
    await h.must(tok, id, 'auction.start', { employeeId: 'E01' });
    await h.must(tok, id, 'auction.sell', { employeeId: 'E01', teamId: 'A', amount: L(10), confirm: true, ackBudget: true });
    const again = await h.act(tok, id, 'auction.sell', { employeeId: 'E01', teamId: 'B', amount: L(12), confirm: true, ackBudget: true });
    assert.equal(again.code, 'SALE_REFUSED');
    assert.match(again.error, /already sold to Team A/);
    assert.equal((await h.act(tok, id, 'auction.start', { employeeId: 'E01' })).code, 'INVALID_STATE');
    const v = await h.view(tok, id);
    const r = v.doc.auction.records.find((x) => x.employeeId === 'E01');
    assert.equal(r.winningTeamId, 'A');
    assert.deepEqual(v.results.roster.B, []);
  });

  test('AT04 a team cannot hire a sixth employee', async () => {
    const h = server(); const tok = await h.setup();
    const id = await h.session(tok, 'practice');
    for (const e of ['E01', 'E02', 'E03', 'E04', 'E05']) {
      await h.must(tok, id, 'auction.start', { employeeId: e });
      await h.must(tok, id, 'auction.sell', { employeeId: e, teamId: 'A', amount: L(5), confirm: true, ackBudget: true });
    }
    await h.must(tok, id, 'auction.start', { employeeId: 'E06' });
    const sixth = await h.act(tok, id, 'auction.sell', { employeeId: 'E06', teamId: 'A', amount: L(5), confirm: true, ackBudget: true });
    assert.equal(sixth.code, 'SALE_REFUSED');
    assert.match(sixth.error, /already has 5 employees/);
    // nor by Event Control allocation, nor by correcting another team's sale
    await h.must(tok, id, 'auction.withdraw', { employeeId: 'E06', reason: 'Testing the team limit' });
    assert.equal((await h.act(tok, id, 'auction.allocate', { employeeId: 'E06', teamId: 'A', amount: L(5), reason: 'Testing the team limit', confirm: true })).code, 'TEAM_FULL');
    await h.must(tok, id, 'auction.start', { employeeId: 'E07' });
    await h.must(tok, id, 'auction.sell', { employeeId: 'E07', teamId: 'B', amount: L(5), confirm: true, ackBudget: true });
    assert.equal((await h.act(tok, id, 'auction.correct', { employeeId: 'E07', teamId: 'A', amount: L(5), reason: 'Testing the team limit', confirm: true })).code, 'TEAM_FULL');
    assert.equal((await h.view(tok, id)).results.roster.A.length, 5);
  });

  test('AT05 a team cannot enter Round 2 short-handed unless the administrator changes the rule', async () => {
    const h = server(); const tok = await h.setup();
    const op = await h.addUser(tok, 'operator1', 'operator');
    const id = await h.session(tok, 'practice');
    const outcome = structuredClone(PRACTICE_AUCTION);
    outcome.A = outcome.A.filter(([e]) => e !== 'E13'); // Team A buys only four
    await recordAuction(h, tok, id, outcome);
    await h.must(tok, id, 'auction.start', { employeeId: 'E13' });
    await h.must(tok, id, 'auction.withdraw', { employeeId: 'E13', reason: 'Candidate withdrew' });
    await h.must(tok, id, 'auction.leaveUnallocated', { employeeId: 'E13', reason: 'Candidate withdrew' });
    const lock = await h.act(tok, id, 'round1.lock', { confirm: true });
    assert.equal(lock.code, 'VALIDATION');
    assert.ok(codes(lock).includes('R1_TEAM_SIZE'));
    const dep = PRACTICE_DEPLOYMENTS.A[0];
    assert.equal((await h.act(tok, id, 'deploy.create', { teamId: 'A', ...dep })).code, 'ROUND1_OPEN');
    // the rule change is a scenario change: Super Administrator only, with a reason
    const v0 = await h.view(tok, id);
    const value = { ...v0.doc.config.auction, allowShortTeams: true };
    assert.equal((await h.act(op, id, 'config.section', { section: 'auction', value, reason: 'x' })).code, 'FORBIDDEN');
    assert.equal((await h.act(tok, id, 'config.section', { section: 'auction', value })).code, 'REASON_REQUIRED');
    await h.must(tok, id, 'config.section', { section: 'auction', value, reason: 'E13 withdrew; Team A plays with four' });
    const locked = await h.must(tok, id, 'round1.lock', { confirm: true });
    assert.ok(locked.results.validation.round1.some((i) => i.code === 'R1_TEAM_SHORT' && i.severity === 'warning'));
    await h.must(tok, id, 'deploy.create', { teamId: 'A', ...dep });
  });

  test('AT06 every city belongs to one valid continent', async () => {
    const doc = blankDoc();
    const conts = new Set(doc.continents.map((c) => c.id));
    assert.equal(doc.cities.length, 20);
    for (const c of doc.cities) assert.ok(conts.has(c.continentId), c.id);
    for (const k of conts) assert.equal(doc.cities.filter((c) => c.continentId === k).length, 5);
    const bad = blankDoc(); bad.cities[3].continentId = 'NOWHERE';
    assert.ok(configIssues(buildContext(bad)).some((i) => i.code === 'CFG_CITIES' && i.severity === 'blocking' && i.ref.id === bad.cities[3].id));
    // the server will not save a city into a continent that does not exist
    const h = server(); const tok = await h.setup();
    const id = await h.session(tok, 'practice');
    const j = await h.act(tok, id, 'city.update', { id: doc.cities[3].id, patch: { continentId: 'NOWHERE' } });
    assert.equal(j.ok, false);
    assert.equal((await h.view(tok, id)).doc.cities[3].continentId, doc.cities[3].continentId);
  });

  test('AT07 every team has a designated home continent', async () => {
    const doc = blankDoc();
    const conts = new Set(doc.continents.map((c) => c.id));
    for (const t of doc.teams) assert.ok(conts.has(t.homeContinentId), t.id);
    const bad = blankDoc(); bad.teams[2].homeContinentId = '';
    assert.ok(configIssues(buildContext(bad)).some((i) => i.code === 'CFG_HOME' && i.severity === 'blocking'));
    const h = server(); const tok = await h.setup();
    const id = await h.session(tok, 'practice');
    assert.equal((await h.act(tok, id, 'team.update', { teamId: 'C', patch: { homeContinentId: 'NOWHERE' } })).code, 'INVALID_REF');
    assert.equal((await h.view(tok, id)).doc.teams[2].homeContinentId, 'SOL');
  });

  test('AT08 a deployment cannot use an employee hired by another team', async () => {
    const h = server(); const tok = await h.setup();
    const id = await practice(h, tok, { round2: false });
    const j = await h.act(tok, id, 'deploy.create', { teamId: 'A', ...PRACTICE_DEPLOYMENTS.B[0] }); // E01 belongs to Team B
    assert.equal(j.code, 'NOT_TEAM_EMPLOYEE');
    assert.match(j.error, /hired by Team B/);
    // a record that somehow names the wrong team is flagged and earns nothing
    const doc = practiceDoc();
    doc.deployments.push({ ...structuredClone(doc.deployments[0]), id: 'DX', teamId: 'B' });
    const res = computeAll(doc);
    assert.ok(res.validation.round2.some((i) => i.code === 'R2_EMP_WRONG_TEAM' && i.severity === 'blocking'));
    assert.ok(!res.round2.teams.B.lines.some((l) => l.depId === 'DX'));
  });

  test('AT09 an employee cannot be deployed twice in incompatible assignments', async () => {
    const h = server(); const tok = await h.setup();
    const id = await practice(h, tok, { round2: false });
    const base = { teamId: 'A', ...PRACTICE_DEPLOYMENTS.A[0] }; // E06
    await h.must(tok, id, 'deploy.create', { ...base, startMonth: '2027-01', contractMonths: 6 });
    await h.must(tok, id, 'deploy.create', { ...base, startMonth: '2027-07', contractMonths: 6, cityId: 'SOL-MER' }); // one after the other: allowed
    const clash = await h.act(tok, id, 'deploy.create', { ...base, startMonth: '2027-03', contractMonths: 4, cityId: 'SOL-OAK' });
    assert.equal(clash.code, 'OVERLAP');
    assert.equal((await h.view(tok, id)).doc.deployments.length, 2);
    // an overlapping pair that reached the data anyway blocks finalisation
    const doc = practiceDoc();
    doc.deployments.push({ ...structuredClone(doc.deployments[1]), id: 'DX', cityId: 'SOL-MER' });
    assert.ok(computeAll(doc).validation.round2.some((i) => i.code === 'R2_OVERLAP' && i.severity === 'blocking'));
  });

  test('AT10 regional benefits change the right outputs when their values change', () => {
    const base = computeAll(practiceDoc());
    // stronger demand in Solmera: teams working there earn more; Team D (Vespera, Caldris) is untouched
    const doc = practiceDoc();
    doc.continents.find((c) => c.id === 'SOL').attrs.marketDemand += 20;
    const res = computeAll(doc);
    assert.ok(res.round2.teams.A.statement.revenue.total > base.round2.teams.A.statement.revenue.total);
    assert.ok(res.round2.teams.C.statement.revenue.total > base.round2.teams.C.statement.revenue.total);
    assert.deepEqual(res.round2.teams.D.statement, base.round2.teams.D.statement);
    // a finance bonus in Vespera raises productivity of a finance role there (D017) and nothing else of Team D's
    const doc2 = practiceDoc();
    doc2.continents.find((c) => c.id === 'VES').functionBonus = { ...doc2.continents.find((c) => c.id === 'VES').functionBonus, finance: 25 };
    const r2 = computeAll(doc2);
    const finance = Object.values(r2.deployments).find((d) => d.teamId === 'D' && d.roleId === 'finance');
    const before = base.deployments[finance.id];
    assert.ok(finance.productivity.value > before.productivity.value);
    assert.equal(r2.deployments.D018.productivity.value, base.deployments.D018.productivity.value);
    // a higher tax rate in Caldris raises Team C's tax and leaves Team A's alone
    const doc3 = practiceDoc();
    doc3.continents.find((c) => c.id === 'CAL').attrs.taxRate += 10;
    const r3 = computeAll(doc3);
    const tax = (r, t) => r.round2.teams[t].statement.recurring.byCategory.tax || 0;
    assert.ok(tax(r3, 'C') >= tax(base, 'C'));
    assert.equal(tax(r3, 'A'), tax(base, 'A'));
  });

  test('AT11 city-specific adjustments are applied correctly', () => {
    const cont = { id: 'K', attrs: { marketDemand: 60, growthRate: 4, operatingCostMultiplier: 1.2, taxRate: 20, employerContributionPct: 10, housingAllowanceAnnual: L(10) } };
    const city = { id: 'K-1', name: 'Test', continentId: 'K', adj: { marketDemand: 50, growthRate: -2, operatingCostMultiplier: 10, taxRate: 5, employerContributionPct: 30 } };
    const e = effectiveCity(city, cont);
    assert.equal(e.attrs.marketDemand, 100); // score: points added, kept within 0–100
    assert.equal(e.attrs.growthRate, 2); // rate: points added
    assert.ok(Math.abs(e.attrs.operatingCostMultiplier - 1.32) < 1e-12); // multiplier: × (1 + 10%)
    assert.equal(e.attrs.taxRate, 25);
    assert.equal(e.attrs.employerContributionPct, 10); // continent-only: a city cannot change it
    assert.equal(e.attrs.housingAllowanceAnnual, L(11)); // follows the city's operating-cost adjustment
    // the sample cities, as the engine uses them
    const doc = practiceDoc();
    const res = computeAll(doc);
    for (const c of doc.cities) {
      const k = doc.continents.find((x) => x.id === c.continentId);
      assert.equal(res.regions[c.id].attrs.marketDemand, clamp(k.attrs.marketDemand + (c.adj?.marketDemand || 0), 0, 100), c.id);
    }
    // changing one city's adjustment changes deployments there and nowhere else
    const doc2 = practiceDoc();
    const kin = doc2.cities.find((c) => c.id === 'SOL-KIN');
    kin.adj = { ...kin.adj, marketDemand: (kin.adj?.marketDemand || 0) + 15 };
    const r2 = computeAll(doc2);
    assert.ok(r2.deployments.D002.market.value > res.deployments.D002.market.value); // in Kinshaven
    assert.ok(r2.deployments.D002.revenueRate > res.deployments.D002.revenueRate);
    assert.deepEqual(r2.deployments.D012.market, res.deployments.D012.market); // elsewhere in Solmera
    assert.equal(r2.deployments.D012.revenueRate, res.deployments.D012.revenueRate);
  });

  test('AT12 mandatory legal requirements are checked before a deployment is approved', async () => {
    const h = server(); const tok = await h.setup();
    const id = await practice(h, tok);
    let v = await h.view(tok, id);
    // automatic check: a supply-chain role in Solmera needs the safety induction (training)
    const d1 = depOf(v, 'E06');
    const blocked = await h.act(tok, id, 'deploy.approve', { id: d1.id });
    assert.equal(blocked.code, 'BLOCKED');
    assert.match(blocked.error, /SOL-03/);
    await h.must(tok, id, 'deploy.update', { id: d1.id, patch: { trainingProvided: true } });
    await h.must(tok, id, 'deploy.approve', { id: d1.id });
    // recorded requirement: the visa must be assessed (and satisfied) before approval
    v = await h.view(tok, id);
    const d2 = depOf(v, 'E16');
    await h.must(tok, id, 'compliance.set', { deploymentId: d2.id, ruleId: 'SOL-01', status: 'unassessed' });
    assert.equal((await h.act(tok, id, 'deploy.approve', { id: d2.id })).code, 'BLOCKED');
    // a mandatory but non-blocking requirement must still be assessed
    await h.must(tok, id, 'compliance.set', { deploymentId: d2.id, ruleId: 'SOL-01', status: 'compliant', evidence: 'Visa SV-1' });
    await h.must(tok, id, 'compliance.set', { deploymentId: d2.id, ruleId: 'GLB-01', status: 'unassessed' });
    const un = await h.act(tok, id, 'deploy.approve', { id: d2.id });
    assert.equal(un.code, 'VALIDATION');
    assert.ok(codes(un).includes('R2_UNASSESSED'));
    await h.must(tok, id, 'compliance.set', { deploymentId: d2.id, ruleId: 'GLB-01', status: 'compliant', evidence: 'Contract C-16' });
    await h.must(tok, id, 'deploy.approve', { id: d2.id });
  });

  test('AT13 missing documentation is distinguished from confirmed non-compliance', () => {
    const cfg = defaultConfig();
    const rule = { id: 'R', title: 'Permit', category: 'Work authorisation', mandatory: true, blocks: true, satisfiableBefore: true, evidenceRequired: true, check: { kind: 'status' }, cost: L(1), costType: 'oneTime', penalty: L(4), revenueImpactPct: 0, scorePenalty: 5, waivable: false };
    const pending = evaluateRule(rule, {}, { status: 'pending', evidence: '' }, cfg, String);
    const non = evaluateRule(rule, {}, { status: 'noncompliant', evidence: '' }, cfg, String);
    const missingEvidence = evaluateRule(rule, {}, { status: 'compliant', evidence: '' }, cfg, String);
    const unassessed = evaluateRule(rule, {}, null, cfg, String);
    assert.equal(pending.status, 'pending');
    assert.equal(non.status, 'noncompliant');
    assert.equal(missingEvidence.status, 'pending'); // "compliant" without the required evidence is documentation pending, not a breach
    assert.equal(missingEvidence.evidenceMissing, true);
    assert.equal(unassessed.status, 'unassessed');
    assert.equal(pending.penalty, 0); assert.equal(non.penalty, L(4));
    assert.equal(pending.documentationCost, cfg.costs.pendingDocumentationCost); assert.equal(non.documentationCost, 0);
    assert.ok(cfg.compliance.statusScores.pending > cfg.compliance.statusScores.noncompliant);
    // pending documentation that can only be completed after arrival does not stop the work
    const later = evaluateRule({ ...rule, satisfiableBefore: false }, {}, { status: 'pending' }, cfg, String);
    assert.equal(later.blocking, false);
    assert.equal(evaluateRule({ ...rule, satisfiableBefore: false }, {}, { status: 'noncompliant' }, cfg, String).blocking, true);
    // in the sample: E17's licence pending → documentation cost; confirmed breach → penalty instead
    const doc = practiceDoc();
    const dep = doc.deployments.find((d) => d.employeeId === 'E17');
    const a = computeAll(doc);
    const evA = a.deployments[dep.id].compliance.evals.find((e) => e.ruleId === 'CAL-01');
    assert.equal(evA.status, 'pending');
    doc.compliance[dep.id]['CAL-01'] = { status: 'noncompliant', evidence: '' };
    const b = computeAll(doc);
    const evB = b.deployments[dep.id].compliance.evals.find((e) => e.ruleId === 'CAL-01');
    assert.equal(evB.status, 'noncompliant');
    assert.ok(b.round2.teams.C.metrics.noncompliantCount > a.round2.teams.C.metrics.noncompliantCount);
    assert.ok(b.round2.teams.C.metrics.complianceScore < a.round2.teams.C.metrics.complianceScore);
  });

  test('AT14 relocation costs are counted once', () => {
    const doc = practiceDoc();
    const res = computeAll(doc);
    const ctx = buildContext(doc);
    const c = doc.config.costs;
    for (const t of doc.teams) {
      const tr = res.round2.teams[t.id];
      const reloc = tr.lines.filter((l) => l.cat === 'relocation');
      // at most one relocation line per deployment, only for people who actually move and work
      const perDep = {}; for (const l of reloc) perDep[l.depId] = (perDep[l.depId] || 0) + 1;
      assert.ok(Object.values(perDep).every((n) => n === 1));
      let expected = 0;
      for (const d of doc.deployments.filter((x) => x.teamId === t.id)) {
        const pd = res.deployments[d.id];
        if (!pd.relocated || !pd.operational) { assert.ok(!perDep[d.id], `${d.id} should have no relocation`); continue; }
        const emp = ctx.employees.get(d.employeeId);
        const type = ctx.types.get(d.assignmentTypeId);
        const one = money((emp.employment.relocationBase || 0) * ctx.eff.get(d.cityId).attrs.relocationCostMultiplier * (pd.foreignToTeam ? 1 : c.domesticRelocationFactor) * (type.relocationFactor || 0) * (c.packageFactors[d.relocationPackage] || 0));
        assert.equal(reloc.find((l) => l.depId === d.id)?.amount || 0, one, d.id);
        expected += one;
      }
      assert.equal(tr.statement.oneTime.byCategory.relocation || 0, expected);
      // Round 1 shows relocation only as an estimate: it is not part of the hiring cost carried into the combined outcome
      const r1 = res.round1.teams[t.id];
      assert.equal(r1.initialHiringCost, r1.totalBids + r1.recruitment + r1.onboarding);
      assert.equal(tr.statement.combined, tr.statement.netContribution - r1.initialHiringCost);
    }
  });

  test('AT15 annual salaries are prorated for part-year assignments', () => {
    const doc = practiceDoc();
    const d = doc.deployments.find((x) => x.employeeId === 'E19'); // Team A, finance, at headquarters
    d.contractMonths = 6; d.startMonth = '2027-01';
    const d2 = doc.deployments.find((x) => x.employeeId === 'E03'); // Team B, abroad from April for nine months
    d2.startMonth = '2027-04'; d2.contractMonths = 9;
    const res = computeAll(doc);
    const ctx = buildContext(doc);
    const line = (t, f) => res.round2.teams[t].lines.filter((l) => l.cat === 'salary' && f(l)).reduce((s, l) => s + l.amount, 0);
    assert.equal(line('A', (l) => l.depId === d.id), money(d.salary.amount * 6 / 12));
    assert.equal(line('B', (l) => l.depId === d2.id), money(d2.salary.amount * 9 / 12));
    // the months outside the assignment are paid at the contracted home salary, never both at once
    const e19 = ctx.employees.get('E19');
    const covered = Math.min(doc.config.period.months, e19.employment.contractMonths || 12);
    assert.equal(line('A', (l) => l.empId === 'E19' && !l.depId), money(contractedSalary(e19, doc.config) * (covered - 6) / 12));
    const e03 = ctx.employees.get('E03');
    assert.equal(line('B', (l) => l.empId === 'E03' && !l.depId), money(contractedSalary(e03, doc.config) * 3 / 12)); // January–March, paid before the move
  });

  test('AT16 winning bids are not deducted twice from the combined outcome', () => {
    const doc = practiceDoc();
    const a = computeAll(doc);
    const rec = doc.auction.records.find((r) => r.employeeId === 'E06');
    rec.winningBid += L(2);
    const b = computeAll(doc);
    const A0 = a.round2.teams.A.statement; const A1 = b.round2.teams.A.statement;
    assert.equal(A1.netContribution, A0.netContribution); // Round 2 does not see the bid
    assert.equal(A1.totalCosts, A0.totalCosts);
    assert.equal(A1.round1InitialHiringCost - A0.round1InitialHiringCost, L(2));
    assert.equal(A0.combined - A1.combined, L(2)); // deducted exactly once
    for (const t of Object.values(a.round2.teams)) assert.ok(!t.lines.some((l) => /bid|auction|recruit|onboard/i.test(l.cat)));
  });

  test('AT17 revenue, costs, profit and margins reconcile', () => {
    const res = computeAll(practiceDoc());
    for (const [id, t] of Object.entries(res.round2.teams)) {
      const s = t.statement;
      const rev = sumOf(t.lines.filter((l) => l.kind === 'revenue').map((l) => l.amount));
      const cost = sumOf(t.lines.filter((l) => l.kind === 'cost').map((l) => l.amount));
      assert.ok(t.lines.every((l) => Number.isInteger(l.amount)), `${id}: every line in whole paise`);
      assert.equal(s.revenue.total, rev);
      assert.equal(s.revenue.total, sumOf(Object.values(s.revenue.byType)));
      assert.equal(s.totalCosts, cost);
      assert.equal(s.totalCosts, s.oneTime.total + s.recurring.total + s.contingent.total);
      for (const sec of [s.oneTime, s.recurring, s.contingent]) assert.equal(sec.total, sumOf(Object.values(sec.byCategory)));
      assert.equal(s.operatingProfit, s.revenue.total - s.recurring.total);
      assert.equal(s.netContribution, s.revenue.total - s.totalCosts);
      assert.equal(s.combined, s.netContribution - s.round1InitialHiringCost);
      assert.equal(sumOf(Object.values(t.byCity).map((c) => c.revenue)), s.revenue.total);
      assert.equal(sumOf(Object.values(t.byCity).map((c) => c.costs)), s.totalCosts);
      assert.equal(sumOf(Object.values(t.byContinent).map((c) => c.contribution)), s.netContribution);
      assert.equal(sumOf(Object.values(t.byEmployee).map((e) => e.revenue)), s.revenue.total);
      if (s.revenue.total > 0) {
        assert.ok(Math.abs(t.metrics.profitMarginPct - (100 * s.netContribution) / s.revenue.total) < 1e-9);
        assert.ok(Math.abs(t.metrics.operatingMarginPct - (100 * s.operatingProfit) / s.revenue.total) < 1e-9);
      }
    }
    assert.ok(!res.validation.round2.some((i) => i.code === 'R2_RECONCILE'));
  });

  test('AT18 all financial outputs use the configured currency', async () => {
    const h = server(); const tok = await h.setup();
    const id = await h.session(tok, 'practice');
    const usd = { code: 'USD', symbol: '$', minor: 100, grouping: 'international', name: 'US dollar' };
    await h.must(tok, id, 'config.section', { section: 'currency', value: usd });
    await h.must(tok, id, 'practice.loadSample', { stage: 'auction' });
    assert.equal((await h.act(tok, id, 'config.section', { section: 'currency', value: { ...usd, symbol: '€', code: 'EUR' }, reason: 'x' })).code, 'LIVE_ROUND');
    await h.must(tok, id, 'round1.lock', { confirm: true });
    await h.must(tok, id, 'practice.loadSample', { stage: 'round2' });
    await h.must(tok, id, 'calc.run');
    const v = await h.view(tok, id);
    assert.deepEqual(v.doc.config.currency, usd);
    const msgs = JSON.stringify([v.results.validation, v.results.ranking.rows.map((r) => r.explanation), Object.values(v.results.round2.teams).map((t) => t.analysis)]);
    assert.ok(msgs.includes('$'));
    assert.ok(!msgs.includes('₹'));
    const f = await h.exportFile(tok, id, 'team', 'xlsx', '&team=A');
    const files = unzip(f.bytes);
    const styles = files['xl/styles.xml'].toString();
    assert.match(styles, /&quot;\$&quot;/);
    assert.ok(!styles.includes('₹'));
    assert.match(readXlsx(f.bytes)['Financial statement'].A4.v, /US dollar \(USD\)/);
  });

  test('AT19 rankings recalculate when the underlying data changes', async () => {
    const h = server(); const tok = await h.setup();
    const id = await practice(h, tok);
    let v = await h.view(tok, id);
    for (const d of v.doc.deployments) {
      if (v.results.deployments[d.id].operational) await h.must(tok, id, 'deploy.approve', { id: d.id });
      else await h.must(tok, id, 'deploy.recordBlocked', { id: d.id, reason: 'Awaiting permit' });
    }
    v = await h.must(tok, id, 'calc.run');
    assert.equal(v.calc.current, true);
    const before = Object.fromEntries(v.results.ranking.rows.map((r) => [r.teamId, r]));
    // Team B pays its business developer far more
    const d = depOf(v, 'E01');
    await h.must(tok, id, 'deploy.update', { id: d.id, patch: { salary: { amount: d.salary.amount * 3, currency: 'base' } } });
    v = await h.view(tok, id);
    const after = Object.fromEntries(v.results.ranking.rows.map((r) => [r.teamId, r]));
    assert.ok(after.B.combined < before.B.combined);
    assert.ok(after.B.overall < before.B.overall);
    assert.equal(after.D.combined, before.D.combined);
    // the stored calculation is now outdated and cannot be finalised until it is run again
    assert.equal(v.calc.current, false);
    assert.ok(v.results.validation.round2.some((i) => i.code === 'R2_CALC' && /changed/.test(i.message)));
    assert.equal((await h.act(tok, id, 'round2.finalise', { confirm: true })).code, 'VALIDATION');
  });

  test('AT20 ties are settled by the configured tie-break rules, never at random', () => {
    const team = (id, { combined = 100, op = 50, costs = 10, violations = 0 } = {}) => [id, {
      statement: { combined, operatingProfit: op, netContribution: combined, totalCosts: costs, revenue: { total: 0 } },
      metrics: { violations, complianceScore: 90, deploymentEffectiveness: 50, complianceReadiness: 90, blockedCount: 0, expansionBudget: null, budgetUtilPct: null, compliantDeployments: 0 },
    }];
    const results = { teams: Object.fromEntries([team('A', { op: 50, costs: 5 }), team('B', { op: 60, costs: 9 }), team('C', { combined: 40 }), team('D', { combined: 40 })]) };
    const rank = (tieBreaks, order = ['A', 'B', 'C', 'D']) => {
      const cfg = { ranking: { mode: 'financial', financialMetric: 'combined', weights: { financial: 100, deployment: 0, compliance: 0, budget: 0 }, tieBreaks, budgetMaxOverspendPct: 50 }, compliance: { blocker: { ranking: 'flag' } } };
      const out = rankTeams({ cfg, teams: order.map((id) => ({ id, label: `Team ${id}` })), fmt: String }, results);
      return Object.fromEntries(out.rows.map((r) => [r.teamId, `${r.shared ? '=' : ''}${r.rank}`]));
    };
    assert.deepEqual(rank(['operatingProfit']), { B: '1', A: '2', C: '=3', D: '=3' }); // B wins on operating profit; C and D share
    assert.deepEqual(rank(['lowerExpansionCosts']), { A: '1', B: '2', C: '=3', D: '=3' }); // a different rule, a different order
    assert.deepEqual(rank([]), { A: '=1', B: '=1', C: '=3', D: '=3' }); // no rule: the place is shared
    for (let i = 0; i < 5; i++) assert.deepEqual(rank(['operatingProfit'], ['D', 'C', 'B', 'A']), rank(['operatingProfit']));
    const cfg = { ranking: { mode: 'financial', financialMetric: 'combined', weights: {}, tieBreaks: ['operatingProfit'], budgetMaxOverspendPct: 50 }, compliance: { blocker: { ranking: 'flag' } } };
    const out = rankTeams({ cfg, teams: ['A', 'B'].map((id) => ({ id, label: `Team ${id}` })), fmt: String }, results);
    assert.match(out.rows.find((r) => r.teamId === 'A').explanation, /tie-break “Higher operating profit”/);
  });

  test('AT21 locked results cannot be silently changed', async () => {
    const h = server(); const tok = await h.setup();
    const op = await h.addUser(tok, 'operator1', 'operator');
    const id = await officialEvent(h, tok);
    let v = await h.view(tok, id);
    const dep = v.doc.deployments[0];
    // Round 1 is locked: no ordinary auction changes
    assert.equal((await h.act(op, id, 'auction.withdraw', { employeeId: 'E01', reason: 'test' })).code, 'ROUND1_LOCKED');
    // Round 2 is finalised: nothing that feeds the result can change
    for (const [type, payload] of [
      ['deploy.update', { id: dep.id, patch: { contractMonths: 3 } }],
      ['compliance.set', { deploymentId: dep.id, ruleId: 'GLB-01', status: 'pending' }],
      ['calc.run', {}],
      ['config.section', { section: 'period', value: v.doc.config.period, reason: 'test' }],
      ['auction.correct', { employeeId: 'E01', teamId: 'B', amount: L(1), reason: 'test', confirm: true }],
      ['round1.unlock', { reason: 'test', confirm: true }],
    ]) assert.equal((await h.act(tok, id, type, payload)).code, 'ROUND2_FINAL', type);
    assert.equal((await h.act(op, id, 'round2.reopen', { reason: 'test', confirm: true })).code, 'FORBIDDEN');
    assert.equal((await h.act(tok, id, 'round2.reopen', { confirm: true })).code, 'REASON_REQUIRED');
    const rev = v.session.rev;
    v = await h.view(tok, id);
    assert.equal(v.session.rev, rev); // every refusal left the record untouched
    // an explicit, logged correction: the official version 1 stays on file
    await h.must(tok, id, 'round2.reopen', { reason: 'Correcting a mistyped salary', confirm: true });
    v = await h.view(tok, id);
    assert.equal(v.doc.finals.length, 1);
    assert.equal(v.doc.finals[0].reopened.reason, 'Correcting a mistyped salary');
    const x = await h.exportFile(tok, id, 'rankings', 'xlsx', '&source=final');
    assert.equal(x.status, 200);
    assert.match(readXlsx(x.bytes).Rankings?.A3?.v || JSON.stringify(readXlsx(x.bytes)), /OFFICIAL RESULT · version 1/);
    // a change made behind the system's back is detected: the official result is not exported
    const key = `sessions/${id}/doc`;
    const raw = await h.store.get(key);
    raw.finals[0].inputs.deployments[0].salary.amount += 100;
    const meta = await h.store.getMeta(key);
    await h.store.set(key, raw, { onlyIfMatch: meta.etag, metadata: meta.metadata });
    const t = await h.exportFile(tok, id, 'rankings', 'xlsx', '&source=final');
    assert.equal(JSON.parse(t.bytes.toString()).code, 'INTEGRITY');
  });

  test('AT22 every administrative override is logged with who, when and why', async () => {
    const h = server(); const tok = await h.setup();
    const op = await h.addUser(tok, 'operator1', 'operator');
    const id = await practice(h, tok);
    let v = await h.view(tok, id);
    const dep = depOf(v, 'E16'); // Team A in Solmera: the visa (SOL-01) may be waived
    assert.equal((await h.act(op, id, 'compliance.waive', { deploymentId: dep.id, ruleId: 'SOL-01', reason: 'x' })).code, 'FORBIDDEN');
    assert.equal((await h.act(tok, id, 'compliance.waive', { deploymentId: dep.id, ruleId: 'SOL-01' })).code, 'REASON_REQUIRED');
    await h.must(tok, id, 'compliance.waive', { deploymentId: dep.id, ruleId: 'SOL-01', reason: 'Visa granted by fictional ministry letter' });
    await h.must(tok, id, 'auction.correct', { employeeId: 'E19', teamId: 'A', amount: L(7), reason: 'Bid misheard: 7 lakh, not 6', confirm: true });
    v = await h.view(tok, id);
    await h.must(tok, id, 'config.section', { section: 'thresholds', value: { ...v.doc.config.thresholds, riskWarn: 55 }, reason: 'Event Head lowered the risk warning' });
    await h.must(tok, id, 'calc.run');
    const blocked = Object.values((await h.view(tok, id)).results.deployments).filter((d) => !d.operational);
    for (const d of blocked) await h.must(tok, id, 'deploy.recordBlocked', { id: d.id, reason: 'Awaiting permit' });
    v = await h.view(tok, id);
    for (const d of v.doc.deployments.filter((x) => x.approval.state === 'pending')) await h.must(tok, id, 'deploy.approve', { id: d.id });
    await h.must(tok, id, 'calc.run');
    await h.must(tok, id, 'round2.finalise', { confirm: true });
    await h.must(tok, id, 'round2.reopen', { reason: 'Checking the reopen trail', confirm: true });
    const log = (await h.audit(tok, id)).entries;
    const find = (action) => log.find((e) => e.action === action);
    const expectations = [
      ['compliance.waive', 'override', 'Visa granted by fictional ministry letter'],
      ['auction.correct', 'correction', 'Bid misheard: 7 lakh, not 6'],
      ['config.section', 'scenario-change', 'Event Head lowered the risk warning'],
      ['round2.reopen', 'correction', 'Checking the reopen trail'],
    ];
    for (const [action, kind, reason] of expectations) {
      const e = find(action);
      assert.ok(e, action);
      assert.equal(e.kind, kind, action);
      assert.equal(e.reason, reason, action);
      assert.equal(e.user.username, 'head', action);
      assert.ok(!Number.isNaN(Date.parse(e.at)), action);
    }
    assert.ok(find('auction.correct').changes.some((c) => c.path === 'winningBid' && c.after === L(7)));
    assert.equal((await h.view(tok, id)).doc.round1.corrections.at(-1).reason, 'Bid misheard: 7 lakh, not 6');
    // the log only grows: sequence numbers are complete and in order
    const seqs = log.map((e) => e.seq).sort((a, b) => a - b);
    assert.deepEqual(seqs, seqs.map((_, i) => i + 1));
  });

  test('AT23 exports reconcile with the official results stored in the database', async () => {
    const { h, tok, id, v } = ev;
    const final = v.doc.finals.at(-1);
    for (const t of v.doc.teams) {
      const x = await h.exportFile(tok, id, 'team', 'xlsx', `&team=${t.id}`);
      const s = readXlsx(x.bytes)['Financial statement'];
      const st = final.summary.teams[t.id].statement;
      assert.equal(rowValue(s, 'Total revenue'), st.revenue.total / 100);
      assert.equal(rowValue(s, 'Total expansion costs'), st.totalCosts / 100);
      assert.equal(rowValue(s, 'Operating profit (loss)'), st.operatingProfit / 100);
      assert.equal(rowValue(s, 'Combined recruitment-and-expansion outcome'), st.combined / 100);
      for (const label of ['Net contribution equals the engine’s stored figure', 'Combined outcome equals the engine’s stored figure', 'Operating profit equals the engine’s stored figure']) assert.equal(rowValue(s, label), true, label);
      assert.match(s.A3.v, /OFFICIAL RESULT · version 1/);
    }
    // rankings: same order and scores as the stored official ranking
    const rk = readXlsx((await h.exportFile(tok, id, 'rankings', 'xlsx')).bytes);
    const text = JSON.stringify(rk);
    for (const r of final.summary.ranking.rows) assert.ok(text.includes(r.label));
    // the complete archive holds every report, the backup and the audit log
    const arc = await h.exportFile(tok, id, 'archive', 'zip');
    assert.equal(arc.status, 200);
    const names = Object.keys(unzip(arc.bytes));
    for (const k of ['auction', 'allocation', 'deployments', 'compliance', 'comparison', 'rankings', 'audit', 'backup']) assert.ok(names.some((n) => n.includes(`_${k}`)), k);
    for (const t of v.doc.teams) assert.ok(names.some((n) => n.includes(`team_Team-${t.id}`)), t.id);
    const bk = JSON.parse(unzip(arc.bytes)[names.find((n) => n.includes('_backup'))].toString());
    assert.equal(bk.doc.finals.at(-1).resultsHash, final.resultsHash);
  });

  test('AT24 a practice session cannot alter the official event', async () => {
    const h = server(); const tok = await h.setup();
    const off = await h.session(tok, 'official');
    const o0 = await h.view(tok, off);
    assert.equal((await h.act(tok, off, 'practice.loadSample', { stage: 'auction' })).code, 'OFFICIAL');
    assert.equal((await h.call('POST', 'sessions', { token: tok, body: { op: 'create', mode: 'official', name: 'Second official' } })).json.code, 'OFFICIAL_EXISTS');
    // a rehearsal copy of the official session, worked through to a result
    const copy = await h.call('POST', 'sessions', { token: tok, body: { op: 'duplicate', sourceId: off, name: 'Rehearsal copy' } });
    const pid = copy.json.session.id;
    assert.equal(copy.json.session.mode, 'practice');
    await h.must(tok, pid, 'rule.approve', { all: true });
    await h.must(tok, pid, 'practice.loadSample', { stage: 'auction' });
    await h.must(tok, pid, 'round1.lock', { confirm: true });
    await h.must(tok, pid, 'practice.loadSample', { stage: 'round2' });
    await h.must(tok, pid, 'calc.run');
    const o1 = await h.view(tok, off);
    assert.equal(o1.session.rev, o0.session.rev);
    assert.equal(o1.results.inputHash, o0.results.inputHash);
    assert.ok(o1.doc.auction.records.every((r) => r.status === 'available'));
    assert.equal(o1.doc.calc.draft, null);
    // every screen can tell which is which
    const p = await h.view(tok, pid);
    assert.equal(p.session.mode, 'practice');
    assert.equal(o1.session.mode, 'official');
    const list = (await h.call('GET', 'sessions', { token: tok })).json.sessions;
    assert.deepEqual(list.map((s) => s.mode).sort(), ['official', 'practice']);
  });

  test('AT25 unauthorised users cannot reach the control panel or its records', async () => {
    const h = server(); const tok = await h.setup();
    const viewer = await h.addUser(tok, 'officer1', 'viewer');
    const op = await h.addUser(tok, 'operator1', 'operator');
    const id = await h.session(tok, 'official');
    // no sign-in, a made-up token, or a token whose signature was altered
    const forged = `${Buffer.from(JSON.stringify({ u: 'x', v: 0, exp: Date.now() + 1e7 })).toString('base64url')}.abc`;
    const tampered = `${tok.slice(0, -2)}${tok.endsWith('A') ? 'B' : 'A'}A`;
    const routes = [['GET', 'sessions'], ['GET', `session/${id}`], ['POST', `session/${id}/act`], ['GET', `session/${id}/audit`], ['GET', `session/${id}/backups`], ['GET', `session/${id}/backup`], ['GET', `session/${id}/export?kind=cvs&format=xlsx`], ['GET', 'users'], ['GET', 'me']];
    for (const t of [undefined, forged, tampered]) {
      for (const [m, p] of routes) {
        const r = await h.call(m, p, { token: t, body: m === 'POST' ? { type: 'auction.start', payload: { employeeId: 'E01' } } : undefined });
        assert.equal(r.status, 401, `${m} ${p}`);
      }
    }
    // signed in, but without the permission: refused by the server, not just hidden in the console
    assert.equal((await h.call('POST', `session/${id}/act`, { token: viewer, body: { type: 'auction.start', payload: { employeeId: 'E01' } } })).status, 403);
    assert.equal((await h.call('GET', `session/${id}/backup`, { token: viewer })).status, 403);
    assert.equal((await h.call('GET', 'users', { token: op })).status, 403);
    assert.equal((await h.act(op, id, 'rule.approve', { all: true })).code, 'FORBIDDEN');
    // there are no participant or judge accounts, and setup cannot be run twice
    for (const role of ['participant', 'judge', 'team']) assert.equal((await h.call('POST', 'users', { token: tok, body: { op: 'create', username: `x-${role}`, role, password: 'Another-pass-99' } })).json.code, 'INVALID');
    assert.equal((await h.call('POST', 'setup', { body: { setupCode: h.env.SETUP_CODE, username: 'intruder', password: 'Intruder-pass-1' } })).status, 403);
    // a disabled account stops working at once
    const users = (await h.call('GET', 'users', { token: tok })).json.users;
    await h.call('POST', 'users', { token: tok, body: { op: 'update', id: users.find((u) => u.username === 'officer1').id, active: false } });
    assert.equal((await h.call('GET', `session/${id}`, { token: viewer })).status, 401);
    // the public files contain no event data at all
    const dist = join(root, 'dist');
    if (!existsSync(join(dist, 'index.html'))) execFileSync(process.execPath, [join(root, 'scripts/build.mjs')]);
    const files = []; const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else files.push(p); } }; walk(dist);
    const doc = blankDoc();
    const secrets = [...doc.employees.map((e) => e.name), ...doc.cities.map((c) => c.name), ...doc.rules.map((r) => r.description), ...doc.continents.map((c) => c.description)];
    for (const f of files.filter((x) => /\.(m?js|html|css|json)$/.test(x))) {
      const s = readFileSync(f, 'utf8');
      for (const w of secrets) assert.ok(!s.includes(w), `${w} found in ${f}`);
    }
  });
});
