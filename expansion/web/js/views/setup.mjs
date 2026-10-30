// 3. Team and Continent Setup: teams, business profiles, revenue models, continents, cities.
import { h, card, tabs, field, num, text, area, select, check, moneyInput, table, pill, m, modal, numVal } from '../ui.mjs';
import { ATTRS, FUNCTIONS, FUNCTION_LABELS, VISIBILITY_GROUPS } from '../../engine/model.mjs';
import { fmtNum } from '../../engine/money.mjs';

export function render(ctx) {
  const tab = ctx.sub.setup?.tab || 'teams';
  return [
    h('div', { class: 'pagehead' }, h('div', {}, h('div', { class: 'eyebrow' }, 'Stage 1 · Configure'), h('h1', { class: 'page' }, 'Team and Continent Setup'))),
    tabs([{ id: 'teams', label: 'Teams' }, { id: 'profile', label: 'Business profiles' }, { id: 'models', label: 'Revenue models' }, { id: 'continents', label: 'Continents' }, { id: 'cities', label: 'Cities' }], tab, (t) => ctx.go('setup', { tab: t, focus: null })),
    ...({ teams, profile, models, continents, cities }[tab] || teams)(ctx),
  ];
}

const editable = (ctx) => ctx.can('config.edit') && ctx.doc.round2.status !== 'finalised';

function teams(ctx) {
  const { doc } = ctx;
  const canEdit = editable(ctx);
  return [h('div', { class: 'note' }, 'Each team has one home continent (its headquarters and starting market). Teams may deploy at home or abroad; no other restriction applies unless it is set in Event Configuration.'),
    h('div', { class: 'grid g2' }, doc.teams.map((t, i) => {
      const label = text(t.label, { disabled: !canEdit }); const company = text(t.profile.companyName, { disabled: !canEdit });
      const home = select(doc.continents.map((c) => [c.id, c.name]), t.homeContinentId, { disabled: !canEdit });
      const hq = select(doc.cities.map((c) => [c.id, `${c.name} (${doc.continents.find((k) => k.id === c.continentId)?.name})`]), t.profile.hqCityId, { disabled: !canEdit });
      const pres = Object.fromEntries(doc.cities.map((c) => [c.id, check(c.name, (t.profile.existingPresence || []).includes(c.id), { disabled: !canEdit })]));
      return card(h('div', { class: 'row' }, h('span', { class: 'dotkey', style: { background: `var(--s${i + 1})` } }), h('h2', {}, t.label)), [
        h('div', { class: 'fields' }, field('Team label', label), field('Company name', company), field('Home continent', home), field('Headquarters city', hq, 'Must be in the home continent')),
        h('details', {}, h('summary', { class: 'small' }, 'Existing presence (cities where the company already operates)'), h('div', { class: 'fields', style: { marginTop: '8px' } }, Object.values(pres).map((c) => c.el))),
        canEdit ? h('div', { class: 'row end', style: { marginTop: '8px' } }, h('button', { class: 'btn primary', onclick: () => ctx.act('team.update', { teamId: t.id, expectRev: t.rev || 0, patch: { label: label.value, homeContinentId: home.value, profile: { companyName: company.value, hqCityId: hq.value, existingPresence: Object.entries(pres).filter(([, c]) => c.input.checked).map(([id]) => id) } } }) }, 'Save team')) : null,
      ], { cls: 'gold' });
    }))];
}

const PROFILE_TEXT = [['industry', 'Industry'], ['businessModel', 'Business model'], ['capacity', 'Initial operating capacity'], ['workforce', 'Existing workforce'], ['infrastructure', 'Infrastructure'], ['targetMarkets', 'Target markets'], ['objectives', 'Financial objectives'], ['restrictions', 'Expansion restrictions'], ['requirements', 'Employment and corporate requirements'], ['modifiers', 'Special scenario modifiers']];
const PROFILE_MONEY = [['startingCash', 'Starting cash'], ['acquisitionBudget', 'Acquisition budget (Round 1)'], ['expansionBudget', 'Expansion budget (Round 2)'], ['baselineRevenue', 'Existing revenue (a year)'], ['baselineOpex', 'Existing operating expenses (a year)']];

