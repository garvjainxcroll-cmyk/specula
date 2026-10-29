// 8. Legal and Compliance Engine: record what is actually known for each requirement, and
// keep the rule book. Missing information is "not yet assessed" — never treated as a refusal.
import { h, card, tabs, pill, m, select, text, area, field, check, moneyInput, num, modal, confirmDialog, issuesList, table, numVal, toast } from '../ui.mjs';
import { COMPLIANCE_STATUS, MANUAL_STATUSES, CHECK_KINDS, RULE_CATEGORIES, FUNCTIONS, FUNCTION_LABELS, SENIORITY, PACKAGES, CAP_KEYS, CAP_LABELS } from '../../engine/model.mjs';
import { describeScope } from '../../engine/compliance.mjs';
import { names, statusPill, depStatus, goToRef } from './common.mjs';

export function render(ctx) {
  const tab = ctx.sub.compliance?.tab || 'evaluations';
  return [
    h('div', { class: 'pagehead' }, h('div', {}, h('div', { class: 'eyebrow' }, 'Stage 3 · Round 2'), h('h1', { class: 'page' }, 'Legal and Compliance Engine'))),
    h('div', { class: 'note' }, 'Every rule here is fictional simulation data unless marked as based on real law (which must record who verified it). Rules are applied only once Event Control approves them. Statuses are kept apart: not yet assessed, pending documentation, non-compliant (a confirmed violation), administrator review, not applicable, compliant, waived.'),
    tabs([{ id: 'evaluations', label: 'Evaluations' }, { id: 'rules', label: `Rules (${ctx.doc.rules.length})` }], tab, (t) => ctx.go('compliance', { tab: t })),
    ...(tab === 'rules' ? rules(ctx) : evaluations(ctx)),
  ];
}

function evaluations(ctx) {
  const { doc, res } = ctx;
  const n = names(ctx);
  const s = ctx.sub.compliance || {};
  const canRecord = ctx.can('compliance.record') && doc.round1.status === 'locked' && doc.round2.status !== 'finalised';
  const canWaive = ctx.can('waiver') && doc.round2.status !== 'finalised';
  const teamF = select(doc.teams.map((t) => [t.id, t.label]), s.team || '', { empty: 'All teams' });
  const statF = select(Object.entries(COMPLIANCE_STATUS), s.status || '', { empty: 'Any status' });
  const contF = select(doc.continents.map((c) => [c.id, c.name]), s.cont || '', { empty: 'All continents' });
  for (const [el, k] of [[teamF, 'team'], [statF, 'status'], [contF, 'cont']]) el.addEventListener('change', () => ctx.go('compliance', { [k]: el.value || null, focus: null }));
  let deps = Object.values(res.deployments).filter((d) => d.valid).sort((a, b) => a.id.localeCompare(b.id));
  if (s.team) deps = deps.filter((d) => d.teamId === s.team);
  if (s.cont) deps = deps.filter((d) => d.continentId === s.cont);
  if (s.status) deps = deps.filter((d) => d.compliance.evals.some((e) => e.status === s.status));
  if (s.focus) deps = [...deps.filter((d) => d.id === s.focus), ...deps.filter((d) => d.id !== s.focus)];
  const issues = res.validation.round2.filter((i) => ['R2_UNASSESSED', 'R2_EVIDENCE', 'R2_BLOCKED'].includes(i.code) && (!s.team || i.ref?.teamId === s.team));
  return [
    h('div', { class: 'row' }, teamF, contF, statF, h('span', { class: 'muted small' }, `${deps.length} deployment(s)`)),
    card('Outstanding compliance checks', issuesList(issues, { onGo: (ref) => goToRef(ctx, ref), empty: 'Every applicable requirement is assessed and every blocked deployment is resolved or recorded.' })),
    ...deps.map((d) => depCard(ctx, d, canRecord, canWaive, n)),
    !deps.length ? h('div', { class: 'note' }, doc.round1.status === 'locked' ? 'No deployments match.' : 'Deployments are recorded after Round 1 is locked.') : null,
  ];
}

