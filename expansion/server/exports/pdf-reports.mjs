// PDF reports. Every figure comes from the stored result passed in; charts are drawn from
// the same calculated data, never typed in.
import { PdfReport } from './pdf.mjs';
import { helpers, stamp } from './common.mjs';
import { CATEGORIES, COST_TYPES, COMPLIANCE_STATUS, FUNCTION_LABELS, REVENUE_TYPES, AUCTION_STATUS } from '../../src/engine/model.mjs';
import { STATEMENT_FORMULAS } from '../../src/engine/trace.mjs';
import { COMPONENTS, METRICS } from '../../src/engine/ranking.mjs';

async function open(d, src, title, subtitle, actor, opts = {}) {
  return PdfReport.create({
    title, subtitle, eventName: d.config.event.name, round: d.config.event.round, source: src?.label || '', draft: !!src?.draft,
    generated: `Generated ${stamp(new Date().toISOString())} by ${actor.username} (${actor.role}) · session “${d.name}” (${d.mode})`,
    notice: 'Fictional simulation data · Confidential to JACO CORP Event Control', ...opts,
  });
}
const yes = (b) => (b ? 'Yes' : 'No');

export async function auctionPdf(d, r, src, actor) {
  const h = helpers(d);
  const p = await open(d, src, 'Round 1 — CV Auction Results', `${d.auction.records.filter((x) => x.status === 'sold').length} of ${d.auction.records.length} CVs sold · team size ${d.config.auction.teamSize}`, actor);
  p.heading('Auction outcome');
  p.table({
    columns: [{ label: '#', w: 0.5 }, { label: 'CV', w: 0.7 }, { label: 'Name', w: 2.2 }, { label: 'Seniority', w: 1.1 }, { label: 'Function', w: 1.7 }, { label: 'Starting bid', w: 1.3, align: 'right' }, { label: 'Winning bid', w: 1.3, align: 'right' }, { label: 'Team', w: 0.9 }, { label: 'Status', w: 1.6 }],
    rows: [...d.auction.records].sort((a, b) => a.order - b.order).map((x) => [String(x.order), x.employeeId, h.emps[x.employeeId]?.name, h.emps[x.employeeId]?.seniority, FUNCTION_LABELS[h.emps[x.employeeId]?.primaryFunction], h.m(x.startingBid), x.winningBid === null ? '—' : h.m(x.winningBid), x.winningTeamId ? h.team(x.winningTeamId) : '—', `${AUCTION_STATUS[x.status]}${x.resolution?.kind === 'direct' ? ' (direct)' : x.resolution?.kind === 'unallocated' ? ' (unallocated)' : ''}`]),
  });
  p.heading('Recruitment expenditure by team');
  const T = r.round1.teams;
  p.table({
    columns: [{ label: 'Team', w: 1 }, { label: 'Hired', w: 0.6, align: 'right' }, { label: 'Winning bids', w: 1.3, align: 'right' }, { label: 'Recruitment', w: 1.2, align: 'right' }, { label: 'Onboarding', w: 1.1, align: 'right' }, { label: 'Initial hiring cost', w: 1.4, align: 'right' }, { label: 'Annual salaries', w: 1.3, align: 'right' }, { label: 'Budget left', w: 1.2, align: 'right' }, { label: 'Avg capability', w: 0.9, align: 'right' }],
    rows: d.teams.map((t) => { const m = T[t.id]; return [t.label, String(m.count), h.m(m.totalBids), h.m(m.recruitment), h.m(m.onboarding), h.m(m.initialHiringCost), h.m(m.expectedSalaries), m.budget === null ? 'No budget' : h.m(m.budgetRemaining), m.avgCapability.toFixed(1)]; }),
    totals: ['All teams', String(d.teams.reduce((s, t) => s + T[t.id].count, 0)), h.m(d.teams.reduce((s, t) => s + T[t.id].totalBids, 0)), h.m(d.teams.reduce((s, t) => s + T[t.id].recruitment, 0)), h.m(d.teams.reduce((s, t) => s + T[t.id].onboarding, 0)), h.m(d.teams.reduce((s, t) => s + T[t.id].initialHiringCost, 0)), h.m(d.teams.reduce((s, t) => s + T[t.id].expectedSalaries, 0)), '', ''],
  });
  p.bars({ title: 'Recruitment expenditure and salary obligations', series: ['Initial hiring cost', 'Annual salaries'], items: d.teams.map((t) => ({ label: t.label, values: [{ v: T[t.id].initialHiringCost, label: h.mc(T[t.id].initialHiringCost) }, { v: T[t.id].expectedSalaries, label: h.mc(T[t.id].expectedSalaries) }] })) });
  p.para('Initial hiring cost = winning bids + one-time recruitment + onboarding. Relocation and training are not charged in Round 1: they are charged in Round 2 when a deployment needs them, so nothing is counted twice. Round 1 has no winner: it allocates the people each team takes into Round 2.', { size: 8.5, color: undefined });
  if ((d.round1.corrections || []).length) {
    p.heading('Corrections after Round 1 was locked');
    p.table({ columns: [{ label: 'When', w: 1.3 }, { label: 'By', w: 0.8 }, { label: 'CV', w: 0.6 }, { label: 'Before', w: 1.4 }, { label: 'After', w: 1.4 }, { label: 'Reason', w: 3 }], rows: d.round1.corrections.map((x) => [stamp(x.at), x.by, x.employeeId, `${x.before.winningTeamId || '—'} ${h.m(x.before.winningBid)}`, x.after.status === 'sold' ? `${x.after.winningTeamId} ${h.m(x.after.winningBid)}` : 'Cancelled', x.reason]) });
  }
  return p.save();
}