function profileForm(ctx, p, onSave) {
  const canEdit = editable(ctx);
  const t = Object.fromEntries(PROFILE_TEXT.map(([k]) => [k, k === 'businessModel' ? area(p[k], { disabled: !canEdit }) : text(p[k], { disabled: !canEdit })]));
  const mo = Object.fromEntries(PROFILE_MONEY.map(([k]) => [k, moneyInput(p[k], { disabled: !canEdit })]));
  const model = select(ctx.doc.revenueModels.map((x) => [x.id, x.name]), p.revenueModelId, { disabled: !canEdit });
  return h('div', { class: 'stack' },
    h('div', { class: 'fields' }, PROFILE_MONEY.map(([k, l]) => field(l, mo[k])), field('Revenue model', model)),
    h('div', { class: 'fields wide' }, PROFILE_TEXT.map(([k, l]) => field(l, t[k]))),
    canEdit ? h('div', { class: 'row end' }, h('button', { class: 'btn primary', onclick: () => {
      const patch = { revenueModelId: model.value, ...Object.fromEntries(PROFILE_TEXT.map(([k]) => [k, t[k].value])) };
      for (const [k] of PROFILE_MONEY) { const v = mo[k].getValue(); if (Number.isNaN(v)) return modal('Check the form', h('p', {}, 'Every amount must be a number of zero or more.')); patch[k] = v; }
      onSave(patch);
    } }, 'Save profile')) : null);
}

function profile(ctx) {
  const { doc } = ctx;
  if (doc.config.identicalResources) {
    return [h('div', { class: 'note info' }, 'Identical resources are on: all four teams use this standard profile’s figures and revenue model, so they compete on equal terms. Switch it off in Event Configuration to give teams their own profiles.'),
      card('Standard business profile (every team)', profileForm(ctx, doc.standardProfile, (patch) => ctx.act('standardProfile.update', { patch })))];
  }
  return doc.teams.map((t) => card(`${t.label} — ${t.profile.companyName}`, profileForm(ctx, { ...doc.standardProfile, ...t.profile }, (patch) => ctx.act('team.update', { teamId: t.id, expectRev: t.rev || 0, patch: { profile: patch } }))));
}

function models(ctx) {
  const canEdit = ctx.can('formulas.edit') && !ctx.doc.config.formulasLocked && ctx.doc.round2.status !== 'finalised';
  return [card('Revenue models', [h('p', { class: 'small muted' }, 'A team’s business model scales each kind of direct revenue, and sets marketing spend as a share of revenue.'),
    h('div', { class: 'stack' }, ctx.doc.revenueModels.map((x) => {
      const name = text(x.name, { disabled: !canEdit }); const desc = text(x.description, { disabled: !canEdit });
      const f = Object.fromEntries(['sales', 'contracts', 'service'].map((k) => [k, num(x.factors[k], { min: 0, max: 3, disabled: !canEdit })]));
      const mk = num(x.marketingPctOfRevenue, { min: 0, max: 50, disabled: !canEdit });
      return h('div', { class: 'card' }, h('div', { class: 'fields' }, field('Name', name), field('Description', desc), field('Sales factor', f.sales), field('Contracts factor', f.contracts), field('Service factor', f.service), field('Marketing spend (% of revenue)', mk)),
        canEdit ? h('div', { class: 'row end', style: { marginTop: '8px' } }, h('button', { class: 'btn', onclick: () => ctx.act('revenueModel.update', { id: x.id, patch: { name: name.value, description: desc.value, factors: { sales: numVal(f.sales), contracts: numVal(f.contracts), service: numVal(f.service) }, marketingPctOfRevenue: numVal(mk) } }) }, 'Save model')) : null);
    }))])];
}

