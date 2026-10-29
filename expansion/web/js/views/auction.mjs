// 5. Round 1 — CV Auction. The auction happens in the room; this screen records its official
// outcome, one CV at a time, with every rule checked by the server.
import { h, card, pill, m, moneyInput, select, field, area, confirmDialog, modal, issuesList, kv, toast } from '../ui.mjs';
import { AUCTION_STATUS, FUNCTION_LABELS } from '../../engine/model.mjs';
import { capBars } from './cvs.mjs';
import { names, goToRef } from './common.mjs';

const TONE = { available: 'neutral', live: 'warn', sold: 'good', withdrawn: 'bad', closed: 'bad' };

export function render(ctx) {
  const { doc, res } = ctx;
  const n = names(ctx);
  const recs = [...doc.auction.records].sort((a, b) => a.order - b.order);
  const live = recs.find((r) => r.status === 'live');
  const focus = ctx.sub.auction?.focus || live?.employeeId || recs.find((r) => r.status === 'available')?.employeeId || recs[0]?.employeeId;
  const rec = recs.find((r) => r.employeeId === focus);
  const locked = doc.round1.status === 'locked';
  const canRecord = ctx.can('auction.record') && !locked;
  const move = (r, dir) => { const ids = recs.map((x) => x.employeeId); const i = ids.indexOf(r.employeeId); const j = i + dir; if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]]; ctx.act('auction.order', { order: ids }, { quiet: true }); };
  const list = h('div', { class: 'card cvlist' }, h('div', { class: 'head' }, h('h2', {}, 'Auction order'), h('div', { class: 'grow' }), pill(`${recs.filter((r) => r.status === 'sold').length}/${recs.length} sold`, 'info')),
    recs.map((r) => h('button', { class: r.employeeId === focus ? 'sel' : '', onclick: () => ctx.go('auction', { focus: r.employeeId }) },
      h('span', { class: 'muted num' }, `${r.order}.`),
      h('span', {}, h('div', { class: 'strong small' }, `${r.employeeId} ${n.emps[r.employeeId]?.name}`), h('div', { class: 'tiny muted' }, `${n.emps[r.employeeId]?.seniority} · ${FUNCTION_LABELS[n.emps[r.employeeId]?.primaryFunction]} · start ${m(r.startingBid)}`)),
      h('span', {}, pill(r.status === 'sold' ? n.team(r.winningTeamId) : AUCTION_STATUS[r.status].replace(' (unsold)', ''), TONE[r.status]),
        canRecord ? h('span', { class: 'row', style: { marginTop: '4px', justifyContent: 'flex-end', gap: '2px' } }, h('span', { class: 'btn ghost sm', role: 'button', tabindex: 0, title: 'Move up', onclick: (e) => { e.stopPropagation(); move(r, -1); } }, '▲'), h('span', { class: 'btn ghost sm', role: 'button', tabindex: 0, title: 'Move down', onclick: (e) => { e.stopPropagation(); move(r, 1); } }, '▼')) : null))));
  return [
    h('div', { class: 'pagehead' }, h('div', {}, h('div', { class: 'eyebrow' }, 'Stage 2 · Round 1'), h('h1', { class: 'page' }, 'CV Auction')), h('div', { class: 'grow' }),
      locked ? pill(`Round 1 locked ${new Date(doc.round1.lockedAt).toLocaleString('en-IN')}`, 'good') : pill('Round 1 open', 'warn'),
      live ? pill(`Now: ${live.employeeId} ${n.emps[live.employeeId]?.name}`, 'warn') : null),
    locked ? h('div', { class: 'note good' }, 'Round 1 is locked. The twenty records are read-only; a Super Administrator can make a correction with a logged reason. The original locked outcome is preserved.') : null,
    h('div', { class: 'auction' }, list, rec ? cvPanel(ctx, rec) : h('div', {}), budgets(ctx)),
    lockCard(ctx),
  ];
}

