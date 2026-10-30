// 7. Round 2 — Global Expansion: record each team's written allocation exactly as submitted.
// The system never decides a deployment; it evaluates the ones the teams submit.
import { h, card, tabs, pill, m, mc, modal, field, num, text, area, select, check, moneyInput, numVal, issuesList, confirmDialog, toast, when } from '../ui.mjs';
import { PACKAGES, FUNCTION_LABELS } from '../../engine/model.mjs';
import { fmtNum } from '../../engine/money.mjs';
import { ymOf, ymLabel } from '../../engine/months.mjs';
import { teamColor } from '../charts.mjs';
import { names, depStatus, formulaModal, goToRef, sourceNote, placeBenefits } from './common.mjs';

export function render(ctx) {
  const { doc, res } = ctx;
  const team = ctx.sub.expansion?.team && doc.teams.some((t) => t.id === ctx.sub.expansion.team) ? ctx.sub.expansion.team : doc.teams[0].id;
  const t = doc.teams.find((x) => x.id === team);
  const n = names(ctx);
  const locked1 = doc.round1.status === 'locked';
  const final = doc.round2.status === 'finalised';
  const canRecord = ctx.can('deploy.record') && locked1 && !final;
  const issues = res.validation.round2.filter((i) => i.ref?.teamId === team || (i.ref?.kind === 'team' && i.ref.id === team));
  const r2 = res.round2.teams[team];
  const sub = doc.round2.submissions[team] || {};
  const subRec = check('Written allocation received', sub.received, { disabled: !canRecord });
  const subRef = text(sub.reference, { disabled: !canRecord, placeholder: 'e.g. Form R2-B, received 14:32' });
  const subNotes = text(sub.notes, { disabled: !canRecord });
  return [
    h('div', { class: 'pagehead' }, h('div', {}, h('div', { class: 'eyebrow' }, 'Stage 3 · Round 2'), h('h1', { class: 'page' }, 'Global Expansion')), h('div', { class: 'grow' }), final ? pill('Round 2 finalised', 'good') : null),
    !locked1 ? h('div', { class: 'note bad' }, 'Round 1 is not locked yet. Deployments can be recorded once a Super Administrator locks the auction results.') : null,
    final ? h('div', { class: 'note good' }, 'Round 2 is finalised: deployments are read-only. A Super Administrator can reopen Round 2 for an administrative correction.') : null,
    tabs(doc.teams.map((x, i) => ({ id: x.id, label: `${x.label} · ${(res.roster[x.id] || []).length} hired` })), team, (id) => ctx.go('expansion', { team: id, focus: null })),
    h('div', { class: 'grid g2' },
      card(h('div', { class: 'row' }, h('span', { class: 'dotkey', style: { background: teamColor(n.teamIndex(team)) } }), h('h2', {}, `${t.label} · ${t.profile.companyName}`)), [
        h('div', { class: 'small muted' }, `Home continent ${n.cont(t.homeContinentId)} · headquarters ${n.city(t.profile.hqCityId)}`),
        h('div', { class: 'kv', style: { marginTop: '8px' } },
          h('div', {}, h('div', { class: 'k' }, 'Revenue'), h('div', { class: 'v' }, mc(r2.statement.revenue.total))),
          h('div', {}, h('div', { class: 'k' }, 'Expansion costs'), h('div', { class: 'v' }, mc(r2.statement.totalCosts))),
          h('div', {}, h('div', { class: 'k' }, 'Net contribution'), h('div', { class: `v ${r2.statement.netContribution < 0 ? 'neg' : ''}` }, mc(r2.statement.netContribution))),
          h('div', {}, h('div', { class: 'k' }, 'Combined outcome'), h('div', { class: `v ${r2.statement.combined < 0 ? 'neg' : ''}` }, mc(r2.statement.combined))))]),
      card('Written submission', [subRec.el, field('Reference', subRef), field('Notes', subNotes),
        canRecord ? h('div', { class: 'row end', style: { marginTop: '6px' } }, h('button', { class: 'btn', onclick: () => ctx.act('submission.set', { teamId: team, received: subRec.input.checked, reference: subRef.value, notes: subNotes.value }) }, 'Save')) : null,
        sub.receivedAt ? h('div', { class: 'tiny muted' }, `Recorded ${when(sub.receivedAt)} by ${sub.by}`) : null])),
    card(`Checks for ${t.label}: ${issues.filter((i) => i.severity === 'blocking').length} blocking, ${issues.filter((i) => i.severity !== 'blocking').length} warnings`, issuesList(issues, { onGo: (ref) => goToRef(ctx, ref), empty: 'No issues for this team.', limit: 4 })),
    sourceNote(ctx),
    ...(res.roster[team] || []).map((id) => employeeCard(ctx, team, id, canRecord)),
    !(res.roster[team] || []).length ? h('div', { class: 'note' }, 'This team has not hired anyone yet.') : null,
  ];
}

