// Helpers shared by the screens.
import { h, modal, m, fmtNum, pct, pill, table, moneyEl } from '../ui.mjs';
import { fmtKind } from '../../engine/money.mjs';
import { CATEGORIES, COMPLIANCE_STATUS, FUNCTION_LABELS } from '../../engine/model.mjs';
import { CATEGORY_FORMULAS, STATEMENT_FORMULAS } from '../../engine/trace.mjs';
import { currency } from '../ui.mjs';

export const names = (ctx) => {
  const { doc } = ctx;
  const by = (arr) => Object.fromEntries(arr.map((x) => [x.id, x]));
  const emps = by(doc.employees); const cities = by(doc.cities); const conts = by(doc.continents); const teams = by(doc.teams);
  const roles = by(doc.config.roles); const types = by(doc.config.assignmentTypes);
  return {
    emps, cities, conts, teams, roles, types,
    emp: (id) => (emps[id] ? `${id} ${emps[id].name}` : id), city: (id) => cities[id]?.name || id, cont: (id) => conts[id]?.name || id,
    team: (id) => teams[id]?.label || id, role: (id) => roles[id]?.name || id, type: (id) => types[id]?.name || id,
    teamIndex: (id) => doc.teams.findIndex((t) => t.id === id),
  };
};

/** Jump from a validation issue to the screen that holds its record. */
export function goToRef(ctx, ref) {
  if (!ref) return;
  if (ref.kind === 'deployment') return ctx.go('expansion', { team: ref.teamId, focus: ref.id });
  if (ref.kind === 'employee' && ref.teamId) return ctx.go('expansion', { team: ref.teamId });
  if (ref.kind === 'employee') return ctx.go('auction', { focus: ref.id });
  if (ref.kind === 'team') return ctx.go(ctx.doc.round1.status === 'locked' ? 'expansion' : 'setup', { team: ref.id, tab: 'teams' });
  if (ref.kind === 'continent' || ref.kind === 'city') return ctx.go('setup', { tab: ref.kind === 'city' ? 'cities' : 'continents', focus: ref.id });
  if (ref.kind === 'rule') return ctx.go('compliance', { tab: 'rules', focus: ref.id });
  if (ref.kind === 'calc') return ctx.go('financial');
  if (ref.kind === 'round') return ctx.go(ref.id === 'round1' ? 'auction' : 'financial');
  return ctx.go('config');
}

