// Bot funds for the balance pass and the end-to-end tests.
// Each bot sees only what a team sees: the release, the published rules, prices,
// headlines, the forecast question and crises once released. None of them reads the script.

import { ECON_ORDER, ECONOMIES } from '../config/economies.mjs';
import { INSTRUMENTS, INST } from '../config/instruments.mjs';
import { RULES } from '../config/rules.mjs';
import { decideAll, figsFromRelease } from '../engine/macro.mjs';
import { settleMarket, rupeePrice, carryRates } from '../engine/market.mjs';
import { deskNow } from '../engine/game.mjs';
import { riskUsed } from '../engine/risk.mjs';
import { r2 } from '../engine/num.mjs';

export function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const CR = 1e9;

/** Scale target positions (₹ Cr) so Risk Used <= riskCap and exposure <= levCap. */
export function scaleTargets(world, targets, nav, riskCap = 85, levCap = 2.8) {
  const pos = Object.fromEntries(Object.entries(targets).filter(([, v]) => Math.abs(v) >= 0.01).map(([k, v]) => [k, Math.round(v * CR)]));
  const ru = riskUsed(pos, nav, world.sigma, world.round.M).pct;
  const gross = Object.values(pos).reduce((a, v) => a + Math.abs(v), 0);
  let s = 1;
  if (ru > riskCap) s = Math.min(s, riskCap / ru);
  if (gross > levCap * nav) s = Math.min(s, (levCap * nav) / gross);
  const out = {};
  for (const [k, v] of Object.entries(targets)) out[k] = Math.round(v * s * 100) / 100;
  return out;
}

/** Model-based expected rupee return of each instrument this round, if no more news arrives. */
export function expectedReturns(world) {
  const dec = decideAll(world.mkt, figsFromRelease(world.release), world.round.mods);
  const sm = settleMarket(world, world.release, dec, {}, world.round.mods);
  const carry = carryRates(world.mkt);
  const out = {};
  for (const x of INSTRUMENTS) {
    let r;
    if (x.kind === 'future') r = (sm.mkt.px.fut[x.econ] - world.mkt.px.fut[x.econ]);
    else if (x.kind === 'cds') r = (sm.mkt.px.cds[x.id] - world.mkt.px.cds[x.id]);
    else r = (rupeePrice(sm.mkt, x.id) / rupeePrice(world.mkt, x.id) - 1) * 100;
    r += carry[x.id].rate / 4;
    if (x.funded) r -= RULES.cashRatePct / 4; // what the money would have earned in cash
    out[x.id] = r;
  }
  return { er: out, decisions: dec };
}

// ---------------- the bots ----------------

