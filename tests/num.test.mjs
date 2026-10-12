import test from 'node:test';
import assert from 'node:assert/strict';
import { roundTo, r1, r2, roundQuarter, mulPct, mulRatioChange, mulPoints, fmtCr, fmtRupees, fmtTerm, groupIndian, crToPaise } from '../src/engine/num.mjs';

test('rounding is half away from zero and free of binary artefacts', () => {
  assert.equal(r2(1.005), 1.01);
  assert.equal(r2(-1.005), -1.01);
  assert.equal(r1(4.05), 4.1);
  assert.equal(r1(4.04999), 4.0);
  assert.equal(roundTo(-0.0001, 2), 0);
  assert.ok(!Object.is(roundTo(-0.0001, 2), -0));
  assert.equal(r2(0.1 + 0.2), 0.3);
});

test('policy rates round to the nearest 0.25 with halves going up', () => {
  assert.equal(roundQuarter(4.375), 4.5); // the worked example in the brief
  assert.equal(roundQuarter(4.374), 4.25);
  assert.equal(roundQuarter(4.125), 4.25);
  assert.equal(roundQuarter(4.12), 4.0);
  assert.equal(roundQuarter(0.1), 0);
});

test('money arithmetic is exact to the paisa', () => {
  const cr100 = crToPaise(100);
  assert.equal(cr100, 1e11);
  assert.equal(mulPct(cr100, 0.10), 1e8); // 0.10% of ₹100 Cr = ₹10 lakh
  assert.equal(mulPct(cr100, 1.5), 1.5e9);
  assert.equal(mulPct(333, 50), 167); // half of 333 paise rounds half up
  assert.equal(mulPct(-333, 50), -167);
  // ₹100 Cr of a bond whose price goes 100 -> 96: -₹4 Cr
  assert.equal(mulRatioChange(cr100, 100, 96), -4e9);
  // futures: ₹100 Cr gains 0.25 points -> ₹0.25 Cr
  assert.equal(mulPoints(cr100, 0.25), 2.5e8);
  // big numbers stay exact
  assert.equal(mulPct(3e12, 0.01), 3e8);
  // reference: exact rational arithmetic with BigInt, rounded half away from zero
  const num = 2999999999999n * (63000654321n - 62000123456n); const den = 62000123456n;
  const q = num / den; const ref = Number((num - q * den) * 2n >= den ? q + 1n : q);
  assert.equal(mulRatioChange(2999999999999, 62000.123456, 63000.654321), ref);
});

test('formatting uses Indian grouping and real minus signs', () => {
  assert.equal(groupIndian('1234567'), '12,34,567');
  assert.equal(fmtCr(1.5e12), '₹1,500.00 Cr');
  assert.equal(fmtCr(-4.12e9), '−₹4.12 Cr');
  assert.equal(fmtRupees(4.12e9), '₹4,12,00,000.00');
  assert.equal(fmtRupees(-123), '−₹1.23');
  assert.equal(fmtTerm(-0.8), '(−0.80)');
  assert.equal(fmtTerm(0.6), '0.60');
});