function depCard(ctx, d, canRecord, canWaive, n) {
  const rows = d.compliance.evals.map((e) => evalRow(ctx, d, e, canRecord, canWaive));
  const bulkEvidence = text('', { placeholder: 'Evidence reference for all' });
  return card(h('div', { class: 'row' }, h('span', { class: 'strong' }, d.id), depStatus(d), h('span', {}, `${n.emp(d.employeeId)} · ${n.team(d.teamId)} · ${n.role(d.roleId)} in ${n.city(d.cityId)}, ${n.cont(d.continentId)}`), d.international ? pill('Not a citizen of the destination', 'info') : pill('Citizen of the destination', 'neutral')), [
    d.compliance.evals.length ? h('div', { class: 'tablewrap' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Rule', 'Requirement', 'Type', 'Status', 'Evidence / detail', 'Costs', ''].map((x) => h('th', {}, x)))), h('tbody', {}, rows))) : h('p', { class: 'muted' }, 'No approved rule applies to this deployment.'),
    canRecord && d.compliance.evals.some((e) => e.source === 'manual' && e.status === 'unassessed') ? h('div', { class: 'row end', style: { marginTop: '8px' } }, bulkEvidence,
      h('button', { class: 'btn sm', onclick: () => ctx.act('compliance.bulk', { deploymentId: d.id, status: 'pending', evidence: bulkEvidence.value }) }, 'Mark the rest pending'),
      h('button', { class: 'btn sm', onclick: async () => { const x = await confirmDialog('Mark every unassessed requirement compliant?', { message: 'Only do this when the documents for all of them are in hand. Requirements that need evidence stay pending until an evidence reference is recorded.', confirmLabel: 'Mark compliant' }); if (x) ctx.act('compliance.bulk', { deploymentId: d.id, status: 'compliant', evidence: bulkEvidence.value }); } }, 'Mark the rest compliant')) : null,
  ], { cls: ctx.sub.compliance?.focus === d.id ? 'gold' : '' });
}

function evalRow(ctx, d, e, canRecord, canWaive) {
  const flags = [e.mandatory ? 'Mandatory' : 'Advisory', e.blocks ? 'blocks deployment' : 'non-blocking', e.satisfiableBefore ? 'before deployment' : 'after arrival', e.evidenceRequired ? 'evidence required' : null].filter(Boolean).join(' · ');
  const costs = [e.oneTimeCost ? `fee ${m(e.oneTimeCost)}` : null, e.annualCost ? `${m(e.annualCost)}/yr` : null, e.documentationCost ? `docs ${m(e.documentationCost)}` : null, e.penalty ? h('span', { class: 'neg' }, `penalty ${m(e.penalty)}`) : null, e.revenueImpactPct ? h('span', { class: 'neg' }, `revenue −${e.revenueImpactPct}%`) : null].filter(Boolean);
  let control;
  if (e.source === 'manual' && canRecord && !e.waived) {
    const st = select(MANUAL_STATUSES.map((s) => [s, COMPLIANCE_STATUS[s]]), e.status === 'pending' && e.evidenceMissing ? 'compliant' : e.status);
    const ev = text(e.evidence, { placeholder: 'Evidence reference' }); const note = text(e.note, { placeholder: 'Note' });
    control = h('div', { class: 'stack' }, h('div', { class: 'row' }, st, ev), h('div', { class: 'row' }, note, h('button', { class: 'btn sm primary', onclick: () => ctx.act('compliance.set', { deploymentId: d.id, ruleId: e.ruleId, status: st.value, evidence: ev.value, note: note.value }) }, 'Save')));
  } else if (e.source === 'auto') {
    control = h('div', { class: 'stack' }, h('div', { class: 'small' }, e.detail), canRecord && !e.waived ? h('button', { class: 'btn sm', onclick: () => ctx.act('compliance.set', { deploymentId: d.id, ruleId: e.ruleId, status: e.status === 'review' ? 'unassessed' : 'review', evidence: '', note: '' }) }, e.status === 'review' ? 'Clear the review flag' : 'Refer for administrator review') : null);
  } else control = h('div', { class: 'small' }, [e.evidence, e.note, e.detail].filter(Boolean).join(' · ') || '—');
  const waive = canWaive && e.waivable ? (e.waived
    ? h('button', { class: 'btn sm', onclick: async () => { const x = await confirmDialog(`Remove the waiver of ${e.ruleId}?`, { reason: 'required', confirmLabel: 'Remove waiver' }); if (x) ctx.act('compliance.unwaive', { deploymentId: d.id, ruleId: e.ruleId, reason: x.reason }); } }, 'Remove waiver')
    : h('button', { class: 'btn sm', onclick: async () => { const x = await confirmDialog(`Waive ${e.ruleId} for ${d.id}?`, { message: 'An administrative override. The documented reason is recorded in the audit log and shown in the compliance report.', reason: 'required', reasonLabel: 'Documented reason for the waiver', confirmLabel: 'Apply the waiver', danger: true }); if (x) ctx.act('compliance.waive', { deploymentId: d.id, ruleId: e.ruleId, reason: x.reason }); } }, 'Waive…')) : null;
  return h('tr', {}, h('td', { class: 'nowrap strong' }, e.ruleId), h('td', { class: 'wrap' }, e.title, h('div', { class: 'tiny muted' }, flags)), h('td', {}, e.source === 'auto' ? 'Automatic' : 'Operator'),
    h('td', {}, statusPill(e.status), e.blocking ? h('div', { class: 'tiny neg strong' }, 'BLOCKING') : null, e.evidenceMissing ? h('div', { class: 'tiny neg' }, 'Evidence missing') : null, e.waived ? h('div', { class: 'tiny' }, `Waived: ${e.waiver.reason}`) : null),
    h('td', {}, control), h('td', { class: 'small' }, costs.length ? costs.flatMap((c, i) => (i ? [' · ', c] : [c])) : '—'), h('td', {}, waive));
}

function rules(ctx) {
  const { doc } = ctx;
  const n = names(ctx);
  const canEdit = ctx.can('config.edit') && doc.round2.status !== 'finalised';
  const canApprove = ctx.can('rules.approve') && doc.round2.status !== 'finalised';
  const nm = Object.fromEntries([...doc.continents.map((c) => [c.id, c.name]), ...doc.cities.map((c) => [c.id, c.name])]);
  const focus = ctx.sub.compliance?.focus;
  return [
    card('Configuration checks for rules', issuesList(ctx.res.validation.config.filter((i) => ['CFG_RULES', 'CFG_RULES_APPROVED', 'CFG_REAL_LAW'].includes(i.code)), { onGo: (ref) => goToRef(ctx, ref), empty: 'Every rule is valid and approved.' })),
    card(null, table([
      { label: 'ID', get: (r) => r.id }, { label: 'Requirement', get: (r) => r.title, wrap: true }, { label: 'Category', get: (r) => r.category },
      { label: 'Applies to', get: (r) => describeScope(r, nm), wrap: true },
      { label: 'Check', get: (r) => CHECK_KINDS[r.check?.kind || 'status'], wrap: true },
      { label: 'Mandatory / blocks', get: (r) => `${r.mandatory ? 'Mandatory' : 'Advisory'} / ${r.blocks ? 'Blocks' : 'No'}` },
      { label: 'Cost', num: true, get: (r) => r.cost, render: (r) => `${m(r.cost)}${r.costType === 'annual' ? '/yr' : ''}` }, { label: 'Penalty', num: true, get: (r) => r.penalty, render: (r) => m(r.penalty) },
      { label: 'State', get: (r) => (r.approved ? 'approved' : 'draft'), render: (r) => h('div', {}, pill(r.approved ? 'Approved' : 'Draft — not applied', r.approved ? 'good' : 'warn'), r.realLaw ? h('div', { class: 'tiny' }, `Real law · verified by ${r.verifiedBy || '—'}`) : h('div', { class: 'tiny muted' }, 'Fictional')) },
      { label: '', sort: false, render: (r) => h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: () => ruleEditor(ctx, r) }, canEdit ? 'Edit' : 'View'),
        canApprove && !r.approved ? h('button', { class: 'btn sm primary', onclick: () => ctx.act('rule.approve', { id: r.id }) }, 'Approve') : null,
        canApprove && r.approved ? h('button', { class: 'btn sm', onclick: async () => { const x = await confirmDialog(`Return ${r.id} to draft?`, { message: 'A draft rule is not applied to any deployment.', reason: 'required', confirmLabel: 'Return to draft' }); if (x) ctx.act('rule.unapprove', { id: r.id, reason: x.reason }); } }, 'Unapprove') : null) },
    ], doc.rules, { id: 'rules', selected: (r) => r.id === focus, filters: [{ label: 'All states', options: [['approved', 'Approved'], ['draft', 'Draft']], get: (r) => (r.approved ? 'approved' : 'draft') }, { label: 'All continents', options: doc.continents.map((c) => [c.id, c.name]), get: (r) => (r.continentIds || [])[0] || '' }],
      tools: h('div', { class: 'row' }, canEdit ? h('button', { class: 'btn', onclick: () => ruleEditor(ctx, null) }, 'Add a rule') : null, canApprove && doc.rules.some((r) => !r.approved) ? h('button', { class: 'btn gold', onclick: () => ctx.act('rule.approve', { all: true }, { confirm: { title: 'Approve every draft rule?', message: 'Approve only after Event Control has reviewed each rule and its numerical consequences.', confirmLabel: 'Approve all' } }) }, 'Approve all drafts') : null) })),
  ];
}

