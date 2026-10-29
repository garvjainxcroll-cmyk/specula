// 9. Financial Calculation Engine: run the calculation, inspect every line and formula,
// check the validation list, and finalise.
import { h, card, tabs, pill, m, mc, table, issuesList, when, kv, moneyEl } from '../ui.mjs';
import { CATEGORIES, COST_TYPES, REVENUE_TYPES, FUNCTION_LABELS } from '../../engine/model.mjs';
import { fmtNum, fmtPct } from '../../engine/money.mjs';
import { teamColor } from '../charts.mjs';
import { names, categoryInfo, statementInfo, info, formulaModal, goToRef, depStatus, sourceNote } from './common.mjs';

export function render(ctx) {
  const { doc, res, view } = ctx;
  const n = names(ctx);
  const team = ctx.sub.financial?.team && doc.teams.some((t) => t.id === ctx.sub.financial.team) ? ctx.sub.financial.team : doc.teams[0].id;
  const final = doc.round2.status === 'finalised';
  const allIssues = [...res.validation.config.filter((i) => i.severity === 'blocking'), ...res.validation.round1.filter((i) => i.severity === 'blocking'), ...res.validation.round2];
  const blocking = allIssues.filter((i) => i.severity === 'blocking');
  const draft = view.calc.draft;
  return [
    h('div', { class: 'pagehead' }, h('div', {}, h('div', { class: 'eyebrow' }, 'Stage 3 · Round 2'), h('h1', { class: 'page' }, 'Financial Calculation Engine')), h('div', { class: 'grow' }), pill(`Model version ${res.modelVersion}`, 'neutral')),
    h('div', { class: 'grid g2' },
      card('Calculation', [
        kv([['Status', !draft ? 'Not run yet' : view.calc.current ? 'Current (matches the inputs)' : 'Outdated (inputs changed since)'], ['Last run', draft ? `${when(draft.at)} by ${draft.by}` : '—'], ['Input fingerprint now', res.inputHash.slice(0, 16)], ['Fingerprint of last run', draft ? draft.inputHash.slice(0, 16) : '—']]),
        h('p', { class: 'small muted', style: { marginTop: '8px' } }, 'The engine is deterministic: the same inputs and model version always give the same results. Results on screen update live with every change; “Run calculation” records them as the draft result. Any later change to a material input marks that draft outdated, and finalising needs a current one.'),
        h('div', { class: 'row', style: { marginTop: '8px' } },
          ctx.can('calc.run') && !final ? h('button', { class: 'btn primary', onclick: () => ctx.act('calc.run', {}) }, 'Run calculation') : null,
          ctx.can('round.finalise') && !final ? h('button', { class: 'btn gold', disabled: blocking.length > 0, onclick: () => ctx.act('round2.finalise', {}, { confirm: { title: 'Finalise Round 2?', message: 'The official result is stored with a copy of every input and the model version. A backup is taken. Later changes need an administrative correction.', confirmLabel: 'Finalise Round 2', typed: 'FINALISE' } }) }, blocking.length ? `Finalise (${blocking.length} blocking)` : 'Finalise Round 2') : null,
          ctx.can('round.finalise') && final ? h('button', { class: 'btn', onclick: () => ctx.act('round2.reopen', {}, { confirm: { title: 'Reopen Round 2 for correction?', message: 'The finalised version stays preserved. A new version must be finalised after the correction.', reason: 'required', confirmLabel: 'Reopen', danger: true } }) }, 'Reopen for administrative correction') : null),
      ]),
      card('Official results', doc.finals.length ? table([
        { label: 'Version', get: (f) => f.version }, { label: 'Finalised', get: (f) => f.at, render: (f) => `${when(f.at)} by ${f.by}` }, { label: 'Model', get: (f) => f.modelVersion },
        { label: 'State', get: (f) => (f.reopened ? 'reopened' : 'official'), render: (f) => (f.reopened ? h('div', {}, pill('Reopened', 'warn'), h('div', { class: 'tiny' }, `${when(f.reopened.at)}: ${f.reopened.reason}`)) : pill('Official', 'good')) },
        { label: 'Warnings', num: true, get: (f) => f.warnings.length },
      ], doc.finals, { id: 'finals', search: false }) : h('p', { class: 'muted' }, 'Nothing finalised yet.'))),
    card(`Validation checklist: ${blocking.length} blocking, ${allIssues.length - blocking.length} warnings`, issuesList(allIssues, { onGo: (ref) => goToRef(ctx, ref), empty: 'Every check passes.' })),
    sourceNote(ctx),
    tabs(doc.teams.map((t) => ({ id: t.id, label: t.label })), team, (id) => ctx.go('financial', { team: id })),
    ...teamDetail(ctx, team, n),
  ];
}

