// Unit tests for the calculation engine: money arithmetic, months, ramp-up, determinism,
// the Regional Opportunity Score and the validation catalogue.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { roundTo, money, allocate, ratio, fmtMoney, fmtCompact, toMinor, groupIndian } from '../src/engine/money.mjs';
import { monthIndex, ymOf, periodLabel } from '../src/engine/months.mjs';
import { rampFactor, salaryInBase } from '../src/engine/round2.mjs';
import { computeAll } from '../src/engine/index.mjs';
import { inputHash } from '../src/engine/hash.mjs';
import { CHECKS } from '../src/engine/model.mjs';
import { practiceDoc, blankDoc, strategyPlan, applyAuction, applyDeployments, applyCompliance, randomAuction, rng } from '../scripts/sim.mjs';
import { configIssues } from '../src/engine/validate.mjs';
import { buildContext } from '../src/engine/context.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('rounding is half away from zero and survives floating-point error', () => {
  assert.equal(roundTo(2.5), 3);
  assert.equal(roundTo(-2.5), -3);
  assert.equal(roundTo(2.675, 2), 2.68);
  assert.equal(roundTo(1.005, 2), 1.01);
  assert.equal(money(0.1 + 0.2), 0);
  assert.equal(Object.is(roundTo(-0.4), -0), false);
  assert.throws(() => roundTo(NaN));
  assert.equal(toMinor(12.34), 1234);
});

test('shared amounts are split to the paisa with nothing lost', () => {
  for (const [total, w] of [[100, [1, 1, 1]], [L(55), [1, 1, 1, 1, 1]], [-1001, [2, 1]], [7, [0, 0, 0]], [1, [1, 1, 1]]]) {
    const parts = allocate(total, w);
    assert.equal(parts.reduce((s, x) => s + x, 0), total);
    assert.ok(parts.every(Number.isInteger));
  }
  assert.deepEqual(allocate(100, [1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(allocate(10, [3, 1]), [8, 2]);
});
function L(x) { return Math.round(x * 1e7); }

test('ratios never divide by zero', () => {
  assert.equal(ratio(5, 0), null);
  assert.equal(ratio(5, -2), null);
  assert.equal(ratio(5, -2, { allowNegativeDen: true }), -2.5);
  assert.equal(ratio(Infinity, 2), null);
  assert.equal(ratio(3, 4), 0.75);
});

test('amounts are shown in the configured currency and grouping', () => {
  assert.equal(groupIndian('123456789'), '12,34,56,789');
  assert.equal(fmtMoney(12345678900), '₹12,34,56,789');
  assert.equal(fmtMoney(-150000), '−₹1,500');
  assert.equal(fmtMoney(123456789, { code: 'USD', symbol: '$', minor: 100, grouping: 'international' }), '$1,234,568');
  assert.equal(fmtCompact(L(4.9)), '₹4.90 L');
  assert.match(fmtCompact(L(490)), /^₹4\.90 Cr$/);
});

test('months of the evaluation period', () => {
  const p = { startYear: 2027, startMonth: 1, months: 12 };
  assert.equal(monthIndex(p, '2027-01'), 1);
  assert.equal(monthIndex(p, '2027-12'), 12);
  assert.equal(monthIndex(p, '2026-12'), 0);
  assert.equal(ymOf(p, 13), '2028-01');
  assert.match(periodLabel(p), /2027/);
});

test('ramp-up: nothing while onboarding, then rising steps, then full', () => {
  // two onboarding months, three ramp months
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((k) => rampFactor(k, 2, 3)), [0, 0, 0.25, 0.5, 0.75, 1, 1]);
  assert.equal(rampFactor(1, 0, 0), 1);
});

test('a salary entered in local currency is converted at the continent’s rate', () => {
  const cont = { currency: { code: 'ASD', rateToBase: 62 } };
  assert.equal(salaryInBase({ salary: { amount: 100000, currency: 'local' } }, cont), 6200000);
  assert.equal(salaryInBase({ salary: { amount: 100000, currency: 'base' } }, cont), 100000);
});

test('the same inputs always give the same results', () => {
  const a = computeAll(practiceDoc());
  const b = computeAll(practiceDoc());
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  // a stored-and-reloaded copy is the same input
  const doc = practiceDoc();
  assert.equal(inputHash(JSON.parse(JSON.stringify(doc))), inputHash(doc));
  // record keeping (who edited, when) is not an input; a figure is
  const c = practiceDoc(); c.updatedAt = 'later'; c.rev = 99; c.audit = [{ seq: 1 }];
  assert.equal(inputHash(c), inputHash(doc));
  c.deployments[0].salary.amount += 1;
  assert.notEqual(inputHash(c), inputHash(doc));
});

test('the engine uses no clock and no random numbers', () => {
  const dir = join(root, 'src/engine');
  for (const f of readdirSync(dir)) {
    const s = readFileSync(join(dir, f), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/\bDate\b/.test(s), `${f} uses Date`);
    assert.ok(!/Math\.random/.test(s), `${f} uses Math.random`);
  }
});

test('Regional Opportunity Score stays on 0–100 and its factor shares add up', () => {
  const res = computeAll(practiceDoc());
  for (const r of Object.values(res.regions)) {
    assert.ok(r.opportunity.score >= 0 && r.opportunity.score <= 100, r.cityId);
  }
  for (const d of Object.values(res.deployments)) {
    if (!d.valid) continue;
    assert.ok(d.opportunity.score >= 0 && d.opportunity.score <= 100, d.id);
    assert.ok(d.opportunity.factors.reduce((a, f) => a + (f.share || 0), 0) <= 100.0001, d.id);
  }
});

test('productivity is capped and never negative, for any auction and any plan', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const rand = rng(seed);
    const doc = blankDoc();
    applyAuction(doc, randomAuction(doc, rand));
    for (const t of doc.teams) applyDeployments(doc, { [t.id]: strategyPlan(doc, t.id, ['cluster', 'random', 'home', 'scattered'][seed % 4], rand) });
    applyCompliance(doc);
    const res = computeAll(doc);
    const cap = doc.config.productivity.maxProductivity;
    for (const d of Object.values(res.deployments)) if (d.valid) assert.ok(d.productivity.value >= 0 && d.productivity.value <= cap + 1e-12, `${seed} ${d.id}`);
    for (const t of Object.values(res.round2.teams)) {
      assert.ok(t.lines.every((l) => Number.isInteger(l.amount)));
      assert.equal(t.statement.totalCosts, t.lines.filter((l) => l.kind === 'cost').reduce((s, l) => s + l.amount, 0));
    }
  }
});