function cvPanel(ctx, r) {
  const { doc } = ctx;
  const n = names(ctx);
  const e = n.emps[r.employeeId];
  const locked = doc.round1.status === 'locked';
  const canRecord = ctx.can('auction.record') && !locked;
  const isSuper = ctx.can('correction');
  const teamOpts = doc.teams.map((t) => [t.id, `${t.label} (${(ctx.res.roster[t.id] || []).length}/${doc.config.auction.teamSize})`]);
  const actions = [];
  if (canRecord && r.status === 'available') {
    actions.push(h('div', { class: 'row' },
      h('button', { class: 'btn gold', onclick: () => ctx.act('auction.start', { employeeId: r.employeeId }) }, 'Start auctioning this CV'),
      h('button', { class: 'btn', onclick: async () => { const x = await confirmDialog(`Withdraw ${r.employeeId}?`, { message: 'A withdrawn CV must later be re-opened, allocated by Event Control decision, or recorded as left unallocated.', reason: 'required', confirmLabel: 'Withdraw', danger: true }); if (x) ctx.act('auction.withdraw', { employeeId: r.employeeId, reason: x.reason }); } }, 'Withdraw')));
  }
  if (canRecord && (r.status === 'live' || r.status === 'available')) actions.push(saleForm(ctx, r, teamOpts));
  if (canRecord && r.status === 'live') {
    const team = select(doc.teams.map((t) => [t.id, t.label]), r.currentBidTeamId || doc.teams[0].id);
    const amt = moneyInput(r.currentBid);
    actions.push(card('Track the bidding (optional)', [
      h('div', { class: 'row' }, field('Bidding team', team), field('Bid', amt), h('button', { class: 'btn', onclick: () => { const v = amt.getValue(); if (!(v >= 0)) return toast('Enter a bid amount.', 'bad'); ctx.act('auction.bid', { employeeId: r.employeeId, teamId: team.value, amount: v }, { quiet: true }); } }, 'Record bid')),
      r.currentBid !== null ? h('p', { class: 'small' }, `Current bid: ${m(r.currentBid)} by ${n.team(r.currentBidTeamId)}`) : null,
      (r.bidLog || []).length ? h('div', { class: 'small muted' }, [...r.bidLog].reverse().slice(0, 6).map((b) => h('div', {}, `${n.team(b.teamId)} ${m(b.amount)} · ${new Date(b.at).toLocaleTimeString('en-IN')} · ${b.by}`))) : null,
      h('div', { class: 'row', style: { marginTop: '6px' } }, h('button', { class: 'btn', onclick: async () => { const x = await confirmDialog(`Close ${r.employeeId} without a sale?`, { message: 'The CV will be marked “Auction closed (unsold)”. It must then be re-opened or resolved by Event Control.', confirmLabel: 'Close without a sale' }); if (x) ctx.act('auction.close', { employeeId: r.employeeId }); } }, 'Close without a sale'),
        h('button', { class: 'btn', onclick: async () => { const x = await confirmDialog(`Withdraw ${r.employeeId}?`, { reason: 'required', confirmLabel: 'Withdraw', danger: true }); if (x) ctx.act('auction.withdraw', { employeeId: r.employeeId, reason: x.reason }); } }, 'Withdraw')),
    ]));
  }
  if (!locked && (r.status === 'withdrawn' || r.status === 'closed')) {
    actions.push(h('div', { class: 'note bad' }, `${AUCTION_STATUS[r.status]}. Unsold CVs are never assigned automatically: resolve it explicitly.${r.resolution?.kind === 'unallocated' ? ` Recorded as left unallocated: ${r.resolution.reason}` : ''}`));
    actions.push(h('div', { class: 'row' },
      canRecord ? h('button', { class: 'btn', onclick: () => ctx.act('auction.reopen', { employeeId: r.employeeId }) }, 'Re-open for auction') : null,
      isSuper ? h('button', { class: 'btn', onclick: () => allocate(ctx, r, teamOpts) }, 'Allocate by Event Control decision') : null,
      isSuper && r.resolution?.kind !== 'unallocated' ? h('button', { class: 'btn', onclick: async () => { const x = await confirmDialog('Leave this CV unallocated?', { message: 'Allowed only if the team-size rule can still be met (the Super Administrator may change it in Event Configuration).', reason: 'required', confirmLabel: 'Leave unallocated' }); if (x) ctx.act('auction.leaveUnallocated', { employeeId: r.employeeId, reason: x.reason }); } }, 'Leave unallocated') : null));
  }
  if (r.status === 'sold') {
    actions.push(h('div', { class: 'note good' }, `Sold to ${n.team(r.winningTeamId)} for ${m(r.winningBid)} — confirmed by ${r.confirmedBy} at ${new Date(r.confirmedAt).toLocaleString('en-IN')}${r.resolution?.kind === 'direct' ? ` (direct allocation: ${r.resolution.reason})` : ''}.`));
    if (isSuper && doc.round2.status !== 'finalised') actions.push(h('button', { class: 'btn', onclick: () => correct(ctx, r, teamOpts) }, locked ? 'Correct this result (administrative correction)' : 'Correct this result'));
  }
  const notes = area(r.notes, { disabled: !ctx.can('auction.record'), rows: 2 });
  return h('div', { class: 'stack' },
    card(`${e.id} · ${e.name}`, [
      h('div', { class: 'row' }, pill(AUCTION_STATUS[r.status], TONE[r.status]), h('span', { class: 'muted' }, `${e.headline} · ${e.seniority} · ${e.yearsExperience} years · from ${n.cont(e.origin)}`)),
      kv([['Starting bid', m(r.startingBid)], ['Expected salary', m(e.employment.expectedSalary)], ['Recruitment + onboarding', m(e.employment.hiringCost + e.employment.onboardingCost)], ['Best role', `${ctx.res.employees[e.id].roles[0].name} (${ctx.res.employees[e.id].roles[0].fit})`], ['Languages', e.languages.join(', ')], ['Risk factor', e.strategic.risk?.kind && e.strategic.risk.kind !== 'none' ? e.strategic.risk.text : 'None disclosed']]),
      h('div', { class: 'sep' }), capBars(e),
      h('div', { class: 'small muted', style: { marginTop: '8px' } }, `Strengths: ${(e.strategic.strengths || []).join('; ')} · Limitations: ${(e.strategic.limitations || []).join('; ')}`),
    ], { cls: 'gold' }),
    ...actions,
    card('Operator notes', [notes, ctx.can('auction.record') ? h('div', { class: 'row end', style: { marginTop: '6px' } }, h('button', { class: 'btn sm', onclick: () => ctx.act('auction.note', { employeeId: r.employeeId, notes: notes.value }, { quiet: true }) }, 'Save notes')) : null]));
}