function employeeCard(ctx, team, empId, canRecord) {
  const { doc, res } = ctx;
  const n = names(ctx);
  const e = n.emps[empId];
  const deps = Object.values(res.deployments).filter((d) => d.employeeId === empId && d.teamId === team).sort((a, b) => a.id.localeCompare(b.id));
  const focus = ctx.sub.expansion?.focus;
  return card(h('div', {}, h('div', { class: 'strong' }, `${e.id} ${e.name}`), h('div', { class: 'small muted' }, `${e.headline} · ${e.seniority} · from ${n.cont(e.origin)} · speaks ${e.languages.join(', ')} · expected ${m(e.employment.expectedSalary)}, minimum ${m(e.employment.minSalary)}`)), [
    deps.length ? h('div', { class: 'stack' }, deps.map((d) => depRow(ctx, d, canRecord, d.id === focus))) : h('div', { class: 'note' }, 'No deployment recorded. Without one the employee stays at headquarters on their contracted salary and earns no expansion revenue.'),
    canRecord ? h('div', { class: 'row end', style: { marginTop: '8px' } }, h('button', { class: 'btn primary', onclick: () => depForm(ctx, team, empId, null) }, deps.length ? 'Add another deployment' : 'Record deployment')) : null,
  ]);
}

function depRow(ctx, d, canRecord, focused) {
  const { doc } = ctx;
  const n = names(ctx);
  const raw = doc.deployments.find((x) => x.id === d.id);
  if (!d.valid) return h('div', { class: 'note bad' }, `${d.id}: ${[...(d.refErrors || []), ...(d.fieldErrors || []), d.wrongTeam ? 'this employee was not hired by this team in Round 1' : ''].filter(Boolean).join(' ')}`, canRecord ? h('div', { class: 'row', style: { marginTop: '6px' } }, h('button', { class: 'btn sm', onclick: () => depForm(ctx, d.teamId, d.employeeId, raw) }, 'Fix'), h('button', { class: 'btn sm', onclick: () => del(ctx, raw) }, 'Delete')) : null);
  const p = d.productivity; const r = d.result;
  return h('div', { class: `card${focused ? ' gold' : ''}`, style: { background: 'var(--surface-2)' } },
    h('div', { class: 'row' }, h('span', { class: 'strong' }, d.id), depStatus(d), h('span', {}, `${n.role(d.roleId)} in ${n.city(d.cityId)}, ${n.cont(d.continentId)}`), h('span', { class: 'muted small' }, `${n.type(d.typeId)} · from ${ymLabel(raw.startMonth)} for ${raw.contractMonths} months${d.share < 1 ? ` · ${Math.round(d.share * 100)}% time` : ''}`), d.foreignToTeam ? pill('International expansion', 'info') : pill('Home continent', 'neutral')),
    h('div', { class: 'kv', style: { marginTop: '8px' } },
      h('div', {}, h('div', { class: 'k' }, 'Salary (a year)'), h('div', { class: 'v' }, m(d.salaryBase)), h('div', { class: 'tiny muted' }, `market ${m(d.marketSalary)}`)),
      h('div', {}, h('div', { class: 'k' }, 'Role suitability'), h('div', { class: 'v' }, `${fmtNum(p.roleSuitability, 0)} / 100`), h('div', { class: 'tiny muted' }, `fit ${fmtNum(p.capFit, 0)} × ${p.relevanceMult === null ? '…' : fmtNum(p.relevanceMult, 2)}`)),
      h('div', {}, h('div', { class: 'k' }, 'Effective productivity'), h('div', { class: 'v' }, fmtNum(p.value, 3)), h('button', { class: 'btn ghost sm', onclick: () => formulaModal(d.traces.productivity) }, 'ⓘ formula')),
      h('div', {}, h('div', { class: 'k' }, 'Revenue attributed'), h('div', { class: 'v' }, m(r.revenue)), h('button', { class: 'btn ghost sm', onclick: () => formulaModal(d.traces.revenue) }, 'ⓘ formula')),
      h('div', {}, h('div', { class: 'k' }, 'Deployment costs'), h('div', { class: 'v' }, m(r.costs)), h('div', { class: 'tiny muted' }, `one-time ${mc(r.oneTimeCosts)} · recurring ${mc(r.recurringCosts)} · contingent ${mc(r.contingentCosts)}`)),
      h('div', {}, h('div', { class: 'k' }, 'Contribution'), h('div', { class: `v ${r.contribution < 0 ? 'neg' : ''}` }, m(r.contribution))),
      h('div', {}, h('div', { class: 'k' }, 'Opportunity score'), h('div', { class: 'v' }, fmtNum(d.opportunity.score, 1))),
      h('div', {}, h('div', { class: 'k' }, 'Compliance'), h('div', { class: 'v small' }, Object.entries(d.compliance.counts).filter(([, c]) => c).map(([s, c]) => `${c} ${s}`).join(', ') || 'none apply'))),
    d.compliance.blockers.length ? h('div', { class: 'note bad', style: { marginTop: '6px' } }, `Blocked by ${d.compliance.blockers.join(', ')}: no revenue until resolved.`) : null,
    d.riskNotes?.length ? h('div', { class: 'note', style: { marginTop: '6px' } }, d.riskNotes.join(' ')) : null,
    h('div', { class: 'row', style: { marginTop: '8px' } },
      canRecord && d.operational && d.approval !== 'approved' ? h('button', { class: 'btn primary sm', onclick: () => ctx.act('deploy.approve', { id: d.id }) }, 'Approve as operational') : null,
      canRecord && !d.operational && d.approval !== 'blockedRecorded' ? h('button', { class: 'btn sm', onclick: async () => { const x = await confirmDialog(`Record ${d.id} as blocked?`, { message: 'The deployment stays in the results as non-operational (no revenue; the configured blocker consequences apply).', reason: 'required', reasonLabel: 'Note', confirmLabel: 'Record as blocked' }); if (x) ctx.act('deploy.recordBlocked', { id: d.id, reason: x.reason }); } }, 'Record as blocked') : null,
      canRecord && d.approval !== 'pending' ? h('button', { class: 'btn sm', onclick: () => ctx.act('deploy.unapprove', { id: d.id }) }, 'Withdraw approval') : null,
      h('button', { class: 'btn sm', onclick: () => ctx.go('compliance', { tab: 'evaluations', team: d.teamId, focus: d.id }) }, 'Compliance'),
      canRecord ? h('button', { class: 'btn sm', onclick: () => depForm(ctx, d.teamId, d.employeeId, raw) }, 'Edit') : null,
      canRecord ? h('button', { class: 'btn sm', onclick: () => del(ctx, raw) }, 'Delete') : null));
}