test('the sample configuration is valid, and fixed checks cannot be downgraded', () => {
  const issues = configIssues(buildContext(blankDoc()));
  assert.deepEqual(issues.filter((i) => i.severity === 'blocking').map((i) => i.code), []);
  const doc = practiceDoc();
  doc.config.validationSeverity = { R1_TEAM_SIZE: 'warning', R2_SUBMISSION: 'blocking' };
  doc.auction.records.find((r) => r.employeeId === 'E01').status = 'available';
  doc.auction.records.find((r) => r.employeeId === 'E01').winningTeamId = null;
  const res = computeAll(doc);
  const size = res.validation.round1.find((i) => i.code === 'R1_TEAM_SIZE');
  assert.equal(size.severity, 'blocking'); // fixed: the setting is ignored
  assert.equal(CHECKS.R2_SUBMISSION.fixed, false);
});

test('ranking weights must total 100', () => {
  const doc = blankDoc();
  doc.config.ranking.weights = { financial: 60, deployment: 20, compliance: 15, budget: 10 };
  assert.ok(configIssues(buildContext(doc)).some((i) => i.code === 'CFG_WEIGHTS' && i.severity === 'blocking'));
});

test('a blocked deployment earns nothing; the person stays on the home payroll', () => {
  const res = computeAll(practiceDoc());
  const blocked = Object.values(res.deployments).filter((d) => d.valid && !d.operational);
  assert.ok(blocked.length >= 1);
  for (const d of blocked) {
    assert.equal(d.result.revenue, 0, d.id);
    const team = res.round2.teams[d.teamId];
    assert.ok(!team.lines.some((l) => l.depId === d.id && ['salary', 'relocation', 'housing', 'opex'].includes(l.cat)), d.id);
    assert.ok(team.lines.some((l) => l.empId === d.employeeId && !l.depId && l.cat === 'salary'), d.id);
  }
});
