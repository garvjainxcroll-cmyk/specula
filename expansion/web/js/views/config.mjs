// 2. Event Configuration: rules of play, formula parameters, scoring, checks, visibility.
// Every field shows its documented range; the server checks every value again.
import { h, card, tabs, field, num, text, select, check, moneyInput, issuesList, pill, table, confirmDialog, modal, numVal } from '../ui.mjs';
import { CHECKS, CAP_LABELS, CAP_KEYS, INDEX_LABELS, FUNCTIONS, FUNCTION_LABELS, MECHANISMS, EFFECT_KINDS, SCOPES, SAVING_CATEGORIES, SENIORITY, VISIBILITY_GROUPS } from '../../engine/model.mjs';
import { DRIVER_LABELS, OPPORTUNITY_FACTORS } from '../../engine/regions.mjs';
import { TIE_BREAKS, METRICS, COMPONENTS } from '../../engine/ranking.mjs';
import { goToRef } from './common.mjs';

const FORMULA = ['roles', 'assignmentTypes', 'indices', 'productivity', 'revenue', 'costs', 'compliance', 'opportunity', 'ranking', 'thresholds'];
const get = (o, path) => path.split('.').reduce((a, k) => (a === undefined || a === null ? a : a[k]), o);
const set = (o, path, v) => { const ks = path.split('.'); let a = o; for (const k of ks.slice(0, -1)) a = a[k]; a[ks.at(-1)] = v; };

/** A form for one configuration section from a list of field specs. */
function sectionForm(ctx, section, specs, { title, intro = null } = {}) {
  const value = structuredClone(ctx.doc.config[section]);
  const formula = FORMULA.includes(section);
  const canEdit = (formula ? ctx.can('formulas.edit') && !ctx.doc.config.formulasLocked : ctx.can('config.edit')) && ctx.doc.round2.status !== 'finalised';
  const readers = [];
  const inputs = specs.map((sp) => {
    const v = section === 'identicalResources' ? value : get(value, sp.key);
    let el; let read;
    if (sp.type === 'bool') { const c = check(sp.label, v, { disabled: !canEdit }); readers.push(() => [sp.key, c.input.checked]); return h('div', {}, c.el, sp.help ? h('div', { class: 'help small muted' }, sp.help) : null); }
    if (sp.type === 'money') { el = moneyInput(v, { disabled: !canEdit }); read = () => el.getValue(); }
    else if (sp.type === 'select') { el = select(sp.options, v, { disabled: !canEdit }); read = () => (sp.numeric ? Number(el.value) : el.value); }
    else if (sp.type === 'text') { el = text(v, { disabled: !canEdit }); read = () => el.value; }
    else if (sp.type === 'list') { el = text((v || []).join(', '), { disabled: !canEdit }); read = () => el.value.split(',').map((x) => Number(x.trim())).filter((x) => !Number.isNaN(x)); }
    else if (sp.type === 'nullnum') { el = num(v, { min: sp.min, max: sp.max, step: sp.step || 1, disabled: !canEdit }); el.placeholder = 'No limit'; read = () => (el.value === '' ? null : Number(el.value)); }
    else { el = num(v, { min: sp.min, max: sp.max, step: sp.step || 'any', disabled: !canEdit }); read = () => numVal(el); }
    readers.push(() => [sp.key, read()]);
    return field(sp.label, el, sp.help || (sp.min !== undefined && sp.max !== undefined ? `Range ${sp.min}–${sp.max}` : null));
  });
  const save = async () => {
    let out = value;
    for (const r of readers) { const [k, v] = r(); if (typeof v === 'number' && Number.isNaN(v)) return alertBad(`“${specs.find((s) => s.key === k)?.label}” needs a number.`); if (section === 'identicalResources') out = v; else set(out, k, v); }
    await ctx.act('config.section', { section, value: out, expectRev: ctx.doc.configRev || 0 });
  };
  return card(title, [intro ? h('p', { class: 'small muted' }, intro) : null, h('div', { class: 'fields' }, inputs),
    canEdit ? h('div', { class: 'row end', style: { marginTop: '12px' } }, h('button', { class: 'btn primary', onclick: save }, 'Save')) : h('div', { class: 'small muted', style: { marginTop: '8px' } }, formula && ctx.doc.config.formulasLocked ? 'Locked: the formulas and scoring framework are locked.' : 'Read-only for your role.')],
  { tools: formula ? pill('Formula setting', 'gold') : null });
}
function alertBad(msg) { modal('Check the form', h('p', {}, msg)); }

const months = Array.from({ length: 12 }, (_, i) => [String(i + 1), new Date(2000, i, 1).toLocaleString('en-IN', { month: 'long' })]);

