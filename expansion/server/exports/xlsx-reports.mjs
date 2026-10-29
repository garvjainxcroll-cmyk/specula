// Excel reports. Totals are live formulas (with their values cached), money uses the
// configured currency format, and each financial sheet carries a reconciliation check
// against the engine's stored total.
import { ref, col } from './xlsx.mjs';
import { helpers } from './common.mjs';
import { CATEGORIES, COST_TYPES, COMPLIANCE_STATUS, FUNCTION_LABELS, TECH_KEYS, SOFT_KEYS, CAP_LABELS, INDEX_LABELS, ATTRS, CHECKS, REVENUE_TYPES, AUCTION_STATUS } from '../../src/engine/model.mjs';
import { STATEMENT_FORMULAS, CATEGORY_FORMULAS } from '../../src/engine/trace.mjs';
import { COMPONENTS, METRICS } from '../../src/engine/ranking.mjs';

const H = (v) => ({ v, s: 'head' });
const M = (v) => ({ v: v ?? null, s: 'money' });
const MB = (v, f) => ({ v, f, s: 'moneyBold' });
const P = (pctValue) => ({ v: pctValue === null || pctValue === undefined ? null : pctValue / 100, s: 'pct' });
const N = (v) => ({ v: v ?? null, s: 'num' });
const B = (v) => ({ v, s: 'bold' });
const note = (v) => ({ v, s: 'note' });
const TOT = (sh, c, a, b) => ({ v: sh.sum(c, a, b), f: `SUM(${c}${a}:${c}${b})`, s: 'moneyBold' });
const yesNo = (b) => (b ? 'Yes' : 'No');

function cover(sh, title, src, d) {
  sh.row([{ v: `${d.config.event.name} — ${title}`, s: 'title' }], { height: 22 });
  sh.row([{ v: d.config.event.round, s: 'subtitle' }]);
  sh.row([{ v: src?.label || '', s: src?.draft ? 'flag' : 'subtitle' }]);
  sh.row([note(`${d.notice || 'Fictional simulation data.'} Session: ${d.name} (${d.mode}). Currency: ${d.config.currency.name} (${d.config.currency.code}); amounts in whole ${d.config.currency.code}.`)]);
  sh.blank();
}

export function auctionXlsx(wb, d, r, src) {
  const h = helpers(d);
  const sh = wb.sheet('Auction results', { cols: [7, 8, 26, 12, 24, 15, 15, 12, 22, 18, 20, 30, 40], freeze: 7 });
  cover(sh, 'Round 1 — CV Auction Results', src, d);
  sh.row(['Order', 'CV ID', 'Name', 'Seniority', 'Primary function', 'Starting bid', 'Winning bid', 'Winning team', 'Status', 'Confirmed by', 'Confirmed at', 'Resolution', 'Operator notes'].map(H));
  const first = sh.next;
  const recs = [...d.auction.records].sort((a, b) => a.order - b.order);
  for (const x of recs) {
    const e = h.emps[x.employeeId];
    sh.row([x.order, x.employeeId, e?.name, e?.seniority, FUNCTION_LABELS[e?.primaryFunction], M(h.major(x.startingBid)), M(h.major(x.winningBid)), x.winningTeamId || '', AUCTION_STATUS[x.status], x.confirmedBy || '', x.confirmedAt || '', x.resolution ? `${x.resolution.kind}${x.resolution.reason ? `: ${x.resolution.reason}` : ''}` : '', x.notes || '']);
  }
  const last = sh.next - 1;
  sh.row([B('Total'), '', '', '', '', MB(h.major(recs.reduce((s, x) => s + (x.startingBid || 0), 0)), `SUM(F${first}:F${last})`), MB(h.major(recs.reduce((s, x) => s + (x.winningBid || 0), 0)), `SUM(G${first}:G${last})`)]);

  const ts = wb.sheet('Team summary', { cols: [14, 10, 16, 16, 16, 18, 18, 18, 18, 16, 16, 16, 16, 12, 14], freeze: 7 });
  cover(ts, 'Round 1 — Team Recruitment Summary', src, d);
  ts.row(['Team', 'Employees', 'Total winning bids', 'Recruitment costs', 'Onboarding costs', 'Initial hiring cost', 'Expected salaries (a year)', 'Employer contributions (estimate)', 'Annual workforce cost', 'Expected relocation (Round 2 estimate)', 'Expected training (Round 2 estimate)', 'Acquisition budget', 'Budget remaining', 'Average capability', 'Check: bids reconcile'].map(H));
  const tfirst = ts.next;
  for (const t of d.teams) {
    const m = r.round1.teams[t.id];
    const row = ts.next;
    ts.row([
      t.label, { v: m.count, f: `COUNTIF('Auction results'!H${first}:H${last},"${t.id}")`, s: 'int' },
      { v: h.major(m.totalBids), f: `SUMIF('Auction results'!H${first}:H${last},"${t.id}",'Auction results'!G${first}:G${last})`, s: 'money' },
      M(h.major(m.recruitment)), M(h.major(m.onboarding)), { v: h.major(m.initialHiringCost), f: `C${row}+D${row}+E${row}`, s: 'money' },
      M(h.major(m.expectedSalaries)), M(h.major(m.employerEstimate)), { v: h.major(m.workforceCost), f: `G${row}+H${row}`, s: 'money' },
      M(h.major(m.expectedRelocation)), M(h.major(m.expectedTraining)), M(h.major(m.budget)),
      m.budget === null ? 'No budget' : { v: h.major(m.budgetRemaining), f: `L${row}-${d.config.auction.budgetBasis === 'initialHiringCost' ? `F${row}` : `C${row}`}`, s: 'money' },
      N(m.avgCapability), { v: true, f: `ROUND(C${row},2)=ROUND(${h.major(m.totalBids)},2)` },
    ]);
  }
  const tl = ts.next - 1;
  ts.row([B('All teams'), { v: d.teams.reduce((s, t) => s + r.round1.teams[t.id].count, 0), f: `SUM(B${tfirst}:B${tl})`, s: 'numBold' }, ...['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'].map((c) => TOT(ts, c, tfirst, tl))]);
  ts.blank();
  ts.row([note('Initial hiring cost = winning bids + recruitment + onboarding. Salaries are an annual commitment; relocation and training are estimates charged only in Round 2 when a deployment needs them, so nothing is counted twice.')]);

  const cap = wb.sheet('Capabilities', { cols: [14, ...TECH_KEYS.map(() => 12), 12, 12, 12] });
  cover(cap, 'Round 1 — Capability by Function', src, d);
  cap.row(['Team', ...TECH_KEYS.map((k) => FUNCTION_LABELS[k]), 'International experience', 'Cultural adaptability', 'Seniority mix'].map(H));
  for (const t of d.teams) {
    const m = r.round1.teams[t.id];
    cap.row([t.label, ...TECH_KEYS.map((k) => N(m.byFunction[k])), N(m.intlExperience), N(m.culturalAdaptability), Object.entries(m.seniority).filter(([, n]) => n).map(([s, n]) => `${n} ${s}`).join(', ')]);
  }
  if ((d.round1.corrections || []).length) {
    const c = wb.sheet('Corrections', { cols: [20, 14, 12, 30, 30, 50] });
    cover(c, 'Round 1 — Corrections After Locking', src, d);
    c.row(['When', 'By', 'CV', 'Before', 'After', 'Reason'].map(H));
    for (const x of d.round1.corrections) c.row([x.at, x.by, x.employeeId, `${x.before.winningTeamId || '—'} at ${h.m(x.before.winningBid)}`, x.after.status === 'sold' ? `${x.after.winningTeamId} at ${h.m(x.after.winningBid)}` : 'Sale cancelled', x.reason]);
  }
}

