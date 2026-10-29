// 1. Control Dashboard: where the event stands, at a glance.
import { h, card, stat, pill, moneyEl, m, when, issuesList } from '../ui.mjs';
import { stackedChart } from '../charts.mjs';
import { periodLabel } from '../../engine/months.mjs';
import { goToRef } from './common.mjs';

export function render(ctx) {
  const { doc, res, view } = ctx;
  const cfg = doc.config;
  const counts = res.round1 ? countStatuses(doc) : {};
  const deps = Object.values(res.deployments);
  const allIssues = [...res.validation.config, ...res.validation.round1, ...res.validation.round2];
  const blocking = allIssues.filter((i) => i.severity === 'blocking');
  const stage = (() => {
    if (doc.round2.status === 'finalised') return 4;
    if (doc.round1.status === 'locked') return 3;
    if (Object.values(counts).some((n, i) => i > 0 && n)) return 2;
    return 1;
  })();
  const rulesDraft = doc.rules.filter((r) => !r.approved).length;
  const steps = [
    { n: 1, title: 'Configure', done: res.validation.blocking.config === 0 && rulesDraft === 0, items: [`${doc.teams.length} teams, ${doc.continents.length} continents, ${doc.cities.length} cities, ${doc.employees.length} CVs`, `${doc.rules.length - rulesDraft} of ${doc.rules.length} rules approved`, `Configuration: ${res.validation.blocking.config} blocking issue(s)`] },
    { n: 2, title: 'Round 1 — CV auction', done: doc.round1.status === 'locked', items: [`${counts.sold || 0} of ${doc.auction.records.length} CVs sold`, `${counts.live ? '1 CV being auctioned' : 'No CV live'}`, doc.round1.status === 'locked' ? `Locked ${when(doc.round1.lockedAt)}` : 'Not locked'] },
    { n: 3, title: 'Round 2 — global expansion', done: doc.round2.status === 'finalised', items: [`${deps.filter((d) => d.valid).length} deployments recorded`, `${deps.filter((d) => d.valid && d.approval === 'approved').length} approved · ${deps.filter((d) => d.valid && !d.operational).length} blocked`, view.calc.draft ? `Calculation ${view.calc.current ? 'current' : 'outdated'} (${when(view.calc.draft.at)})` : 'Not calculated yet'] },
    { n: 4, title: 'Preserve results', done: doc.round2.status === 'finalised', items: [doc.finals.length ? `Official result v${doc.finals.at(-1).version} finalised ${when(doc.finals.at(-1).at)}` : 'No official result yet', 'Exports and the event archive: Reports and Exports', 'Backups: Settings and Backup'] },
  ];
  return [
    h('div', { class: 'pagehead' },
      h('div', {}, h('div', { class: 'eyebrow' }, cfg.event.name), h('h1', { class: 'page' }, 'Control Dashboard'), h('div', { class: 'muted' }, `${cfg.event.round} · ${cfg.event.subtitle} · ${periodLabel(cfg.period)}`)),
      h('div', { class: 'grow' }),
      doc.sampleData ? pill('Fictional sample data', 'gold') : null),
    h('div', { class: 'steps' }, steps.map((s) => h('div', { class: `step ${s.done ? 'done' : s.n === stage ? 'now' : ''}` }, h('div', { class: 's' }, `Stage ${s.n}${s.done ? ' · done' : s.n === stage ? ' · now' : ''}`), h('h3', {}, s.title), h('ul', {}, s.items.map((i) => h('li', {}, i)))))),
    h('div', { class: 'grid g4' }, doc.teams.map((t, i) => teamCard(ctx, t, i))),
    h('div', { class: 'grid g2' },
      card('Auction progress', stackedChart({ items: [{ label: 'CVs', values: [counts.sold || 0, counts.live || 0, counts.available || 0, counts.withdrawn || 0, counts.closed || 0] }], series: [{ name: 'Sold', color: 'var(--st-good)' }, { name: 'Being auctioned', color: 'var(--st-warning)' }, { name: 'Available', color: 'var(--st-neutral)' }, { name: 'Withdrawn', color: 'var(--st-serious)' }, { name: 'Closed unsold', color: 'var(--st-critical)' }] }), { tools: h('button', { class: 'btn sm', onclick: () => ctx.go('auction') }, 'Open the auction') }),
      card('Results status', h('div', { class: 'stack' },
        h('div', { class: 'row' }, stat('Round 1', doc.round1.status === 'locked' ? 'Locked' : 'Open'), stat('Round 2', doc.round2.status === 'finalised' ? 'Finalised' : 'Open'), stat('Calculation', !view.calc.draft ? 'Not run' : view.calc.current ? 'Current' : 'Outdated'), stat('Official result', doc.finals.length ? `v${doc.finals.at(-1).version}` : 'None')),
        h('p', { class: 'small muted' }, doc.round2.status === 'finalised' ? 'Round 2 is finalised. Later changes need an administrative correction (Super Administrator, with a reason).' : 'Results on screen are a live draft until a Super Administrator finalises Round 2.'),
        h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => ctx.go('financial') }, 'Financial engine'), h('button', { class: 'btn', onclick: () => ctx.go('rankings') }, 'Rankings'))))),
    card(`Validation: ${blocking.length} blocking, ${allIssues.length - blocking.length} warnings`, issuesList(blocking.slice(0, 8), { onGo: (ref) => goToRef(ctx, ref), empty: 'No blocking issues.' }), { tools: blocking.length > 8 ? h('span', { class: 'small muted' }, `${blocking.length - 8} more on the Financial Calculation Engine screen`) : null }),
    card('Recent activity', h('div', { class: 'stack' }, (view.auditTail || []).map((e) => h('div', { class: 'row small' }, h('span', { class: 'muted nowrap' }, when(e.at)), h('span', { class: 'strong' }, e.user?.username), h('span', {}, e.summary), e.reason ? h('span', { class: 'muted' }, `— ${e.reason}`) : null))), { tools: h('button', { class: 'btn sm', onclick: () => ctx.go('audit') }, 'Full audit log') }),
  ];
}