export function render(ctx) {
  const tab = ctx.sub.config?.tab || 'event';
  const doc = ctx.doc;
  const setTab = (t) => ctx.go('config', { tab: t });
  const body = {
    event: () => [
      sectionForm(ctx, 'event', [{ key: 'name', label: 'Event name', type: 'text' }, { key: 'round', label: 'Round title', type: 'text' }, { key: 'subtitle', label: 'Subtitle', type: 'text' }], { title: 'Event identity' }),
      sectionForm(ctx, 'currency', [{ key: 'name', label: 'Currency name', type: 'text' }, { key: 'code', label: 'Code', type: 'text' }, { key: 'symbol', label: 'Symbol', type: 'text' }, { key: 'grouping', label: 'Digit grouping', type: 'select', options: [['indian', 'Indian (12,34,567)'], ['international', 'International (1,234,567)']] }], { title: 'Base currency', intro: 'Every amount is entered and reported in this currency. Changing it relabels amounts; it does not convert them, so it is allowed only before the auction starts. Continent currencies are used only to convert a salary entered in local currency, at the rate set for each continent.' }),
      sectionForm(ctx, 'period', [{ key: 'startYear', label: 'First year', min: 2000, max: 2100, step: 1 }, { key: 'startMonth', label: 'First month', type: 'select', options: months, numeric: true }, { key: 'months', label: 'Length (months)', min: 1, max: 36, step: 1 }], { title: 'Financial evaluation period', intro: 'Salaries, revenue and recurring costs are counted month by month across this period, so partial-year assignments are prorated exactly.' }),
      sectionForm(ctx, 'identicalResources', [{ key: 'identicalResources', label: 'All four teams use identical starting resources (the standard profile)', type: 'bool', help: 'Switch off to give each team its own cash, budgets, baseline and revenue model (Team and Continent Setup).' }], { title: 'Comparable businesses' }),
    ],
    rules: () => [
      sectionForm(ctx, 'auction', [
        { key: 'poolSize', label: 'CVs in the auction', min: 1, max: 60, step: 1 }, { key: 'teamSize', label: 'Employees each team must hire', min: 1, max: 10, step: 1, help: 'Round 1 cannot be locked until every team has exactly this many, unless the next setting is on.' },
        { key: 'allowShortTeams', label: 'Allow a team with fewer employees to go into Round 2', type: 'bool', help: 'Off = every team must have exactly the number above. Turn on only by Event Control decision (for example after a CV is withdrawn and left unallocated). A team can never have more.' },
        { key: 'budgetEnabled', label: 'Use an acquisition budget', type: 'bool' },
        { key: 'budgetBasis', label: 'Budget counts', type: 'select', options: [['bids', 'Winning bids only'], ['initialHiringCost', 'Bids + recruitment + onboarding']] },
        { key: 'budgetEnforcement', label: 'When a sale exceeds the budget', type: 'select', options: [['warn', 'Warn — the operator must acknowledge'], ['block', 'Block — the sale is refused']] },
      ], { title: 'Round 1 auction rules' }),
      sectionForm(ctx, 'round1', [{ key: 'salaryAdjustmentPct', label: 'Salary rule: adjustment to expected salaries (%)', min: -50, max: 100, help: '0 = each employee is paid their expected salary. Applied to the contracted salary only.' }], { title: 'Round 1 salary rule' }),
      deploymentRules(ctx),
    ],
    roles: () => [rolesCard(ctx), typesCard(ctx)],
    assumptions: () => [
      sectionForm(ctx, 'costs', [
        { key: 'baseOpexPerEmployee', label: 'Local operating cost per employee (a year)', type: 'money' }, { key: 'equipmentPerDeployment', label: 'Equipment and setup per deployment', type: 'money' },
        { key: 'expatSupportAnnual', label: 'Support for staff abroad (a year)', type: 'money' }, { key: 'complianceOverheadAnnual', label: 'Legal and compliance overhead per employee (a year, × legal complexity ÷ 100)', type: 'money' },
        { key: 'domesticRelocationFactor', label: 'Relocation factor inside the home continent', min: 0, max: 2, help: 'Share of the full relocation cost for a move within the team’s home continent' },
        { key: 'packageFactors.none', label: 'Package factor: none', min: 0, max: 5 }, { key: 'packageFactors.standard', label: 'Package factor: standard', min: 0, max: 5 }, { key: 'packageFactors.enhanced', label: 'Package factor: enhanced', min: 0, max: 5 }, { key: 'packageFactors.family', label: 'Package factor: family', min: 0, max: 5 },
        { key: 'pendingDocumentationCost', label: 'Additional documentation cost per pending requirement', type: 'money' }, { key: 'preOperationalCostPct', label: 'Pre-operational cost of a blocked deployment (% of its housing + operating cost)', min: 0, max: 100 },
        { key: 'interruptionCost', label: 'Cost of an assignment interruption', type: 'money' }, { key: 'duplicateRoleCostPct', label: 'Duplicated-role cost (% of salary)', min: 0, max: 100 },
        { key: 'payBeforeDeployment', label: 'Pay the contracted salary before an employee’s first deployment', type: 'bool' }, { key: 'taxEnabled', label: 'Charge local taxes on positive city profit', type: 'bool' },
      ], { title: 'Cost assumptions' }),
      sectionForm(ctx, 'productivity', [
        { key: 'fitFloor', label: 'Capability fit giving zero productivity', min: 0, max: 99 }, { key: 'fitFull', label: 'Capability fit giving full (1.00) base productivity', min: 1, max: 100 },
        { key: 'relevanceMin', label: 'Role suitability multiplier at relevance 0', min: 0.1, max: 2 }, { key: 'relevanceMax', label: '… at relevance 100', min: 0.1, max: 3 },
        { key: 'environmentMin', label: 'Operating environment multiplier at 0', min: 0.1, max: 2 }, { key: 'environmentMax', label: '… at 100', min: 0.1, max: 3 },
        { key: 'envInfraWeight', label: 'Environment weight: infrastructure', min: 0, max: 10 }, { key: 'envTalentWeight', label: 'Environment weight: talent', min: 0, max: 10 },
        { key: 'functionBonusCap', label: 'Regional role bonus cap (±%)', min: 0, max: 50 },
        { key: 'expMin', label: 'Experience multiplier at 0 years', min: 0.1, max: 2 }, { key: 'expMax', label: '… at the cap', min: 0.1, max: 3 }, { key: 'expYearsCap', label: 'Experience cap (years)', min: 1, max: 40 },
        { key: 'intlBonusMax', label: 'International-experience bonus (abroad)', min: 0, max: 0.5 }, { key: 'intlAssignCap', label: 'Assignments for the full bonus', min: 1, max: 10 },
        { key: 'cultureSlope', label: 'Cultural adaptation slope (per point)', min: 0, max: 0.05 }, { key: 'cultureMin', label: 'Cultural multiplier minimum', min: 0.1, max: 1 }, { key: 'cultureMax', label: 'Cultural multiplier maximum', min: 1, max: 2 },
        { key: 'languageRelief', label: 'Difficulty removed by speaking a local language (points)', min: 0, max: 100 },
        { key: 'trainingMissingMult', label: 'Multiplier when required training is missing', min: 0.1, max: 1 }, { key: 'noSupportMult', label: 'Multiplier with no office, partner or presence', min: 0.1, max: 1 },
        { key: 'relocationShortfallMult', label: 'Multiplier when the relocation package is below needs', min: 0.1, max: 1 }, { key: 'maxProductivity', label: 'Maximum effective productivity', min: 0.1, max: 3 },
      ], { title: 'Employee productivity', intro: 'Effective productivity = base productivity × role suitability × operating environment × regional role bonus × experience × cultural adaptation × training × local support × relocation fit, capped at the maximum. Every multiplier stays inside its range.' }),
      sectionForm(ctx, 'revenue', [
        { key: 'demandWeight', label: 'Market index weight: demand', min: 0, max: 10 }, { key: 'purchasingWeight', label: 'Market index weight: purchasing power', min: 0, max: 10 }, { key: 'competitionWeight', label: 'Market index weight: low competition', min: 0, max: 10 },
        { key: 'mdmMin', label: 'Market multiplier at index 0', min: 0.05, max: 2 }, { key: 'mdmMax', label: 'Market multiplier at index 100', min: 0.05, max: 3 },
        { key: 'riskDiscountMax', label: 'Revenue discount at risk 100', min: 0, max: 0.95 }, { key: 'homeSaturationPct', label: 'Home-market saturation (% less direct revenue at home)', min: 0, max: 100 },
        { key: 'sharedCredit', label: 'Shared credit, same city (1st, 2nd, …)', type: 'list', help: 'Comma-separated, each 0–1' }, { key: 'continentCredit', label: 'Continent credit (1st, 2nd, …)', type: 'list', help: 'Comma-separated, each 0–1' },
        { key: 'upliftCap', label: 'Cap on total uplift of one revenue line', min: 0, max: 2 }, { key: 'savingsCap', label: 'Cap on total savings of one cost line', min: 0, max: 0.9 },
      ], { title: 'Revenue model' }),
    ],
    scoring: () => [
      sectionForm(ctx, 'ranking', [
        { key: 'mode', label: 'Ranking mode', type: 'select', options: [['weighted', 'Weighted performance ranking'], ['financial', 'Financial ranking']] },
        { key: 'financialMetric', label: 'Financial metric', type: 'select', options: Object.entries(METRICS).map(([k, v]) => [k, v.label]) },
        ...Object.keys(COMPONENTS).map((k) => ({ key: `weights.${k}`, label: `Weight: ${COMPONENTS[k]} (%)`, min: 0, max: 100 })),
        { key: 'budgetMaxOverspendPct', label: 'Overspend at which budget discipline reaches 0 (%)', min: 1, max: 500 },
      ], { title: 'Ranking model', intro: 'Weights must total exactly 100%. Raw money is never mixed with scores: the financial metric is scaled between the lowest (0) and highest (100) team first.' }),
      tieBreakCard(ctx),
      sectionForm(ctx, 'compliance', [
        ...['compliant', 'waived', 'pending', 'review', 'unassessed', 'noncompliant'].map((k) => ({ key: `statusScores.${k}`, label: `Status score: ${k}`, min: 0, max: 100 })),
        { key: 'mandatoryWeight', label: 'Weight of a mandatory requirement', min: 1, max: 10 }, { key: 'complianceShare', label: 'Compliance share of the component', min: 0, max: 100 }, { key: 'readinessShare', label: 'Readiness share of the component', min: 0, max: 100 },
        { key: 'blocker.fixedPenalty', label: 'Fixed penalty per blocked deployment', type: 'money', help: 'Zero unless Event Control sets one' },
        { key: 'blocker.ranking', label: 'Extra ranking consequence of a blocker', type: 'select', options: [['flag', 'Flag it (the deployment already earns nothing)'], ['complianceZero', 'Set the compliance component to zero'], ['unranked', 'Remove the team from the ranking']] },
      ], { title: 'Compliance scoring and blocker consequences', intro: '“Not applicable” requirements are left out. A mandatory blocker always stops its deployment from earning revenue; the setting here adds only the consequence Event Control chooses.' }),
      sectionForm(ctx, 'opportunity', [
        ...Object.entries(OPPORTUNITY_FACTORS).map(([k, v]) => ({ key: `weights.${k}`, label: `Weight: ${v.label}${v.benefit ? '' : ' (burden)'}`, min: 0, max: 100 })),
        { key: 'ranges.growthMin', label: 'Growth scaled to 0 at (% a year)', min: -50, max: 50 }, { key: 'ranges.growthMax', label: 'Growth scaled to 100 at', min: -50, max: 100 },
        { key: 'ranges.costMultMin', label: 'Cost burden 0 at multiplier', min: 0.1, max: 5 }, { key: 'ranges.costMultMax', label: 'Cost burden 100 at multiplier', min: 0.1, max: 5 },
        { key: 'ranges.relocMultMin', label: 'Relocation burden 0 at multiplier', min: 0.1, max: 5 }, { key: 'ranges.relocMultMax', label: 'Relocation burden 100 at multiplier', min: 0.1, max: 5 },
      ], { title: 'Regional opportunity score', intro: 'Score (0–100) = Σ weight × goodness ÷ Σ weight, where goodness is the factor for a benefit and (100 − factor) for a burden. It is an analytical measure and never replaces the financial calculation.' }),
      indicesCard(ctx),
      sectionForm(ctx, 'thresholds', [{ key: 'profitMarginWarnPct', label: 'Warn below this profit margin (%)', min: -100, max: 100 }, { key: 'riskWarn', label: 'Warn above this revenue-weighted regional risk', min: 0, max: 100 }], { title: 'Profitability and risk thresholds' }),
    ],
    checks: () => [severityCard(ctx)],
    visibility: () => [visibilityCard(ctx), lockCard(ctx)],
  };
  return [
    h('div', { class: 'pagehead' }, h('div', {}, h('div', { class: 'eyebrow' }, 'Stage 1 · Configure'), h('h1', { class: 'page' }, 'Event Configuration')), h('div', { class: 'grow' }),
      doc.config.formulasLocked ? pill('Formulas locked', 'gold') : pill('Formulas unlocked', 'warn'), pill(`Configuration version ${doc.configRev || 0}`, 'neutral')),
    card('Configuration check', issuesList(ctx.res.validation.config, { onGo: (ref) => goToRef(ctx, ref), empty: 'The configuration is complete and valid.' })),
    tabs([{ id: 'event', label: 'Event and period' }, { id: 'rules', label: 'Rules of play' }, { id: 'roles', label: 'Job roles and assignments' }, { id: 'assumptions', label: 'Financial assumptions' }, { id: 'scoring', label: 'Scoring and ranking' }, { id: 'checks', label: 'Validation checks' }, { id: 'visibility', label: 'Visibility and lock' }], tab, setTab),
    ...(body[tab] || body.event)(),
  ];
}

