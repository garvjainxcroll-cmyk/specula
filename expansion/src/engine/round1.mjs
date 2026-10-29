// Round 1 — the CV auction. The auction itself happens in the room; this records its
// official outcome and works out what each team has committed to.
//
//   Total winning bids        = Σ winning bids of the team's employees
//   Initial hiring cost       = winning bids + one-time recruitment costs + onboarding costs
//   Annual workforce cost     = Σ contracted salaries (expected salary, adjusted only by the
//                               configured salary rule) + employer contributions at the
//                               home continent's rate
// Auction price, recruitment, onboarding, salary, relocation and training stay in separate
// categories. Relocation and training are shown here as estimates only: they are charged in
// Round 2, when a deployment actually moves or trains someone, so nothing is counted twice.

import { TECH_KEYS, SENIORITY, CHECKS } from './model.mjs';
import { sum, r1, money } from './money.mjs';
import { indicesOf, capValue, techAverage } from './capability.mjs';

export const contractedSalary = (e, cfg) => money(e.employment.expectedSalary * (1 + (Number(cfg.round1?.salaryAdjustmentPct) || 0) / 100));

export function severityOf(cfg, code) {
  const c = CHECKS[code];
  if (!c) return 'blocking';
  if (c.fixed) return c.severity;
  return cfg.validationSeverity?.[code] || c.severity;
}
export function issue(cfg, code, message, ref = {}) {
  return { code, severity: severityOf(cfg, code), title: CHECKS[code]?.title || code, message, ref };
}

/** Budget usage of a team for the configured basis. */
export function budgetUse(m, cfg) {
  return cfg.auction.budgetBasis === 'initialHiringCost' ? m.initialHiringCost : m.totalBids;
}

export function teamRound1(ctx, teamId) {
  const { cfg } = ctx;
  const ids = ctx.roster[teamId] || [];
  const emps = ids.map((id) => ctx.employees.get(id)).filter(Boolean);
  const recs = ids.map((id) => ctx.auctionById.get(id));
  const prof = ctx.profiles[teamId];
  const team = ctx.teamById[teamId];
  const home = ctx.continents.get(team.homeContinentId);
  const totalBids = sum(recs.map((r) => r?.winningBid || 0));
  const recruitment = sum(emps.map((e) => e.employment.hiringCost || 0));
  const onboarding = sum(emps.map((e) => e.employment.onboardingCost || 0));
  const salaries = sum(emps.map((e) => contractedSalary(e, cfg)));
  const employerPct = Number(home?.attrs?.employerContributionPct) || 0;
  const employer = money(salaries * employerPct / 100);
  const m = {
    teamId, count: emps.length, employeeIds: ids,
    totalBids, recruitment, onboarding,
    initialHiringCost: totalBids + recruitment + onboarding,
    expectedSalaries: salaries, employerEstimate: employer, employerPct,
    workforceCost: salaries + employer,
    expectedRelocation: sum(emps.map((e) => e.employment.relocationBase || 0)),
    expectedTraining: sum(emps.filter((e) => e.employment.trainingRequired).map((e) => e.employment.trainingCost || 0)),
    budgetEnabled: !!cfg.auction.budgetEnabled,
    budget: cfg.auction.budgetEnabled ? Number(prof.acquisitionBudget) || 0 : null,
  };
  m.budgetUsed = budgetUse(m, cfg);
  m.budgetRemaining = m.budget === null ? null : m.budget - m.budgetUsed;
  m.overBudget = m.budget !== null && m.budgetUsed > m.budget;
  const avg = (f) => (emps.length ? r1(sum(emps.map(f)) / emps.length) : 0);
  m.avgCapability = avg(techAverage);
  m.byFunction = Object.fromEntries(TECH_KEYS.map((k) => [k, avg((e) => capValue(e, k))]));
  m.byFunctionMax = Object.fromEntries(TECH_KEYS.map((k) => [k, emps.length ? Math.max(...emps.map((e) => capValue(e, k))) : 0]));
  m.seniority = Object.fromEntries(SENIORITY.map((s) => [s, emps.filter((e) => e.seniority === s).length]));
  m.intlExperience = avg((e) => capValue(e, 'intlExperience'));
  m.culturalAdaptability = avg((e) => capValue(e, 'culturalAdaptability'));
  const idx = emps.map((e) => indicesOf(e, cfg.indices));
  m.indices = Object.fromEntries(Object.keys(cfg.indices).map((k) => [k, idx.length ? r1(sum(idx.map((x) => x[k])) / idx.length) : 0]));
  m.functions = Object.fromEntries(Object.keys(m.byFunction).map((k) => [k, emps.filter((e) => e.primaryFunction === k).length]));
  return m;
}

