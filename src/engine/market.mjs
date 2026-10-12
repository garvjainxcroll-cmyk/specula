// The markets: yields, spreads and the price of every instrument.
// Prices move only at settlement and when a crisis breaks (guide, page 01).
// Every move is built from named drivers so "Why did prices move?" is exact.

import { ECONOMIES, ECON_ORDER, START_FX } from '../config/economies.mjs';
import { INSTRUMENTS, INST } from '../config/instruments.mjs';
import { RULES } from '../config/rules.mjs';
import { r2, r4, r6, roundTo, sumRound, fmtNum, fmtTerm } from './num.mjs';

const D = (key, label, value) => ({ key, label, value: r2(value) });
const k = (x) => (x < 0 ? `−${Math.abs(x)}` : `${x}`);
const nz = (arr) => arr.filter((d) => d && d.value !== 0);
const total = (drivers) => sumRound(drivers.map((d) => d.value), 2);
const val = (x) => (x && typeof x === 'object' ? x.v : x) || 0;
const why = (x, dflt) => (x && typeof x === 'object' && x.why) || dflt;

export const cdsPrice = (s) => r4(100 * (1 - Math.exp((-4 * Math.max(0, s)) / 100)));
export const equityDrift = (e) => r2((0.5 * ECONOMIES[e].trend + ECONOMIES[e].target + 1.5) / 4);

// ---------------- yield levels ----------------

export function anchorOf(e, pi) {
  const c = ECONOMIES[e];
  return r2(c.neutralReal + c.target + 0.4 * (pi - c.target));
}

/** 2-year and 10-year yields as labelled parts. */
export function yieldParts(e, s, pi, mods = {}) {
  const c = ECONOMIES[e];
  const y2 = [
    { k: 'policy', label: 'policy rate', v: r2(0.5 * s.i) },
    { k: 'target', label: 'where the rule points next', v: r2(0.5 * s.iT) },
    { k: 'tp', label: 'term premium', v: c.yields.tp2 },
    { k: 'cp', label: 'credit risk', v: r2(0.5 * s.cp) },
  ];
  const anchor = anchorOf(e, pi);
  const y10 = [
    { k: 'policy', label: 'policy rate', v: r2(0.3 * s.i) },
    { k: 'anchor', label: 'long-run rate', v: r2(0.7 * anchor) },
    { k: 'tp', label: 'term premium', v: s.tp10 },
    { k: 'cp', label: 'credit risk', v: s.cp },
  ];
  let v2 = sumRound(y2.map((p) => p.v), 2);
  if (v2 < 0) { y2.push({ k: 'floor', label: 'yields cannot go below zero', v: r2(-v2) }); v2 = 0; }
  let v10 = sumRound(y10.map((p) => p.v), 2);
  const cap = mods[e]?.cap10;
  if (typeof cap === 'number' && v10 > cap) { y10.push({ k: 'cap', label: 'central bank yield cap', v: r2(cap - v10) }); v10 = cap; }
  if (v10 < 0) { y10.push({ k: 'floor', label: 'yields cannot go below zero', v: r2(-v10) }); v10 = 0; }
  return { y2: v2, y10: v10, y2Parts: y2, y10Parts: y10, anchor };
}

function cpFairOf(e, rel, fear, s) {
  const c = ECONOMIES[e];
  const Y = c.yields;
  const parts = [{ label: 'normal', v: Y.cpBase }];
  if (Y.debtSens) parts.push({ label: 'debt', v: r2(Y.debtSens * Math.max(0, rel.debt - Y.debtRef)) });
  parts.push({ label: 'fear', v: r2(Y.fearSens * Math.max(0, fear - 16)) });
  if (e === 'VER') parts.push({ label: 'banks selling bonds', v: r2(Y.bankShareSens * Math.max(0, Y.bankShareRef - rel.special.bankShare)) });
  if (e === 'KES') {
    parts.push({ label: 'low reserves', v: r2(Y.reserveSens * Math.max(0, Y.reserveRef - rel.special.reserves)) });
    if (s.pegBroken) parts.push({ label: 'peg broken', v: 1.0 });
  }
  if (s.defaulted) parts.push({ label: 'after default', v: 1.5 });
  return sumRound(parts.map((p) => p.v), 2);
}

// ---------------- initial market ----------------

export function initialMarket(release) {
  const econ = {};
  for (const e of ECON_ORDER) {
    const c = ECONOMIES[e];
    const R = release.econ[e];
    const s = { i: R.i, di: 0, iT: R.i, tp10: c.yields.tp10, cp: c.yields.cpBase };
    // the starting target is the rule on the starting figures; start the market there
    Object.assign(s, yieldParts(e, s, R.pi));
    if (e === 'CAL') { s.markPerCrown = 7.5; s.reserves = 3200; s.band = { ...c.band }; }
    if (e === 'KES') { s.dinarPerCrown = 50; s.pegBroken = false; }
    s.defaulted = false;
    econ[e] = s;
  }
  const A = econ.AUR;
  const glob = { fear: 16, sIG: 1.2, sHY: 4.0, sBank: 0.8, defaulted: { KES: false, VER: false, BANKS: false } };
  Object.assign(glob, derivedAUR(A, release.econ.AUR.pi));
  glob.sKES = r2(econ.KES.cp + 0.5);
  glob.sVER = r2(econ.VER.cp + 0.2);
  const fx = { ...START_FX };
  const lp = {};
  for (const x of INSTRUMENTS) if (x.startLocal) lp[x.id] = x.startLocal;
  lp.FEAR = glob.fear;
  const cds = { KESCDS: cdsPrice(glob.sKES), VERCDS: cdsPrice(glob.sVER), BANKCDS: cdsPrice(glob.sBank) };
  const fut = {};
  for (const e of ECON_ORDER) fut[e] = r2(100 - econ[e].i);
  return { econ, glob, px: { lp, fx, cds, fut } };
}