function deploymentRules(ctx) {
  const v = ctx.doc.config.deployment;
  const types = ctx.doc.config.assignmentTypes;
  const card0 = sectionForm(ctx, 'deployment', [
    { key: 'maxPerCity', label: 'Maximum employees per city', type: 'nullnum', min: 1 }, { key: 'maxPerContinent', label: 'Maximum employees per continent', type: 'nullnum', min: 1 },
    { key: 'minHomeRetained', label: 'Employees that must stay in the home continent (every month)', min: 0, max: 10, step: 1 },
    { key: 'maxForeignContinents', label: 'Maximum foreign continents a team may enter', type: 'nullnum', min: 0, help: 'Empty = a team may enter every foreign continent' },
    { key: 'seniorAtHQ', label: 'A senior executive must stay at headquarters', type: 'bool' }, { key: 'allowSameCity', label: 'Several employees of a team may work in the same city', type: 'bool', help: 'Off (the event rule) = each team may place at most one employee in any city, headquarters included, so its five employees go to five different cities. Other teams may use the same city.' },
    { key: 'allowNoPresence', label: 'Employees may go to a city with no prior presence', type: 'bool' }, { key: 'requireOfficeOrPartner', label: 'Every deployment needs a local office or partner', type: 'bool' },
    { key: 'splitAssignments', label: 'Allow split (concurrent) assignments with time shares', type: 'bool' },
  ], { title: 'Round 2 deployment rules', intro: `Only the restrictions set here apply. Permitted assignment types: ${v.allowedAssignmentTypes.map((id) => types.find((t) => t.id === id)?.name || id).join(', ')} (change them under Job roles and assignments).` });
  return card0;
}

