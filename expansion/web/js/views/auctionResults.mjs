// 6. Round 1 — Auction Results: what each team took into Round 2. There is no Round 1 winner.
import { h, card, table, m, pill, when } from '../ui.mjs';
import { barChart, teamColor } from '../charts.mjs';
import { TECH_KEYS, FUNCTION_LABELS, SENIORITY } from '../../engine/model.mjs';
import { fmtNum } from '../../engine/money.mjs';
import { names } from './common.mjs';

export function render(ctx) {
  const { doc, res } = ctx;
  const n = names(ctx);
  const T = res.round1.teams;
  const teams = doc.teams;
  const series = teams.map((t, i) => ({ name: t.label, color: teamColor(i) }));
  const money = (label, k) => ({ label, num: true, get: (t) => T[t.id][k], render: (t) => m(T[t.id][k]) });
  return [
    h('div', { class: 'pagehead' }, h('div', {}, h('div', { class: 'eyebrow' }, 'Stage 2 · Round 1'), h('h1', { class: 'page' }, 'Auction Results')), h('div', { class: 'grow' }),
      doc.round1.status === 'locked' ? pill(`Locked ${when(doc.round1.lockedAt)} by ${doc.round1.lockedBy}`, 'good') : pill('Provisional: Round 1 is not locked', 'warn')),
    h('div', { class: 'note' }, 'Round 1 allocates people; it has no winner. Spending least or hiring the highest scores does not decide anything here — the results feed Round 2. Initial hiring cost = winning bids + recruitment + onboarding; salaries are a yearly commitment; relocation and training are estimates charged in Round 2 only when used.'),
    card('Recruitment by team', table([
      { label: 'Team', get: (t) => t.label }, { label: 'Hired', num: true, get: (t) => T[t.id].count },
      money('Winning bids', 'totalBids'), money('Recruitment', 'recruitment'), money('Onboarding', 'onboarding'), money('Initial hiring cost', 'initialHiringCost'),
      money('Annual salaries', 'expectedSalaries'), money('Annual workforce cost', 'workforceCost'), money('Relocation (estimate)', 'expectedRelocation'), money('Training (estimate)', 'expectedTraining'),
      { label: 'Budget left', num: true, get: (t) => T[t.id].budgetRemaining, render: (t) => (T[t.id].budget === null ? 'No budget' : h('span', { class: T[t.id].overBudget ? 'neg' : '' }, m(T[t.id].budgetRemaining))) },
      { label: 'Avg capability', num: true, get: (t) => T[t.id].avgCapability, render: (t) => fmtNum(T[t.id].avgCapability, 1) },
      { label: 'Intl experience', num: true, get: (t) => T[t.id].intlExperience, render: (t) => fmtNum(T[t.id].intlExperience, 1) },
      { label: 'Cultural adaptability', num: true, get: (t) => T[t.id].culturalAdaptability, render: (t) => fmtNum(T[t.id].culturalAdaptability, 1) },
    ], teams, { id: 'r1teams', search: false })),
    h('div', { class: 'grid g2' },
      card('Recruitment expenditure and salary obligations', barChart({ series: [{ name: 'Initial hiring cost', color: 'var(--s1)' }, { name: 'Annual salaries', color: 'var(--s2)' }], items: teams.map((t) => ({ label: t.label, values: [T[t.id].initialHiringCost, T[t.id].expectedSalaries] })) })),
      card('Average capability by function', barChart({ series, fmt: (v) => fmtNum(v, 0), fmtFull: (v) => fmtNum(v, 1), height: 7, gap: 1, items: TECH_KEYS.map((k) => ({ label: FUNCTION_LABELS[k], values: teams.map((t) => T[t.id].byFunction[k]) })) }))),
    card('Employee composition', h('div', { class: 'grid g4' }, teams.map((t, i) => h('div', {},
      h('h3', {}, h('span', { class: 'dotkey', style: { background: teamColor(i) } }), t.label),
      h('div', { class: 'small muted' }, SENIORITY.filter((s) => T[t.id].seniority[s]).map((s) => `${T[t.id].seniority[s]} ${s}`).join(' · ') || 'No one yet'),
      h('ul', { class: 'small' }, (res.roster[t.id] || []).map((id) => { const r = doc.auction.records.find((x) => x.employeeId === id); return h('li', {}, `${n.emp(id)} — ${n.emps[id].seniority}, ${FUNCTION_LABELS[n.emps[id].primaryFunction]} — ${m(r.winningBid)}`); })))))),
    doc.round1.snapshot ? card('Preserved locked outcome', [h('p', { class: 'small' }, `Locked ${when(doc.round1.snapshot.at)} by ${doc.round1.snapshot.by}. Fingerprint ${doc.round1.snapshot.fingerprint}. Later corrections never overwrite this record.`),
      table([{ label: 'CV', get: (r) => r.employeeId }, { label: 'Name', get: (r) => n.emps[r.employeeId]?.name }, { label: 'Team at lock', get: (r) => n.team(r.winningTeamId) }, { label: 'Winning bid at lock', num: true, get: (r) => r.winningBid, render: (r) => m(r.winningBid) }, { label: 'Status at lock', get: (r) => r.status }], doc.round1.snapshot.records, { id: 'snap' })]) : null,
    (doc.round1.corrections || []).length ? card('Corrections after locking', table([
      { label: 'When', get: (c) => c.at, render: (c) => when(c.at) }, { label: 'By', get: (c) => c.by }, { label: 'CV', get: (c) => c.employeeId },
      { label: 'Before', get: (c) => `${n.team(c.before.winningTeamId)} ${m(c.before.winningBid)}` }, { label: 'After', get: (c) => (c.after.status === 'sold' ? `${n.team(c.after.winningTeamId)} ${m(c.after.winningBid)}` : 'Sale cancelled') }, { label: 'Reason', get: (c) => c.reason, wrap: true },
    ], doc.round1.corrections, { id: 'corr', search: false })) : null,
    h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: () => ctx.go('reports') }, 'Export Round 1 results')),
  ];
}