export function cvsXlsx(wb, d, r) {
  const h = helpers(d);
  const sh = wb.sheet('CV repository', { cols: [7, 24, 6, 10, 14, 34, 28, 12, 18, 8, 40, 30, 30, 40, 26, 30, ...TECH_KEYS.map(() => 9), ...SOFT_KEYS.map(() => 9), 14, 14, 13, 13, 13, 13, 9, 9, 9, 9, 12, 30, 40, 40, 30, 40, 10, 40, 13], freeze: 7 });
  cover(sh, 'Employee CV Repository', { label: 'Twenty fictional CVs for the Round 1 auction' }, d);
  sh.row(['ID', 'Name', 'Age', 'Origin', 'Nationality', 'Headline', 'Category', 'Seniority', 'Primary function', 'Years', 'Education', 'Certifications', 'Previous industries', 'International assignments', 'Languages', 'Leadership experience',
    ...TECH_KEYS.map((k) => CAP_LABELS[k]), ...SOFT_KEYS.map((k) => CAP_LABELS[k]),
    'Expected salary', 'Minimum acceptable salary', 'Recruitment cost', 'Onboarding cost', 'Relocation estimate', 'Training cost', 'Training required', 'Onboarding (months)', 'Ramp-up (months)', 'Contract (months)', 'Relocation needs', 'Restrictions',
    'Strengths', 'Limitations', 'Best-fit roles', 'Suitable environments', 'International suitability', 'Disclosed risk factor', 'Starting bid'].map(H));
  for (const e of d.employees) {
    const em = e.employment; const st = e.strategic;
    sh.row([e.id, e.name, e.age, h.cont(e.origin), e.nationality, e.headline, e.category, e.seniority, FUNCTION_LABELS[e.primaryFunction], e.yearsExperience, (e.education || []).join('; '), (e.certifications || []).join('; '), (e.previousIndustries || []).join('; '),
      (e.internationalAssignments || []).map((a) => `${a.place} (${a.years} yr, ${a.role})`).join('; '), (e.languages || []).join(', '), e.leadershipExperience || '',
      ...TECH_KEYS.map((k) => ({ v: e.technical[k], s: 'int' })), ...SOFT_KEYS.map((k) => ({ v: e.soft[k], s: 'int' })),
      M(h.major(em.expectedSalary)), M(h.major(em.minSalary)), M(h.major(em.hiringCost)), M(h.major(em.onboardingCost)), M(h.major(em.relocationBase)), M(h.major(em.trainingCost)), yesNo(em.trainingRequired), em.onboardingMonths, em.rampUpMonths, em.contractMonths, em.relocationNeeds, (em.restrictions || []).join('; '),
      (st.strengths || []).join('; '), (st.limitations || []).join('; '), (st.bestFit || []).map(h.role).join(', '), st.environments, st.intlSuitability, st.risk?.kind && st.risk.kind !== 'none' ? `${st.risk.kind}: ${st.risk.text}` : 'None disclosed',
      M(h.major(d.auction.records.find((x) => x.employeeId === e.id)?.startingBid))]);
  }
  const ix = wb.sheet('Capability indices', { cols: [7, 24, ...Object.keys(INDEX_LABELS).map(() => 16), 30, 30, 30], freeze: 7 });
  cover(ix, 'Capability Indices (administrator-weighted)', { label: 'Inputs to the model: capability is kept separate from financial outcomes' }, d);
  ix.row(['ID', 'Name', ...Object.values(INDEX_LABELS), 'Best role', 'Second role', 'Third role'].map(H));
  for (const e of d.employees) {
    const x = r.employees[e.id];
    ix.row([e.id, e.name, ...Object.keys(INDEX_LABELS).map((k) => N(x.indices[k])), ...x.roles.slice(0, 3).map((ro) => `${ro.name} (${ro.fit})`)]);
  }
}

function deploymentRows(d, r, filterTeam = null) {
  return Object.values(r.deployments).filter((x) => x.valid && (!filterTeam || x.teamId === filterTeam)).sort((a, b) => a.id.localeCompare(b.id));
}