async function del(ctx, raw) {
  const x = await confirmDialog(`Delete deployment ${raw.id}?`, { message: 'Its compliance records go with it. A Super Administrator can revert this from the audit log.', confirmLabel: 'Delete', danger: true });
  if (x) ctx.act('deploy.delete', { id: raw.id, expectRev: raw.rev || 0 });
}

function depForm(ctx, team, empId, raw) {
  const { doc } = ctx;
  const n = names(ctx);
  const e = n.emps[empId];
  const cfg = doc.config;
  const per = cfg.period;
  const cur = raw?.cityId ? n.cities[raw.cityId]?.continentId : null;
  const contSel = select(doc.continents.map((c) => [c.id, `${c.name}${c.id === doc.teams.find((t) => t.id === team).homeContinentId ? ' (home)' : ''}`]), cur || '', { empty: 'Choose a continent…' });
  const citySel = select([], '', { empty: 'Choose a city…' });
  const hq = doc.teams.find((t) => t.id === team).profile.hqCityId;
  const oneCity = !cfg.deployment.allowSameCity;
  // cities this team already uses for another employee (one employee per city unless Event Control allows more)
  const takenBy = (cityId) => [...new Set(doc.deployments.filter((d) => d.teamId === team && d.cityId === cityId && d.employeeId !== empId && d.id !== raw?.id).map((d) => d.employeeId))];
  const fillCities = () => {
    const v = citySel.value;
    citySel.replaceChildren(h('option', { value: '' }, 'Choose a city…'), ...doc.cities.filter((c) => c.continentId === contSel.value).map((c) => {
      const tk = takenBy(c.id);
      return h('option', { value: c.id, disabled: oneCity && tk.length > 0 }, `${c.name}${c.id === hq ? ' (headquarters)' : ''}${tk.length ? ` — ${oneCity ? 'already used by' : 'also'} ${tk.join(', ')}` : ''}`);
    }));
    citySel.value = v && doc.cities.find((c) => c.id === v)?.continentId === contSel.value && !(oneCity && takenBy(v).length) ? v : '';
  };
  const place = h('div');
  const showPlace = () => place.replaceChildren(placeBenefits(ctx, citySel.value, roleSel.value || null));
  contSel.addEventListener('change', () => { fillCities(); showPlace(); }); fillCities(); if (raw) citySel.value = raw.cityId;
  const roleSel = select(cfg.roles.map((r) => [r.id, `${r.name} (${FUNCTION_LABELS[r.function]}) — fit ${ctx.res.employees[empId].roles.find((x) => x.roleId === r.id)?.fit ?? '…'}`]), raw?.roleId || '', { empty: 'Choose a job role…' });
  citySel.addEventListener('change', showPlace); roleSel.addEventListener('change', showPlace); showPlace();
  const typeSel = select(cfg.assignmentTypes.filter((t) => cfg.deployment.allowedAssignmentTypes.includes(t.id)).map((t) => [t.id, `${t.name}${t.maxMonths ? ` (≤ ${t.maxMonths} months)` : ''}${t.minSeniority ? ` (${t.minSeniority}+)` : ''}`]), raw?.assignmentTypeId || '', { empty: 'Choose an assignment type…' });
  const salary = moneyInput(raw?.salary?.amount ?? e.employment.expectedSalary);
  const salCur = select([['base', `Base currency (${cfg.currency.code})`], ['local', 'Destination’s local currency']], raw?.salary?.currency || 'base');
  const salHint = h('div', { class: 'tiny muted' });
  const updHint = () => { const c = doc.continents.find((k) => k.id === contSel.value); salHint.textContent = salCur.value === 'local' && c?.currency ? `Converted at 1 ${c.currency.code} = ${c.currency.rateToBase} ${cfg.currency.code}: ${m(Math.round((salary.getValue() || 0) * c.currency.rateToBase))}` : `Expected ${m(e.employment.expectedSalary)}, minimum acceptable ${m(e.employment.minSalary)}`; };
  for (const el of [salCur, contSel, salary.input]) el.addEventListener('input', updHint); salCur.addEventListener('change', updHint); updHint();
  const months = num(raw?.contractMonths ?? per.months, { min: 1, max: 60, step: 1 });
  const start = h('input', { type: 'month', value: raw?.startMonth || ymOf(per, 1) });
  const pkg = select(Object.entries(PACKAGES).map(([k, v]) => [k, v.label]), raw?.relocationPackage || (e.employment.relocationNeeds === 'family' ? 'family' : 'standard'));
  const training = check(`Training provided${e.employment.trainingRequired ? ' (this employee needs training)' : ''}`, raw?.trainingProvided ?? e.employment.trainingRequired);
  const partner = check('A local partner is engaged', raw?.localPartner);
  const office = check('A local office or station is set up', raw?.officeArranged ?? true);
  const share = num(raw?.timeShare ?? 100, { min: 1, max: 100, step: 1, disabled: !cfg.deployment.splitAssignments });
  const resp = text(raw?.responsibility); const unit = text(raw?.businessUnit); const contrib = text(raw?.contribution); const permits = text(raw?.permitsObtained); const notes = area(raw?.notes, { rows: 2 });
  modal(raw ? `Edit ${raw.id}: ${e.id} ${e.name}` : `Record a deployment: ${e.id} ${e.name}`, (close) => [
    h('div', { class: 'note' }, `Enter the allocation exactly as ${doc.teams.find((t) => t.id === team).label} submitted it. The server checks every value and every event rule.`),
    h('div', { class: 'fields' }, field('Destination continent', contSel), field('Destination city', citySel, oneCity ? 'One employee per city for each team: cities already used are greyed out' : null), field('Proposed job role', roleSel), field('Assignment type', typeSel, 'Only types permitted by the event rules')),
    place,
    h('div', { class: 'fields' }, field('Annual salary at destination', salary), field('Salary entered in', salCur, null), field('Contract duration (months)', months), field('Planned deployment month', start, `Evaluation period ${ymLabel(ymOf(per, 1))} – ${ymLabel(ymOf(per, per.months))}`), field('Relocation package', pkg, `Employee needs: ${e.employment.relocationNeeds}`), field('Time share (%)', share, cfg.deployment.splitAssignments ? 'Split assignments are enabled' : 'Split assignments are not enabled')),
    salHint,
    h('div', { class: 'row' }, training.el, partner.el, office.el),
    h('div', { class: 'fields wide' }, field('Expected operational responsibility', resp), field('Proposed business unit', unit), field('Expected contribution to local operations', contrib), field('Permits or approvals already obtained', permits)),
    field('Operator notes', notes),
    h('div', { class: 'row end' }, h('button', { class: 'btn primary', onclick: async () => {
      const amount = salary.getValue();
      if (!citySel.value || !roleSel.value || !typeSel.value) return toast('Choose the city, role and assignment type.', 'bad');
      if (!(amount >= 0)) return toast('Enter the annual salary.', 'bad');
      const fields = { cityId: citySel.value, roleId: roleSel.value, assignmentTypeId: typeSel.value, salary: { amount, currency: salCur.value }, contractMonths: numVal(months), startMonth: start.value, relocationPackage: pkg.value, trainingProvided: training.input.checked, localPartner: partner.input.checked, officeArranged: office.input.checked, timeShare: numVal(share), responsibility: resp.value, businessUnit: unit.value, contribution: contrib.value, permitsObtained: permits.value, notes: notes.value };
      const ok = raw ? await ctx.act('deploy.update', { id: raw.id, expectRev: raw.rev || 0, patch: fields }) : await ctx.act('deploy.create', { teamId: team, employeeId: empId, ...fields });
      if (ok) close();
    } }, raw ? 'Save changes' : 'Record deployment')),
  ], { wide: true });
}
