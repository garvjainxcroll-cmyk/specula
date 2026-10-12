// The economy: data releases ("data drops") and central bank decisions.
// Every published figure is built from rounded terms so the working shown on screen
// can be checked with a calculator, digit for digit.

import { ECONOMIES, ECON_ORDER, SPECIALS } from '../config/economies.mjs';
import { RULES } from '../config/rules.mjs';
import { r1, r2, r3, roundTo, roundQuarter, fmtTerm, fmtNum, sumRound } from './num.mjs';

const W = (label, expr, value, dp = 2) => ({ label, expr, value: roundTo(value, dp) });

/** Build a figure from labelled terms; result rounded to dp. */
function build(name, terms, dp = 1, { floor = null } = {}) {
  const clean = terms.filter((t) => t && t.value !== 0 || (t && t.keep));
  const raw = sumRound(clean.map((t) => t.value), 2);
  let value = roundTo(raw, dp);
  if (floor !== null && value < floor) value = floor;
  return { name, terms: clean, raw, value, dp };
}

const T = (label, expr, value, keep = false) => ({ label, expr, value: r2(value), keep });

export function startRelease() {
  const econ = {};
  for (const e of ECON_ORDER) {
    const c = ECONOMIES[e];
    const s = { ...c.start };
    const special = Object.fromEntries(SPECIALS[e].map((x) => [x.key, x.start]));
    econ[e] = { ...s, special, exp: { g: s.g, pi: s.pi, u: s.u }, work: {}, shocks: {} };
  }
  return { q: 1, econ, revisions: [], note: 'Starting position of every economy, as printed in the guide.' };
}

/**
 * The data drop for quarter q (q >= 2), built from the state after the last settlement.
 * world.econ holds last release figures + current policy rates; world.moves the market moves
 * of the last quarter. shocks = the script's data shocks for this quarter.
 */
