// Every number printed in the participant guide is a promise to players. These tests
// pin the code to the guide so nothing drifts.
//
// October 2026: at the Event Head's request the game now runs six rounds of one
// ten-minute window each (no quarters inside rounds), every crisis is the Event Head's
// choice, and results are hidden until the end. Those three changes depart from the
// printed guide on purpose (see CHANGELOG.md); the guide must be reprinted to match.
// Everything else below still pins the printed guide.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ECONOMIES, ECON_ORDER } from '../src/config/economies.mjs';
import { INSTRUMENTS, FAMILIES } from '../src/config/instruments.mjs';
import { RULES, ROUNDS } from '../src/config/rules.mjs';
import { startRelease } from '../src/engine/macro.mjs';

test('six economies with the guide’s names, nicknames and currencies', () => {
  const want = {
    AUR: ['Aurelia', 'The Anchor', 'crown'], CAL: ['Calder', 'The Workshop', 'mark'], VER: ['Verana', 'The Debtor', 'florin'],
    KES: ['Kesh', 'The Riser', 'dinar'], NOR: ['Norvik', 'The Well', 'krone'], SAR: ['Sarvan', 'The Granary', 'ora'],
  };
  assert.deepEqual(ECON_ORDER, Object.keys(want));
  for (const [e, [name, title, ccy]] of Object.entries(want)) {
    assert.equal(ECONOMIES[e].name, name);
    assert.equal(ECONOMIES[e].title, title);
    assert.equal(ECONOMIES[e].currency, ccy);
  }
});

test('starting figures are exactly page 02 of the guide', () => {
  const page2 = {
    AUR: { g: 2.0, pi: 4.2, target: 4, i: 4.0, debt: 90 },
    CAL: { g: 5.5, pi: 2.0, target: 3, i: 3.0, debt: 60 },
    VER: { g: 0.8, pi: 1.2, target: 2, i: 1.0, debt: 155 },
    KES: { g: 6.5, pi: 7.0, target: 5, i: 9.0, debt: 55 },
    NOR: { g: 2.5, pi: 3.0, target: 3, i: 3.5, debt: 30 },
    SAR: { g: 4.0, pi: 9.0, target: 6, i: 11.0, debt: 70 },
  };
  const rel = startRelease();
  for (const [e, f] of Object.entries(page2)) {
    assert.equal(rel.econ[e].g, f.g, `${e} growth`);
    assert.equal(rel.econ[e].pi, f.pi, `${e} inflation`);
    assert.equal(ECONOMIES[e].target, f.target, `${e} target`);
    assert.equal(rel.econ[e].i, f.i, `${e} policy rate`);
    assert.equal(rel.econ[e].debt, f.debt, `${e} debt`);
  }
  assert.equal(ECONOMIES.KES.peg, 50); // "fixes the dinar at 50 to the crown"
});

test('forty-four instruments in the guide’s eight families', () => {
  assert.equal(INSTRUMENTS.length, 44);
  const counts = Object.fromEntries(FAMILIES.map((f) => [f.id, 0]));
  for (const x of INSTRUMENTS) counts[x.family]++;
  for (const f of FAMILIES) assert.equal(counts[f.id], f.count, f.name);
  assert.deepEqual(FAMILIES.map((f) => f.count), [14, 2, 8, 6, 6, 4, 1, 3]);
  // the named ones
  for (const id of ['AURIL10', 'KESCB5', 'AURIG', 'AURHY', 'AURBANKS', 'NORENERGY', 'OIL', 'COPPER', 'WHEAT', 'GOLD', 'FEAR', 'KESCDS', 'VERCDS', 'BANKCDS']) {
    assert.ok(INSTRUMENTS.find((x) => x.id === id), id);
  }
  // every one can be bought or sold short: nothing is flagged long-only
  assert.ok(INSTRUMENTS.every((x) => !x.longOnly));
});

test('the desk rules on pages 01, 04, 05 and 06', () => {
  assert.equal(RULES.startFundCr, 1000);
  assert.equal(RULES.leverageLimit, 3);
  assert.equal(RULES.riskLimitPct, 100);
  assert.equal(RULES.baseSpreadPct, 0.10);
  // the Event Head's change (CHANGELOG, Oct 2026): six rounds, one ten-minute window each
  assert.equal(RULES.rounds, 6);
  assert.equal(RULES.quarters, 6);
  assert.equal(RULES.windowSeconds, 600);
  assert.equal(RULES.forcedTargetPct, 80);
  assert.equal(RULES.forcedWorsePct, 2);
  assert.equal(RULES.borrowExtraPct, 1);
  assert.deepEqual(RULES.score, { rar: 60, forecast: 25, discipline: 15, perForced: 5 });
  assert.equal(RULES.forecastMaxPoints, 10);
  assert.equal(RULES.forecastMaxPoints * RULES.quarters, 60); // six forecasts, one a round
  // trading costs 0.10% in calm markets everywhere except Sarvan, which costs more
  for (const x of INSTRUMENTS) {
    if (x.econ === 'SAR') assert.ok(x.spread > 0.10, x.id); else assert.equal(x.spread, 0.10, x.id);
  }
});

test('the six rounds and their names', () => {
  assert.deepEqual(ROUNDS.map((r) => r.name), [
    'Markets in Normal Times', 'Inflation and Interest Rates', 'Commodities and Trade',
    'Emerging Markets and Currencies', 'Banking and Credit', 'Sovereign Debt and Recovery',
  ]);
  assert.deepEqual(ROUNDS.flatMap((r) => r.quarters), [1, 2, 3, 4, 5, 6]); // one window per round
});