export function deploymentsXlsx(wb, d, r, src) {
  const h = helpers(d);
  const sh = wb.sheet('Deployment register', { cols: [7, 10, 26, 12, 12, 14, 30, 26, 14, 9, 11, 16, 9, 9, 9, 9, 8, 30, 16, 30, 26, 14, 10, 10, 10, 10, 15, 15, 15, 30], freeze: 7 });
  cover(sh, 'Round 2 — Deployment Register', src, d);
  sh.row(['ID', 'Team', 'Employee', 'Home continent', 'Destination continent', 'Destination city', 'Job role', 'Assignment type', 'Annual salary (base)', 'Months', 'Start', 'Relocation package', 'Training', 'Local partner', 'Office', 'Time share', 'Operational', 'Responsibility', 'Business unit', 'Expected contribution', 'Permits obtained', 'Approval', 'Productivity', 'Role suitability', 'Opportunity score', 'Effective months', 'Revenue', 'Costs', 'Contribution', 'Compliance'].map(H));
  const first = sh.next;
  for (const x of deploymentRows(d, r)) {
    const dep = d.deployments.find((y) => y.id === x.id);
    const row = sh.next;
    sh.row([x.id, h.team(x.teamId), h.emp(x.employeeId), h.cont(h.teams[x.teamId].homeContinentId), h.cont(x.continentId), h.city(x.cityId), h.role(x.roleId), h.type(x.typeId), M(h.major(x.salaryBase)), dep.contractMonths, h.ym(dep.startMonth), dep.relocationPackage, yesNo(dep.trainingProvided), yesNo(dep.localPartner), yesNo(dep.officeArranged), P(x.share * 100), yesNo(x.operational),
      dep.responsibility, dep.businessUnit, dep.contribution, dep.permitsObtained, x.approval, N(x.productivity.value), N(x.productivity.roleSuitability), N(x.opportunity.score), N(x.result.effectiveMonths),
      M(h.major(x.result.revenue)), M(h.major(x.result.costs)), { v: h.major(x.result.contribution), f: `AA${row}-AB${row}`, s: 'money' },
      Object.entries(x.compliance.counts).filter(([, n]) => n).map(([s, n]) => `${n} ${COMPLIANCE_STATUS[s]}`).join(', ')]);
  }
  const last = sh.next - 1;
  if (last >= first) sh.row([B('Total'), ...Array(25).fill(''), TOT(sh, 'AA', first, last), TOT(sh, 'AB', first, last), { v: Math.round((sh.sum('AA', first, last) - sh.sum('AB', first, last)) * 100) / 100, f: `SUM(AC${first}:AC${last})`, s: 'moneyBold' }]);
  sh.blank();
  sh.row([note('Deployment revenue and costs are those attributed to the deployment itself. Shared city costs (office, market entry, logistics, partner fees, taxes) and salaries paid at headquarters appear in the team reports.')]);
}

export function complianceXlsx(wb, d, r, src) {
  const h = helpers(d);
  const sh = wb.sheet('Compliance register', { cols: [7, 10, 24, 14, 9, 30, 22, 10, 9, 8, 26, 24, 10, 34, 13, 13, 13, 13, 10, 44], freeze: 7 });
  cover(sh, 'Legal and Compliance Report', src, d);
  sh.row(['Deployment', 'Team', 'Employee', 'City', 'Rule', 'Requirement', 'Category', 'Mandatory', 'Blocks', 'Source', 'Status', 'Evidence', 'Evidence missing', 'Waiver (administrative override)', 'One-time cost', 'Annual cost', 'Documentation cost', 'Penalty', 'Revenue impact', 'Detail'].map(H));
  const first = sh.next;
  for (const x of deploymentRows(d, r)) for (const e of x.compliance.evals) {
    sh.row([x.id, h.team(x.teamId), h.emp(x.employeeId), h.city(x.cityId), e.ruleId, e.title, e.category, yesNo(e.mandatory), yesNo(e.blocks), e.source === 'auto' ? 'Automatic' : 'Operator', COMPLIANCE_STATUS[e.status], e.evidence, yesNo(e.evidenceMissing), e.waiver ? `${e.waiver.reason} (${e.waiver.by}, ${e.waiver.at})` : '',
      M(h.major(e.oneTimeCost)), M(h.major(e.annualCost)), M(h.major(e.documentationCost)), M(h.major(e.penalty)), P(e.revenueImpactPct), e.detail || e.note || '']);
  }
  const last = sh.next - 1;
  if (last >= first) sh.row([B('Total'), ...Array(13).fill(''), ...['O', 'P', 'Q', 'R'].map((c) => TOT(sh, c, first, last))]);
  const su = wb.sheet('Summary by team', { cols: [14, 12, 12, 14, 12, 14, 12, 12, 16, 16, 16] });
  cover(su, 'Compliance Summary by Team', src, d);
  su.row(['Team', 'Compliant', 'Pending', 'Non-compliant', 'Not assessed', 'Admin review', 'Waived', 'Blocked deployments', 'Compliance score', 'Readiness', 'Cost of non-compliance'].map(H));
  for (const t of d.teams) {
    const mt = r.round2.teams[t.id].metrics;
    const evs = deploymentRows(d, r, t.id).flatMap((x) => x.compliance.evals);
    const n = (s) => evs.filter((e) => e.status === s).length;
    su.row([t.label, n('compliant'), n('pending'), n('noncompliant'), n('unassessed'), n('review'), n('waived'), mt.blockedCount, N(mt.complianceScore), P(mt.readinessPct), M(h.major(mt.costOfNonCompliance))]);
  }
}

