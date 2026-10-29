// 10. Team Performance Comparison: the four teams side by side, with charts drawn from the
// calculated results. Team colours follow the team on every chart.
import { h, card, table, m, mc, moneyEl } from '../ui.mjs';
import { barChart, stackedChart, teamColor } from '../charts.mjs';
import { TECH_KEYS, FUNCTION_LABELS } from '../../engine/model.mjs';
import { fmtNum, fmtPct } from '../../engine/money.mjs';
import { names, sourceNote } from './common.mjs';

export function render(ctx) {
  const { doc, res } = ctx;
  const n = names(ctx);
  const teams = doc.teams;
  const T = (id) => res.round2.teams[id];
  const R1 = (id) => res.round1.teams[id];
  const teamSeries = teams.map((t, i) => ({ name: t.label, color: teamColor(i) }));
  const rowsDef = [
    ['Initial hiring cost (Round 1)', (id) => R1(id).initialHiringCost, 'money'], ['Total revenue', (id) => T(id).statement.revenue.total, 'money'],
    ['One-time expansion costs', (id) => T(id).statement.oneTime.total, 'money'], ['Recurring costs', (id) => T(id).statement.recurring.total, 'money'], ['Contingent costs', (id) => T(id).statement.contingent.total, 'money'],
    ['Total expansion costs', (id) => T(id).statement.totalCosts, 'money'], ['Operating profit (loss)', (id) => T(id).statement.operatingProfit, 'money'],
    ['Round 2 incremental contribution', (id) => T(id).statement.netContribution, 'money'], ['Combined outcome', (id) => T(id).statement.combined, 'money'],
    ['Profit margin', (id) => T(id).metrics.profitMarginPct, 'pct'], ['Return on expansion expenditure', (id) => T(id).metrics.roeePct, 'pct'], ['Budget utilisation', (id) => T(id).metrics.budgetUtilPct, 'pct'],
    ['Cash remaining', (id) => T(id).metrics.cashRemaining, 'money'], ['Revenue per employee', (id) => T(id).metrics.revenuePerEmployee, 'money'], ['Profit per employee', (id) => T(id).metrics.profitPerEmployee, 'money'],
    ['Deployment effectiveness', (id) => T(id).metrics.deploymentEffectiveness, 'num'], ['Compliance score', (id) => T(id).metrics.complianceScore, 'num'], ['Operational readiness', (id) => T(id).metrics.readinessPct, 'pct'],
    ['Cost of non-compliance', (id) => T(id).metrics.costOfNonCompliance, 'money'], ['Blocked deployments', (id) => T(id).metrics.blockedCount, 'int'],
  ];
  const fmtCell = (v, k) => (v === null || v === undefined ? 'n/a' : k === 'money' ? moneyEl(v) : k === 'pct' ? fmtPct(v) : k === 'num' ? fmtNum(v, 1) : String(v));
  const compTable = h('div', { class: 'tablewrap' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, h('th', {}, 'Measure'), teams.map((t, i) => h('th', { class: 'num' }, h('span', { class: 'dotkey', style: { background: teamColor(i) } }), t.label)))),
    h('tbody', {}, rowsDef.map(([l, f, k]) => h('tr', {}, h('td', {}, l), teams.map((t) => h('td', { class: 'num' }, fmtCell(f(t.id), k))))))));
  const cityItems = teams.flatMap((t) => Object.values(T(t.id).byCity).filter((c) => c.revenue || c.costs).map((c) => ({ label: `${t.label} · ${c.name}`, values: [c.contribution] }))).sort((a, b) => b.values[0] - a.values[0]);
  const empItems = teams.flatMap((t) => Object.values(T(t.id).byEmployee).map((v) => ({ label: `${v.employeeId} ${v.name.split(' ')[0]} (${t.id})`, values: [v.contribution] }))).sort((a, b) => b.values[0] - a.values[0]);
  const statusSeries = [{ k: 'compliant', name: 'Compliant', color: 'var(--st-good)' }, { k: 'waived', name: 'Waived', color: 'var(--st-waived)' }, { k: 'pending', name: 'Pending', color: 'var(--st-warning)' }, { k: 'review', name: 'Admin review', color: 'var(--st-serious)' }, { k: 'noncompliant', name: 'Non-compliant', color: 'var(--st-critical)' }, { k: 'unassessed', name: 'Not assessed', color: 'var(--st-neutral)' }];
  const evalsOf = (id) => Object.values(res.deployments).filter((d) => d.valid && d.teamId === id).flatMap((d) => d.compliance.evals);
  return [
    h('div', { class: 'pagehead' }, h('div', {}, h('div', { class: 'eyebrow' }, 'Results'), h('h1', { class: 'page' }, 'Team Performance Comparison'))),
    sourceNote(ctx),
    card('Four-team comparison', compTable),
    h('div', { class: 'grid g2' },
      card('Revenue versus total costs', barChart({ series: [{ name: 'Revenue', color: 'var(--s1)' }, { name: 'Total expansion costs', color: 'var(--s2)' }], items: teams.map((t) => ({ label: t.label, values: [T(t.id).statement.revenue.total, T(t.id).statement.totalCosts] })) })),
      card('Profit by team', barChart({ series: [{ name: 'Operating profit', color: 'var(--s1)' }, { name: 'Net contribution', color: 'var(--s2)' }, { name: 'Combined outcome', color: 'var(--s3)' }], items: teams.map((t) => ({ label: t.label, values: [T(t.id).statement.operatingProfit, T(t.id).statement.netContribution, T(t.id).statement.combined] })) }))),
    h('div', { class: 'grid g2' },
      card('Revenue by continent', barChart({ series: teamSeries, height: 12, items: doc.continents.map((c) => ({ label: c.name, values: teams.map((t) => T(t.id).byContinent[c.id]?.revenue || 0) })) })),
      card('Deployment cost breakdown', barChart({ series: [{ name: 'One-time', color: 'var(--s1)' }, { name: 'Recurring', color: 'var(--s2)' }, { name: 'Contingent', color: 'var(--s3)' }], items: teams.map((t) => ({ label: t.label, values: [T(t.id).statement.oneTime.total, T(t.id).statement.recurring.total, T(t.id).statement.contingent.total] })) }))),
    h('div', { class: 'grid g2' },
      card('Profit by city', cityItems.length ? barChart({ series: [{ name: 'Contribution', color: 'var(--s1)' }], items: cityItems, labelW: 190 }) : h('p', { class: 'muted' }, 'No city results yet.')),
      card('Employee contribution comparison', empItems.length ? barChart({ series: [{ name: 'Contribution', color: 'var(--s1)' }], items: empItems, height: 12, labelW: 190 }) : h('p', { class: 'muted' }, 'No employees yet.'))),
    h('div', { class: 'grid g2' },
      card('Budget utilisation', barChart({ series: [{ name: 'Share of expansion budget used', color: 'var(--s1)' }], items: teams.map((t) => ({ label: t.label, values: [T(t.id).metrics.budgetUtilPct ?? NaN] })), fmt: (v) => `${fmtNum(v, 0)}%`, fmtFull: (v) => `${fmtNum(v, 1)}%`, mark: { value: 100, label: 'Budget' } })),
      card('Compliance status distribution', stackedChart({ series: statusSeries, items: teams.map((t) => ({ label: t.label, values: statusSeries.map((s) => evalsOf(t.id).filter((e) => e.status === s.k).length) })) }))),
    card('Employee capability distribution (average by function)', barChart({ series: teamSeries, fmt: (v) => fmtNum(v, 0), fmtFull: (v) => fmtNum(v, 1), height: 7, gap: 1, items: TECH_KEYS.map((k) => ({ label: FUNCTION_LABELS[k], values: teams.map((t) => R1(t.id).byFunction[k]) })) })),
  ];
}