export async function teamPdf(d, r, src, teamId, actor) {
  const h = helpers(d);
  const t = h.teams[teamId];
  const res = r.round2.teams[teamId];
  const st = res.statement; const mt = res.metrics;
  const prof = d.config.identicalResources ? { ...d.standardProfile, companyName: t.profile.companyName, hqCityId: t.profile.hqCityId } : t.profile;
  const rankRow = r.ranking.rows.find((x) => x.teamId === teamId);
  const p = await open(d, src, `${t.label} — Financial Report`, `${prof.companyName || ''} · ${prof.industry || ''}`, actor);
  const deps = Object.values(r.deployments).filter((x) => x.valid && x.teamId === teamId).sort((a, b) => a.id.localeCompare(b.id));
  // A. Executive summary
  p.heading('A. Executive summary');
  const dests = Object.values(res.byCity).filter((c) => c.revenue > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 3).map((c) => c.name);
  p.kv([
    ['Home continent', h.cont(t.homeContinentId)], ['Headquarters', h.city(prof.hqCityId)],
    ['Employees hired', String(mt.hired)], ['Deployed outside the home continent', String(mt.deployedInternationally)],
    ['Main destinations', dests.join(', ') || 'None yet'], ['Ranking', rankRow ? (rankRow.rank === null ? 'Not ranked' : `${rankRow.shared ? '=' : ''}${rankRow.rank} of ${d.teams.length}`) : '—'],
    ['Round 2 incremental contribution', h.m(st.netContribution)], ['Combined recruitment-and-expansion outcome', h.m(st.combined)],
  ]);
  const issues = deps.filter((x) => !x.operational).map((x) => `${x.id} ${h.emp(x.employeeId)} blocked by ${x.compliance.blockers.join(', ')}`);
  const pend = deps.flatMap((x) => x.compliance.evals.filter((e) => ['pending', 'noncompliant', 'review'].includes(e.status)).map((e) => `${x.id}: ${e.ruleId} ${COMPLIANCE_STATUS[e.status].toLowerCase()}`));
  p.heading('Major compliance issues', 2);
  p.bullets([...issues, ...pend].slice(0, 8).map((x) => ({ text: x, tone: 'negative' })).concat(issues.length + pend.length ? [] : [{ text: 'No open compliance issue.', tone: 'positive' }]));
  p.heading('Main drivers of the result', 2);
  p.bullets(res.analysis.slice(0, 4));

  // B. Employee deployment table
  p.heading('B. Employee deployments');
  p.table({
    size: 7.2,
    columns: [{ label: 'ID', w: 0.6 }, { label: 'Employee', w: 1.7 }, { label: 'Role', w: 1.7 }, { label: 'Destination', w: 1.5 }, { label: 'Salary (a year)', w: 1.1, align: 'right' }, { label: 'One-time', w: 1, align: 'right' }, { label: 'Recurring', w: 1, align: 'right' }, { label: 'Revenue', w: 1.1, align: 'right' }, { label: 'Contribution', w: 1.1, align: 'right' }, { label: 'Productivity', w: 1, align: 'right' }, { label: 'Compliance', w: 1.1 }],
    rows: deps.map((x) => [x.id, h.emp(x.employeeId), h.role(x.roleId), `${h.city(x.cityId)}, ${h.cont(x.continentId)}`, h.mc(x.salaryBase), h.mc(x.result.oneTimeCosts), h.mc(x.result.recurringCosts), h.mc(x.result.revenue), h.mc(x.result.contribution), x.productivity.value.toFixed(2), x.operational ? (x.compliance.counts.pending ? 'Docs pending' : 'Compliant') : `Blocked (${x.compliance.blockers.join(', ')})`]),
  });
  p.para('Amounts in this table are rounded to lakh (L) or crore (Cr); exact amounts are in the statements and the Excel report. Deployment figures exclude shared city costs (office, market entry, logistics, partner fees, taxes) and salaries paid at headquarters; those appear in the statements below and in the contribution by employee.', { size: 8 });

  // C. Financial statements
  p.heading('C. Financial statements');
  const rows = [];
  for (const [k, label] of Object.entries(REVENUE_TYPES)) if (st.revenue.byType[k]) rows.push([`  ${label}`, h.m(st.revenue.byType[k])]);
  rows.push(['Total revenue', h.m(st.revenue.total)]);
  for (const [type, label] of Object.entries(COST_TYPES)) {
    for (const [k, v] of Object.entries(st[type].byCategory)) if (v) rows.push([`  ${CATEGORIES[k]?.label || k}${k === 'savings' ? ' (reduces costs)' : ''}`, h.m(v)]);
    rows.push([`Total ${label.toLowerCase()}`, h.m(st[type].total)]);
  }
  rows.push(['Total expansion costs', h.m(st.totalCosts)]);
  rows.push(['Operating profit (loss) = revenue − recurring costs', h.m(st.operatingProfit)]);
  rows.push(['Round 2 incremental contribution = revenue − total expansion costs', h.m(st.netContribution)]);
  rows.push(['Round 1 initial hiring cost (not deducted again inside Round 2)', h.m(st.round1InitialHiringCost)]);
  p.table({ columns: [{ label: 'Line', w: 4 }, { label: 'Amount', w: 1.3, align: 'right' }], rows, totals: ['Combined recruitment-and-expansion outcome', h.m(st.combined)] });
  p.kv([
    ['Profit margin', h.pct(mt.profitMarginPct)], ['Return on expansion expenditure', h.pct(mt.roeePct)],
    ['Budget utilisation', mt.budgetUtilPct === null ? 'No budget set' : h.pct(mt.budgetUtilPct)], ['Cash remaining', h.m(mt.cashRemaining)],
    ['Break-even revenue', mt.breakEvenRevenue === null ? 'n/a' : h.m(mt.breakEvenRevenue)], ['Revenue growth vs baseline', h.pct(mt.revenueGrowthPct)],
    ['Revenue per employee', h.m(mt.revenuePerEmployee)], ['Profit per employee', h.m(mt.profitPerEmployee)],
    ['Cost of non-compliance', h.m(mt.costOfNonCompliance)], ['Revenue forgone (estimate)', h.m(mt.revenueForgoneEstimate)],
  ], { cols: 2 });
  p.para(`${STATEMENT_FORMULAS.combined} ${STATEMENT_FORMULAS.roee}. ${STATEMENT_FORMULAS.cash}.`, { size: 7.8 });

  // D. Regional performance
  p.heading('D. Regional performance');
  p.table({
    columns: [{ label: 'Continent', w: 1.5 }, { label: 'Revenue', w: 1.3, align: 'right' }, { label: 'Costs', w: 1.3, align: 'right' }, { label: 'Contribution', w: 1.3, align: 'right' }],
    rows: Object.values(res.byContinent).map((c) => [c.name, h.m(c.revenue), h.m(c.costs), h.m(c.contribution)]),
  });
  const cities = Object.values(res.byCity).sort((a, b) => b.contribution - a.contribution);
  p.table({
    columns: [{ label: 'City', w: 1.4 }, { label: 'Continent', w: 1.1 }, { label: 'Revenue', w: 1.2, align: 'right' }, { label: 'Costs', w: 1.2, align: 'right' }, { label: 'Contribution', w: 1.2, align: 'right' }, { label: 'Opportunity score', w: 1, align: 'right' }, { label: 'Avg productivity', w: 1, align: 'right' }],
    rows: cities.map((c) => { const ds = deps.filter((x) => x.cityId === c.cityId); const ops = r.regions[c.cityId]?.opportunity?.score; return [c.name, h.cont(c.continentId), h.m(c.revenue), h.m(c.costs), h.m(c.contribution), ops === null || ops === undefined ? '—' : ops.toFixed(1), ds.length ? (ds.reduce((s, x) => s + x.productivity.value, 0) / ds.length).toFixed(2) : '—']; }),
  });
  if (mt.bestCity) p.para(`Best-performing destination: ${h.city(mt.bestCity)}. ${mt.worstCity ? `Weakest: ${h.city(mt.worstCity)}.` : ''} The opportunity score is an analytical measure; it does not enter the financial calculation, which is why a high-opportunity city can still lose money when costs or compliance intervene.`, { size: 8.5 });
  p.bars({ title: 'Revenue and costs by continent', series: ['Revenue', 'Costs'], items: Object.values(res.byContinent).map((c) => ({ label: c.name, values: [{ v: c.revenue, label: h.mc(c.revenue) }, { v: c.costs, label: h.mc(c.costs) }] })) });
  p.bars({ title: 'Contribution by employee', items: Object.values(res.byEmployee).map((v) => ({ label: `${v.employeeId} ${v.name}`, values: [{ v: v.contribution, label: h.mc(v.contribution) }] })) });

  // E. Compliance report
  p.heading('E. Compliance report');
  p.table({
    size: 7.2,
    columns: [{ label: 'Deployment', w: 0.8 }, { label: 'Rule', w: 0.7 }, { label: 'Requirement', w: 2.2 }, { label: 'Mandatory / blocks', w: 1 }, { label: 'Status', w: 1.4 }, { label: 'Evidence', w: 1.3 }, { label: 'Cost', w: 0.9, align: 'right' }, { label: 'Penalty', w: 0.9, align: 'right' }, { label: 'Override', w: 1.4 }],
    rows: deps.flatMap((x) => x.compliance.evals.map((e) => [x.id, e.ruleId, e.title, `${yes(e.mandatory)} / ${yes(e.blocks)}`, `${COMPLIANCE_STATUS[e.status]}${e.evidenceMissing ? ' (evidence missing)' : ''}`, e.evidence || '—', h.m(e.oneTimeCost + e.annualCost + e.documentationCost), h.m(e.penalty), e.waiver ? `Waived: ${e.waiver.reason}` : ''])),
  });
  const outstanding = deps.flatMap((x) => x.compliance.evals.filter((e) => !e.satisfied).map((e) => `${x.id} ${e.ruleId} ${e.title}: ${COMPLIANCE_STATUS[e.status]}`));
  p.heading('Outstanding issues', 2);
  p.bullets(outstanding.length ? outstanding.map((x) => ({ text: x, tone: 'negative' })) : [{ text: 'None.', tone: 'positive' }]);

  // F. Decision analysis
  p.heading('F. Decision analysis');
  p.para('Each statement below is generated from this team’s calculated figures and the model inputs.', { size: 8.5 });
  p.bullets(res.analysis);
  return p.save();
}