export function computeRelease(world, q, shocks = {}) {
  const prev = world.release;
  const moves = world.moves; // { oil, copper, wheat, fx: {e: %}, markPerCrownPct, dinarPerCrownPct }
  const worldGap = r2(ECON_ORDER.reduce((a, e) => a + ECONOMIES[e].weight * (prev.econ[e].g - ECONOMIES[e].trend), 0));
  const econ = {};

  for (const e of ECON_ORDER) {
    const c = ECONOMIES[e];
    const P = prev.econ[e];
    const sh = shocks[e] || {};
    const iNow = world.econ[e].i; // the rate just set
    const out = { special: {}, work: {}, exp: {}, shocks: sh };

    // ---- figures particular to each economy (drive some of the main figures) ----
    const sp = { ...P.special };
    if (e === 'AUR') {
      const t = [T('last quarter', `${fmtNum(P.special.badLoans, 1)}`, P.special.badLoans, true),
        T('drift back to 2.0', `0.1 × (2.0 − ${fmtNum(P.special.badLoans, 1)})`, 0.1 * (2.0 - P.special.badLoans)),
        T('growth below trend raises bad loans', `−0.15 × (${fmtNum(P.g, 1)} − ${fmtNum(c.trend, 1)})`, -0.15 * (P.g - c.trend)),
        T('higher rates raise bad loans', `0.1 × ${fmtTerm(world.econ[e].di)}`, 0.1 * world.econ[e].di)];
      const expV = build('badLoans', t, 1, { floor: 0.5 }).value;
      if (sh.badLoans) t.push(T('news', fmtTerm(sh.badLoans), sh.badLoans));
      const b = build('Bank bad loans', t, 1, { floor: 0.5 });
      sp.badLoans = b.value; out.work.badLoans = b; out.exp.badLoans = expV;
    }
    if (e === 'CAL') {
      sp.markPerCrown = world.econ.CAL.markPerCrown;
      sp.reserves = Math.round(world.econ.CAL.reserves + (sh.reserves || 0));
    }
    if (e === 'VER') {
      sp.bankShare = r1(P.special.bankShare + (sh.bankShare || 0));
    }
    if (e === 'KES') {
      const k = world.econ.KES;
      const caGuess = P.ca; // reserves respond to the last current account
      const t = [T('last quarter', `${Math.round(P.special.reserves)}`, P.special.reserves, true),
        T('normal inflows', '5', 5),
        T('current account', `1.0 × ${fmtTerm(caGuess, 1)}`, 1.0 * caGuess),
        T('fear drives money out', `−1.5 × max(0, ${fmtNum(world.glob.fear, 2)} − 16)`, -1.5 * Math.max(0, world.glob.fear - 16)),
        T('rate gap with Aurelia', `2 × (${fmtNum(k.i)} − ${fmtNum(world.econ.AUR.i)} − 4)`, 2 * (k.i - world.econ.AUR.i - 4))];
      if (k.pegBroken) { t.splice(1); t.push(T('no peg to defend', '0', 0, true)); }
      const expV = Math.round(build('reserves', t, 0, { floor: 0 }).value);
      if (sh.reserves) t.push(T('news', fmtTerm(sh.reserves, 0), sh.reserves));
      const b = build('Reserves', t, 0, { floor: 0 });
      sp.reserves = Math.round(b.value); out.work.reserves = b; out.exp.reserves = expV;
      sp.dinarPerCrown = k.dinarPerCrown;
    }
    if (e === 'NOR') {
      sp.oilOutput = r1(P.special.oilOutput + (sh.oilOutput || 0));
      sp.wealthFund = Math.round(P.special.wealthFund + 5 * P.b);
    }
    if (e === 'SAR') {
      sp.harvest = Math.round(P.special.harvest + 0.2 * (100 - P.special.harvest) + (sh.harvest || 0));
      sp.copperOutput = Math.round(P.special.copperOutput + 0.2 * (100 - P.special.copperOutput) + (sh.copperOutput || 0));
    }
    out.special = sp;

    // ---- growth ----
    const G = c.growth;
    const rr = r2(iNow - P.pi);
    const gTerms = [
      T('trend growth', fmtNum(c.trend, 2), c.trend, true),
      T('momentum', `${G.rho} × (${fmtNum(P.g, 1)} − ${fmtNum(c.trend, 1)})`, G.rho * (P.g - c.trend)),
      T('cost of borrowing', `−${G.beta} × (${fmtNum(iNow)} − ${fmtNum(P.pi, 1)} − ${fmtNum(c.neutralReal)})`, -G.beta * (rr - c.neutralReal)),
      T('world demand', `${G.spill} × ${fmtTerm(worldGap)}`, G.spill * worldGap),
      G.oil ? T('oil price', `${G.oil} × ${fmtTerm(moves.oil)}`, G.oil * moves.oil) : null,
      G.copper ? T('copper price', `${G.copper} × ${fmtTerm(moves.copper)}`, G.copper * moves.copper) : null,
      G.wheat ? T('wheat price', `${G.wheat} × ${fmtTerm(moves.wheat)}`, G.wheat * moves.wheat) : null,
    ];
    if (e === 'CAL') gTerms.push(T('cheaper mark helps exports', `${G.markFx} × ${fmtTerm(moves.markPerCrownPct)}`, G.markFx * moves.markPerCrownPct));
    if (e === 'KES') gTerms.push(T('crown debts grow as the dinar falls', `−${G.crownDebt} × ${fmtTerm(moves.dinarPerCrownPct)}`, -G.crownDebt * moves.dinarPerCrownPct));
    if (e === 'NOR') { const d = r1(sp.oilOutput - P.special.oilOutput); gTerms.push(T('oil output change', `${G.oilOutput} × ${fmtTerm(d, 1)}`, G.oilOutput * d)); }
    if (e === 'SAR') { const d = sp.harvest - P.special.harvest; gTerms.push(T('harvest change', `${G.harvest} × ${fmtTerm(d, 0)}`, G.harvest * d)); }
    // the consensus knows everything except this quarter's surprises
    const gExp = build('growth', gTerms.filter((t) => t && !['oil output change', 'harvest change'].includes(t.label)), 1).value;
    if (sh.g) gTerms.push(T('news this quarter', fmtTerm(sh.g), sh.g));
    const g = build('Growth', gTerms.filter(Boolean), 1);
    out.g = g.value; out.work.g = g; out.exp.g = gExp;

    // ---- inflation ----
    const I = c.infl;
    const depr = r2(-(moves.fx[e] || 0));
    const piTerms = (gUse) => [
      T('last quarter', `${I.lam} × ${fmtNum(P.pi, 1)}`, I.lam * P.pi, true),
      T('pull to target', `${r2(1 - I.lam)} × ${fmtNum(c.target, 1)}`, (1 - I.lam) * c.target),
      T('demand pressure', `${I.alpha} × (${fmtNum(gUse, 1)} − ${fmtNum(c.trend, 1)})`, I.alpha * (gUse - c.trend)),
      T('oil price', `${I.oil} × ${fmtTerm(moves.oil)}`, I.oil * moves.oil),
      T('food prices', `${I.wheat} × ${fmtTerm(moves.wheat)}`, I.wheat * moves.wheat),
      T('currency', `${I.fx} × ${fmtTerm(depr)} (fall in the ${c.currency})`, I.fx * depr),
    ];
    const piExp = build('inflation', piTerms(gExp), 1).value;
    const pT = piTerms(g.value);
    if (sh.pi) pT.push(T('news this quarter', fmtTerm(sh.pi), sh.pi));
    const pi = build('Inflation', pT, 1);
    out.pi = pi.value; out.work.pi = pi; out.exp.pi = piExp;

    // ---- unemployment ----
    const uTerms = (gUse) => [
      T('last quarter', fmtNum(P.u, 1), P.u, true),
      T('drift to normal', `0.1 × (${fmtNum(c.uStar, 1)} − ${fmtNum(P.u, 1)})`, 0.1 * (c.uStar - P.u)),
      T('growth versus trend', `−0.15 × (${fmtNum(gUse, 1)} − ${fmtNum(c.trend, 1)})`, -0.15 * (gUse - c.trend)),
    ];
    const uExp = build('u', uTerms(gExp), 1, { floor: 1 }).value;
    const uT = uTerms(g.value);
    if (sh.u) uT.push(T('news this quarter', fmtTerm(sh.u), sh.u));
    const u = build('Unemployment', uT, 1, { floor: 1 });
    out.u = u.value; out.work.u = u; out.exp.u = uExp;

    // ---- budget balance ----
    const B = c.budget;
    const bT = [
      T('last quarter', fmtNum(P.b, 1), P.b, true),
      T('drift to normal', `0.1 × (${fmtNum(c.start.b, 1)} − ${fmtNum(P.b, 1)})`, 0.1 * (c.start.b - P.b)),
      T('tax from growth', `0.05 × (${fmtNum(g.value, 1)} − ${fmtNum(c.trend, 1)})`, 0.05 * (g.value - c.trend)),
      B.oil ? T('oil revenue', `${B.oil} × ${fmtTerm(moves.oil)}`, B.oil * moves.oil) : null,
      B.copper ? T('copper revenue', `${B.copper} × ${fmtTerm(moves.copper)}`, B.copper * moves.copper) : null,
      sh.b ? T('news this quarter', fmtTerm(sh.b), sh.b) : null,
    ].filter(Boolean);
    const b = build('Budget balance', bT, 1);
    out.b = b.value; out.work.b = b;

    // ---- current account ----
    const C = c.ca;
    const caT = [
      T('last quarter', fmtNum(P.ca, 1), P.ca, true),
      T('drift to normal', `0.1 × (${fmtNum(c.start.ca, 1)} − ${fmtNum(P.ca, 1)})`, 0.1 * (c.start.ca - P.ca)),
      C.world ? T('world demand', `${C.world} × ${fmtTerm(worldGap)}`, C.world * worldGap) : null,
      T('imports from growth', `−0.05 × (${fmtNum(g.value, 1)} − ${fmtNum(c.trend, 1)})`, -0.05 * (g.value - c.trend)),
      C.oil ? T('oil price', `${C.oil} × ${fmtTerm(moves.oil)}`, C.oil * moves.oil) : null,
      C.copper ? T('copper price', `${C.copper} × ${fmtTerm(moves.copper)}`, C.copper * moves.copper) : null,
      C.wheat ? T('wheat price', `${C.wheat} × ${fmtTerm(moves.wheat)}`, C.wheat * moves.wheat) : null,
      sh.ca ? T('news this quarter', fmtTerm(sh.ca), sh.ca) : null,
    ].filter(Boolean);
    const ca = build('Current account', caT, 1);
    out.ca = ca.value; out.work.ca = ca;

    // ---- debt ----
    const y10 = world.econ[e].y10;
    const dT = [
      T('last quarter', fmtNum(P.debt, 1), P.debt, true),
      T('interest minus nominal growth', `${fmtNum(P.debt, 1)} × (${fmtNum(y10)} − ${fmtNum(g.value, 1)} − ${fmtNum(pi.value, 1)}) ÷ 400`, P.debt * (y10 - g.value - pi.value) / 400),
      T('this quarter’s borrowing', `−${fmtTerm(b.value, 1)} ÷ 4`, -b.value / 4),
      sh.debt ? T('news this quarter', fmtTerm(sh.debt), sh.debt) : null,
    ].filter(Boolean);
    const debt = build('Debt to GDP', dT, 1);
    out.debt = debt.value; out.work.debt = debt;

    out.i = iNow;
    econ[e] = out;
  }
  return { q, econ, revisions: [], worldGap };
}