function teamDetail(ctx, teamId, n) {
  const { doc, res } = ctx;
  const t = doc.teams.find((x) => x.id === teamId);
  const r = res.round2.teams[teamId];
  const st = r.statement; const mt = r.metrics;
  const line = (label, value, onInfo, { strong = false, indent = false } = {}) => h('tr', {}, h('td', { class: strong ? 'strong' : '', style: indent ? { paddingLeft: '28px' } : null }, label, onInfo ? info(onInfo) : null), h('td', { class: `num${strong ? ' strong' : ''}` }, moneyEl(value)));
  const rows = [];
  rows.push(h('tr', {}, h('td', { class: 'eyebrow', colspan: 2 }, 'Revenue')));
  for (const [k, l] of Object.entries(REVENUE_TYPES)) rows.push(line(l, st.revenue.byType[k] || 0, null, { indent: true }));
  rows.push(line('Total revenue', st.revenue.total, () => statementInfo('revenue', 'Total revenue'), { strong: true }));
  for (const [type, label] of Object.entries(COST_TYPES)) {
    rows.push(h('tr', {}, h('td', { class: 'eyebrow', colspan: 2 }, label)));
    for (const [k, v] of Object.entries(st[type].byCategory)) rows.push(line(CATEGORIES[k]?.label || k, v, () => categoryInfo(k), { indent: true }));
    rows.push(line(`Total ${label.toLowerCase()}`, st[type].total, () => statementInfo(type, label), { strong: true }));
  }
  rows.push(line('Total expansion costs', st.totalCosts, () => statementInfo('totalCosts', 'Total expansion costs'), { strong: true }));
  rows.push(line('Operating profit (loss)', st.operatingProfit, () => statementInfo('operatingProfit', 'Operating profit'), { strong: true }));
  rows.push(line('Round 2 incremental contribution', st.netContribution, () => statementInfo('netContribution', 'Round 2 incremental contribution'), { strong: true }));
  rows.push(line('Round 1 initial hiring cost', st.round1InitialHiringCost, null));
  rows.push(line('Combined recruitment-and-expansion outcome', st.combined, () => statementInfo('combined', 'Combined outcome'), { strong: true }));
  const metric = (label, v, key, fmt = (x) => m(x)) => h('div', {}, h('div', { class: 'k' }, label, key ? info(() => statementInfo(key, label), '') : null), h('div', { class: 'v' }, v === null || v === undefined ? 'n/a' : fmt(v)));
  const deps = Object.values(res.deployments).filter((d) => d.valid && d.teamId === teamId);
  return [
    h('div', { class: 'grid g2' },
      card(h('div', { class: 'row' }, h('span', { class: 'dotkey', style: { background: teamColor(n.teamIndex(teamId)) } }), h('h2', {}, `${t.label} — statement`)), h('div', { class: 'tablewrap' }, h('table', { class: 't' }, h('tbody', {}, rows)))),
      h('div', { class: 'stack' },
        card('Ratios and measures', h('div', { class: 'kv' },
          metric('Profit margin', mt.profitMarginPct, 'margin', (x) => fmtPct(x)), metric('Operating margin', mt.operatingMarginPct, null, (x) => fmtPct(x)),
          metric('Return on expansion expenditure', mt.roeePct, 'roee', (x) => fmtPct(x)), metric('Combined return', mt.combinedReturnPct, 'combinedReturn', (x) => fmtPct(x)),
          metric('Budget utilisation', mt.budgetUtilPct, 'budgetUtil', (x) => fmtPct(x)), metric('Cash remaining', mt.cashRemaining, 'cash'),
          metric('Break-even revenue', mt.breakEvenRevenue, 'breakEven'), metric('Revenue growth vs baseline', mt.revenueGrowthPct, 'growth', (x) => fmtPct(x)),
          metric('Revenue per employee', mt.revenuePerEmployee, 'perEmployee'), metric('Operating cost per employee', mt.operatingCostPerEmployee, 'perEmployee'), metric('Profit per employee', mt.profitPerEmployee, 'perEmployee'),
          metric('Cost of non-compliance', mt.costOfNonCompliance, 'nonCompliance'), metric('Revenue forgone (estimate)', mt.revenueForgoneEstimate),
          metric('Deployment effectiveness', mt.deploymentEffectiveness, 'effectiveness', (x) => fmtNum(x, 1)), metric('Compliance and readiness', mt.complianceReadiness, 'compliance', (x) => fmtNum(x, 1)),
          metric('Regional risk (revenue-weighted)', mt.weightedRisk, null, (x) => fmtNum(x, 1)))),
        card('Decision analysis', h('ul', {}, r.analysis.map((a) => h('li', { class: a.tone === 'negative' ? 'neg' : '' }, a.text)))))),
    card('Contribution by deployment', table([
      { label: 'ID', get: (d) => d.id }, { label: 'Employee', get: (d) => n.emp(d.employeeId) }, { label: 'Role and destination', get: (d) => `${n.role(d.roleId)} · ${n.city(d.cityId)}`, wrap: true },
      { label: 'Status', get: (d) => d.approval, render: (d) => depStatus(d) },
      { label: 'Productivity', num: true, get: (d) => d.productivity.value, render: (d) => h('span', {}, fmtNum(d.productivity.value, 3), ' ', h('button', { class: 'btn ghost sm', onclick: () => formulaModal(d.traces.productivity) }, 'ⓘ')) },
      { label: 'Revenue', num: true, get: (d) => d.result.revenue, render: (d) => h('span', {}, m(d.result.revenue), ' ', h('button', { class: 'btn ghost sm', onclick: () => formulaModal(d.traces.revenue) }, 'ⓘ')) },
      { label: 'One-time', num: true, get: (d) => d.result.oneTimeCosts, render: (d) => m(d.result.oneTimeCosts) }, { label: 'Recurring', num: true, get: (d) => d.result.recurringCosts, render: (d) => m(d.result.recurringCosts) },
      { label: 'Contingent', num: true, get: (d) => d.result.contingentCosts, render: (d) => m(d.result.contingentCosts) }, { label: 'Contribution', num: true, get: (d) => d.result.contribution, render: (d) => moneyEl(d.result.contribution) },
    ], deps, { id: `fin-deps-${teamId}`, search: false, empty: 'No deployments yet.' })),
    h('div', { class: 'grid g2' },
      card('By city', table([{ label: 'City', get: (c) => c.name }, { label: 'Presence', get: (c) => c.mode || '' }, { label: 'Revenue', num: true, get: (c) => c.revenue, render: (c) => m(c.revenue) }, { label: 'Costs', num: true, get: (c) => c.costs, render: (c) => m(c.costs) }, { label: 'Contribution', num: true, get: (c) => c.contribution, render: (c) => moneyEl(c.contribution) }, { label: 'Tax', num: true, get: (c) => c.tax?.tax || 0, render: (c) => (c.tax ? `${m(c.tax.tax)} @ ${fmtNum(c.tax.rate, 0)}%` : '—') }], Object.values(r.byCity), { id: `fin-city-${teamId}`, search: false }),
        { tools: h('span', { class: 'tiny muted' }, 'Shared city costs (office, market entry, logistics, partner fees, taxes) are counted here') }),
      card('By employee', table([{ label: 'Employee', get: (v) => n.emp(v.employeeId) }, { label: 'Revenue', num: true, get: (v) => v.revenue, render: (v) => m(v.revenue) }, { label: 'Own costs', num: true, get: (v) => v.ownCosts, render: (v) => m(v.ownCosts) }, { label: 'Share of city costs', num: true, get: (v) => v.sharedCosts, render: (v) => m(v.sharedCosts) }, { label: 'Contribution', num: true, get: (v) => v.contribution, render: (v) => moneyEl(v.contribution) }], Object.values(r.byEmployee), { id: `fin-emp-${teamId}`, search: false,
        foot: ['Total', m(Object.values(r.byEmployee).reduce((s, v) => s + v.revenue, 0)), '', '', m(Object.values(r.byEmployee).reduce((s, v) => s + v.contribution, 0))] }))),
    h('div', { class: 'grid g2' },
      card('By continent', table([{ label: 'Continent', get: (c) => c.name }, { label: 'Revenue', num: true, get: (c) => c.revenue, render: (c) => m(c.revenue) }, { label: 'Costs', num: true, get: (c) => c.costs, render: (c) => m(c.costs) }, { label: 'Contribution', num: true, get: (c) => c.contribution, render: (c) => moneyEl(c.contribution) }], Object.values(r.byContinent), { id: `fin-cont-${teamId}`, search: false })),
      card('By business function', table([{ label: 'Function', get: (f) => (f.function === 'hq' ? 'At headquarters' : FUNCTION_LABELS[f.function]) }, { label: 'Employees', get: (f) => f.employees.join(', ') }, { label: 'Revenue', num: true, get: (f) => f.revenue, render: (f) => m(f.revenue) }, { label: 'Contribution', num: true, get: (f) => f.contribution, render: (f) => moneyEl(f.contribution) }], Object.values(r.byFunction), { id: `fin-fn-${teamId}`, search: false }))),
  ];
}