export async function comparisonPdf(d, r, src, actor) {
  const h = helpers(d);
  const p = await open(d, src, 'Four-Team Comparison', h.period, actor);
  const T = (id) => r.round2.teams[id];
  const cols = [{ label: 'Measure', w: 2.6 }, ...d.teams.map((t) => ({ label: t.label, w: 1.2, align: 'right' }))];
  const row = (label, f) => [label, ...d.teams.map((t) => f(t.id))];
  p.heading('Recruitment and expansion');
  p.table({
    columns: cols,
    rows: [
      row('Initial hiring cost (Round 1)', (id) => h.m(r.round1.teams[id].initialHiringCost)),
      row('Total revenue', (id) => h.m(T(id).statement.revenue.total)),
      row('One-time expansion costs', (id) => h.m(T(id).statement.oneTime.total)),
      row('Recurring costs', (id) => h.m(T(id).statement.recurring.total)),
      row('Contingent costs', (id) => h.m(T(id).statement.contingent.total)),
      row('Total expansion costs', (id) => h.m(T(id).statement.totalCosts)),
      row('Operating profit (loss)', (id) => h.m(T(id).statement.operatingProfit)),
      row('Round 2 incremental contribution', (id) => h.m(T(id).statement.netContribution)),
      row('Combined outcome', (id) => h.m(T(id).statement.combined)),
      row('Profit margin', (id) => h.pct(T(id).metrics.profitMarginPct)),
      row('Return on expansion expenditure', (id) => h.pct(T(id).metrics.roeePct)),
      row('Budget utilisation', (id) => h.pct(T(id).metrics.budgetUtilPct)),
      row('Deployment effectiveness', (id) => T(id).metrics.deploymentEffectiveness.toFixed(1)),
      row('Compliance score', (id) => T(id).metrics.complianceScore.toFixed(1)),
      row('Blocked deployments', (id) => String(T(id).metrics.blockedCount)),
    ],
  });
  p.bars({ title: 'Revenue versus total costs', series: ['Revenue', 'Total expansion costs'], items: d.teams.map((t) => ({ label: t.label, values: [{ v: T(t.id).statement.revenue.total, label: h.mc(T(t.id).statement.revenue.total) }, { v: T(t.id).statement.totalCosts, label: h.mc(T(t.id).statement.totalCosts) }] })) });
  p.bars({ title: 'Combined outcome by team', items: d.teams.map((t) => ({ label: t.label, values: [{ v: T(t.id).statement.combined, label: h.mc(T(t.id).statement.combined) }] })) });
  p.bars({ title: 'Revenue by continent', series: d.continents.map((c) => c.name), items: d.teams.map((t) => ({ label: t.label, values: d.continents.map((c) => ({ v: T(t.id).byContinent[c.id]?.revenue || 0, label: h.mc(T(t.id).byContinent[c.id]?.revenue || 0) })) })) });
  return p.save();
}