// ---------------- central banks ----------------

/** The published rule for one economy, as text with symbols (shown on the desk). */
export function ruleText(e, mods = {}) {
  const c = ECONOMIES[e];
  const R = { ...c.rule, ...(mods[e] || {}) };
  const add = R.add ? ` ${R.add > 0 ? '+' : '−'} ${Math.abs(R.add).toFixed(2)} (emergency)` : '';
  if (e === 'KES') {
    return `Target = Aurelia’s rate + ${R.premium.toFixed(2)} + ${R.a} × (inflation − ${c.target.toFixed(2)}) + ${R.b} × (growth − ${c.trend.toFixed(2)}) + ${R.reserveSens} × max(0, ${R.reserveRef} − reserves)${add}`;
  }
  const watch = R.watchAUR ? ` + ${R.watchAUR} × (Aurelia’s rate − 4.00)` : '';
  return `Target = ${R.rStar.toFixed(2)} + inflation + ${R.a} × (inflation − ${c.target.toFixed(2)}) + ${R.b} × (growth − ${c.trend.toFixed(2)})${watch}${add}`;
}
export function smoothingText(e, mods = {}) {
  const R = { ...ECONOMIES[e].rule, ...(mods[e] || {}) };
  return `New rate = ${R.rho} × last rate + ${r2(1 - R.rho)} × target, rounded to the nearest 0.25%`;
}

