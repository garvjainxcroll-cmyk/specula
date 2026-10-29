// 4. Employee CV Repository: twenty structured CVs. Scores are numbers the engine uses
// directly; nothing is read out of the narrative text.
import { h, card, table, m, pill, modal, field, num, text, area, select, check, moneyInput, numVal, kv } from '../ui.mjs';
import { TECH_KEYS, SOFT_KEYS, CAP_LABELS, FUNCTION_LABELS, SENIORITY, INDEX_LABELS, FUNCTIONS, AUCTION_STATUS } from '../../engine/model.mjs';
import { fmtNum } from '../../engine/money.mjs';
import { names } from './common.mjs';

export function render(ctx) {
  const { doc, res } = ctx;
  const n = names(ctx);
  const focus = ctx.sub.cvs?.focus || null;
  const rec = (id) => doc.auction.records.find((r) => r.employeeId === id);
  const avg = (e) => TECH_KEYS.reduce((s, k) => s + e.technical[k], 0) / TECH_KEYS.length;
  const list = table([
    { label: 'ID', get: (e) => e.id }, { label: 'Name', get: (e) => e.name }, { label: 'Seniority', get: (e) => e.seniority },
    { label: 'Category', get: (e) => e.category }, { label: 'Origin', get: (e) => n.cont(e.origin) }, { label: 'Years', num: true, get: (e) => e.yearsExperience },
    { label: 'Avg capability', num: true, get: (e) => avg(e), render: (e) => fmtNum(avg(e), 1) },
    { label: 'Best role', get: (e) => res.employees[e.id]?.roles[0]?.name, render: (e) => `${res.employees[e.id]?.roles[0]?.name} (${res.employees[e.id]?.roles[0]?.fit})` },
    { label: 'Expected salary', num: true, get: (e) => e.employment.expectedSalary, render: (e) => m(e.employment.expectedSalary) },
    { label: 'Starting bid', num: true, get: (e) => rec(e.id)?.startingBid, render: (e) => m(rec(e.id)?.startingBid) },
    { label: 'Auction', get: (e) => rec(e.id)?.status, render: (e) => { const r = rec(e.id); return r?.status === 'sold' ? pill(`Sold · ${n.team(r.winningTeamId)}`, 'good') : pill(AUCTION_STATUS[r?.status] || '—', r?.status === 'live' ? 'warn' : 'neutral'); } },
  ], doc.employees, { id: 'cvs', onRow: (e) => ctx.go('cvs', { focus: e.id }), selected: (e) => e.id === focus,
    filters: [{ label: 'All seniority', options: SENIORITY, get: (e) => e.seniority }, { label: 'All functions', options: FUNCTIONS.map((f) => [f, FUNCTION_LABELS[f]]), get: (e) => e.primaryFunction }, { label: 'All origins', options: doc.continents.map((c) => [c.id, c.name]), get: (e) => e.origin }],
    searchText: (e) => `${e.id} ${e.name} ${e.category} ${e.headline} ${(e.languages || []).join(' ')} ${(e.strategic.strengths || []).join(' ')}` });
  const e = doc.employees.find((x) => x.id === focus);
  return [
    h('div', { class: 'pagehead' }, h('div', {}, h('div', { class: 'eyebrow' }, 'Stage 1 · Configure'), h('h1', { class: 'page' }, 'Employee CV Repository')), h('div', { class: 'grow' }), pill(`${doc.employees.length} CVs`, doc.employees.length === doc.config.auction.poolSize ? 'good' : 'bad'), doc.sampleData ? pill('Fictional CVs', 'gold') : null),
    h('div', { class: 'note' }, 'Capability scores (1–100) are inputs. A balanced pool: specialists, generalists and executives, with no CV best at everything. The financial model decides what each capability is worth in each destination.'),
    card(null, list),
    e ? detail(ctx, e) : h('p', { class: 'muted small' }, 'Click a CV to see it in full.'),
  ];
}