function derivedAUR(A, pi) {
  const c = ECONOMIES.AUR;
  const be = r2(0.5 * pi + 0.5 * c.target);
  const ry = r2(A.y10 - be);
  const y5 = r2((A.y2 + A.y10) / 2);
  return { be, ry, y5 };
}

function creditYields(glob, KES) {
  return {
    yCB: r2(glob.y5 + glob.sKES),
    yIG: r2(glob.y5 + glob.sIG),
    yHY: r2(glob.y5 + glob.sHY),
  };
}

// ---------------- prices in rupees ----------------

export function rupeePrice(mkt, id) {
  const x = INST[id];
  if (x.kind === 'fx') return mkt.px.fx[x.econ];
  if (x.kind === 'future') return mkt.px.fut[x.econ];
  if (x.kind === 'cds') return mkt.px.cds[id];
  const lp = mkt.px.lp[id];
  return x.ccy ? lp * mkt.px.fx[x.ccy] : lp;
}

/** What holding each instrument earns or costs, % a year, at current yields and rates. */
export function carryRates(mkt) {
  const out = {};
  const g = mkt.glob;
  const cy = creditYields(g);
  for (const x of INSTRUMENTS) {
    const s = x.econ ? mkt.econ[x.econ] : null;
    let rate = 0; let label = 'pays nothing beyond its price change';
    switch (x.kind) {
      case 'bond2': rate = s.y2; label = 'interest at the 2-year yield'; break;
      case 'bond10': rate = s.y10; label = 'interest at the 10-year yield'; break;
      case 'ilb': rate = g.ry; label = 'interest at the real yield (inflation is added to the price)'; break;
      case 'crownbond': rate = cy.yCB; label = 'interest at the Crown Bond yield'; break;
      case 'ig': rate = cy.yIG; label = 'interest at the investment-grade yield'; break;
      case 'hy': rate = cy.yHY; label = 'interest at the high-yield yield'; break;
      case 'fx': rate = s.i; label = `${ECONOMIES[x.econ].name}’s short-term rate`; break;
      case 'fear': rate = r2(-RULES.fearFeePct * 4); label = `a fee of ${fmtNum(RULES.fearFeePct)}% a quarter`; break;
      case 'cds': {
        const sp = x.entity === 'KES' ? g.sKES : x.entity === 'VER' ? g.sVER : g.sBank;
        rate = r2(-sp); label = 'the premium, on the amount protected'; break;
      }
      default: break;
    }
    out[x.id] = { rate, label };
  }
  return out;
}

// ---------------- market expectation (for rate futures and early repricing) ----------------

export function marketFigs(release) {
  // what forecasters expected, plus any official revisions announced since
  const f = {};
  for (const e of ECON_ORDER) {
    const r = release.econ[e];
    const o = r.orig || r;
    const reservesExp = r.exp.reserves ?? r.special.reserves;
    f[e] = {
      g: r2(r.exp.g + (r.g - o.g)),
      pi: r2(r.exp.pi + (r.pi - o.pi)),
      reserves: e === 'KES' ? reservesExp + ((r.special.reserves ?? 0) - (o.special?.reserves ?? r.special.reserves)) : 0,
    };
  }
  return f;
}

// ---------------- crowd-independent market moves ----------------

function fxPart(e, pi) { return D('inflation', `inflation gap with the rupee: −(${fmtNum(pi, 1)} − ${fmtNum(RULES.rupeeInflationPct, 1)}) ÷ 4`, -(pi - RULES.rupeeInflationPct) / 4); }

/**
 * Settlement: central banks have acted (decisions), prices reset.
 * world = state at the bell; rel = (revised) release; news = script settlement news.
 */