function ruleEditor(ctx, r) {
  const { doc } = ctx;
  const canEdit = ctx.can('config.edit') && doc.round2.status !== 'finalised';
  const dis = { disabled: !canEdit };
  const x = r || { id: '', title: '', category: 'Employment documentation', description: '', continentIds: [], cityIds: [], appliesTo: { when: 'always', functions: [], seniority: [], assignmentTypes: [], roles: [] }, mandatory: true, blocks: false, satisfiableBefore: true, evidenceRequired: false, check: { kind: 'status' }, cost: 0, costType: 'oneTime', penalty: 0, revenueImpactPct: 0, scorePenalty: 0, waivable: false, realLaw: false, verifiedBy: '' };
  const id = text(x.id, { disabled: !canEdit || !!r }); const title = text(x.title, dis); const cat = select(RULE_CATEGORIES, x.category, dis); const desc = area(x.description, { ...dis, rows: 2 });
  const conts = Object.fromEntries(doc.continents.map((c) => [c.id, check(c.name, x.continentIds.includes(c.id), dis)]));
  const cities = Object.fromEntries(doc.cities.map((c) => [c.id, check(c.name, x.cityIds.includes(c.id), dis)]));
  const when = select([['always', 'Every employee'], ['international', 'Employees who are not citizens of the destination continent'], ['foreignToTeam', 'Destinations outside the team’s home continent']], x.appliesTo.when, dis);
  const fns = Object.fromEntries(FUNCTIONS.map((f) => [f, check(FUNCTION_LABELS[f], x.appliesTo.functions.includes(f), dis)]));
  const sen = Object.fromEntries(SENIORITY.map((f) => [f, check(f, x.appliesTo.seniority.includes(f), dis)]));
  const types = Object.fromEntries(doc.config.assignmentTypes.map((t) => [t.id, check(t.name, x.appliesTo.assignmentTypes.includes(t.id), dis)]));
  const flags = Object.fromEntries([['mandatory', 'Mandatory'], ['blocks', 'Blocks the deployment until satisfied'], ['satisfiableBefore', 'Must be satisfied before deployment'], ['evidenceRequired', 'Evidence must be recorded'], ['waivable', 'May be waived by a Super Administrator (with a reason)'], ['realLaw', 'Based on real law (must be independently verified)']].map(([k, l]) => [k, check(l, x[k], dis)]));
  const verified = text(x.verifiedBy, { ...dis, placeholder: 'Name, source and date of the verification' });
  const kind = select(Object.entries(CHECK_KINDS), x.check.kind, dis);
  const pBasis = select([['market', '% of the local market salary'], ['expected', '% of the employee’s expected salary'], ['fixed', 'A fixed amount']], x.check.basis || 'market', dis);
  const pPct = num(x.check.pct ?? 90, dis); const pAmt = moneyInput(x.check.amount ?? 0, dis); const pMonths = num(x.check.months ?? 6, dis); const pYears = num(x.check.years ?? 5, dis);
  const pKey = select(CAP_KEYS.map((k) => [k, CAP_LABELS[k]]), x.check.key || 'legal', dis); const pMin = num(x.check.min ?? 60, dis); const pLevel = select(SENIORITY, x.check.level || 'Senior', dis);
  const pPkg = select(Object.entries(PACKAGES).map(([k, v]) => [k, v.label]), x.check.min && PACKAGES[x.check.min] ? x.check.min : 'standard', dis);
  const pTypes = Object.fromEntries(doc.config.assignmentTypes.map((t) => [t.id, check(t.name, (x.check.types || []).includes(t.id), dis)]));
  const cost = moneyInput(x.cost, dis); const costType = select([['oneTime', 'One-time'], ['annual', 'A year (prorated)']], x.costType, dis);
  const penalty = moneyInput(x.penalty, dis); const revImp = num(x.revenueImpactPct, { ...dis, min: 0, max: 100 }); const scorePen = num(x.scorePenalty, { ...dis, min: 0, max: 100 });
  const picked = (m0) => Object.entries(m0).filter(([, c]) => c.input.checked).map(([k]) => k);
  modal(r ? `Rule ${r.id}` : 'New rule', (close) => [
    r?.approved ? h('div', { class: 'note' }, 'This rule is approved. Changing its conditions or consequences returns it to draft until it is approved again.') : null,
    h('div', { class: 'fields' }, field('Rule ID', id), field('Requirement', title), field('Category', cat)), field('Description', desc),
    h('h3', {}, 'Where it applies (none ticked = everywhere)'), h('div', { class: 'fields' }, Object.values(conts).map((c) => c.el)),
    h('details', {}, h('summary', { class: 'small' }, 'Only in particular cities'), h('div', { class: 'fields' }, Object.values(cities).map((c) => c.el))),
    h('h3', {}, 'Who it applies to'), field('Applies to', when),
    h('details', {}, h('summary', { class: 'small' }, 'Only some functions, seniority levels or assignment types'), h('div', { class: 'fields' }, Object.values(fns).map((c) => c.el)), h('div', { class: 'fields' }, Object.values(sen).map((c) => c.el)), h('div', { class: 'fields' }, Object.values(types).map((c) => c.el))),
    h('h3', {}, 'How it is checked'), h('div', { class: 'fields' }, field('Check', kind), field('Minimum salary basis', pBasis), field('Minimum salary %', pPct), field('Fixed minimum salary', pAmt), field('Maximum months', pMonths), field('Minimum years', pYears), field('Capability', pKey), field('Minimum score', pMin), field('Minimum seniority', pLevel), field('Minimum package', pPkg)),
    h('details', {}, h('summary', { class: 'small' }, 'Banned assignment types (for that check)'), h('div', { class: 'fields' }, Object.values(pTypes).map((c) => c.el))),
    h('h3', {}, 'Status rules'), h('div', { class: 'fields' }, Object.values(flags).map((c) => c.el)), field('Verified by (required for real law)', verified),
    h('h3', {}, 'Numerical consequences'), h('div', { class: 'fields' }, field('Cost of complying', cost), field('Cost type', costType), field('Penalty for a confirmed violation', penalty), field('Revenue reduction while unresolved (%)', revImp, 'For mandatory non-blocking rules'), field('Compliance score penalty (points)', scorePen)),
    canEdit ? h('div', { class: 'row end' }, r ? h('button', { class: 'btn danger', onclick: async () => { const y = await confirmDialog(`Delete rule ${r.id}?`, { confirmLabel: 'Delete', danger: true }); if (y && await ctx.act('rule.delete', { id: r.id })) close(); } }, 'Delete') : null,
      h('button', { class: 'btn primary', onclick: async () => {
        const k = kind.value;
        const chk = { kind: k, ...(k === 'minSalary' ? { basis: pBasis.value, ...(pBasis.value === 'fixed' ? { amount: pAmt.getValue() } : { pct: numVal(pPct) }) } : {}), ...(k === 'maxContractMonths' ? { months: numVal(pMonths) } : {}), ...(k === 'minExperience' ? { years: numVal(pYears) } : {}), ...(k === 'minCapability' ? { key: pKey.value, min: numVal(pMin) } : {}), ...(k === 'minSeniority' ? { level: pLevel.value } : {}), ...(k === 'relocationPackage' ? { min: pPkg.value } : {}), ...(k === 'assignmentTypeBan' ? { types: picked(pTypes) } : {}) };
        const fields = { title: title.value, category: cat.value, description: desc.value, continentIds: picked(conts), cityIds: picked(cities), appliesTo: { when: when.value, functions: picked(fns), seniority: picked(sen), assignmentTypes: picked(types), roles: [] }, ...Object.fromEntries(Object.entries(flags).map(([kk, c]) => [kk, c.input.checked])), verifiedBy: verified.value, check: chk, cost: cost.getValue(), costType: costType.value, penalty: penalty.getValue(), revenueImpactPct: numVal(revImp), scorePenalty: numVal(scorePen) };
        if ([fields.cost, fields.penalty].some((v) => Number.isNaN(v))) return toast('Amounts must be numbers of zero or more.', 'bad');
        const ok = r ? await ctx.act('rule.update', { id: r.id, expectRev: r.rev || 0, patch: fields }) : await ctx.act('rule.create', { rule: { id: id.value, ...fields } });
        if (ok) close();
      } }, r ? 'Save rule' : 'Add as draft')) : null,
  ], { wide: true });
}