function rolesCard(ctx) {
  const roles = ctx.doc.config.roles;
  const canEdit = ctx.can('formulas.edit') && !ctx.doc.config.formulasLocked && ctx.doc.round2.status !== 'finalised';
  const edit = (idx) => roleEditor(ctx, idx);
  return card('Job roles', [h('p', { class: 'small muted' }, 'Each role says which capabilities make someone good at it, which destination conditions make it matter, how it earns revenue and what it does for colleagues. Capability fit is an input; the financial model decides what it is worth.'),
    table([
      { label: 'Role', get: (r) => r.name }, { label: 'Function', get: (r) => FUNCTION_LABELS[r.function] }, { label: 'Revenue', get: (r) => `${MECHANISMS[r.mechanism]}${r.revenueFactor ? ` × ${r.revenueFactor}` : ''}` },
      { label: 'Capability weights', get: (r) => Object.entries(r.weights).map(([k, v]) => `${CAP_LABELS[k]} ${v}`).join(', '), wrap: true },
      { label: 'Effects on colleagues', get: (r) => r.effects.map((e) => `${EFFECT_KINDS[e.kind]}${e.category ? ` (${SAVING_CATEGORIES[e.category]})` : ''}, ${SCOPES[e.scope].toLowerCase()}${e.target === 'international' ? ', international staff' : ''}, up to ${Math.round(e.max * 100)}%`).join('; ') || '—', wrap: true },
      { label: '', sort: false, render: (r) => h('button', { class: 'btn sm', onclick: () => edit(roles.indexOf(r)) }, canEdit ? 'Edit' : 'View') },
    ], roles, { id: 'roles', search: false }),
    canEdit ? h('div', { class: 'row end', style: { marginTop: '8px' } }, h('button', { class: 'btn', onclick: () => edit(-1) }, 'Add a role')) : null]);
}