/** The detailed financial workbook of one team. */
export function teamXlsx(wb, d, r, src, teamId) {
  const h = helpers(d);
  const t = h.teams[teamId];
  const res = r.round2.teams[teamId];
  const st = res.statement;
  const sh = wb.sheet('Financial statement', { cols: [46, 18, 60] });
  cover(sh, `${t.label} — Financial Report`, src, d);
  sh.row(['Line', 'Amount', 'How it is calculated'].map(H));
  const sec = (label) => sh.row([B(label), '', '']);
  // revenue
  sec('Revenue');
  const rv = []; for (const [k, label] of Object.entries(REVENUE_TYPES)) rv.push(sh.row([label, M(h.major(st.revenue.byType[k] || 0)), '']));
  const revRow = sh.row([B('Total revenue'), MB(h.major(st.revenue.total), `SUM(B${rv[0]}:B${rv.at(-1)})`), note(STATEMENT_FORMULAS.revenue)]);
  const sections = {};
  for (const [type, label] of Object.entries(COST_TYPES)) {
    sec(label);
    const s = st[type];
    const cats = Object.keys(CATEGORIES).filter((k) => (CATEGORIES[k].type === type && k !== 'savings') || (k === 'savings' && s.byCategory.savings));
    const rows = [];
    for (const k of cats) rows.push(sh.row([CATEGORIES[k].label, M(h.major(s.byCategory[k] || 0)), note(CATEGORY_FORMULAS[k] || '')]));
    sections[type] = sh.row([B(`Total ${label.toLowerCase()}`), MB(h.major(s.total), `SUM(B${rows[0]}:B${rows.at(-1)})`), note(STATEMENT_FORMULAS[type] || '')]);
  }
  sh.blank();
  const tc = sh.row([B('Total expansion costs'), MB(h.major(st.totalCosts), `B${sections.oneTime}+B${sections.recurring}+B${sections.contingent}`), note(STATEMENT_FORMULAS.totalCosts)]);
  const op = sh.row([B('Operating profit (loss)'), MB(h.major(st.operatingProfit), `B${revRow}-B${sections.recurring}`), note(STATEMENT_FORMULAS.operatingProfit)]);
  const net = sh.row([B('Round 2 incremental contribution (net expansion contribution)'), MB(h.major(st.netContribution), `B${revRow}-B${tc}`), note(STATEMENT_FORMULAS.netContribution)]);
  const r1 = sh.row(['Round 1 initial hiring cost (bids + recruitment + onboarding)', M(h.major(st.round1InitialHiringCost)), note('From Round 1; not deducted again inside Round 2.')]);
  const comb = sh.row([B('Combined recruitment-and-expansion outcome'), MB(h.major(st.combined), `B${net}-B${r1}`), note(STATEMENT_FORMULAS.combined)]);
  sh.blank();
  sh.row([B('Reconciliation checks'), '', '']);
  sh.row(['Net contribution equals the engine’s stored figure', { v: true, f: `ROUND(B${net},2)=ROUND(${h.major(st.netContribution)},2)` }, '']);
  sh.row(['Combined outcome equals the engine’s stored figure', { v: true, f: `ROUND(B${comb},2)=ROUND(${h.major(st.combined)},2)` }, '']);
  sh.row(['Operating profit equals the engine’s stored figure', { v: true, f: `ROUND(B${op},2)=ROUND(${h.major(st.operatingProfit)},2)` }, '']);
  sh.blank();
  const mt = res.metrics;
  sh.row([B('Ratios'), '', '']);
  const ratio = (label, v, f, formula) => sh.row([label, v === null || v === undefined ? 'n/a' : { v: v / 100, f, s: 'pct' }, note(formula)]);
  ratio('Profit margin', mt.profitMarginPct, revRow ? `IF(B${revRow}=0,"n/a",B${net}/B${revRow})` : null, STATEMENT_FORMULAS.margin);
  ratio('Operating margin', mt.operatingMarginPct, `IF(B${revRow}=0,"n/a",B${op}/B${revRow})`, 'Operating profit ÷ total revenue (n/a without revenue)');
  ratio('Return on expansion expenditure', mt.roeePct, `IF(B${tc}<=0,"n/a",B${net}/B${tc})`, STATEMENT_FORMULAS.roee);
  ratio('Combined return', mt.combinedReturnPct, `IF(B${tc}+B${r1}<=0,"n/a",B${comb}/(B${tc}+B${r1}))`, STATEMENT_FORMULAS.combinedReturn);
  ratio('Budget utilisation', mt.budgetUtilPct, mt.expansionBudget ? `B${tc}/${h.major(mt.expansionBudget)}` : null, STATEMENT_FORMULAS.budgetUtil);
  ratio('Revenue growth relative to baseline', mt.revenueGrowthPct, null, STATEMENT_FORMULAS.growth);
  sh.row(['Revenue per employee', M(h.major(mt.revenuePerEmployee)), note(STATEMENT_FORMULAS.perEmployee)]);
  sh.row(['Operating cost per employee', M(h.major(mt.operatingCostPerEmployee)), note(STATEMENT_FORMULAS.perEmployee)]);
  sh.row(['Profit per employee', M(h.major(mt.profitPerEmployee)), note(STATEMENT_FORMULAS.perEmployee)]);
  sh.row(['Cash remaining', M(h.major(mt.cashRemaining)), note(STATEMENT_FORMULAS.cash)]);
  sh.row(['Break-even revenue', mt.breakEvenRevenue === null ? 'n/a' : M(h.major(mt.breakEvenRevenue)), note(STATEMENT_FORMULAS.breakEven)]);
  sh.row(['Cost of non-compliance', M(h.major(mt.costOfNonCompliance)), note(STATEMENT_FORMULAS.nonCompliance)]);
  sh.row(['Revenue forgone through blocked or reduced deployments (estimate)', M(h.major(mt.revenueForgoneEstimate)), note('Standalone revenue the affected deployments would have earned with every requirement satisfied.')]);

  const dep = wb.sheet('Deployments', { cols: [7, 26, 30, 14, 14, 15, 15, 15, 15, 15, 10, 10, 30], freeze: 7 });
  cover(dep, `${t.label} — Employee Deployments`, src, d);
  dep.row(['ID', 'Employee', 'Role', 'Continent', 'City', 'Annual salary', 'One-time cost', 'Recurring cost', 'Contingent cost', 'Revenue', 'Productivity', 'Operational', 'Compliance status'].map(H));
  const dfirst = dep.next;
  for (const x of deploymentRows(d, r, teamId)) dep.row([x.id, h.emp(x.employeeId), h.role(x.roleId), h.cont(x.continentId), h.city(x.cityId), M(h.major(x.salaryBase)), M(h.major(x.result.oneTimeCosts)), M(h.major(x.result.recurringCosts)), M(h.major(x.result.contingentCosts)), M(h.major(x.result.revenue)), N(x.productivity.value), yesNo(x.operational), x.operational ? (x.compliance.counts.pending ? 'Operational, documents pending' : 'Operational') : `Blocked: ${x.compliance.blockers.join(', ')}`]);
  const dl = dep.next - 1;
  if (dl >= dfirst) dep.row([B('Total'), '', '', '', '', '', ...['G', 'H', 'I', 'J'].map((c) => TOT(dep, c, dfirst, dl))]);

  const em = wb.sheet('By employee', { cols: [7, 26, 30, 16, 16, 16, 16, 12] });
  cover(em, `${t.label} — Contribution by Employee`, src, d);
  em.row(['ID', 'Name', 'Main role', 'Revenue attributed', 'Own costs', 'Share of city costs', 'Contribution', 'Effectiveness'].map(H));
  const ef = em.next;
  for (const v of Object.values(res.byEmployee)) {
    const row = em.next;
    const md = res.mainDeployment[v.employeeId];
    em.row([v.employeeId, v.name, md ? h.role(r.deployments[md]?.roleId) : 'At headquarters (no deployment)', M(h.major(v.revenue)), M(h.major(v.ownCosts)), M(h.major(v.sharedCosts)), { v: h.major(v.contribution), f: `D${row}-E${row}-F${row}`, s: 'money' }, N(mt.effectivenessByEmployee?.[v.employeeId] ?? null)]);
  }
  const el = em.next - 1;
  em.row([B('Total'), '', '', ...['D', 'E', 'F', 'G'].map((c) => TOT(em, c, ef, el))]);
  em.row(['Reconciles with the net contribution', '', '', '', '', '', { v: true, f: `ROUND(G${el + 1},2)=ROUND(${h.major(st.netContribution)},2)` }]);

  const ci = wb.sheet('By city', { cols: [16, 14, 12, 16, 16, 16, 14, 14, 14] });
  cover(ci, `${t.label} — Regional Performance`, src, d);
  ci.row(['City', 'Continent', 'Presence', 'Revenue', 'Costs', 'Contribution', 'Opportunity score', 'Tax rate', 'Tax'].map(H));
  const cf = ci.next;
  for (const c of Object.values(res.byCity).sort((a, b) => b.contribution - a.contribution)) {
    const row = ci.next;
    ci.row([c.name, h.cont(c.continentId), c.mode || '', M(h.major(c.revenue)), M(h.major(c.costs)), { v: h.major(c.contribution), f: `D${row}-E${row}`, s: 'money' }, N(r.regions[c.cityId]?.opportunity?.score ?? null), c.tax ? P(c.tax.rate) : '', M(h.major(c.tax?.tax || 0))]);
  }
  const cl = ci.next - 1;
  ci.row([B('Total'), '', '', ...['D', 'E', 'F'].map((c) => TOT(ci, c, cf, cl))]);
  ci.blank();
  ci.row(['Continent', '', '', 'Revenue', 'Costs', 'Contribution'].map(H));
  for (const c of Object.values(res.byContinent)) ci.row([c.name, '', '', M(h.major(c.revenue)), M(h.major(c.costs)), M(h.major(c.contribution))]);

  const ln = wb.sheet('All lines', { cols: [10, 30, 22, 9, 26, 16, 14, 9, 9, 16], freeze: 7 });
  cover(ln, `${t.label} — Every Calculated Line`, src, d);
  ln.row(['Kind', 'Category', 'Of', 'Deployment', 'Employee', 'City', 'Continent', 'Rule', 'Source', 'Amount'].map(H));
  const lf = ln.next;
  for (const l of res.lines) ln.row([l.kind, l.kind === 'revenue' ? REVENUE_TYPES[l.cat] : CATEGORIES[l.cat]?.label || l.cat, l.of ? (CATEGORIES[l.of]?.label || l.of) : '', l.depId || '', l.empId ? h.emp(l.empId) : '', h.city(l.cityId), h.cont(l.contId), l.ruleId || '', l.srcId || '', M(h.major(l.kind === 'revenue' ? l.amount : -l.amount))]);
  const ll = ln.next - 1;
  ln.row([B('Net (revenue − costs)'), '', '', '', '', '', '', '', '', MB(h.major(st.netContribution), `SUM(J${lf}:J${ll})`)]);
  ln.row(['Reconciles with the net contribution', '', '', '', '', '', '', '', '', { v: true, f: `ROUND(J${ll + 1},2)=ROUND(${h.major(st.netContribution)},2)` }]);

  const an = wb.sheet('Decision analysis', { cols: [12, 110] });
  cover(an, `${t.label} — Decision Analysis`, src, d);
  an.row(['Effect', 'Statement (from the calculated figures)'].map(H));
  for (const a of res.analysis) an.row([a.tone, { v: a.text, s: 'wrap' }]);
}