export async function rankingsPdf(d, r, src, actor) {
  const h = helpers(d);
  const rk = r.ranking;
  const p = await open(d, src, 'Final Rankings', rk.mode === 'weighted' ? `Weighted performance: ${Object.entries(rk.weights).map(([k, v]) => `${COMPONENTS[k]} ${v}%`).join(' · ')}` : `Financial ranking on ${METRICS[rk.metric]?.label.toLowerCase()}`, actor);
  p.heading('Ranking');
  p.table({
    size: 7.6,
    columns: [{ label: 'Rank', w: 0.5 }, { label: 'Team', w: 0.9 }, { label: 'Revenue', w: 1.1, align: 'right' }, { label: 'Expansion costs', w: 1.1, align: 'right' }, { label: 'Operating profit', w: 1.1, align: 'right' }, { label: 'Combined outcome', w: 1.1, align: 'right' }, { label: 'Budget use', w: 0.8, align: 'right' }, { label: 'Deploy. effect.', w: 0.7, align: 'right' }, { label: 'Compl.', w: 0.6, align: 'right' }, { label: 'Score', w: 0.7, align: 'right' }, { label: 'Compliant / blocked', w: 0.9, align: 'right' }],
    rows: rk.rows.map((x) => [x.rank === null ? '—' : `${x.shared ? '=' : ''}${x.rank}`, x.label, h.m(x.revenue), h.m(x.totalCosts), h.m(x.operatingProfit), h.m(x.combined), h.pct(x.budgetUtilPct), x.components.deployment.toFixed(1), x.components.compliance.toFixed(1), rk.mode === 'weighted' ? x.overall.toFixed(2) : h.mc(x.score), `${x.compliantDeployments} / ${x.blockedCount}`]),
  });
  p.heading('Why each team is placed where it is');
  for (const x of rk.rows) { p.heading(`${x.rank === null ? 'Not ranked' : `${x.shared ? '=' : ''}${x.rank}`} · ${x.label}`, 2); p.para(x.explanation, { size: 9 }); }
  p.heading('Method');
  p.para(`Financial scores are scaled between the lowest team (0) and the highest (100); deployment effectiveness and compliance are already on 0–100; budget discipline is 100 within budget and falls to 0 at ${d.config.ranking.budgetMaxOverspendPct}% overspend. Ties are broken by: ${rk.tieBreaks.join(', then ') || 'no rule'}. Teams still level share the place; nothing is decided at random. A mandatory legal blocker always stops the affected deployment from earning revenue; the configured extra consequence is “${d.config.compliance.blocker.ranking}”.`, { size: 8.5 });
  return p.save();
}