export const BOTS = {
  /** Does nothing at all. */
  idle: { label: 'Does nothing', decide: () => null, forecast: () => null },

  /** Big random leveraged bets every round; never reacts to a crisis; random forecasts. */
  gambler: {
    label: 'Reckless gambler',
    decide(ctx) {
      if (ctx.epoch !== 0) return null;
      const r = ctx.rand;
      const picks = [];
      const n = 3 + Math.floor(r() * 3);
      while (picks.length < n) { const x = INSTRUMENTS[Math.floor(r() * INSTRUMENTS.length)].id; if (!picks.includes(x)) picks.push(x); }
      const navCr = ctx.nav / CR;
      const t = {};
      for (const id of picks) t[id] = (r() < 0.5 ? -1 : 1) * navCr * 2.9 / n;
      return { replace: true, targets: scaleTargets(ctx.world, t, ctx.nav, 140, 2.95) };
    },
    forecast(ctx) { const v = currentValue(ctx); return v === null ? null : r2(v + (ctx.rand() - 0.5) * 2); },
  },

  /** Random moderate positions. */
  random: {
    label: 'Random trader',
    decide(ctx) {
      if (ctx.epoch !== 0) return null;
      const r = ctx.rand; const t = {};
      const navCr = ctx.nav / CR;
      for (let k = 0; k < 6; k++) { const x = INSTRUMENTS[Math.floor(r() * INSTRUMENTS.length)].id; t[x] = (r() - 0.5) * navCr * 0.5; }
      return { replace: true, targets: scaleTargets(ctx.world, t, ctx.nav, 90, 1.5) };
    },
    forecast(ctx) { const v = currentValue(ctx); return v === null ? null : r2(v + (ctx.rand() - 0.5)); },
  },

  /** Buys the six share indices in Q1 and holds them. */
  buyhold: {
    label: 'Buy and hold shares',
    decide(ctx) {
      if (ctx.q !== 1 || ctx.epoch !== 0) return null;
      const t = {}; for (const e of ECON_ORDER) t[`${e}EQ`] = 160;
      return { replace: true, targets: t };
    },
    forecast: (ctx) => currentValue(ctx),
  },

  /** The carry trade: borrow cheap, lend in high-rate Kesh and Sarvan. Holds through everything. */
  carry: {
    label: 'Carry trader',
    decide(ctx) {
      if (ctx.epoch !== 0) return null;
      const t = { DINAR: 600, KES2Y: 400, ORA: 300, SAR2Y: 300, KESCB5: 300 };
      return { replace: true, targets: scaleTargets(ctx.world, t, ctx.nav, 95, 2.5) };
    },
    forecast: (ctx) => currentValue(ctx),
  },

  /** Chases last round's winners and shorts its losers. */
  momentum: {
    label: 'Momentum chaser',
    decide(ctx) {
      if (ctx.epoch !== 0 || !ctx.world.history.length) return null;
      const h = ctx.world.history; const last = h[h.length - 1].prices; const prev = h.length > 1 ? h[h.length - 2].prices : null;
      if (!prev) return null;
      const rets = INSTRUMENTS.filter((x) => x.funded).map((x) => ({ id: x.id, r: last[x.id] / prev[x.id] - 1 })).sort((a, b) => b.r - a.r);
      const t = {}; const navCr = ctx.nav / CR;
      for (const x of rets.slice(0, 4)) t[x.id] = navCr * 0.4;
      for (const x of rets.slice(-4)) t[x.id] = -navCr * 0.4;
      return { replace: true, targets: scaleTargets(ctx.world, t, ctx.nav, 90, 2.8) };
    },
    forecast: (ctx) => currentValue(ctx),
  },

  /** A good student team: reads the data drop and the rules, reacts sensibly to crises. */
  reader: {
    label: 'Reads the economy',
    decide(ctx) { return readerTargets(ctx, 1.0); },
    forecast: (ctx) => readerForecast(ctx),
    bid: (ctx) => ({ price: r2(ctx.price * 0.97), amountCr: Math.round(ctx.nav / CR * 0.05) }),
  },

  /** A cautious reader: same reasoning, half the size. */
  cautious: {
    label: 'Cautious reader',
    decide(ctx) { return readerTargets(ctx, 0.5); },
    forecast: (ctx) => readerForecast(ctx),
  },

  /** A perfect economist: uses the full model to estimate this round's price moves. */
  economist: {
    label: 'Model economist',
    decide(ctx) {
      const { er } = expectedReturns(ctx.world);
      const t = {}; const navCr = ctx.nav / CR;
      const cand = INSTRUMENTS.map((x) => {
        const sig = Math.max(0.1, ctx.world.sigma[x.id]);
        const edge = Math.abs(er[x.id]) - x.spread - 0.15;
        return { id: x.id, er: er[x.id], sig, score: edge / sig };
      }).filter((c) => Math.abs(c.er) > INST[c.id].spread + 0.15).sort((a, b) => b.score - a.score).slice(0, 10);
      for (const c of cand) t[c.id] = Math.sign(c.er) * navCr * Math.min(0.6, 0.5 * c.score);
      return { replace: true, targets: scaleTargets(ctx.world, t, ctx.nav, 80, 2.6) };
    },
    forecast: (ctx) => readerForecast(ctx),
    bid: (ctx) => ({ price: r2(ctx.price * 0.95), amountCr: Math.round(ctx.nav / CR * 0.05) }),
  },
};

function currentValue(ctx) {
  const spec = ctx.forecastSpec; if (!spec) return null;
  const r = ctx.world.release.econ[spec.econ];
  return spec.v === 'i' ? ctx.world.mkt.econ[spec.econ].i : r[spec.v];
}