export function comparisonXlsx(wb, d, r, src) {
  const h = helpers(d);
  const sh = wb.sheet('Four-team comparison', { cols: [46, ...d.teams.map(() => 18)], freeze: 7 });
  cover(sh, 'Four-Team Comparison', src, d);
  sh.row(['Measure', ...d.teams.map((t) => t.label)].map(H));
  const rows = {};
  const line = (key, label, get, kind = 'money', formulaFor = null) => {
    rows[key] = sh.next;
    sh.row([label, ...d.teams.map((t, i) => {
      const v = get(t.id);
      const c = col(i + 1);
      const f = formulaFor ? formulaFor(c) : null;
      if (v === null || v === undefined) return f ? { v: null, f, s: kind === 'pct' ? 'pct' : 'money' } : 'n/a';
      if (kind === 'money') return { v: h.major(v), f, s: f ? 'moneyBold' : 'money' };
      if (kind === 'pct') return { v: v / 100, f, s: 'pct' };
      return { v, s: 'num' };
    })]);
  };
  const T = (id) => r.round2.teams[id]; const R1 = (id) => r.round1.teams[id];
  sh.row([B('Round 1 — recruitment')]);
  line('bids', 'Total winning bids', (id) => R1(id).totalBids);
  line('hire', 'Initial hiring cost', (id) => R1(id).initialHiringCost);
  line('sal', 'Expected annual salaries', (id) => R1(id).expectedSalaries);
  line('cap', 'Average capability', (id) => R1(id).avgCapability, 'num');
  sh.row([B('Round 2 — expansion')]);
  line('rev', 'Total revenue', (id) => T(id).statement.revenue.total);
  line('one', 'One-time expansion costs', (id) => T(id).statement.oneTime.total);
  line('rec', 'Recurring costs', (id) => T(id).statement.recurring.total);
  line('con', 'Contingent costs', (id) => T(id).statement.contingent.total);
  line('tot', 'Total expansion costs', (id) => T(id).statement.totalCosts, 'money', (c) => `${c}${rows.one}+${c}${rows.rec}+${c}${rows.con}`);
  line('op', 'Operating profit (loss)', (id) => T(id).statement.operatingProfit, 'money', (c) => `${c}${rows.rev}-${c}${rows.rec}`);
  line('net', 'Round 2 incremental contribution', (id) => T(id).statement.netContribution, 'money', (c) => `${c}${rows.rev}-${c}${rows.tot}`);
  line('comb', 'Combined recruitment-and-expansion outcome', (id) => T(id).statement.combined, 'money', (c) => `${c}${rows.net}-${c}${rows.hire}`);
  line('margin', 'Profit margin', (id) => T(id).metrics.profitMarginPct, 'pct', (c) => `IF(${c}${rows.rev}=0,"n/a",${c}${rows.net}/${c}${rows.rev})`);
  line('roee', 'Return on expansion expenditure', (id) => T(id).metrics.roeePct, 'pct', (c) => `IF(${c}${rows.tot}<=0,"n/a",${c}${rows.net}/${c}${rows.tot})`);
  line('budget', 'Budget utilisation', (id) => T(id).metrics.budgetUtilPct, 'pct');
  line('cash', 'Cash remaining', (id) => T(id).metrics.cashRemaining);
  line('rpe', 'Revenue per employee', (id) => T(id).metrics.revenuePerEmployee);
  line('ppe', 'Profit per employee', (id) => T(id).metrics.profitPerEmployee);
  line('eff', 'Deployment effectiveness (0–100)', (id) => T(id).metrics.deploymentEffectiveness, 'num');
  line('comp', 'Compliance score (0–100)', (id) => T(id).metrics.complianceScore, 'num');
  line('ready', 'Operational readiness', (id) => T(id).metrics.readinessPct, 'pct');
  line('nonc', 'Cost of non-compliance', (id) => T(id).metrics.costOfNonCompliance);
  line('blk', 'Blocked deployments', (id) => T(id).metrics.blockedCount, 'num');
  sh.blank();
  sh.row([B('Reconciliation: combined outcome equals the engine’s stored figure'), ...d.teams.map((t, i) => ({ v: true, f: `ROUND(${col(i + 1)}${rows.comb},2)=ROUND(${h.major(T(t.id).statement.combined)},2)` }))]);
  const cont = wb.sheet('Revenue by continent', { cols: [20, ...d.teams.map(() => 18)] });
  cover(cont, 'Revenue and Contribution by Continent', src, d);
  cont.row(['Continent', ...d.teams.map((t) => `${t.label} revenue`), ...d.teams.map((t) => `${t.label} contribution`)].map(H));
  for (const k of d.continents) cont.row([k.name, ...d.teams.map((t) => M(h.major(T(t.id).byContinent[k.id]?.revenue || 0))), ...d.teams.map((t) => M(h.major(T(t.id).byContinent[k.id]?.contribution || 0)))]);
}