/** The exact formula behind a value: every input with its value and where it came from. */
export function formulaModal(trace) {
  const cur = currency();
  modal(trace.title, [
    h('div', { class: 'formula' }, trace.formula),
    h('div', { class: 'tablewrap trace' }, h('table', { class: 't' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Input'), h('th', { class: 'num' }, 'Value'), h('th', {}, 'Where it comes from'))),
      h('tbody', {}, trace.terms.map((t) => h('tr', {}, h('td', {}, t.label), h('td', { class: 'num' }, t.value === null ? 'Confidential' : t.kind === 'text' ? String(t.value) : fmtKind(t.value, t.kind, cur)), h('td', { class: 'src' }, t.source || '')))),
      h('tfoot', {}, h('tr', {}, h('td', {}, trace.result.label), h('td', { class: 'num' }, fmtKind(trace.result.value, trace.result.kind, cur)), h('td', {}, ''))))),
    trace.schedule?.length ? h('div', {}, h('h3', {}, 'Month by month'), h('div', { class: 'tablewrap' }, h('table', { class: 't' },
      h('thead', {}, h('tr', {}, ['Month', 'Assignment month', 'Ramp-up', 'Growth', 'Productive share', 'Standalone revenue', 'City credit', 'Continent credit', 'Credited'].map((x, i) => h('th', { class: i ? 'num' : '' }, x)))),
      h('tbody', {}, trace.schedule.map((s) => h('tr', {}, h('td', {}, s.label), h('td', { class: 'num' }, String(s.k)), h('td', { class: 'num' }, fmtNum(s.ramp, 3)), h('td', { class: 'num' }, fmtNum(s.growth, 4)), h('td', { class: 'num' }, fmtNum(s.prod, 3)), h('td', { class: 'num' }, m(Math.round(s.standalone))), h('td', { class: 'num' }, s.cityCredit === null ? '—' : fmtNum(s.cityCredit, 2)), h('td', { class: 'num' }, s.contCredit === null ? '—' : fmtNum(s.contCredit, 2)), h('td', { class: 'num' }, m(Math.round(s.credited))))))))) : null,
    (trace.notes || []).map((n) => h('div', { class: 'note' }, n)),
  ], { wide: true, eyebrow: 'Formula inspection' });
}

export function categoryInfo(cat) {
  modal(CATEGORIES[cat]?.label || cat, h('div', { class: 'formula' }, CATEGORY_FORMULAS[cat] || ''), { eyebrow: 'How this line is calculated' });
}
export function statementInfo(key, title) {
  modal(title, h('div', { class: 'formula' }, STATEMENT_FORMULAS[key] || ''), { eyebrow: 'Formula' });
}
export const info = (onclick, label = 'Formula') => h('button', { class: 'btn ghost sm', onclick, title: 'Show the exact formula' }, `ⓘ ${label}`);

export function depStatus(d) {
  if (!d.valid) return pill('Invalid', 'bad');
  if (!d.operational) return pill(d.approval === 'blockedRecorded' ? 'Blocked (recorded)' : 'Blocked', 'bad');
  if (d.approval === 'approved') return pill(d.compliance.counts.pending ? 'Approved · docs pending' : 'Approved', d.compliance.counts.pending ? 'warn' : 'good');
  return pill('Awaiting approval', 'warn');
}
export const statusPill = (s) => pill(COMPLIANCE_STATUS[s] || s, { compliant: 'good', waived: 'info', na: 'neutral', pending: 'warn', review: 'warn', unassessed: 'neutral', noncompliant: 'bad' }[s] || 'neutral');

export function readOnlyNote(ctx, perm, what = 'change this') {
  return ctx.can(perm) ? null : h('div', { class: 'note info' }, `You can view this screen; your role cannot ${what}.`);
}

export function sourceNote(ctx) {
  const { view, doc } = ctx;
  if (doc.round2.status === 'finalised') return h('div', { class: 'note good' }, `Figures below are the live calculation of the finalised inputs. The official stored result is version ${doc.finals.at(-1).version}, finalised ${new Date(doc.finals.at(-1).at).toLocaleString('en-IN')} — exports use it.`);
  if (!view.calc.draft) return h('div', { class: 'note' }, 'Live preview: these figures update with every change, but no calculation has been recorded yet. Run the calculation on the Financial Calculation Engine screen.');
  if (!view.calc.current) return h('div', { class: 'note bad' }, 'Live preview: inputs changed after the last recorded calculation, so that calculation is outdated. Run it again before finalising.');
  return h('div', { class: 'note info' }, 'Draft result: the recorded calculation matches the current inputs. It becomes official only when a Super Administrator finalises Round 2.');
}

/**
 * What a destination offers: the continent's benefits and disadvantages, then the city's own,
 * and the regional role bonus they give together. Hidden values arrive as null or •••.
 */
export function placeBenefits(ctx, cityId, roleId = null) {
  const { doc, res } = ctx;
  const city = doc.cities.find((c) => c.id === cityId);
  if (!city) return h('div', { class: 'small muted' }, 'Choose a city to see what it offers.');
  const cont = doc.continents.find((c) => c.id === city.continentId) || {};
  const items = (list, minus = false) => (list || []).map((b) => h('li', { class: minus ? 'minus' : '' }, b.label, b.effect ? h('span', { class: 'muted' }, ` — ${b.effect}`) : null));
  const block = (title, sub, x) => h('div', {}, h('h4', {}, title), sub ? h('div', { class: 'tiny muted' }, sub) : null,
    (x.benefits || []).length || (x.disadvantages || []).length ? h('ul', {}, items(x.benefits), items(x.disadvantages, true)) : h('div', { class: 'small muted' }, 'No particular benefits listed.'),
    x.special?.active && x.special.label ? h('div', { class: 'tiny', style: { marginTop: '4px' } }, `Special: ${x.special.label}`) : null);
  const bonusLine = () => {
    if (cont.functionBonus === null || city.functionBonus === null) return 'Role bonuses: confidential.';
    const fb = (o) => Object.entries(o || {}).filter(([, v]) => Number(v)).map(([k, v]) => `${FUNCTION_LABELS[k] || k} ${v > 0 ? '+' : ''}${v}%`);
    const all = [...new Set([...Object.keys(cont.functionBonus || {}), ...Object.keys(city.functionBonus || {})])];
    const role = roleId ? doc.config.roles.find((r) => r.id === roleId) : null;
    const parts = [`Continent: ${fb(cont.functionBonus).join(', ') || 'none'}`, `${city.name}: ${fb(city.functionBonus).join(', ') || 'none'}`];
    if (role) {
      const a = Number(cont.functionBonus?.[role.function]) || 0; const b = Number(city.functionBonus?.[role.function]) || 0;
      const cap = doc.config.productivity.functionBonusCap;
      const tot = Math.max(-cap, Math.min(cap, a + b));
      parts.push(`for a ${role.name} (${FUNCTION_LABELS[role.function]}): ${a} + ${b} = ${tot > 0 ? '+' : ''}${tot}% productivity${a + b !== tot ? ` (capped at ±${cap}%)` : ''}`);
    } else if (!all.length) parts.push('no role bonus here');
    return `Regional role bonus — ${parts.join(' · ')}`;
  };
  const score = res.regions[cityId]?.opportunity?.score;
  return h('div', { class: 'place' },
    block(`${cont.name || ''} (continent)`, cont.description, cont),
    block(`${city.name} (city)`, city.description, city),
    h('div', { class: 'bonus small' }, bonusLine(), score !== undefined && score !== null ? h('span', { class: 'muted' }, ` · City opportunity score ${fmtNum(score, 1)} / 100`) : null));
}

export { m, fmtNum, pct, table, moneyEl };