/**
 * One central bank decision with full working.
 * fig: { g, pi, reserves } the figures the bank reacts to. iAUR: Aurelia's new rate.
 */
export function decide(e, iOld, fig, iAUR, mods = {}) {
  const c = ECONOMIES[e];
  const R = { ...c.rule, ...(mods[e] || {}) };
  const x = r2(fig.g - c.trend);
  const terms = [];
  if (e === 'KES') {
    terms.push(W('Aurelia’s rate', fmtNum(iAUR), iAUR));
    terms.push(W('Kesh premium', fmtNum(R.premium), R.premium));
    terms.push(W('inflation gap', `${R.a} × (${fmtNum(fig.pi)} − ${fmtNum(c.target)})`, R.a * (fig.pi - c.target)));
    terms.push(W('growth gap', `${R.b} × ${fmtTerm(x)}`, R.b * x));
    terms.push(W('reserve defence', `${R.reserveSens} × max(0, ${R.reserveRef} − ${Math.round(fig.reserves)})`, R.reserveSens * Math.max(0, R.reserveRef - fig.reserves)));
  } else {
    terms.push(W('neutral rate', fmtNum(R.rStar), R.rStar));
    terms.push(W('inflation', fmtNum(fig.pi), fig.pi));
    terms.push(W('inflation gap', `${R.a} × (${fmtNum(fig.pi)} − ${fmtNum(c.target)})`, R.a * (fig.pi - c.target)));
    terms.push(W('growth gap', `${R.b} × ${fmtTerm(x)}`, R.b * x));
    if (R.watchAUR) terms.push(W('watching Aurelia', `${R.watchAUR} × (${fmtNum(iAUR)} − 4.00)`, R.watchAUR * (iAUR - 4.0)));
  }
  if (R.add) terms.push(W('emergency adjustment', fmtTerm(R.add), R.add));
  const target = sumRound(terms.map((t) => t.value), 2);
  const smoothA = r3(R.rho * iOld);
  const smoothB = r3((1 - R.rho) * target);
  const raw = r3(smoothA + smoothB);
  let iNew = Math.max(0, roundQuarter(raw));
  let override = null;
  if (typeof R.set === 'number') { override = `Emergency decision: the rule is suspended and the rate is set to ${fmtNum(R.set)}%.`; iNew = R.set; }
  const exprTarget = terms.map((t) => (t.expr.startsWith('(') || /^[−-]/.test(t.expr) ? t.expr : t.expr)).join(' + ');
  const steps = [
    `Target = ${exprTarget} = ${fmtNum(target)}`,
    `Smoothed with last quarter’s ${fmtNum(iOld)}: ${R.rho} × ${fmtNum(iOld)} + ${r2(1 - R.rho)} × ${fmtNum(target)} = ${raw.toFixed(3)}`,
    `Rounded to the nearest 0.25: ${fmtNum(iNew)}%${iNew === 0 && raw < 0.125 ? ' (rates cannot go below zero)' : ''}`,
  ];
  if (override) steps.push(override);
  return { econ: e, iOld, target, raw, iNew, change: r2(iNew - iOld), terms, steps, rule: ruleText(e, mods), mods: mods[e] || null };
}