export function rankingsXlsx(wb, d, r, src) {
  const h = helpers(d);
  const rk = r.ranking;
  const sh = wb.sheet('Final rankings', { cols: [8, 14, 16, 16, 16, 16, 12, 12, 12, 12, 12, 12, 10, 10, 10, 90], freeze: 7 });
  cover(sh, 'Final Rankings', src, d);
  sh.row(['Rank', 'Team', 'Total revenue', 'Total expansion costs', 'Operating profit', 'Combined outcome', 'Budget utilisation', 'Financial score', 'Deployment effectiveness', 'Compliance score', 'Budget score', 'Overall score', 'Compliant deployments', 'Blocked', 'Violations', 'Why'].map(H));
  for (const x of rk.rows) {
    sh.row([x.rank === null ? 'Not ranked' : `${x.shared ? '=' : ''}${x.rank}`, x.label, M(h.major(x.revenue)), M(h.major(x.totalCosts)), M(h.major(x.operatingProfit)), M(h.major(x.combined)), x.budgetUtilPct === null ? 'n/a' : P(x.budgetUtilPct), N(x.components.financial), N(x.components.deployment), N(x.components.compliance), x.components.budget === null ? 'n/a' : N(x.components.budget), N(x.overall), x.compliantDeployments, x.blockedCount, x.violations, { v: x.explanation, s: 'wrap' }]);
  }
  sh.blank();
  sh.row([B('Method')]);
  sh.row([note(`Mode: ${rk.mode === 'weighted' ? 'weighted performance ranking' : 'financial ranking'}. Financial metric: ${METRICS[rk.metric]?.label}. Weights: ${Object.entries(rk.weights).map(([k, v]) => `${COMPONENTS[k]} ${v}%`).join(', ')}. Financial scores are scaled between the lowest (0) and highest (100) team; the other components are already on 0–100. Ties: ${rk.tieBreaks.join(', then ') || 'none configured'}; teams level on every rule share the place. Nothing is decided at random.`)]);
}