export function capBars(e) {
  const bar = (k, v) => h('div', { class: 'capbar' }, h('span', {}, CAP_LABELS[k]), h('span', { class: 'track' }, h('span', { class: 'fill', style: { width: `${v}%` } })), h('span', { class: 'num' }, String(v)));
  return h('div', { class: 'grid g2' }, h('div', { class: 'bars' }, h('h3', {}, 'Technical capabilities'), TECH_KEYS.map((k) => bar(k, e.technical[k]))), h('div', { class: 'bars' }, h('h3', {}, 'Personal and professional skills'), SOFT_KEYS.map((k) => bar(k, e.soft[k]))));
}

export function detail(ctx, e) {
  const { doc, res } = ctx;
  const n = names(ctx);
  const x = res.employees[e.id];
  const em = e.employment; const st = e.strategic;
  const canEdit = ctx.can('config.edit') && doc.round2.status !== 'finalised' && (doc.round1.status !== 'locked' || ctx.me?.role === 'super');
  return card(`${e.id} · ${e.name}`, [
    h('div', { class: 'muted' }, `${e.headline} · ${e.seniority} · ${e.category}`),
    kv([['Age', e.age], ['Origin', `${n.cont(e.origin)} (${e.nationality})`], ['Experience', `${e.yearsExperience} years`], ['Languages', (e.languages || []).join(', ')], ['Previous industries', (e.previousIndustries || []).join(', ')], ['Leadership', e.leadershipExperience]]),
    kv([['Education', (e.education || []).join('; ')], ['Certifications', (e.certifications || []).join('; ') || 'None'], ['International assignments', (e.internationalAssignments || []).map((a) => `${a.place} (${a.years} yr, ${a.role})`).join('; ') || 'None']]),
    h('div', { class: 'sep' }), capBars(e), h('div', { class: 'sep' }),
    h('div', { class: 'grid g3' },
      h('div', {}, h('h3', {}, 'Capability indices'), kv(Object.entries(INDEX_LABELS).map(([k, l]) => [l, fmtNum(x.indices[k], 1)]))),
      h('div', {}, h('h3', {}, 'Best-fit roles (capability fit)'), h('ol', {}, x.roles.map((r) => h('li', {}, `${r.name} — ${r.fit}`)))),
      h('div', {}, h('h3', {}, 'Regional suitability (0–100)'), kv(doc.continents.map((c) => [c.name, fmtNum(x.regional[c.id], 0)])))),
    h('div', { class: 'sep' }),
    h('h3', {}, 'Employment and financial profile'),
    kv([['Expected salary', m(em.expectedSalary)], ['Minimum acceptable', m(em.minSalary)], ['Recruitment cost (once)', m(em.hiringCost)], ['Onboarding cost (once)', m(em.onboardingCost)], ['Relocation estimate', m(em.relocationBase)], ['Training cost', `${m(em.trainingCost)}${em.trainingRequired ? ' · required' : ''}`], ['Onboarding', `${em.onboardingMonths} month(s)`], ['Ramp-up', `${em.rampUpMonths} month(s)`], ['Contract', `${em.contractMonths} months`], ['Relocation needs', em.relocationNeeds], ['Restrictions', (em.restrictions || []).join('; ') || 'None']]),
    h('h3', { style: { marginTop: '10px' } }, 'Strategic attributes'),
    kv([['Strengths', (st.strengths || []).join('; ')], ['Limitations', (st.limitations || []).join('; ')], ['Best-fit functions', (st.bestFit || []).map(n.role).join(', ')], ['Suitable environments', st.environments], ['International suitability', st.intlSuitability], ['Disclosed risk factor', st.risk?.kind && st.risk.kind !== 'none' ? st.risk.text : 'None disclosed']]),
    canEdit ? h('div', { class: 'row end' }, h('button', { class: 'btn primary', onclick: () => editor(ctx, e) }, 'Edit CV')) : null,
  ], { cls: 'gold' });
}

