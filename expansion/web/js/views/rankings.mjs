// 11. Final Rankings: private to Event Control. Shows why each team is where it is.
import { h, card, pill, m, moneyEl, when } from '../ui.mjs';
import { fmtNum, fmtPct } from '../../engine/money.mjs';
import { COMPONENTS, METRICS } from '../../engine/ranking.mjs';
import { teamColor } from '../charts.mjs';
import { names, sourceNote } from './common.mjs';

export function render(ctx) {
  const { doc, res, view } = ctx;
  const n = names(ctx);
  const rk = res.ranking;
  const final = doc.round2.status === 'finalised';
  const calcStatus = final ? pill(`Official v${doc.finals.at(-1).version}`, 'good') : !view.calc.draft ? pill('Not calculated', 'neutral') : view.calc.current ? pill('Draft — current', 'info') : pill('Draft — outdated', 'bad');
  const head = ['Rank', 'Team', 'Total revenue', 'Total expansion costs', 'Operating profit', 'Combined outcome', 'Budget utilisation', 'Deployment effectiveness', 'Compliance', 'Overall score', 'Compliant deployments', 'Blocked or unresolved', 'Calculation'];
  return [
    h('div', { class: 'pagehead' }, h('div', {}, h('div', { class: 'eyebrow' }, 'Results · private to Event Control'), h('h1', { class: 'page' }, 'Final Rankings')), h('div', { class: 'grow' }), calcStatus),
    final ? h('div', { class: 'note good' }, `Round 2 was finalised ${when(doc.finals.at(-1).at)} by ${doc.finals.at(-1).by}. These are the official rankings.`) : h('div', { class: 'note bad' }, 'Not final. These rankings are a draft until a Super Administrator finalises Round 2. Do not announce them.'),
    sourceNote(ctx),
    card(`Ranking — ${rk.mode === 'weighted' ? 'weighted performance' : `financial (${METRICS[rk.metric].label.toLowerCase()})`}`, h('div', { class: 'tablewrap' }, h('table', { class: 't' },
      h('thead', {}, h('tr', {}, head.map((x, i) => h('th', { class: i > 1 && i < 12 ? 'num' : '' }, x)))),
      h('tbody', {}, rk.rows.map((r) => h('tr', {},
        h('td', { class: 'strong' }, r.rank === null ? 'Not ranked' : `${r.shared ? '=' : ''}${r.rank}`),
        h('td', { class: 'nowrap' }, h('span', { class: 'dotkey', style: { background: teamColor(n.teamIndex(r.teamId)) } }), r.label),
        h('td', { class: 'num' }, moneyEl(r.revenue)), h('td', { class: 'num' }, moneyEl(r.totalCosts)), h('td', { class: 'num' }, moneyEl(r.operatingProfit)), h('td', { class: 'num' }, moneyEl(r.combined)),
        h('td', { class: 'num' }, r.budgetUtilPct === null ? 'n/a' : fmtPct(r.budgetUtilPct)), h('td', { class: 'num' }, fmtNum(r.deploymentEffectiveness, 1)), h('td', { class: 'num' }, fmtNum(r.complianceScore, 1)),
        h('td', { class: 'num strong' }, rk.mode === 'weighted' ? fmtNum(r.overall, 2) : m(r.score)), h('td', { class: 'num' }, String(r.compliantDeployments)),
        h('td', { class: 'num' }, r.blockedCount ? h('span', { class: 'neg' }, String(r.blockedCount)) : '0'), h('td', {}, final ? 'Official' : view.calc.current ? 'Draft (current)' : 'Draft'))))))),
    h('div', { class: 'grid g2' }, rk.rows.map((r) => card(`${r.rank === null ? 'Not ranked' : `${r.shared ? '=' : ''}${r.rank}`} · ${r.label}`, [
      h('p', {}, r.explanation),
      rk.mode === 'weighted' ? h('div', { class: 'kv' }, Object.entries(r.components).map(([k, v]) => h('div', {}, h('div', { class: 'k' }, `${COMPONENTS[k]} (${r.effectiveWeights[k]}%)`), h('div', { class: 'v' }, v === null ? 'not scored' : fmtNum(v, 1))))) : null,
    ]))),
    card('Method', h('div', { class: 'stack small' },
      h('p', {}, `Mode: ${rk.mode === 'weighted' ? 'weighted performance ranking' : 'financial ranking'}. Financial metric: ${METRICS[rk.metric].label}.`),
      rk.mode === 'weighted' ? h('p', {}, `Weights: ${Object.entries(rk.weights).map(([k, v]) => `${COMPONENTS[k]} ${v}%`).join(', ')}. The financial metric is scaled between the lowest team (0) and the highest (100) before it is weighted; deployment effectiveness and compliance are already on 0–100; budget discipline is 100 within budget and falls to 0 at ${doc.config.ranking.budgetMaxOverspendPct}% overspend, and is left out (its weight shared out) when no expansion budget is set.`) : null,
      h('p', {}, `Ties: ${rk.tieBreaks.length ? rk.tieBreaks.join(', then ') : 'no tie-break rule is configured'}. Teams still level share the place. Nothing is decided at random.`),
      h('p', {}, `A mandatory legal blocker always stops the affected deployment from earning revenue. Configured extra consequence: ${{ flag: 'shown as a flag', complianceZero: 'compliance component set to zero', unranked: 'team removed from the ranking' }[doc.config.compliance.blocker.ranking]}${doc.config.compliance.blocker.fixedPenalty ? `; fixed penalty ${m(doc.config.compliance.blocker.fixedPenalty)} per blocked deployment` : ''}.`))),
  ];
}