function readerForecast(ctx) {
  const spec = ctx.forecastSpec; if (!spec) return null;
  const e = spec.econ; const c = ECONOMIES[e]; const r = ctx.world.release.econ[e];
  if (spec.v === 'i') {
    const d = decideAll(ctx.world.mkt, figsFromRelease(ctx.world.release), ctx.world.round.mods);
    return d[e].iNew;
  }
  if (spec.v === 'g') return r2(c.trend + 0.6 * (r.g - c.trend));
  if (spec.v === 'pi') return r2(0.7 * r.pi + 0.3 * c.target + 0.25 * (r.g - c.trend) * 0.6);
  if (spec.v === 'u') return r2(r.u + 0.1 * (c.uStar - r.u) - 0.15 * 0.6 * (r.g - c.trend));
  return null;
}

function readerTargets(ctx, size) {
  const w = ctx.world; const navCr = ctx.nav / CR;
  const rel = w.release;
  const dec = decideAll(w.mkt, figsFromRelease(rel), w.round.mods);
  const t = {};
  const add = (id, v) => { t[id] = (t[id] || 0) + v; };
  for (const e of ECON_ORDER) {
    // 1. the rule tells you the rate decision; the future tells you what the market expects
    const expected = r2(100 - w.mkt.px.fut[e]);
    const surprise = r2(dec[e].iNew - expected);
    if (Math.abs(surprise) >= 0.25) {
      add(`${e}FUT`, -Math.sign(surprise) * Math.min(1200, 600 * Math.abs(surprise) / 0.25));
      add(`${e}2Y`, -Math.sign(surprise) * 150);
    }
    // 2. growth surprises move shares
    const r = rel.econ[e];
    const gs = r2((r.orig?.g ?? r.g) - r.exp.g);
    if (Math.abs(gs) >= 0.2) add(`${e}EQ`, Math.max(-300, Math.min(300, 150 * gs / 0.3)));
  }
  // 3. inflation surprise in Aurelia: inflation-linked beats ordinary bonds
  const psA = r2((rel.econ.AUR.orig?.pi ?? rel.econ.AUR.pi) - rel.econ.AUR.exp.pi);
  if (psA >= 0.2) { add('AURIL10', 150); add('AUR10Y', -150); }
  if (psA <= -0.2) { add('AURIL10', -150); add('AUR10Y', 150); }
  // 4. a steady long in shares earns the equity premium
  for (const e of ['AUR', 'CAL']) add(`${e}EQ`, 100);
  // 5. supply news in the data
  const dOut = rel.econ.NOR.delta?.oilOutput || 0; if (dOut <= -0.2) add('OIL', 200); if (dOut >= 0.2) add('OIL', -150);
  const dH = rel.econ.SAR.delta?.harvest || 0; if (dH <= -5) add('WHEAT', 200); if (dH >= 5) add('WHEAT', -100);
  // 6. warning lights
  if (rel.econ.KES.special.reserves < 80 && !w.mkt.econ.KES.pegBroken) { add('DINAR', -200); add('KESEQ', -150); }
  if (rel.econ.AUR.special.badLoans >= 3) { add('AURBANKS', -200); add('AURHY', -150); }
  if (rel.econ.VER.special.bankShare < 70 && !w.mkt.glob.defaulted.VER) { add('VER10Y', -200); }
  // 7. in a crisis: buy some safety and keep risk well inside the limit
  const fear = w.mkt.glob.fear;
  if (fear > 22) { add('GOLD', 150); for (const k of Object.keys(t)) if (k.endsWith('EQ') && t[k] > 0) t[k] *= 0.5; }
  for (const k of Object.keys(t)) t[k] *= size;
  return { replace: true, targets: scaleTargets(w, t, ctx.nav, 75, 2.6) };
}

/** Turn target positions into orders for this epoch. */
export function ordersFor(world, teamId, existing, targets, epoch, checkOrder) {
  const now = deskNow(world, teamId, existing);
  const out = [];
  const ids = new Set([...Object.keys(now.st.pos), ...Object.keys(targets)]);
  const list = [...existing];
  for (const id of [...ids].sort()) {
    const cur = (now.st.pos[id] || 0) / CR;
    const want = targets[id] || 0;
    const d = Math.round((want - cur) * 100) / 100;
    if (Math.abs(d) < 1) continue; // ignore tiny changes
    let order;
    if (want === 0 && cur !== 0) order = { inst: id, side: 'close' };
    else order = { inst: id, side: d > 0 ? 'buy' : 'sell', amountCr: Math.abs(d) };
    const chk = checkOrder(world, teamId, list, order);
    if (chk.ok) { const o = { inst: id, delta: chk.delta, epoch }; list.push(o); out.push(o); }
  }
  return out;
}