function editor(ctx, e) {
  const { doc } = ctx;
  const lines = (arr) => (arr || []).join('\n');
  const fromLines = (ta) => ta.value.split('\n').map((x) => x.trim()).filter(Boolean);
  const f = {
    name: text(e.name), age: num(e.age, { min: 16, max: 90, step: 1 }), origin: select(doc.continents.map((c) => [c.id, c.name]), e.origin), nationality: text(e.nationality), headline: text(e.headline), category: text(e.category),
    seniority: select(SENIORITY, e.seniority), primaryFunction: select(FUNCTIONS.map((x) => [x, FUNCTION_LABELS[x]]), e.primaryFunction), yearsExperience: num(e.yearsExperience, { min: 0, max: 60 }),
    education: area(lines(e.education)), certifications: area(lines(e.certifications)), previousIndustries: area(lines(e.previousIndustries)), languages: text((e.languages || []).join(', ')),
    intl: area((e.internationalAssignments || []).map((a) => `${a.place} | ${a.years} | ${a.role}`).join('\n')), leadershipExperience: text(e.leadershipExperience),
  };
  const tech = Object.fromEntries(TECH_KEYS.map((k) => [k, num(e.technical[k], { min: 1, max: 100, step: 1 })]));
  const soft = Object.fromEntries(SOFT_KEYS.map((k) => [k, num(e.soft[k], { min: 1, max: 100, step: 1 })]));
  const em = e.employment;
  const emp = { expectedSalary: moneyInput(em.expectedSalary), minSalary: moneyInput(em.minSalary), hiringCost: moneyInput(em.hiringCost), onboardingCost: moneyInput(em.onboardingCost), relocationBase: moneyInput(em.relocationBase), trainingCost: moneyInput(em.trainingCost) };
  const months = { onboardingMonths: num(em.onboardingMonths, { min: 0, step: 1 }), rampUpMonths: num(em.rampUpMonths, { min: 0, step: 1 }), contractMonths: num(em.contractMonths, { min: 1, step: 1 }) };
  const trainingRequired = check('Training required', em.trainingRequired);
  const needs = select([['none', 'None'], ['standard', 'Standard'], ['enhanced', 'Enhanced'], ['family', 'Family']], em.relocationNeeds);
  const st = e.strategic;
  const strengths = area(lines(st.strengths)); const limitations = area(lines(st.limitations)); const bestFit = text((st.bestFit || []).join(', ')); const environments = text(st.environments); const intl = num(st.intlSuitability, { min: 1, max: 100, step: 1 });
  const compat = Object.fromEntries(doc.continents.map((c) => [c.id, num(st.regionalCompatibility?.[c.id] ?? 0, { min: -30, max: 30 })]));
  const riskKind = select([['none', 'None'], ['maxAbroadMonths', 'Will not stay abroad beyond N months'], ['visaHistory', 'Past work-permit difficulty in a continent'], ['familyCommitment', 'Family commitments (expects a family package)']], st.risk?.kind || 'none');
  const riskMonths = num(st.risk?.months ?? '', { min: 1, step: 1 }); const riskCont = select(doc.continents.map((c) => [c.id, c.name]), st.risk?.continentId || doc.continents[0].id); const riskText = text(st.risk?.text);
  const rec = doc.auction.records.find((r) => r.employeeId === e.id);
  const bid = moneyInput(rec?.startingBid, { disabled: rec?.status !== 'available' });
  modal(`Edit ${e.id} ${e.name}`, (close) => [
    h('div', { class: 'note' }, doc.round1.status === 'locked' ? 'Round 1 is locked: this is a correction and needs a reason.' : 'Changes are recorded in the audit log.'),
    h('div', { class: 'fields' }, field('Name', f.name), field('Age', f.age), field('Origin continent', f.origin), field('Nationality', f.nationality), field('Headline', f.headline), field('Category', f.category), field('Seniority', f.seniority), field('Primary function', f.primaryFunction), field('Years of experience', f.yearsExperience), field('Languages (comma-separated)', f.languages), field('Leadership experience', f.leadershipExperience), field('Starting bid', bid, rec?.status === 'available' ? null : 'Fixed once auctioned')),
    h('div', { class: 'grid g3' }, field('Education (one per line)', f.education), field('Certifications (one per line)', f.certifications), field('Previous industries (one per line)', f.previousIndustries)),
    field('International assignments (place | years | role, one per line)', f.intl),
    h('h3', {}, 'Technical capabilities (1–100)'), h('div', { class: 'fields' }, TECH_KEYS.map((k) => field(CAP_LABELS[k], tech[k]))),
    h('h3', {}, 'Personal and professional skills (1–100)'), h('div', { class: 'fields' }, SOFT_KEYS.map((k) => field(CAP_LABELS[k], soft[k]))),
    h('h3', {}, 'Employment and financial profile'), h('div', { class: 'fields' }, field('Expected salary (a year)', emp.expectedSalary), field('Minimum acceptable salary', emp.minSalary), field('Recruitment cost (once)', emp.hiringCost), field('Onboarding cost (once)', emp.onboardingCost), field('Relocation estimate', emp.relocationBase), field('Training cost', emp.trainingCost), field('Onboarding (months)', months.onboardingMonths), field('Ramp-up (months)', months.rampUpMonths), field('Contract (months)', months.contractMonths), field('Relocation needs', needs), trainingRequired.el),
    h('h3', {}, 'Strategic attributes'), h('div', { class: 'grid g2' }, field('Strengths (one per line)', strengths), field('Limitations (one per line)', limitations)),
    h('div', { class: 'fields' }, field('Best-fit role IDs (comma-separated)', bestFit), field('Suitable environments', environments), field('International suitability (1–100)', intl), ...doc.continents.map((c) => field(`Compatibility with ${c.name} (± points)`, compat[c.id]))),
    h('div', { class: 'fields' }, field('Disclosed risk factor', riskKind), field('Months (if a limit)', riskMonths), field('Continent (if permit history)', riskCont), field('Risk description', riskText)),
    h('div', { class: 'row end' }, h('button', { class: 'btn primary', onclick: async () => {
      const ems = {}; for (const [k, i] of Object.entries(emp)) { ems[k] = i.getValue(); if (Number.isNaN(ems[k])) return modal('Check the form', h('p', {}, 'Every amount must be a number of zero or more.')); }
      const patch = {
        name: f.name.value, age: f.age.value === '' ? null : numVal(f.age), origin: f.origin.value, nationality: f.nationality.value, headline: f.headline.value, category: f.category.value, seniority: f.seniority.value, primaryFunction: f.primaryFunction.value, yearsExperience: numVal(f.yearsExperience),
        education: fromLines(f.education), certifications: fromLines(f.certifications), previousIndustries: fromLines(f.previousIndustries), languages: f.languages.value.split(',').map((x) => x.trim()).filter(Boolean), leadershipExperience: f.leadershipExperience.value,
        internationalAssignments: fromLines(f.intl).map((l) => { const [place, years, role] = l.split('|').map((x) => x.trim()); return { place, years: Number(years) || 0, role: role || '' }; }),
        technical: Object.fromEntries(Object.entries(tech).map(([k, i]) => [k, numVal(i)])), soft: Object.fromEntries(Object.entries(soft).map(([k, i]) => [k, numVal(i)])),
        employment: { ...ems, ...Object.fromEntries(Object.entries(months).map(([k, i]) => [k, numVal(i)])), trainingRequired: trainingRequired.input.checked, relocationNeeds: needs.value, relocationText: em.relocationText || '', trainingText: em.trainingText || '', restrictions: em.restrictions || [] },
        strategic: { strengths: fromLines(strengths), limitations: fromLines(limitations), bestFit: bestFit.value.split(',').map((x) => x.trim()).filter(Boolean), environments: environments.value, intlSuitability: numVal(intl), regionalCompatibility: Object.fromEntries(Object.entries(compat).map(([k, i]) => [k, numVal(i) || 0])), risk: { kind: riskKind.value, text: riskText.value, ...(riskKind.value === 'maxAbroadMonths' ? { months: numVal(riskMonths) } : {}), ...(riskKind.value === 'visaHistory' ? { continentId: riskCont.value } : {}) } },
      };
      if (rec?.status === 'available') patch.startingBid = bid.getValue();
      if (await ctx.act('employee.update', { id: e.id, expectRev: e.rev || 0, patch })) close();
    } }, 'Save CV')),
  ], { wide: true });
}