function saleForm(ctx, r, teamOpts) {
  const { doc, res } = ctx;
  const n = names(ctx);
  const team = select(teamOpts, r.currentBidTeamId || '', { empty: 'Choose the winning team…' });
  const amt = moneyInput(r.currentBid ?? null);
  const submit = async () => {
    const amount = amt.getValue();
    if (!team.value) return toast('Choose the winning team.', 'bad');
    if (!(amount >= 0)) return toast('Enter the winning bid (zero or more).', 'bad');
    const m1 = res.round1.teams[team.value];
    const e = n.emps[r.employeeId];
    const extra = doc.config.auction.budgetBasis === 'initialHiringCost' ? amount + e.employment.hiringCost + e.employment.onboardingCost : amount;
    const over = m1.budget !== null && m1.budgetUsed + extra > m1.budget;
    const x = await confirmDialog('Confirm the winning allocation', {
      message: h('div', { class: 'stack' }, h('p', { class: 'strong' }, `${r.employeeId} ${e.name} → ${n.team(team.value)} for ${m(amount)}`),
        h('p', { class: 'small' }, `${n.team(team.value)} will have ${m1.count + 1} of ${doc.config.auction.teamSize} employees.`),
        m1.budget !== null ? h('p', { class: `small${over ? ' neg' : ''}` }, `Acquisition budget: ${m(m1.budgetUsed + extra)} of ${m(m1.budget)} used${over ? ' — OVER BUDGET' : ''}.`) : null,
        amount < r.startingBid ? h('p', { class: 'small neg' }, `Below the starting bid of ${m(r.startingBid)}.`) : null),
      confirmLabel: 'Confirm the sale', ack: over && doc.config.auction.budgetEnforcement === 'warn' ? 'I have seen the budget warning' : null,
    });
    if (x) ctx.act('auction.sell', { employeeId: r.employeeId, teamId: team.value, amount, confirm: true, ackBudget: !!over });
  };
  return card('Record the official result', [h('div', { class: 'row' }, field('Winning team', team), field('Winning bid', amt), h('button', { class: 'btn primary', onclick: submit }, 'Record the sale…')),
    h('p', { class: 'tiny muted' }, 'The sale is recorded only after you confirm it. The server refuses a second sale of the same CV and a sixth employee for a team.')]);
}

async function allocate(ctx, r, teamOpts) {
  const team = select(teamOpts, '', { empty: 'Choose a team…' });
  const amt = moneyInput(0);
  const reason = area('', { rows: 2 });
  modal(`Allocate ${r.employeeId} by Event Control decision`, (close) => [h('p', {}, 'Used only when the auction cannot resolve the CV. The decision and its reason are recorded.'), field('Team', team), field('Price', amt), field('Reason (required)', reason),
    h('div', { class: 'row end' }, h('button', { class: 'btn primary', onclick: async () => { if (await ctx.act('auction.allocate', { employeeId: r.employeeId, teamId: team.value, amount: amt.getValue(), reason: reason.value, confirm: true })) close(); } }, 'Allocate'))]);
}