function roleEditor(ctx, idx) {
  const roles = structuredClone(ctx.doc.config.roles);
  const r = idx >= 0 ? roles[idx] : { id: '', name: '', function: 'sales', mechanism: 'sales', revenueFactor: 0.5, logisticsFactor: 1, annualBudget: 0, weights: { sales: 1 }, drivers: { marketDemand: 1 }, effects: [] };
  const canEdit = ctx.can('formulas.edit') && !ctx.doc.config.formulasLocked;
  const used = ctx.doc.deployments.some((d) => d.roleId === r.id);
  const id = text(r.id, { disabled: !canEdit || used }); const name = text(r.name, { disabled: !canEdit });
  const fn = select(FUNCTIONS.map((f) => [f, FUNCTION_LABELS[f]]), r.function, { disabled: !canEdit });
  const mech = select(Object.entries(MECHANISMS), r.mechanism, { disabled: !canEdit });
  const rf = num(r.revenueFactor, { min: 0, max: 3, disabled: !canEdit }); const lf = num(r.logisticsFactor, { min: 0, max: 3, disabled: !canEdit });
  const budget = moneyInput(r.annualBudget, { disabled: !canEdit });
  const wIn = Object.fromEntries(CAP_KEYS.map((k) => [k, num(r.weights[k] ?? '', { min: 0, disabled: !canEdit })]));
  const dIn = Object.fromEntries(Object.keys(DRIVER_LABELS).map((k) => [k, num(r.drivers[k] ?? '', { min: 0, disabled: !canEdit })]));
  const effRows = [0, 1, 2, 3].map((i) => {
    const e = r.effects[i] || { kind: '', scope: 'city', max: 0.1, target: 'all', category: 'opex' };
    return { kind: select([['', '—'], ...Object.entries(EFFECT_KINDS)], e.kind || '', { disabled: !canEdit }), scope: select(Object.entries(SCOPES), e.scope, { disabled: !canEdit }), target: select([['all', 'All colleagues'], ['international', 'International staff only']], e.target || 'all', { disabled: !canEdit }), category: select(Object.entries(SAVING_CATEGORIES), e.category || 'opex', { disabled: !canEdit }), max: num(e.max, { min: 0, max: 1, disabled: !canEdit }) };
  });
  modal(idx >= 0 ? `Role: ${r.name}` : 'New role', (close) => [
    h('div', { class: 'fields' }, field('Identifier', id, used ? 'In use by a deployment' : 'Letters, numbers and dashes'), field('Name', name), field('Function', fn), field('Revenue mechanism', mech), field('Revenue factor (0–3)', rf, 'Share of the city’s base opportunity at productivity 1.00'), field('Logistics factor (0–3)', lf), field('Campaign budget (a year)', budget)),
    h('h3', {}, 'Capability weights (relative; blank = 0)'), h('div', { class: 'fields' }, CAP_KEYS.map((k) => field(CAP_LABELS[k], wIn[k]))),
    h('h3', {}, 'Destination drivers (what makes the role matter there)'), h('div', { class: 'fields' }, Object.entries(DRIVER_LABELS).map(([k, l]) => field(l, dIn[k]))),
    h('h3', {}, 'Effects on colleagues (strength 0–1, scaled by the specialist’s productivity)'),
    h('div', { class: 'stack' }, effRows.map((e) => h('div', { class: 'row' }, e.kind, e.scope, e.target, e.category, e.max))),
    canEdit ? h('div', { class: 'row end' }, h('button', { class: 'btn primary', onclick: async () => {
      const weights = Object.fromEntries(Object.entries(wIn).filter(([, i]) => i.value !== '' && Number(i.value) > 0).map(([k, i]) => [k, Number(i.value)]));
      const drivers = Object.fromEntries(Object.entries(dIn).filter(([, i]) => i.value !== '' && Number(i.value) > 0).map(([k, i]) => [k, Number(i.value)]));
      const effects = effRows.filter((e) => e.kind.value).map((e) => ({ kind: e.kind.value, scope: e.scope.value, max: Number(e.max.value), ...(e.kind.value === 'uplift' ? { target: e.target.value } : {}), ...(e.kind.value === 'saving' ? { category: e.category.value } : {}) }));
      const next = { id: id.value.trim(), name: name.value.trim(), function: fn.value, mechanism: mech.value, revenueFactor: Number(rf.value), logisticsFactor: Number(lf.value), annualBudget: budget.getValue(), weights, drivers, effects };
      if (idx >= 0) roles[idx] = next; else roles.push(next);
      if (await ctx.act('config.section', { section: 'roles', value: roles, expectRev: ctx.doc.configRev || 0 })) close();
    } }, 'Save role')) : null,
  ], { wide: true });
}