export async function compliancePdf(d, r, src, actor) {
  const h = helpers(d);
  const p = await open(d, src, 'Legal and Compliance Report', 'Fictional rules approved by Event Control', actor);
  for (const t of d.teams) {
    const deps = Object.values(r.deployments).filter((x) => x.valid && x.teamId === t.id).sort((a, b) => a.id.localeCompare(b.id));
    const mt = r.round2.teams[t.id].metrics;
    p.heading(`${t.label} — compliance score ${mt.complianceScore.toFixed(1)}, ${mt.blockedCount} blocked`);
    p.table({
      size: 7.2,
      columns: [{ label: 'Deployment', w: 1.6 }, { label: 'Rule', w: 0.7 }, { label: 'Requirement', w: 2.2 }, { label: 'Status', w: 1.5 }, { label: 'Evidence / detail', w: 2 }, { label: 'Cost + penalty', w: 1, align: 'right' }, { label: 'Override', w: 1.2 }],
      rows: deps.flatMap((x) => x.compliance.evals.map((e) => [`${x.id} ${h.emps[x.employeeId]?.name} · ${h.city(x.cityId)}`, e.ruleId, `${e.title}${e.mandatory ? '' : ' (advisory)'}${e.blocks ? ' · blocks' : ''}`, `${COMPLIANCE_STATUS[e.status]}${e.blocking ? ' — BLOCKING' : ''}`, e.evidence || e.detail || '—', h.m(e.oneTimeCost + e.annualCost + e.documentationCost + e.penalty), e.waiver ? `Waived by ${e.waiver.by}: ${e.waiver.reason}` : ''])),
    });
  }
  return p.save();
}