function continents(ctx) {
  const { doc } = ctx;
  const focus = ctx.sub.setup?.focus && doc.continents.some((c) => c.id === ctx.sub.setup.focus) ? ctx.sub.setup.focus : doc.continents[0]?.id;
  const c = doc.continents.find((x) => x.id === focus);
  const canEdit = editable(ctx);
  const groups = [...new Set(ATTRS.map((a) => a.group))];
  const attrIn = Object.fromEntries(ATTRS.map((a) => [a.key, a.kind === 'money' ? moneyInput(c.attrs[a.key], { disabled: !canEdit || c.attrs[a.key] === null }) : num(c.attrs[a.key] ?? '', { disabled: !canEdit || c.attrs[a.key] === null, step: 'any' })]));
  const name = text(c.name, { disabled: !canEdit }); const desc = area(c.description, { disabled: !canEdit });
  const langs = text((c.languages || []).join(', '), { disabled: !canEdit });
  const curCode = text(c.currency?.code, { disabled: !canEdit }); const curName = text(c.currency?.name, { disabled: !canEdit }); const curRate = num(c.currency?.rateToBase, { min: 0, disabled: !canEdit });
  const fb = Object.fromEntries(FUNCTIONS.map((f) => [f, num(c.functionBonus?.[f] ?? '', { min: -50, max: 50, disabled: !canEdit || c.functionBonus === null })]));
  const spR = num(c.special?.revenuePct ?? 0, { disabled: !canEdit || c.special === null }); const spC = num(c.special?.costPct ?? 0, { disabled: !canEdit || c.special === null }); const spL = text(c.special?.label || '', { disabled: !canEdit || c.special === null }); const spA = check('Active', c.special?.active, { disabled: !canEdit || c.special === null });
  const req = Object.fromEntries(['employment', 'protection', 'permits', 'qualifications'].map((k) => [k, area(c.requirements?.[k], { disabled: !canEdit, rows: 2 })]));
  const benefits = area((c.benefits || []).map((b) => `${b.label} | ${b.effect}`).join('\n'), { disabled: !canEdit, rows: 4 });
  const disadv = area((c.disadvantages || []).map((b) => `${b.label} | ${b.effect}`).join('\n'), { disabled: !canEdit, rows: 4 });
  const parseList = (ta) => ta.value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [label, ...rest] = l.split('|'); return { label: label.trim(), effect: rest.join('|').trim() }; });
  const save = () => {
    const attrs = {};
    for (const a of ATTRS) { const v = a.kind === 'money' ? attrIn[a.key].getValue() : numVal(attrIn[a.key]); if (Number.isNaN(v)) return modal('Check the form', h('p', {}, `${a.label} needs a number.`)); attrs[a.key] = v; }
    const patch = { name: name.value, description: desc.value, languages: langs.value.split(',').map((x) => x.trim()).filter(Boolean), currency: { code: curCode.value, name: curName.value, rateToBase: numVal(curRate) }, requirements: Object.fromEntries(Object.entries(req).map(([k, v]) => [k, v.value])), benefits: parseList(benefits), disadvantages: parseList(disadv) };
    if (c.attrs.marketDemand !== null) patch.attrs = attrs;
    if (c.functionBonus !== null) patch.functionBonus = Object.fromEntries(Object.entries(fb).filter(([, i]) => i.value !== '' && Number(i.value) !== 0).map(([k, i]) => [k, Number(i.value)]));
    if (c.special !== null) patch.special = { revenuePct: numVal(spR), costPct: numVal(spC), label: spL.value, active: spA.input.checked };
    ctx.act('continent.update', { id: c.id, expectRev: c.rev || 0, patch });
  };
  return [
    h('div', { class: 'row' }, doc.continents.map((x) => h('button', { class: `btn ${x.id === focus ? 'primary' : ''}`, onclick: () => ctx.go('setup', { tab: 'continents', focus: x.id }) }, x.name))),
    c.redacted ? h('div', { class: 'note info' }, 'Some of this continent’s information is confidential and hidden by the Super Administrator.') : null,
    card(`${c.name} — regional intelligence`, [
      h('div', { class: 'fields' }, field('Name', name), field('Languages (comma-separated)', langs), field('Local currency code', curCode), field('Local currency name', curName), field('1 local unit = how many base units', curRate)),
      field('Description', desc),
      ...groups.map((g) => [h('h3', { style: { marginTop: '10px' } }, VISIBILITY_GROUPS[g]), h('div', { class: 'fields' }, ATTRS.filter((a) => a.group === g).map((a) => field(`${a.label}${a.unit ? ` (${a.unit})` : ''}`, attrIn[a.key], a.kind === 'score' ? '0–100' : a.kind === 'mult' ? `Multiplier ${a.min}–${a.max}` : a.kind === 'rate' ? `${a.min}–${a.max}` : null)))]),
      h('h3', { style: { marginTop: '10px' } }, 'Regional role bonuses (± % productivity)'), h('div', { class: 'fields' }, FUNCTIONS.map((f) => field(FUNCTION_LABELS[f], fb[f]))),
      h('h3', { style: { marginTop: '10px' } }, 'Special scenario modifier'), h('div', { class: 'fields' }, field('Revenue (%)', spR), field('Local costs (%)', spC), field('Label', spL), spA.el),
      h('h3', { style: { marginTop: '10px' } }, 'Requirements (description; the binding rules are in the Legal and Compliance Engine)'), h('div', { class: 'fields wide' }, Object.entries(req).map(([k, v]) => field(k[0].toUpperCase() + k.slice(1), v))),
      h('div', { class: 'grid g2', style: { marginTop: '10px' } }, field('Benefits (one per line: label | numerical effect)', benefits), field('Disadvantages (one per line: label | numerical effect)', disadv)),
      canEdit ? h('div', { class: 'row end', style: { marginTop: '10px' } }, h('button', { class: 'btn primary', onclick: save }, 'Save continent')) : null,
    ]),
  ];
}