async function correct(ctx, r, teamOpts) {
  const locked = ctx.doc.round1.status === 'locked';
  const team = select(teamOpts, r.winningTeamId);
  const amt = moneyInput(r.winningBid);
  const reason = area('', { rows: 2 });
  modal(`Correct the result for ${r.employeeId}`, (close) => [
    h('div', { class: `note ${locked ? 'bad' : ''}` }, locked ? 'Round 1 is locked. This is an administrative correction: it is recorded beside the preserved original outcome, and any Round 2 calculation becomes outdated.' : 'The previous result and the reason are recorded in the audit log.'),
    field('Correct team', team), field('Correct winning bid', amt), field('Reason (required)', reason),
    h('div', { class: 'row end' },
      h('button', { class: 'btn danger', onclick: async () => { if (await ctx.act('auction.correct', { employeeId: r.employeeId, cancel: true, reason: reason.value, confirm: true })) close(); } }, 'Cancel the sale'),
      h('button', { class: 'btn primary', onclick: async () => { if (await ctx.act('auction.correct', { employeeId: r.employeeId, teamId: team.value, amount: amt.getValue(), reason: reason.value, confirm: true })) close(); } }, 'Save the correction'))]);
}

function budgets(ctx) {
  const { doc, res } = ctx;
  return h('div', { class: 'stack budgets' }, doc.teams.map((t, i) => {
    const r1 = res.round1.teams[t.id];
    const used = r1.budget ? Math.min(100, (100 * r1.budgetUsed) / r1.budget) : 0;
    return h('div', { class: 'card' },
      h('div', { class: 'head' }, h('span', { class: 'dotkey', style: { background: `var(--s${i + 1})` } }), h('h3', {}, t.label), h('div', { class: 'grow' }), pill(`${r1.count}/${doc.config.auction.teamSize}`, r1.count === doc.config.auction.teamSize ? 'good' : 'neutral')),
      h('div', { class: 'small' }, `Bids ${m(r1.totalBids)} · hiring cost ${m(r1.initialHiringCost)}`),
      r1.budget !== null ? [h('div', { class: 'capbar', style: { gridTemplateColumns: '1fr' } }, h('span', { class: 'track' }, h('span', { class: 'fill', style: { width: `${used}%`, background: r1.overBudget ? 'var(--st-critical)' : 'var(--s1)' } }))),
        h('div', { class: `small ${r1.overBudget ? 'neg' : 'muted'}` }, `${m(r1.budgetRemaining)} of ${m(r1.budget)} left${r1.overBudget ? ' — over budget' : ''}`)] : h('div', { class: 'small muted' }, 'No acquisition budget'),
      h('div', { class: 'tiny muted', style: { marginTop: '4px' } }, (res.roster[t.id] || []).join(', ') || 'No one hired yet'));
  }));
}

function lockCard(ctx) {
  const { doc, res } = ctx;
  const issues = [...res.validation.round1, ...res.validation.config.filter((i) => i.severity === 'blocking')];
  const blocking = issues.filter((i) => i.severity === 'blocking').length;
  const locked = doc.round1.status === 'locked';
  return card('Round 1 checklist and lock', [
    issuesList(issues, { onGo: (ref) => goToRef(ctx, ref), empty: 'Every team has exactly the required employees and every CV is resolved.' }),
    (doc.round1.corrections || []).length ? h('div', { class: 'note', style: { marginTop: '8px' } }, `${doc.round1.corrections.length} correction(s) after locking — listed in Auction Results.`) : null,
    h('div', { class: 'row end', style: { marginTop: '10px' } },
      !locked && ctx.can('round.lock') ? h('button', { class: 'btn gold', disabled: blocking > 0, onclick: () => ctx.act('round1.lock', {}, { confirm: { title: 'Lock Round 1?', message: 'The twenty auction records become read-only, the employee-to-team mapping is preserved for Round 2, and a backup is taken.', confirmLabel: 'Lock Round 1' } }) }, blocking ? `Lock Round 1 (${blocking} blocking issue${blocking > 1 ? 's' : ''})` : 'Lock Round 1') : null,
      locked && ctx.can('round.lock') && doc.round2.status !== 'finalised' ? h('button', { class: 'btn', onclick: () => ctx.act('round1.unlock', {}, { confirm: { title: 'Unlock Round 1?', message: 'Auction records become editable again. The locked outcome stays preserved, and Round 2 results may become outdated.', reason: 'required', confirmLabel: 'Unlock', danger: true } }) }, 'Unlock Round 1') : null),
  ]);
}