export function settleMarket(world, rel, decisions, news = {}, mods = {}) {
  const old = world.mkt;
  const econ = structuredClone(old.econ);
  const glob = structuredClone(old.glob);
  const n = (k, e) => (e ? news[k]?.[e] : news[k]);
  const orig = (e, k) => (rel.econ[e].orig ? rel.econ[e].orig[k] : rel.econ[e][k]);
  const gs = {}; const ps = {};
  for (const e of ECON_ORDER) { gs[e] = r2(orig(e, 'g') - rel.econ[e].exp.g); ps[e] = r2(orig(e, 'pi') - rel.econ[e].exp.pi); }
  const worldGS = r2(ECON_ORDER.reduce((a, e) => a + ECONOMIES[e].weight * gs[e], 0));
  const delta = (e, k) => rel.econ[e].delta?.[k] || 0;

  // fear
  const fearD = [D('base', 'normal level', 16), ...nz([D('calm', `half of last level’s gap from normal: 0.5 × (${fmtNum(old.glob.fear)} − 16)`, 0.5 * (old.glob.fear - 16)),
    D('growth', `world growth surprise −3 × ${fmtTerm(worldGS)}`, -3 * worldGS), D('news', why(n('fear'), 'market news'), val(n('fear')))])];
  let fearNew = total(fearD);
  if (fearNew < 10) { fearD.push(D('floor', 'the Fear Index never falls below 10', 10 - fearNew)); fearNew = 10; }
  const dFear = r2(fearNew - old.glob.fear);
  glob.fear = fearNew;

  // commodities
  const oilD = nz([D('drift', 'normal drift', 1.0), D('demand', `world growth surprise 4.0 × ${fmtTerm(worldGS)}`, 4 * worldGS),
    D('supply', `Norvik output change −10 × ${fmtTerm(delta('NOR', 'oilOutput'), 1)}`, -10 * delta('NOR', 'oilOutput')),
    D('news', why(n('oil'), 'supply news'), val(n('oil')))]);
  const oil = total(oilD);
  const copperD = nz([D('drift', 'normal drift', 1.0), D('calder', `Calder growth surprise 3.0 × ${fmtTerm(gs.CAL)}`, 3 * gs.CAL),
    D('demand', `world growth surprise 1.5 × ${fmtTerm(worldGS)}`, 1.5 * worldGS),
    D('supply', `Sarvan copper output −0.3 × ${fmtTerm(delta('SAR', 'copperOutput'), 0)}`, -0.3 * delta('SAR', 'copperOutput')),
    D('news', why(n('copper'), 'market news'), val(n('copper')))]);
  const copper = total(copperD);
  const wheatD = nz([D('drift', 'normal drift', 1.0), D('harvest', `Sarvan harvest −0.5 × ${fmtTerm(delta('SAR', 'harvest'), 0)}`, -0.5 * delta('SAR', 'harvest')),
    D('oil', `fuel and fertiliser 0.15 × ${fmtTerm(oil)}`, 0.15 * oil), D('news', why(n('wheat'), 'market news'), val(n('wheat')))]);
  const wheat = total(wheatD);

  // rates and yields
  const yieldsOld = {}; const yieldsNew = {};
  for (const e of ECON_ORDER) {
    const s = econ[e];
    const d = decisions[e];
    yieldsOld[e] = { y2: old.econ[e].y2, y10: old.econ[e].y10, y2Parts: old.econ[e].y2Parts, y10Parts: old.econ[e].y10Parts };
    s.di = r2(d.iNew - s.i); s.i = d.iNew; s.iT = d.target;
    const c = ECONOMIES[e];
    s.tp10 = r2(s.tp10 + 0.2 * (c.yields.tp10 - s.tp10) + val(n('tp10', e)));
    const fair = cpFairOf(e, rel.econ[e], fearNew, s);
    s.cp = r2(Math.max(-0.5, s.cp + 0.3 * (fair - s.cp) + val(n('cp', e))));
    Object.assign(s, yieldParts(e, s, rel.econ[e].pi, mods));
    yieldsNew[e] = { y2: s.y2, y10: s.y10 };
  }
  const A = econ.AUR;
  const aurOld = { be: old.glob.be, ry: old.glob.ry, y5: old.glob.y5 };
  Object.assign(glob, derivedAUR(A, rel.econ.AUR.pi));
  const bl = rel.econ.AUR.special.badLoans;
  const fairIG = r2(1.2 + 0.25 * Math.max(0, bl - 2) + 0.03 * Math.max(0, fearNew - 16));
  const fairHY = r2(4.0 + 1.0 * Math.max(0, bl - 2) + 0.15 * Math.max(0, fearNew - 16) + 0.3 * Math.max(0, ECONOMIES.AUR.trend - rel.econ.AUR.g));
  const fairBank = r2(0.8 + 0.5 * Math.max(0, bl - 2.0) + 0.04 * Math.max(0, fearNew - 16) + (glob.defaulted.BANKS ? 1.0 : 0));
  const cyOld = creditYields(old.glob);
  glob.sIG = r2(Math.max(0.3, glob.sIG + 0.3 * (fairIG - glob.sIG) + val(n('sIG'))));
  glob.sHY = r2(Math.max(1.5, glob.sHY + 0.3 * (fairHY - glob.sHY) + val(n('sHY'))));
  glob.sBank = r2(Math.max(0.2, glob.sBank + 0.3 * (fairBank - glob.sBank) + val(n('sBank'))));
  glob.sKES = r2(econ.KES.cp + 0.5);
  glob.sVER = r2(econ.VER.cp + 0.2);
  const cyNew = creditYields(glob);

  const dy = (e, k) => r2(econ[e][k] - old.econ[e][k]);
  const dRy = r2(glob.ry - aurOld.ry);

  const goldD = nz([D('drift', 'normal drift', 1.0), D('fear', `fear 0.3 × ${fmtTerm(dFear)}`, 0.3 * dFear),
    D('realyield', `Aurelian real yield −3.0 × ${fmtTerm(dRy)}`, -3 * dRy),
    D('inflation', `Aurelian inflation surprise 0.5 × ${fmtTerm(ps.AUR)}`, 0.5 * ps.AUR), D('news', why(n('gold'), 'market news'), val(n('gold')))]);
  const gold = total(goldD);

  // equities (local currency)
  const eq = {}; const eqD = {};
  for (const e of ECON_ORDER) {
    const c = ECONOMIES[e];
    const mu = equityDrift(e);
    const d = nz([D('drift', 'normal profit growth', mu), D('growth', `growth surprise 1.5 × ${fmtTerm(gs[e])}`, 1.5 * gs[e]),
      D('rates', `10-year yield −2.5 × ${fmtTerm(dy(e, 'y10'))}`, -2.5 * dy(e, 'y10')),
      D('fear', `fear −0.4 × ${c.equity.beta} × ${fmtTerm(dFear)}`, -0.4 * c.equity.beta * dFear),
      c.equity.oil ? D('oil', `oil ${k(c.equity.oil)} × ${fmtTerm(oil)}`, c.equity.oil * oil) : null,
      c.equity.copper ? D('copper', `copper ${k(c.equity.copper)} × ${fmtTerm(copper)}`, c.equity.copper * copper) : null,
      D('news', why(n('eq', e), 'company news'), val(n('eq', e)))]);
    eqD[e] = d; eq[e] = total(d);
  }
  const muA = equityDrift('AUR'); const muN = equityDrift('NOR');
  const dCurve = r2(dy('AUR', 'y10') - dy('AUR', 'y2'));
  const dBl = rel.econ.AUR.delta?.badLoans || 0;
  const banksD = nz([D('drift', 'normal profit growth', muA), D('market', `1.2 × the rest of Aurelia’s market move ${fmtTerm(eq.AUR - muA)}`, 1.2 * (eq.AUR - muA)),
    D('curve', `steeper yield curve 3.0 × ${fmtTerm(dCurve)}`, 3 * dCurve), D('badloans', `bad loans −3.0 × ${fmtTerm(dBl, 1)}`, -3 * dBl),
    D('news', why(n('banks'), 'bank news'), val(n('banks')))]);
  const energyD = nz([D('drift', 'normal profit growth', muN), D('market', `0.5 × the rest of Norvik’s market move ${fmtTerm(eq.NOR - muN)}`, 0.5 * (eq.NOR - muN)),
    D('oil', `oil 0.6 × ${fmtTerm(oil)}`, 0.6 * oil), D('news', why(n('energy'), 'company news'), val(n('energy')))]);

  // currencies (₹ per unit)
  const fxD = {};
  const di = (e) => econ[e].di;
  const dcp = (e) => r2(econ[e].cp - old.econ[e].cp);
  fxD.AUR = nz([fxPart('AUR', rel.econ.AUR.pi), D('rates', `rate change 2.0 × ${fmtTerm(di('AUR'))}`, 2 * di('AUR')),
    D('fear', `safe haven 0.10 × ${fmtTerm(dFear)}`, 0.1 * dFear), D('news', why(n('fx', 'AUR'), 'money flows'), val(n('fx', 'AUR')))]);
  fxD.VER = nz([fxPart('VER', rel.econ.VER.pi), D('rates', `rate change 2.0 × ${fmtTerm(di('VER'))}`, 2 * di('VER')),
    D('fear', `safe haven 0.05 × ${fmtTerm(dFear)}`, 0.05 * dFear), D('credit', `credit risk −1.5 × ${fmtTerm(dcp('VER'))}`, -1.5 * dcp('VER')),
    D('news', why(n('fx', 'VER'), 'money flows'), val(n('fx', 'VER')))]);
  fxD.NOR = nz([fxPart('NOR', rel.econ.NOR.pi), D('rates', `rate change 2.0 × ${fmtTerm(di('NOR'))}`, 2 * di('NOR')),
    D('oil', `oil 0.25 × ${fmtTerm(oil)}`, 0.25 * oil), D('fear', `fear −0.03 × ${fmtTerm(dFear)}`, -0.03 * dFear),
    D('news', why(n('fx', 'NOR'), 'money flows'), val(n('fx', 'NOR')))]);
  fxD.SAR = nz([fxPart('SAR', rel.econ.SAR.pi), D('rates', `rate change 2.0 × ${fmtTerm(di('SAR'))}`, 2 * di('SAR')),
    D('wheat', `wheat 0.12 × ${fmtTerm(wheat)}`, 0.12 * wheat), D('copper', `copper 0.12 × ${fmtTerm(copper)}`, 0.12 * copper),
    D('fear', `fear −0.12 × ${fmtTerm(dFear)}`, -0.12 * dFear), D('credit', `credit risk −1.0 × ${fmtTerm(dcp('SAR'))}`, -1.0 * dcp('SAR')),
    D('news', why(n('fx', 'SAR'), 'money flows'), val(n('fx', 'SAR')))]);
  const fx = { ...old.px.fx };
  const fxPct = {};
  for (const e of ['AUR', 'VER', 'NOR', 'SAR']) { fxPct[e] = total(fxD[e]); fx[e] = r6(old.px.fx[e] * (1 + fxPct[e] / 100)); }
  // Calder: the mark moves against the crown inside its band
  {
    const C = econ.CAL;
    const pressD = nz([D('rates', `Calder rate change versus Aurelia’s −2.0 × (${fmtTerm(di('CAL'))} − ${fmtTerm(di('AUR'))})`, -2 * (di('CAL') - di('AUR'))),
      D('news', why(n('fx', 'CAL'), 'trade flows'), val(n('fx', 'CAL')) * -1)]);
    const press = total(pressD); // % rise in marks per crown (a weaker mark)
    const res = bandMove(C, press);
    fx.CAL = r6(fx.AUR / res.mpc);
    const crownPct = fxPct.AUR;
    fxPct.CAL = r2(((fx.CAL / old.px.fx.CAL) - 1) * 100);
    fxD.CAL = nz([D('crown', `follows the crown ${fmtTerm(crownPct)}`, crownPct),
      D('band', `moves within its band: marks per crown ${fmtNum(C.markPerCrown, 4)} → ${fmtNum(res.mpc, 4)}`, fxPct.CAL - crownPct)]);
    fxD.CAL.band = { press, ...res };
    C.markPerCrown = res.mpc; C.reserves = Math.round(C.reserves + res.reserveChange);
  }
  // Kesh: pegged at 50 dinars to the crown until the peg breaks
  {
    const K = econ.KES;
    if (!K.pegBroken) {
      fx.KES = r6(fx.AUR / K.dinarPerCrown);
      fxPct.KES = r2(((fx.KES / old.px.fx.KES) - 1) * 100);
      fxD.KES = [D('peg', `pegged at ${fmtNum(K.dinarPerCrown, 2)} to the crown, so it moves with the crown`, fxPct.KES)];
    } else {
      fxD.KES = nz([fxPart('KES', rel.econ.KES.pi), D('rates', `rate change 2.0 × ${fmtTerm(di('KES'))}`, 2 * di('KES')),
        D('credit', `credit risk −2.0 × ${fmtTerm(dcp('KES'))}`, -2 * dcp('KES')), D('fear', `fear −0.10 × ${fmtTerm(dFear)}`, -0.1 * dFear),
        D('news', why(n('fx', 'KES'), 'money flows'), val(n('fx', 'KES')))]);
      fxPct.KES = total(fxD.KES); fx.KES = r6(old.px.fx.KES * (1 + fxPct.KES / 100));
      K.dinarPerCrown = r2(fx.AUR / fx.KES);
    }
  }

  // instrument local returns
  const rets = {};
  const lp = { ...old.px.lp };
  const set = (id, drivers) => { const pct = total(drivers); rets[id] = { local: { pct, drivers } }; lp[id] = r6(old.px.lp[id] * (1 + pct / 100)); };
  for (const e of ECON_ORDER) {
    const d2 = dy(e, 'y2'); const d10 = dy(e, 'y10');
    set(`${e}2Y`, [D('yield', `2-year yield change: −1.9 × ${fmtTerm(d2)}`, -1.9 * d2)].filter((d) => d.value !== 0));
    set(`${e}10Y`, [D('yield', `10-year yield change: −8.0 × ${fmtTerm(d10)}`, -8.0 * d10)].filter((d) => d.value !== 0));
    rets[`${e}2Y`].yieldChange = { from: old.econ[e].y2, to: econ[e].y2, parts: partsDelta(old.econ[e].y2Parts, econ[e].y2Parts) };
    rets[`${e}10Y`].yieldChange = { from: old.econ[e].y10, to: econ[e].y10, parts: partsDelta(old.econ[e].y10Parts, econ[e].y10Parts) };
    set(`${e}EQ`, eqD[e]);
  }
  set('AURIL10', nz([D('realyield', `real yield change: −8.5 × ${fmtTerm(dRy)}`, -8.5 * dRy),
    D('inflation', `inflation added to the price: ${fmtNum(rel.econ.AUR.pi, 1)} ÷ 4`, rel.econ.AUR.pi / 4)]));
  const dCB = r2(cyNew.yCB - cyOld.yCB); const dIG = r2(cyNew.yIG - cyOld.yIG); const dHY = r2(cyNew.yHY - cyOld.yHY);
  set('KESCB5', nz([D('yield', `Crown Bond yield change (Aurelian 5-year + Kesh spread): −4.5 × ${fmtTerm(dCB)}`, -4.5 * dCB)]));
  set('AURIG', nz([D('yield', `yield change (Aurelian 5-year + spread): −6.0 × ${fmtTerm(dIG)}`, -6.0 * dIG)]));
  set('AURHY', nz([D('yield', `yield change (Aurelian 5-year + spread): −4.0 × ${fmtTerm(dHY)}`, -4.0 * dHY),
    D('defaults', 'weaker companies failing to pay', -0.75)]));
  set('AURBANKS', banksD);
  set('NORENERGY', energyD);
  set('OIL', oilD); set('COPPER', copperD); set('WHEAT', wheatD); set('GOLD', goldD);
  lp.FEAR = fearNew;
  rets.FEAR = { local: { pct: r2((fearNew / old.px.lp.FEAR - 1) * 100), drivers: fearD, level: { from: old.glob.fear, to: fearNew } } };
  for (const e of ECON_ORDER) {
    const id = INSTRUMENTS.find((x) => x.kind === 'fx' && x.econ === e).id;
    rets[id] = { local: { pct: fxPct[e], drivers: fxD[e] } };
  }
  // futures settle at 100 minus the actual rate
  const fut = { ...old.px.fut };
  for (const e of ECON_ORDER) {
    const S = r2(100 - econ[e].i);
    rets[`${e}FUT`] = { points: r2(S - old.px.fut[e]), from: old.px.fut[e], to: S,
      local: { pct: 0, drivers: [D('settle', `settles at 100 − ${fmtNum(econ[e].i)} = ${fmtNum(S)}; the market had expected ${fmtNum(100 - old.px.fut[e])}%`, S - old.px.fut[e])] } };
    fut[e] = S;
  }
  const cds = { ...old.px.cds };
  for (const [id, key, label] of [['KESCDS', 'sKES', 'Kesh'], ['VERCDS', 'sVER', 'Verana'], ['BANKCDS', 'sBank', 'Aurelian banks']]) {
    const p = cdsPrice(glob[key]);
    rets[id] = { points: r4(p - old.px.cds[id]), from: old.px.cds[id], to: p, spread: { from: old.glob[key], to: glob[key] },
      local: { pct: 0, drivers: [D('spread', `${label} default risk ${fmtNum(old.glob[key])}% → ${fmtNum(glob[key])}% a year`, p - old.px.cds[id])] } };
    cds[id] = p;
  }

  // currency effect on instruments priced in another currency
  for (const x of INSTRUMENTS) if (x.ccy && rets[x.id]) rets[x.id].fx = { ccy: x.ccy, pct: fxPct[x.ccy] };

  const moves = { oil, copper, wheat, fx: fxPct,
    markPerCrownPct: r2((econ.CAL.markPerCrown / old.econ.CAL.markPerCrown - 1) * 100),
    dinarPerCrownPct: r2((econ.KES.dinarPerCrown / old.econ.KES.dinarPerCrown - 1) * 100) };
  const mkt = { econ, glob, px: { lp, fx, cds, fut } };
  return { mkt, rets, info: { worldGS, gs, ps, dFear, fear: fearNew, oil, copper, wheat, gold, yieldsOld, yieldsNew }, moves };
}