function cities(ctx) {
  const { doc, res } = ctx;
  const focus = ctx.sub.setup?.focus && doc.cities.some((c) => c.id === ctx.sub.setup.focus) ? ctx.sub.setup.focus : null;
  const contName = (id) => doc.continents.find((c) => c.id === id)?.name || id;
  const val = (c, k, dp = 0) => { const v = res.regions[c.id]?.attrs?.[k]; return v === null || v === undefined ? 'Confidential' : fmtNum(v, dp); };
  const list = table([
    { label: 'City', get: (c) => c.name }, { label: 'Continent', get: (c) => contName(c.continentId) },
    { label: 'City role bonus', get: (c) => (c.functionBonus === null ? 'Confidential' : Object.entries(c.functionBonus || {}).filter(([, v]) => Number(v)).map(([k, v]) => `${FUNCTION_LABELS[k] || k} ${v > 0 ? '+' : ''}${v}%`).join(', ')), wrap: true },
    { label: 'Demand', num: true, get: (c) => res.regions[c.id]?.attrs?.marketDemand, render: (c) => val(c, 'marketDemand') },
    { label: 'Purchasing', num: true, get: (c) => res.regions[c.id]?.attrs?.purchasingPower, render: (c) => val(c, 'purchasingPower') },
    { label: 'Growth %', num: true, get: (c) => res.regions[c.id]?.attrs?.growthRate, render: (c) => val(c, 'growthRate', 1) },
    { label: 'Op. cost ×', num: true, get: (c) => res.regions[c.id]?.attrs?.operatingCostMultiplier, render: (c) => val(c, 'operatingCostMultiplier', 2) },
    { label: 'Logistics', num: true, get: (c) => res.regions[c.id]?.attrs?.logistics, render: (c) => val(c, 'logistics') },
    { label: 'Tax %', num: true, get: (c) => res.regions[c.id]?.attrs?.taxRate, render: (c) => val(c, 'taxRate') },
    { label: 'Base opportunity', num: true, get: (c) => c.baseRevenueOpportunity, render: (c) => (c.baseRevenueOpportunity === null ? 'Confidential' : m(c.baseRevenueOpportunity)) },
    { label: 'Opportunity score', num: true, get: (c) => res.regions[c.id]?.opportunity?.score, render: (c) => fmtNum(res.regions[c.id]?.opportunity?.score ?? 0, 1) },
    { label: 'Special', get: (c) => (res.regions[c.id]?.specialLabels || []).join('; '), wrap: true },
  ], doc.cities, { id: 'cities', onRow: (c) => ctx.go('setup', { tab: 'cities', focus: c.id }), selected: (c) => c.id === focus, filters: [{ label: 'All continents', options: doc.continents.map((c) => [c.id, c.name]), get: (c) => c.continentId }] });
  return [card('Cities: effective values (continent + city adjustment)', [h('p', { class: 'small muted' }, 'These are the exact values the engine applies to each destination: the continent’s figures adjusted by the city’s own. Each city adds its own benefits, including a role bonus of its own, to the continent’s. A team may place only one employee in each city. Click a city to edit it.'), list]), focus ? cityEditor(ctx, doc.cities.find((c) => c.id === focus)) : null];
}