function typesCard(ctx) {
  const cfg = ctx.doc.config;
  const canEdit = ctx.can('formulas.edit') && !cfg.formulasLocked && ctx.doc.round2.status !== 'finalised';
  const canRules = ctx.can('config.edit') && ctx.doc.round2.status !== 'finalised';
  const rows = cfg.assignmentTypes.map((t) => ({ t, name: text(t.name, { disabled: !canEdit }), rf: num(t.relocationFactor, { min: 0, max: 5, disabled: !canEdit }), hf: num(t.housingFactor, { min: 0, max: 5, disabled: !canEdit }), mx: num(t.maxMonths ?? '', { min: 1, disabled: !canEdit }), sen: select([['', 'Any'], ...SENIORITY.map((x) => [x, x])], t.minSeniority || '', { disabled: !canEdit }), allowed: check('', cfg.deployment.allowedAssignmentTypes.includes(t.id), { disabled: !canRules }) }));
  return card('Assignment types', [
    h('div', { class: 'tablewrap' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Type', 'Relocation factor', 'Housing factor', 'Maximum months', 'Minimum seniority', 'Permitted'].map((x) => h('th', {}, x)))),
      h('tbody', {}, rows.map((r) => h('tr', {}, h('td', {}, r.name), h('td', {}, r.rf), h('td', {}, r.hf), h('td', {}, r.mx), h('td', {}, r.sen), h('td', {}, r.allowed.el)))))),
    h('div', { class: 'row end', style: { marginTop: '8px' } },
      canEdit ? h('button', { class: 'btn primary', onclick: async () => {
        const value = rows.map((r) => ({ id: r.t.id, name: r.name.value, relocationFactor: Number(r.rf.value), housingFactor: Number(r.hf.value), maxMonths: r.mx.value === '' ? null : Number(r.mx.value), minSeniority: r.sen.value || null }));
        await ctx.act('config.section', { section: 'assignmentTypes', value, expectRev: ctx.doc.configRev || 0 });
      } }, 'Save types') : null,
      canRules ? h('button', { class: 'btn', onclick: async () => {
        const value = { ...structuredClone(cfg.deployment), allowedAssignmentTypes: rows.filter((r) => r.allowed.input.checked).map((r) => r.t.id) };
        await ctx.act('config.section', { section: 'deployment', value, expectRev: ctx.doc.configRev || 0 });
      } }, 'Save permitted types') : null),
  ]);
}