function countStatuses(doc) {
  const c = { sold: 0, live: 0, available: 0, withdrawn: 0, closed: 0 };
  for (const r of doc.auction.records) c[r.status] = (c[r.status] || 0) + 1;
  return c;
}

function teamCard(ctx, t, i) {
  const { res, doc } = ctx;
  const r1 = res.round1.teams[t.id];
  const r2 = res.round2.teams[t.id];
  const deps = Object.values(res.deployments).filter((d) => d.teamId === t.id && d.valid);
  const sub = doc.round2.submissions[t.id];
  const home = doc.continents.find((c) => c.id === t.homeContinentId);
  return h('section', { class: 'card gold' },
    h('div', { class: 'head' }, h('span', { class: 'dotkey', style: { background: `var(--s${i + 1})` } }), h('h2', {}, t.label), h('div', { class: 'grow' }), pill(home?.name || 'No home', 'neutral')),
    h('div', { class: 'small muted' }, t.profile.companyName),
    h('div', { class: 'kv', style: { marginTop: '10px' } },
      h('div', {}, h('div', { class: 'k' }, 'Hired'), h('div', { class: 'v' }, `${r1.count} of ${doc.config.auction.teamSize}`)),
      h('div', {}, h('div', { class: 'k' }, 'Winning bids'), h('div', { class: 'v' }, m(r1.totalBids))),
      h('div', {}, h('div', { class: 'k' }, 'Deployments'), h('div', { class: 'v' }, `${deps.length} · ${deps.filter((d) => d.operational).length} operational`)),
      h('div', {}, h('div', { class: 'k' }, 'Submission'), h('div', { class: 'v' }, sub?.received ? 'Received' : 'Not yet')),
      h('div', {}, h('div', { class: 'k' }, 'Net contribution'), h('div', { class: 'v' }, moneyEl(r2.statement.netContribution, { compact: true }))),
      h('div', {}, h('div', { class: 'k' }, 'Combined outcome'), h('div', { class: 'v' }, moneyEl(r2.statement.combined, { compact: true })))),
    h('div', { class: 'row', style: { marginTop: '10px' } }, h('button', { class: 'btn sm', onclick: () => ctx.go('expansion', { team: t.id }) }, 'Deployments'), h('button', { class: 'btn sm', onclick: () => ctx.go('financial', { team: t.id }) }, 'Financials')));
}