function cityEditor(ctx, c) {
  const { doc, res } = ctx;
  const canEdit = editable(ctx);
  const cont = doc.continents.find((k) => k.id === c.continentId);
  const reg = res.regions[c.id];
  const adjIn = Object.fromEntries(ATTRS.filter((a) => !a.continentOnly).map((a) => [a.key, num(c.adj?.[a.key] ?? '', { disabled: !canEdit || c.adj === null || (c.adj && c.adj[a.key] === null), step: 'any' })]));
  const name = text(c.name, { disabled: !canEdit }); const desc = area(c.description, { disabled: !canEdit, rows: 2 });
  const contSel = select(doc.continents.map((k) => [k.id, k.name]), c.continentId, { disabled: !canEdit });
  const mo = Object.fromEntries(['baseRevenueOpportunity', 'setupCost', 'officeCostAnnual'].map((k) => [k, moneyInput(c[k], { disabled: !canEdit || c[k] === null })]));
  const fb = Object.fromEntries(FUNCTIONS.map((f) => [f, num(c.functionBonus?.[f] ?? '', { min: -50, max: 50, disabled: !canEdit || c.functionBonus === null })]));
  const spR = num(c.special?.revenuePct ?? 0, { disabled: !canEdit || c.special === null }); const spC = num(c.special?.costPct ?? 0, { disabled: !canEdit || c.special === null }); const spL = text(c.special?.label || '', { disabled: !canEdit || c.special === null }); const spA = check('Active', c.special?.active, { disabled: !canEdit || c.special === null });
  const benefits = area((c.benefits || []).map((b) => `${b.label} | ${b.effect}`).join('\n'), { disabled: !canEdit, rows: 3 });
  const disadv = area((c.disadvantages || []).map((b) => `${b.label} | ${b.effect}`).join('\n'), { disabled: !canEdit, rows: 3 });
  const parseList = (ta) => ta.value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [label, ...rest] = l.split('|'); return { label: label.trim(), effect: rest.join('|').trim() }; });
  const save = () => {
    const patch = { name: name.value, description: desc.value, continentId: contSel.value, benefits: parseList(benefits), disadvantages: parseList(disadv) };
    if (c.adj !== null) patch.adj = Object.fromEntries(Object.entries(adjIn).filter(([, i]) => i.value !== '').map(([k, i]) => [k, Number(i.value)]));
    for (const [k, i] of Object.entries(mo)) if (c[k] !== null) { const v = i.getValue(); if (Number.isNaN(v)) return modal('Check the form', h('p', {}, 'Amounts must be numbers of zero or more.')); patch[k] = v; }
    if (c.functionBonus !== null) patch.functionBonus = Object.fromEntries(Object.entries(fb).filter(([, i]) => i.value !== '' && Number(i.value) !== 0).map(([k, i]) => [k, Number(i.value)]));
    if (c.special !== null) patch.special = { revenuePct: numVal(spR), costPct: numVal(spC), label: spL.value, active: spA.input.checked };
    ctx.act('city.update', { id: c.id, expectRev: c.rev || 0, patch });
  };
  return card(`${c.name} (${cont?.name}) — adjustments`, [
    h('div', { class: 'fields' }, field('City name', name), field('Continent', contSel, 'A city belongs to exactly one continent'), field('Base revenue opportunity (a year)', mo.baseRevenueOpportunity, 'Revenue a fully productive earner can make in a neutral market'), field('Office setup (once)', mo.setupCost), field('Office and infrastructure (a year)', mo.officeCostAnnual)),
    field('Description', desc),
    h('h3', { style: { marginTop: '10px' } }, 'Adjustments to the continent (scores and rates: + points; multipliers: + %)'),
    h('div', { class: 'tablewrap' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Attribute', 'Continent', 'City adjustment', 'Effective value'].map((x, i) => h('th', { class: i ? 'num' : '' }, x)))),
      h('tbody', {}, ATTRS.filter((a) => !a.continentOnly).map((a) => h('tr', {}, h('td', {}, a.label), h('td', { class: 'num' }, cont.attrs[a.key] === null ? 'Confidential' : fmtNum(cont.attrs[a.key], 2)), h('td', { class: 'num' }, adjIn[a.key]), h('td', { class: 'num strong' }, reg?.attrs?.[a.key] === null || reg?.attrs?.[a.key] === undefined ? 'Confidential' : fmtNum(reg.attrs[a.key], 2))))))),
    h('h3', { style: { marginTop: '10px' } }, 'City role bonuses (± %, added to the continent’s)'), h('div', { class: 'fields' }, FUNCTIONS.map((f) => field(FUNCTION_LABELS[f], fb[f]))),
    h('h3', { style: { marginTop: '10px' } }, 'Special scenario modifier'), h('div', { class: 'fields' }, field('Revenue (%)', spR), field('Local costs (%)', spC), field('Label', spL), spA.el),
    h('div', { class: 'grid g2', style: { marginTop: '10px' } }, field('Benefits (label | numerical effect)', benefits), field('Disadvantages (label | numerical effect)', disadv)),
    reg?.opportunity ? h('div', { style: { marginTop: '10px' } }, h('h3', {}, `Regional opportunity score ${fmtNum(reg.opportunity.score, 1)} / 100`), h('div', { class: 'small muted' }, reg.opportunity.factors.map((f) => `${f.label}: ${f.raw === null ? 'confidential' : `${fmtNum(f.raw, 0)}${f.benefit ? '' : ' (burden)'}`} × weight ${f.weight}`).join(' · '))) : null,
    canEdit ? h('div', { class: 'row end', style: { marginTop: '10px' } }, h('button', { class: 'btn primary', onclick: save }, 'Save city')) : null,
  ]);
}