function tieBreakCard(ctx) {
  const rk = ctx.doc.config.ranking;
  const canEdit = ctx.can('formulas.edit') && !ctx.doc.config.formulasLocked && ctx.doc.round2.status !== 'finalised';
  const opts = [['', '— none —'], ...Object.entries(TIE_BREAKS).map(([k, v]) => [k, v.label])];
  const sels = [0, 1, 2, 3, 4].map((i) => select(opts, rk.tieBreaks[i] || '', { disabled: !canEdit }));
  return card('Tie-break rules', [h('p', { class: 'small muted' }, 'Applied in order when two teams have the same score. Teams level on every rule share the place. Ties are never resolved at random.'),
    h('div', { class: 'fields' }, sels.map((s, i) => field(`${i + 1}. rule`, s))),
    canEdit ? h('div', { class: 'row end' }, h('button', { class: 'btn primary', onclick: () => ctx.act('config.section', { section: 'ranking', value: { ...structuredClone(rk), tieBreaks: [...new Set(sels.map((s) => s.value).filter(Boolean))] }, expectRev: ctx.doc.configRev || 0 }) }, 'Save tie-breaks')) : null]);
}

function indicesCard(ctx) {
  const idx = ctx.doc.config.indices;
  const canEdit = ctx.can('formulas.edit') && !ctx.doc.config.formulasLocked && ctx.doc.round2.status !== 'finalised';
  const ins = Object.fromEntries(Object.keys(idx).map((n) => [n, Object.fromEntries(CAP_KEYS.map((k) => [k, num(idx[n][k] ?? '', { min: 0, disabled: !canEdit })]))]));
  return card('Capability index weights', [h('p', { class: 'small muted' }, 'Relative weights (blank = 0) for the capability indices shown on CVs and in Round 1. The cross-cultural index also feeds cultural adaptation in Round 2.'),
    h('div', { class: 'tablewrap' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, h('th', {}, 'Capability'), Object.keys(idx).map((n) => h('th', {}, INDEX_LABELS[n])))),
      h('tbody', {}, CAP_KEYS.map((k) => h('tr', {}, h('td', {}, CAP_LABELS[k]), Object.keys(idx).map((n) => h('td', {}, ins[n][k]))))))),
    canEdit ? h('div', { class: 'row end', style: { marginTop: '8px' } }, h('button', { class: 'btn primary', onclick: () => ctx.act('config.section', { section: 'indices', value: Object.fromEntries(Object.entries(ins).map(([n, m]) => [n, Object.fromEntries(Object.entries(m).filter(([, i]) => i.value !== '' && Number(i.value) > 0).map(([k, i]) => [k, Number(i.value)]))])), expectRev: ctx.doc.configRev || 0 }) }, 'Save index weights')) : null]);
}

