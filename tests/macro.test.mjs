import test from 'node:test';
import assert from 'node:assert/strict';
import { decide, decideAll, startRelease, computeRelease, reviseRelease, ruleText } from '../src/engine/macro.mjs';
import { ECONOMIES, ECON_ORDER } from '../src/config/economies.mjs';
import { initialMarket } from '../src/engine/market.mjs';
import { r2, sumRound, roundTo } from '../src/engine/num.mjs';

test('Aurelia’s rule: the worked example 0.25 + 4.60 + 0.5×(4.60−4.00) + 0.5×(−0.80) = 4.75 → 4.375 → 4.50%', () => {
  const d = decide('AUR', 4.0, { g: 1.2, pi: 4.6 }, 0, {});
  assert.equal(d.target, 4.75);
  assert.equal(d.raw, 4.375);
  assert.equal(d.iNew, 4.5);
  assert.equal(d.change, 0.5);
  assert.match(d.steps[0], /0\.25 \+ 4\.60 \+ 0\.5 × \(4\.60 − 4\.00\) \+ 0\.5 × \(−0\.80\) = 4\.75/);
  assert.match(d.steps[1], /4\.375/);
  assert.match(d.steps[2], /4\.50%/);
});

test('every rule starts close to its starting rate (the world begins near balance)', () => {
  const rel = startRelease();
  const mkt = initialMarket(rel);
  const figs = Object.fromEntries(ECON_ORDER.map((e) => [e, { g: rel.econ[e].g, pi: rel.econ[e].pi, reserves: rel.econ[e].special.reserves || 0 }]));
  const d = decideAll(mkt, figs, {});
  for (const e of ECON_ORDER) assert.ok(Math.abs(d[e].iNew - rel.econ[e].i) <= 0.25, `${e}: ${d[e].iNew} vs ${rel.econ[e].i}`);
  // Aurelia's inflation is above target, so its first move is a hike
  assert.equal(d.AUR.iNew, 4.25);
});

test('Kesh’s rule is built on Aurelia’s new rate (the peg)', () => {
  const lo = decide('KES', 9, { g: 6.5, pi: 7, reserves: 140 }, 4.0, {});
  const hi = decide('KES', 9, { g: 6.5, pi: 7, reserves: 140 }, 5.0, {});
  assert.equal(r2(hi.target - lo.target), 1.0);
  const low = decide('KES', 9, { g: 6.5, pi: 7, reserves: 60 }, 4.0, {});
  assert.equal(r2(low.target - lo.target), 3.0); // 0.05 × (120 − 60)
});

test('rates never go below zero; crisis rule changes are applied and shown', () => {
  const d = decide('VER', 0.25, { g: -3, pi: -1 }, 0, {});
  assert.equal(d.iNew, 0);
  const e = decide('AUR', 4.0, { g: 2, pi: 6 }, 0, { AUR: { a: 1.0 } });
  assert.equal(e.target, 0.25 + 6 + 1.0 * 2);
  const f = decide('KES', 9, { g: 6.5, pi: 7, reserves: 140 }, 4, { KES: { add: 5 } });
  assert.equal(f.target, 4 + 4 + 1 + 0 + 0 + 5);
  assert.match(ruleText('KES', { KES: { add: 5 } }), /emergency/);
});

test('a data release is built from terms that add up exactly', () => {
  const rel = startRelease();
  const mkt = initialMarket(rel);
  const world = { release: rel, econ: mkt.econ, glob: mkt.glob, moves: { oil: 2, copper: 1, wheat: 1, fx: { AUR: 0.5, CAL: 0.5, VER: 1, KES: 0.5, NOR: 0.3, SAR: -1 }, markPerCrownPct: 0, dinarPerCrownPct: 0 } };
  const r2rel = computeRelease(world, 2, { AUR: { g: 0.3, pi: 0.2 } });
  for (const e of ECON_ORDER) {
    for (const k of ['g', 'pi', 'u', 'b', 'ca', 'debt']) {
      const w = r2rel.econ[e].work[k];
      assert.equal(w.raw, sumRound(w.terms.map((t) => t.value), 2), `${e}.${k}`);
      assert.equal(r2rel.econ[e][k], Math.max(roundTo(w.raw, 1), k === 'u' ? 1 : -Infinity), `${e}.${k} rounding`);
    }
  }
  // the consensus does not know this quarter's news
  assert.equal(r2(r2rel.econ.AUR.g - r2rel.econ.AUR.exp.g), 0.3);
});

test('a crisis revision keeps the original figures beside the revised ones', () => {
  const rel = startRelease();
  const rev = reviseRelease(rel, { KES: { reserves: -30, pi: 2.5 } }, 'Run on the Dinar');
  assert.equal(rev.econ.KES.special.reserves, 110);
  assert.equal(rev.econ.KES.pi, 9.5);
  assert.equal(rev.econ.KES.orig.pi, 7.0);
  assert.equal(rev.revisions.length, 2);
  assert.equal(rel.econ.KES.pi, 7.0); // the original release is untouched
});