export function configXlsx(wb, d) {
  const h = helpers(d);
  const kv = wb.sheet('Settings', { cols: [34, 50, 60] });
  cover(kv, 'Configuration Snapshot', { label: `Configuration version ${d.configRev || 0}${d.config.formulasLocked ? ' · formulas locked' : ''}` }, d);
  kv.row(['Section', 'Setting', 'Value'].map(H));
  const walk = (prefix, o) => {
    for (const [k, v] of Object.entries(o)) {
      if (['roles', 'assignmentTypes', 'indices'].includes(k) && !prefix) continue;
      if (v && typeof v === 'object' && !Array.isArray(v)) walk(prefix ? `${prefix}.${k}` : k, v);
      else kv.row([prefix || k, prefix ? k : '', Array.isArray(v) ? v.join(', ') : v === null ? '(none)' : typeof v === 'number' && /cost|budget|Penalty|Annual|Cost/.test(k) && Number.isInteger(v) && v > 1000 ? h.m(v) : String(v)]);
    }
  };
  walk('', d.config);
  const ro = wb.sheet('Job roles', { cols: [18, 34, 14, 12, 10, 10, 50, 50, 60] });
  cover(ro, 'Job Roles and Effects', null, d);
  ro.row(['ID', 'Role', 'Function', 'Mechanism', 'Revenue factor', 'Logistics factor', 'Capability weights', 'Destination drivers', 'Effects on colleagues'].map(H));
  for (const x of d.config.roles) ro.row([x.id, x.name, FUNCTION_LABELS[x.function], x.mechanism, N(x.revenueFactor), N(x.logisticsFactor), Object.entries(x.weights).map(([k, v]) => `${CAP_LABELS[k]} ${v}`).join('; '), Object.entries(x.drivers).map(([k, v]) => `${k} ${v}`).join('; '), x.effects.map((e) => `${e.kind}${e.category ? `/${e.category}` : ''} ${e.scope}${e.target === 'international' ? ' (international)' : ''} up to ${Math.round(e.max * 100)}%`).join('; ')]);
  const ty = wb.sheet('Assignment types', { cols: [20, 36, 12, 12, 12, 14, 10] });
  cover(ty, 'Assignment Types', null, d);
  ty.row(['ID', 'Type', 'Relocation factor', 'Housing factor', 'Maximum months', 'Minimum seniority', 'Permitted'].map(H));
  for (const x of d.config.assignmentTypes) ty.row([x.id, x.name, N(x.relocationFactor), N(x.housingFactor), x.maxMonths ?? '—', x.minSeniority || '—', yesNo(d.config.deployment.allowedAssignmentTypes.includes(x.id))]);
  const tm = wb.sheet('Teams', { cols: [10, 28, 12, 14, 16, 16, 16, 16, 16, 18, 40] });
  cover(tm, 'Teams and Business Profiles', { label: d.config.identicalResources ? 'Identical resources: every team uses the standard profile’s figures' : 'Each team has its own profile' }, d);
  tm.row(['Team', 'Company', 'Home continent', 'Headquarters', 'Starting cash', 'Acquisition budget', 'Expansion budget', 'Baseline revenue', 'Baseline opex', 'Revenue model', 'Industry'].map(H));
  for (const t of d.teams) {
    const p = d.config.identicalResources ? { ...d.standardProfile, ...t.profile, ...Object.fromEntries(['startingCash', 'acquisitionBudget', 'expansionBudget', 'baselineRevenue', 'baselineOpex', 'revenueModelId', 'industry'].map((k) => [k, d.standardProfile[k]])) } : t.profile;
    tm.row([t.label, p.companyName, h.cont(t.homeContinentId), h.city(p.hqCityId), M(h.major(p.startingCash)), M(h.major(p.acquisitionBudget)), M(h.major(p.expansionBudget)), M(h.major(p.baselineRevenue)), M(h.major(p.baselineOpex)), d.revenueModels.find((m) => m.id === p.revenueModelId)?.name, p.industry]);
  }
  const co = wb.sheet('Continents', { cols: [28, ...d.continents.map(() => 16)] });
  cover(co, 'Continents (regional intelligence)', null, d);
  co.row(['Attribute', ...d.continents.map((c) => c.name)].map(H));
  for (const a of ATTRS) co.row([`${a.label}${a.unit ? ` (${a.unit})` : ''}`, ...d.continents.map((c) => { const v = c.attrs?.[a.key]; return v === null || v === undefined ? 'Not included in reports' : a.kind === 'money' ? M(h.major(v)) : N(v); })]);
  co.row(['Languages', ...d.continents.map((c) => (c.languages || []).join(', '))]);
  co.row(['Currency (rate to base)', ...d.continents.map((c) => (c.currency ? `${c.currency.code} × ${c.currency.rateToBase}` : '—'))]);
  co.row(['Role bonuses', ...d.continents.map((c) => (c.functionBonus === null ? 'Not included' : Object.entries(c.functionBonus || {}).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}%`).join(', ')))]);
  const ct = wb.sheet('Cities', { cols: [14, 16, 14, 16, 16, 16, 60, 40] });
  cover(ct, 'Cities and their adjustments', null, d);
  ct.row(['ID', 'City', 'Continent', 'Base revenue opportunity', 'Setup cost', 'Office (a year)', 'Adjustments to the continent', 'Special modifier'].map(H));
  for (const c of d.cities) ct.row([c.id, c.name, h.cont(c.continentId), c.baseRevenueOpportunity === null ? 'Not included' : M(h.major(c.baseRevenueOpportunity)), c.setupCost === null ? 'Not included' : M(h.major(c.setupCost)), c.officeCostAnnual === null ? 'Not included' : M(h.major(c.officeCostAnnual)), Object.entries(c.adj || {}).filter(([, v]) => v !== null).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join('; '), c.special === null ? 'Not included' : (c.special?.active ? c.special.label : '')]);
  const ru = wb.sheet('Compliance rules', { cols: [9, 34, 22, 20, 14, 9, 8, 10, 9, 22, 13, 13, 13, 10, 9, 9, 10, 50] });
  cover(ru, 'Compliance Rules (fictional unless marked)', null, d);
  ru.row(['ID', 'Requirement', 'Category', 'Where', 'Applies to', 'Mandatory', 'Blocks', 'Before deployment', 'Evidence', 'Check', 'Cost', 'Penalty', 'Cost type', 'Revenue impact', 'Waivable', 'Approved', 'Real law', 'Description'].map(H));
  for (const x of d.rules) ru.row([x.id, x.title, x.category, x.cityIds.length ? x.cityIds.map(h.city).join(', ') : x.continentIds.length ? x.continentIds.map(h.cont).join(', ') : 'All', x.appliesTo.when, yesNo(x.mandatory), yesNo(x.blocks), yesNo(x.satisfiableBefore), yesNo(x.evidenceRequired), x.check.kind, M(h.major(x.cost)), M(h.major(x.penalty)), x.costType, P(x.revenueImpactPct), yesNo(x.waivable), yesNo(x.approved), x.realLaw ? `Yes — verified by ${x.verifiedBy}` : 'No (fictional)', x.description]);
  const vs = wb.sheet('Validation checks', { cols: [24, 60, 12, 10] });
  cover(vs, 'Validation Checklist Severities', null, d);
  vs.row(['Code', 'Check', 'Severity', 'Fixed'].map(H));
  for (const [k, c] of Object.entries(CHECKS)) vs.row([k, c.title, c.fixed ? c.severity : (d.config.validationSeverity?.[k] || c.severity), yesNo(c.fixed)]);
}

export function auditXlsx(wb, d, entries) {
  const sh = wb.sheet('Audit log', { cols: [7, 20, 16, 12, 22, 14, 18, 60, 40, 80, 10], freeze: 7 });
  cover(sh, 'Audit Log', { label: `${entries.length} entries, newest first` }, d);
  sh.row(['#', 'When (UTC)', 'User', 'Role', 'Action', 'Kind', 'Target', 'Summary', 'Reason', 'Changes (field: before → after)', 'Reverted by'].map(H));
  const show = (v) => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v).slice(0, 120) : String(v).slice(0, 120));
  for (const e of entries) sh.row([e.seq, e.at, e.user?.username, e.user?.role, e.action, e.kind, `${e.target?.kind || ''} ${e.target?.id || ''}`, { v: e.summary, s: 'wrap' }, e.reason || '', { v: (e.changes || []).map((c) => `${c.path}: ${show(c.before)} → ${show(c.after)}`).join('\n').slice(0, 3000), s: 'wrap' }, e.revertedBy || '']);
}

export function auditCsv(entries) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['seq', 'at', 'user', 'role', 'action', 'kind', 'target', 'summary', 'reason', 'changes', 'revertedBy'].join(',')];
  for (const e of entries) lines.push([e.seq, e.at, e.user?.username, e.user?.role, e.action, e.kind, `${e.target?.kind || ''} ${e.target?.id || ''}`, e.summary, e.reason || '', (e.changes || []).map((c) => `${c.path}: ${JSON.stringify(c.before)} -> ${JSON.stringify(c.after)}`).join(' | '), e.revertedBy || ''].map(q).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}

export function allocationXlsx(wb, d, r, src) {
  const h = helpers(d);
  for (const t of d.teams) {
    const sh = wb.sheet(`${t.label} allocation`, { cols: [7, 26, 18, 12, 15, 15, 15, 15, 16, 14, 30, 14, 9, 15] });
    cover(sh, `${t.label} — Employee Allocation Sheet`, src, d);
    sh.row(['ID', 'Employee', 'Function', 'Seniority', 'Winning bid', 'Recruitment', 'Onboarding', 'Contracted salary', 'Destination', 'Continent', 'Role', 'Start', 'Months', 'Status'].map(H));
    const first = sh.next;
    for (const id of r.roster[t.id] || []) {
      const e = h.emps[id];
      const deps = Object.values(r.deployments).filter((x) => x.valid && x.employeeId === id && x.teamId === t.id);
      const rec = d.auction.records.find((x) => x.employeeId === id);
      const base = [id, e.name, FUNCTION_LABELS[e.primaryFunction], e.seniority, M(h.major(rec.winningBid)), M(h.major(e.employment.hiringCost)), M(h.major(e.employment.onboardingCost)), M(h.major(e.employment.expectedSalary))];
      if (!deps.length) sh.row([...base, 'Not yet deployed']);
      deps.forEach((x, i) => { const dep = d.deployments.find((y) => y.id === x.id); sh.row([...(i ? ['', '', '', '', '', '', '', ''] : base), h.city(x.cityId), h.cont(x.continentId), h.role(x.roleId), h.ym(dep.startMonth), dep.contractMonths, x.operational ? 'Operational' : 'Blocked']); });
    }
    const last = sh.next - 1;
    sh.row([B('Total'), '', '', '', ...['E', 'F', 'G', 'H'].map((c) => TOT(sh, c, first, last))]);
  }
}