function severityCard(ctx) {
  const cfg = ctx.doc.config;
  const canEdit = ctx.can('severity.set') && ctx.doc.round2.status !== 'finalised';
  const sels = {};
  const rows = Object.entries(CHECKS).map(([code, c]) => ({ code, c }));
  return card('Validation checklist', [h('p', { class: 'small muted' }, 'Blocking checks stop locking or finalising; warnings are shown but do not stop it. Structural checks are always blocking.'),
    table([
      { label: 'Stage', get: (r) => r.c.stage }, { label: 'Check', get: (r) => r.c.title, wrap: true }, { label: 'Code', get: (r) => r.code },
      { label: 'Severity', sort: false, render: (r) => { if (r.c.fixed) return h('span', { class: 'pill neutral' }, 'Always blocking'); const s = select([['blocking', 'Blocking'], ['warning', 'Warning']], cfg.validationSeverity?.[r.code] || r.c.severity, { disabled: !canEdit }); sels[r.code] = s; return s; } },
    ], rows, { id: 'checks', filters: [{ label: 'All stages', options: [['config', 'Configuration'], ['round1', 'Round 1'], ['round2', 'Round 2']], get: (r) => r.c.stage }] }),
    canEdit ? h('div', { class: 'row end', style: { marginTop: '8px' } }, h('button', { class: 'btn primary', onclick: () => {
      const value = Object.fromEntries(Object.entries(sels).filter(([k, s]) => s.value !== CHECKS[k].severity).map(([k, s]) => [k, s.value]));
      return ctx.act('config.section', { section: 'validationSeverity', value, expectRev: ctx.doc.configRev || 0 });
    } }, 'Save severities')) : null]);
}

function visibilityCard(ctx) {
  const v = ctx.doc.config.visibility;
  const canEdit = ctx.can('visibility.set') && ctx.doc.round2.status !== 'finalised';
  const ops = {}; const reps = {};
  const regions = [...ctx.doc.continents.map((c) => [c.id, `${c.name} (continent)`]), ...ctx.doc.cities.map((c) => [c.id, c.name])];
  const hid = Object.fromEntries(regions.map(([id, l]) => [id, check(l, (v.hiddenRegions || []).includes(id), { disabled: !canEdit })]));
  return card('What operators and reports may see', [
    h('p', { class: 'small muted' }, 'Hidden values are removed on the server before anything is sent: operators and read-only officers see “Confidential”, and reports leave them out. Calculated totals stay visible. Only a Super Administrator sees everything.'),
    h('div', { class: 'tablewrap' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, h('th', {}, 'Information'), h('th', {}, 'Shown to operators and officers'), h('th', {}, 'Included in reports'))),
      h('tbody', {}, Object.entries(VISIBILITY_GROUPS).map(([g, l]) => { ops[g] = check('', v.operators?.[g] !== false, { disabled: !canEdit }); reps[g] = check('', v.reports?.[g] !== false, { disabled: !canEdit }); return h('tr', {}, h('td', {}, l), h('td', {}, ops[g].el), h('td', {}, reps[g].el)); })))),
    h('h3', { style: { marginTop: '12px' } }, 'Unannounced regions (everything about them hidden from operators)'),
    h('div', { class: 'fields' }, Object.values(hid).map((c) => c.el)),
    canEdit ? h('div', { class: 'row end', style: { marginTop: '8px' } }, h('button', { class: 'btn primary', onclick: () => ctx.act('config.section', { section: 'visibility', value: { operators: Object.fromEntries(Object.entries(ops).filter(([, c]) => !c.input.checked).map(([g]) => [g, false])), reports: Object.fromEntries(Object.entries(reps).filter(([, c]) => !c.input.checked).map(([g]) => [g, false])), hiddenRegions: Object.entries(hid).filter(([, c]) => c.input.checked).map(([id]) => id) }, expectRev: ctx.doc.configRev || 0 }) }, 'Save visibility')) : h('p', { class: 'small muted' }, 'Only a Super Administrator changes visibility.')]);
}

function lockCard(ctx) {
  const locked = ctx.doc.config.formulasLocked;
  return card('Formula lock', [h('p', {}, locked ? 'The financial formulas and scoring framework are locked: nobody can change them until a Super Administrator unlocks them (with a reason, recorded in the audit log).' : 'The formulas and scoring framework can be changed by a Super Administrator, or an operator granted the formula permission. Lock them before the event.'),
    ctx.can('formulas.lock') ? h('button', { class: `btn ${locked ? '' : 'gold'}`, onclick: async () => {
      if (locked) { const r = await confirmDialog('Unlock the formulas?', { reason: 'required', confirmLabel: 'Unlock' }); if (r) ctx.act('config.formulasLock', { locked: false, reason: r.reason }); }
      else ctx.act('config.formulasLock', { locked: true });
    } }, locked ? 'Unlock the formulas' : 'Lock the formulas') : null]);
}