function partsDelta(oldParts = [], newParts = []) {
  const keys = new Set([...oldParts.map((p) => p.k), ...newParts.map((p) => p.k)]);
  const out = [];
  for (const k of keys) {
    const a = oldParts.find((p) => p.k === k); const b = newParts.find((p) => p.k === k);
    const d = r2((b?.v || 0) - (a?.v || 0));
    if (d !== 0) out.push({ k, label: (b || a).label, change: d });
  }
  return out;
}

/** Move Calder's marks-per-crown by press% and keep it inside the band; reserves pay for it. */
export function bandMove(C, pressPct) {
  const lo = r4(C.band.centre * (1 - C.band.width / 100));
  const hi = r4(C.band.centre * (1 + C.band.width / 100));
  const want = r6(C.markPerCrown * (1 + pressPct / 100));
  const mpc = r4(Math.min(hi, Math.max(lo, want)));
  // selling reserves to stop a fall costs ₵60 bn for each 1% held back
  const heldPct = r2((want / mpc - 1) * 100);
  return { mpc, want, lo, hi, heldPct, reserveChange: Math.round(-60 * heldPct) };
}

/**
 * A crisis stage breaks during the window. Prices react at once.
 * relBefore/relAfter: release before and after the stage's revisions;
 * expBefore/expAfter: market-expected decisions before and after (rules may change).
 */