export async function allocationPdf(d, r, src, actor) {
  const h = helpers(d);
  const p = await open(d, src, 'Team Employee Allocation Sheets', 'Official employee-to-team mapping from Round 1, with Round 2 destinations', actor);
  for (const t of d.teams) {
    p.heading(`${t.label} — home continent ${h.cont(t.homeContinentId)}`);
    const rows = [];
    for (const id of r.roster[t.id] || []) {
      const deps = Object.values(r.deployments).filter((x) => x.valid && x.employeeId === id && x.teamId === t.id);
      const rec = d.auction.records.find((x) => x.employeeId === id);
      if (!deps.length) rows.push([id, h.emps[id]?.name, h.m(rec?.winningBid), 'Not yet deployed', '', '']);
      for (const x of deps) rows.push([id, h.emps[id]?.name, h.m(rec?.winningBid), `${h.city(x.cityId)}, ${h.cont(x.continentId)}`, h.role(x.roleId), x.operational ? 'Operational' : 'Blocked']);
    }
    p.table({ columns: [{ label: 'CV', w: 0.6 }, { label: 'Employee', w: 1.8 }, { label: 'Winning bid', w: 1.1, align: 'right' }, { label: 'Destination', w: 2 }, { label: 'Role', w: 2 }, { label: 'Status', w: 1 }], rows });
  }
  return p.save();
}