/** All six decisions. Aurelia decides first; the others watch Aurelia's new rate. */
export function decideAll(world, figs, mods) {
  const out = {};
  out.AUR = decide('AUR', world.econ.AUR.i, figs.AUR, 0, mods);
  for (const e of ECON_ORDER) {
    if (e === 'AUR') continue;
    out[e] = decide(e, world.econ[e].i, figs[e], out.AUR.iNew, mods);
  }
  return out;
}

/** The figures a central bank reacts to: the (possibly revised) release. */
export function figsFromRelease(release, useExpected = false) {
  const f = {};
  for (const e of ECON_ORDER) {
    const r = release.econ[e];
    f[e] = useExpected
      ? { g: r.exp.g, pi: r.exp.pi, reserves: e === 'KES' ? (r.exp.reserves ?? r.special.reserves) : 0 }
      : { g: r.g, pi: r.pi, reserves: e === 'KES' ? r.special.reserves : 0 };
  }
  return f;
}

/** Copy a release and apply crisis revisions to it, keeping the original figures. */
export function reviseRelease(release, data, label) {
  const out = structuredClone(release);
  for (const [e, ch] of Object.entries(data || {})) {
    const r = out.econ[e];
    if (!r.orig) r.orig = { g: r.g, pi: r.pi, u: r.u, b: r.b, ca: r.ca, debt: r.debt, special: { ...r.special } };
    for (const [k, v] of Object.entries(ch)) {
      if (['g', 'pi', 'u', 'b', 'ca', 'debt'].includes(k)) {
        const before = r[k]; r[k] = r1(r[k] + v);
        out.revisions.push({ econ: e, key: k, from: before, to: r[k], by: v, label });
      } else {
        const before = r.special[k];
        r.special[k] = k === 'reserves' || k === 'harvest' || k === 'copperOutput' ? Math.round(before + v) : r1(before + v);
        out.revisions.push({ econ: e, key: k, from: before, to: r.special[k], by: v, label });
      }
    }
  }
  return out;
}