export function crisisMarket(world, stage, relBefore, relAfter, expBefore, expAfter, mods) {
  const old = world.mkt;
  const econ = structuredClone(old.econ);
  const glob = structuredClone(old.glob);
  const st = stage.state || {};
  const J = stage.jumps || {};
  const jx = (k, e) => (e ? J[k]?.[e] : J[k]) || 0;
  const label = stage.title;

  const fearNew = Math.max(10, r2(old.glob.fear + (st.fear || 0)));
  const dFear = r2(fearNew - old.glob.fear); glob.fear = fearNew;
  const dEi = {}; const dIT = {};
  for (const e of ECON_ORDER) {
    dEi[e] = r2(expAfter[e].iNew - expBefore[e].iNew);
    dIT[e] = r2(expAfter[e].target - expBefore[e].target);
  }
  for (const e of ECON_ORDER) {
    const s = econ[e];
    s.tp10 = r2(s.tp10 + (st.tp10?.[e] || 0));
    s.cp = r2(s.cp + (st.cp?.[e] || 0));
    const dPi = r2(relAfter.econ[e].pi - relBefore.econ[e].pi);
    const dcp = r2(s.cp - old.econ[e].cp);
    // yields reprice now on what the market now expects the central bank to do
    s.y2Parts = [...s.y2Parts, { k: `c${stage.id}`, label: `crisis: ${label}`, v: r2(0.5 * dEi[e] + 0.5 * dIT[e] + 0.5 * dcp) }];
    s.y2 = r2(Math.max(0, s.y2 + 0.5 * dEi[e] + 0.5 * dIT[e] + 0.5 * dcp));
    let y10 = r2(s.y10 + 0.3 * dEi[e] + 0.28 * dPi + (st.tp10?.[e] || 0) + dcp);
    const cap = mods[e]?.cap10;
    if (typeof cap === 'number' && y10 > cap) y10 = cap;
    s.y10Parts = [...s.y10Parts, { k: `c${stage.id}`, label: `crisis: ${label}`, v: r2(y10 - s.y10) }];
    s.y10 = Math.max(0, y10);
  }
  if (stage.band) econ.CAL.band = { ...econ.CAL.band, ...stage.band };
  if (stage.defaultEntity === 'KES' || stage.defaultEntity === 'VER') econ[stage.defaultEntity].defaulted = true;

  const aurOld = { ry: old.glob.ry };
  Object.assign(glob, derivedAUR(econ.AUR, relAfter.econ.AUR.pi));
  const cyOld = creditYields(old.glob);
  glob.sIG = r2(Math.max(0.3, glob.sIG + (st.sIG || 0)));
  glob.sHY = r2(Math.max(1.5, glob.sHY + (st.sHY || 0)));
  glob.sBank = r2(Math.max(0.2, glob.sBank + (st.sBank || 0)));
  glob.sKES = r2(econ.KES.cp + 0.5);
  glob.sVER = r2(econ.VER.cp + 0.2);
  const cyNew = creditYields(glob);
  const dy = (e, k) => r2(econ[e][k] - old.econ[e][k]);
  const dRy = r2(glob.ry - aurOld.ry);

  const rets = {};
  const lp = { ...old.px.lp };
  const set = (id, drivers) => { const pct = total(drivers); rets[id] = { local: { pct, drivers } }; lp[id] = r6(old.px.lp[id] * (1 + pct / 100)); };
  const hc = (id) => (stage.haircuts?.[id] ? D('default', `default: bondholders lose ${fmtNum(-stage.haircuts[id], 0)}%`, stage.haircuts[id]) : null);
  const C = (txt) => `${label}: ${txt}`;

  const oil = r2(jx('oil')); const copper = r2(jx('copper')); const wheat = r2(jx('wheat'));
  const eqMove = {};
  for (const e of ECON_ORDER) {
    const c = ECONOMIES[e];
    const d10 = dy(e, 'y10'); const d2 = dy(e, 'y2');
    set(`${e}2Y`, nz([D('yield', C(`2-year yield ${fmtSigned(d2)}: −1.9 × ${fmtTerm(d2)}`), -1.9 * d2), hc(`${e}2Y`)]));
    set(`${e}10Y`, nz([D('yield', C(`10-year yield ${fmtSigned(d10)}: −8.0 × ${fmtTerm(d10)}`), -8.0 * d10), hc(`${e}10Y`)]));
    const dEq = nz([D('shock', C('first reaction'), jx('eq', e)), D('rates', `10-year yield −2.5 × ${fmtTerm(d10)}`, -2.5 * d10),
      D('fear', `fear −0.4 × ${c.equity.beta} × ${fmtTerm(dFear)}`, -0.4 * c.equity.beta * dFear),
      c.equity.oil ? D('oil', `oil ${k(c.equity.oil)} × ${fmtTerm(oil)}`, c.equity.oil * oil) : null,
      c.equity.copper ? D('copper', `copper ${k(c.equity.copper)} × ${fmtTerm(copper)}`, c.equity.copper * copper) : null]);
    set(`${e}EQ`, dEq); eqMove[e] = rets[`${e}EQ`].local.pct;
  }
  set('AURIL10', nz([D('realyield', C(`real yield −8.5 × ${fmtTerm(dRy)}`), -8.5 * dRy)]));
  const dCB = r2(cyNew.yCB - cyOld.yCB); const dIG = r2(cyNew.yIG - cyOld.yIG); const dHY = r2(cyNew.yHY - cyOld.yHY);
  set('KESCB5', nz([D('yield', C(`Crown Bond yield −4.5 × ${fmtTerm(dCB)}`), -4.5 * dCB), hc('KESCB5')]));
  set('AURIG', nz([D('yield', C(`yield −6.0 × ${fmtTerm(dIG)}`), -6.0 * dIG)]));
  set('AURHY', nz([D('yield', C(`yield −4.0 × ${fmtTerm(dHY)}`), -4.0 * dHY)]));
  const dCurve = r2(dy('AUR', 'y10') - dy('AUR', 'y2'));
  set('AURBANKS', nz([D('market', `1.2 × Aurelia’s market move ${fmtTerm(eqMove.AUR)}`, 1.2 * eqMove.AUR),
    D('curve', `yield curve 3.0 × ${fmtTerm(dCurve)}`, 3 * dCurve), D('shock', C('bank shares'), jx('banks'))]));
  set('NORENERGY', nz([D('market', `0.5 × Norvik’s market move ${fmtTerm(eqMove.NOR)}`, 0.5 * eqMove.NOR),
    D('oil', `oil 0.6 × ${fmtTerm(oil)}`, 0.6 * oil), D('shock', C('energy shares'), jx('energy'))]));
  set('OIL', nz([D('shock', C('oil'), oil)]));
  set('COPPER', nz([D('shock', C('copper'), copper)]));
  set('WHEAT', nz([D('shock', C('wheat'), wheat)]));
  set('GOLD', nz([D('fear', `fear 0.3 × ${fmtTerm(dFear)}`, 0.3 * dFear), D('realyield', `real yield −3.0 × ${fmtTerm(dRy)}`, -3 * dRy), D('shock', C('gold'), jx('gold'))]));
  lp.FEAR = fearNew;
  rets.FEAR = { local: { pct: r2((fearNew / old.px.lp.FEAR - 1) * 100), drivers: [D('shock', C(`Fear Index ${fmtNum(old.glob.fear)} → ${fmtNum(fearNew)}`), r2((fearNew / old.px.lp.FEAR - 1) * 100))], level: { from: old.glob.fear, to: fearNew } } };

  // currencies
  const fxD = {}; const fx = { ...old.px.fx }; const fxPct = {};
  const dcp = (e) => r2(econ[e].cp - old.econ[e].cp);
  fxD.AUR = nz([D('shock', C('money flows'), jx('fx', 'AUR')), D('rates', `expected rate change 2.0 × ${fmtTerm(dEi.AUR)}`, 2 * dEi.AUR), D('fear', `safe haven 0.10 × ${fmtTerm(dFear)}`, 0.1 * dFear)]);
  fxD.VER = nz([D('shock', C('money flows'), jx('fx', 'VER')), D('rates', `expected rate change 2.0 × ${fmtTerm(dEi.VER)}`, 2 * dEi.VER), D('fear', `0.05 × ${fmtTerm(dFear)}`, 0.05 * dFear), D('credit', `credit risk −1.5 × ${fmtTerm(dcp('VER'))}`, -1.5 * dcp('VER'))]);
  fxD.NOR = nz([D('shock', C('money flows'), jx('fx', 'NOR')), D('rates', `expected rate change 2.0 × ${fmtTerm(dEi.NOR)}`, 2 * dEi.NOR), D('oil', `oil 0.25 × ${fmtTerm(oil)}`, 0.25 * oil), D('fear', `−0.03 × ${fmtTerm(dFear)}`, -0.03 * dFear)]);
  fxD.SAR = nz([D('shock', C('money flows'), jx('fx', 'SAR')), D('rates', `expected rate change 2.0 × ${fmtTerm(dEi.SAR)}`, 2 * dEi.SAR), D('wheat', `wheat 0.12 × ${fmtTerm(wheat)}`, 0.12 * wheat), D('copper', `copper 0.12 × ${fmtTerm(copper)}`, 0.12 * copper), D('fear', `−0.12 × ${fmtTerm(dFear)}`, -0.12 * dFear), D('credit', `credit risk −1.0 × ${fmtTerm(dcp('SAR'))}`, -1.0 * dcp('SAR'))]);
  for (const e of ['AUR', 'VER', 'NOR', 'SAR']) { fxPct[e] = total(fxD[e]); fx[e] = r6(old.px.fx[e] * (1 + fxPct[e] / 100)); }
  {
    const Cc = econ.CAL;
    const press = r2(-(jx('fx', 'CAL')) - 2 * (dEi.CAL - dEi.AUR));
    const res = bandMove(Cc, press);
    fx.CAL = r6(fx.AUR / res.mpc);
    fxPct.CAL = r2((fx.CAL / old.px.fx.CAL - 1) * 100);
    fxD.CAL = nz([D('crown', `follows the crown ${fmtTerm(fxPct.AUR)}`, fxPct.AUR), D('band', `moves within its band: marks per crown ${fmtNum(Cc.markPerCrown, 4)} → ${fmtNum(res.mpc, 4)}`, fxPct.CAL - fxPct.AUR)]);
    Cc.markPerCrown = res.mpc; Cc.reserves = Math.round(Cc.reserves + res.reserveChange);
  }
  {
    const K = econ.KES;
    if (!K.pegBroken && !stage.pegBreak) {
      fx.KES = r6(fx.AUR / K.dinarPerCrown); fxPct.KES = r2((fx.KES / old.px.fx.KES - 1) * 100);
      fxD.KES = [D('peg', 'the peg holds: the dinar moves with the crown', fxPct.KES)].filter((d) => d.value !== 0);
    } else {
      fxD.KES = nz([D('shock', C(stage.pegBreak ? 'the peg breaks' : 'money flows'), jx('fx', 'KES')), D('crown', `the crown ${fmtTerm(fxPct.AUR)}`, stage.pegBreak && !K.pegBroken ? fxPct.AUR : 0),
        D('rates', `expected rate change 2.0 × ${fmtTerm(dEi.KES)}`, 2 * dEi.KES), D('credit', `credit risk −2.0 × ${fmtTerm(dcp('KES'))}`, -2 * dcp('KES')), D('fear', `−0.10 × ${fmtTerm(dFear)}`, -0.1 * dFear)]);
      fxPct.KES = total(fxD.KES); fx.KES = r6(old.px.fx.KES * (1 + fxPct.KES / 100));
      K.pegBroken = true; K.dinarPerCrown = r2(fx.AUR / fx.KES);
    }
  }
  for (const e of ECON_ORDER) {
    const id = INSTRUMENTS.find((x) => x.kind === 'fx' && x.econ === e).id;
    rets[id] = { local: { pct: fxPct[e], drivers: fxD[e] } };
  }
  const fut = { ...old.px.fut };
  for (const e of ECON_ORDER) {
    const F = r2(old.px.fut[e] - dEi[e]);
    rets[`${e}FUT`] = { points: r2(F - old.px.fut[e]), from: old.px.fut[e], to: F,
      local: { pct: 0, drivers: dEi[e] ? [D('expect', C(`the market now expects ${fmtNum(expAfter[e].iNew)}% instead of ${fmtNum(expBefore[e].iNew)}%`), -dEi[e])] : [] } };
    fut[e] = F;
  }
  const cds = { ...old.px.cds };
  for (const [id, key, ent, nm] of [['KESCDS', 'sKES', 'KES', 'Kesh'], ['VERCDS', 'sVER', 'VER', 'Verana'], ['BANKCDS', 'sBank', 'BANKS', 'Aurelian banks']]) {
    if (stage.defaultEntity === ent) {
      glob.defaulted[ent] = true;
      const after = stage.newSpread ?? glob[key];
      glob[key] = after;
      if (ent === 'BANKS') glob.sBank = after;
      const p = cdsPrice(after);
      rets[id] = { points: r4(100 - old.px.cds[id]), from: old.px.cds[id], to: 100, defaulted: true, reopenAt: p,
        local: { pct: 0, drivers: [D('default', C(`${nm} has defaulted: protection pays out in full at 100`), 100 - old.px.cds[id])] } };
      cds[id] = p;
    } else {
      const p = cdsPrice(glob[key]);
      rets[id] = { points: r4(p - old.px.cds[id]), from: old.px.cds[id], to: p, spread: { from: old.glob[key], to: glob[key] },
        local: { pct: 0, drivers: p !== old.px.cds[id] ? [D('spread', C(`${nm} default risk ${fmtNum(old.glob[key])}% → ${fmtNum(glob[key])}%`), p - old.px.cds[id])] : [] } };
      cds[id] = p;
    }
  }
  for (const x of INSTRUMENTS) if (x.ccy && rets[x.id]) rets[x.id].fx = { ccy: x.ccy, pct: fxPct[x.ccy] };
  const moves = { oil, copper, wheat, fx: fxPct,
    markPerCrownPct: r2((econ.CAL.markPerCrown / old.econ.CAL.markPerCrown - 1) * 100),
    dinarPerCrownPct: r2((econ.KES.dinarPerCrown / old.econ.KES.dinarPerCrown - 1) * 100) };
  return { mkt: { econ, glob, px: { lp, fx, cds, fut } }, rets, moves, info: { dFear, fear: fearNew, dEi } };
}

function fmtSigned(x) { const v = r2(x); return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2); }

/** Rate futures for a new quarter: 100 minus the rate the market expects. */
export function futuresFromExpectation(exp) {
  const fut = {};
  for (const e of ECON_ORDER) fut[e] = r2(100 - exp[e].iNew);
  return fut;
}