export function round1Issues(ctx) {
  const { cfg, doc } = ctx;
  const out = [];
  const size = cfg.auction.teamSize;
  for (const t of ctx.teams) {
    const n = (ctx.roster[t.id] || []).length;
    if (n < size && cfg.auction.allowShortTeams) out.push(issue(cfg, 'R1_TEAM_SHORT', `${t.label} has ${n} of ${size} employees and goes into Round 2 short-handed (Event Control has allowed this).`, { kind: 'team', id: t.id }));
    else if (n !== size) out.push(issue(cfg, 'R1_TEAM_SIZE', `${t.label} has ${n} of ${size} employees.`, { kind: 'team', id: t.id }));
  }
  for (const r of doc.auction?.records || []) {
    const e = ctx.employees.get(r.employeeId);
    const nm = e ? `${e.id} ${e.name}` : r.employeeId;
    if (r.status === 'available' || r.status === 'live') {
      out.push(issue(cfg, 'R1_UNRESOLVED', `${nm} has not been sold (${r.status === 'live' ? 'currently being auctioned' : 'not yet auctioned'}).`, { kind: 'employee', id: r.employeeId }));
    } else if ((r.status === 'withdrawn' || r.status === 'closed') && r.resolution?.kind !== 'unallocated') {
      out.push(issue(cfg, 'R1_UNRESOLVED', `${nm} is ${r.status === 'withdrawn' ? 'withdrawn' : 'unsold'}: re-open it for auction, allocate it by Event Control decision, or record it as left unallocated.`, { kind: 'employee', id: r.employeeId }));
    } else if (r.status === 'sold' && !r.confirmed) {
      out.push(issue(cfg, 'R1_UNCONFIRMED', `The sale of ${nm} is not confirmed.`, { kind: 'employee', id: r.employeeId }));
    }
    if (r.status === 'sold' && r.confirmed && Number.isFinite(r.startingBid) && r.winningBid < r.startingBid && r.resolution?.kind !== 'direct') {
      out.push(issue(cfg, 'R1_BELOW_START', `${nm} sold for ${ctx.fmt(r.winningBid)}, below its starting bid of ${ctx.fmt(r.startingBid)}.`, { kind: 'employee', id: r.employeeId }));
    }
  }
  for (const t of ctx.teams) {
    const m = teamRound1(ctx, t.id);
    if (m.overBudget) out.push(issue(cfg, 'R1_BUDGET', `${t.label} has used ${ctx.fmt(m.budgetUsed)} of its ${ctx.fmt(m.budget)} acquisition budget.`, { kind: 'team', id: t.id }));
  }
  return out;
}

/**
 * Would this sale be allowed? errors stop it; budget may need acknowledging.
 * Used by the server before recording a sale (and shown to the operator first).
 */
export function checkSale(ctx, { employeeId, teamId, amount }) {
  const { cfg } = ctx;
  const errors = []; const warnings = [];
  const rec = ctx.auctionById.get(employeeId);
  const team = ctx.teamById[teamId];
  if (!rec) errors.push('There is no auction record for this CV.');
  if (!team) errors.push('Choose a valid team.');
  if (!Number.isInteger(amount) || amount < 0) errors.push('The winning bid must be a number of zero or more.');
  if (rec && rec.status === 'sold') errors.push(`This CV is already sold to ${ctx.teamById[rec.winningTeamId]?.label || rec.winningTeamId}. A correction needs a Super Administrator.`);
  if (rec && !['available', 'live'].includes(rec.status)) {
    if (rec.status !== 'sold') errors.push('Only an available CV, or the one being auctioned, can be sold. Re-open a withdrawn or unsold CV first.');
  }
  if (team && (ctx.roster[teamId] || []).length >= cfg.auction.teamSize) errors.push(`${team.label} already has ${cfg.auction.teamSize} employees and cannot hire another.`);
  let budget = null;
  if (team && !errors.length && cfg.auction.budgetEnabled) {
    const m = teamRound1(ctx, teamId);
    const e = ctx.employees.get(employeeId);
    const extra = cfg.auction.budgetBasis === 'initialHiringCost' ? amount + (e?.employment.hiringCost || 0) + (e?.employment.onboardingCost || 0) : amount;
    const after = m.budgetUsed + extra;
    budget = { before: m.budgetUsed, after, budget: m.budget, over: after > m.budget };
    if (budget.over) {
      const msg = `${team.label} would use ${ctx.fmt(after)} of its ${ctx.fmt(m.budget)} acquisition budget.`;
      if (cfg.auction.budgetEnforcement === 'block') errors.push(`${msg} The budget is enforced, so the sale cannot be recorded.`);
      else warnings.push(msg);
    }
  }
  return { errors, warnings, budget };
}

export function round1Results(ctx) {
  const teams = Object.fromEntries(ctx.teams.map((t) => [t.id, teamRound1(ctx, t.id)]));
  const recs = ctx.doc.auction?.records || [];
  const counts = { available: 0, live: 0, sold: 0, withdrawn: 0, closed: 0 };
  for (const r of recs) counts[r.status] = (counts[r.status] || 0) + 1;
  return { teams, counts, total: recs.length, issues: round1Issues(ctx) };
}
