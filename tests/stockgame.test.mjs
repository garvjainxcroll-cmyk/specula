// The stock game (stockgame/): prices, orders, report codes, replay and the sealed updates.
// Uses made-up moves, so it runs without the secret game data. When the secret data is
// present (stockgame/secret/), it also checks the prices against the organiser's sheet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  pricePaths, dayStats, indexAt, newBook, placeOrder, cancelOrder, onPriceStep, availableCash, maxQty,
  bookValue, encodeReport, decodeReport, replay, normaliseCode, codeProblem, fmtRs, fmtPct,
} from '../stockgame/src/engine.mjs';
import { deriveRaw, seal, unseal, aesKey, toB64, walkBack, findSlot, slotOf } from '../stockgame/src/vault.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const STOCKS = [{ start: 100 }, { start: 250 }, { start: 1150 }];
// update 1: stock 0 +10%; update 2: stock 0 -5%, stock 1 +20%; update 3: stock 2 -14%
const MOVES = [[[0, 0.1]], [[0, -0.05], [1, 0.2]], [[2, -0.14]]];
const ltpAt = (paths, p) => (k) => paths[k][p];

test('prices compound in release order and are rounded to the paisa', () => {
  const paths = pricePaths(STOCKS, MOVES);
  assert.deepEqual(paths[0], [10000, 11000, 10450, 10450]);
  assert.deepEqual(paths[1], [25000, 25000, 30000, 30000]);
  assert.deepEqual(paths[2], [115000, 115000, 115000, 98900]);
  assert.equal(indexAt(paths, 0), 1000);
  const d = dayStats(paths[0], 2, 2);
  assert.equal(d.ltp, 10450);
  assert.equal(d.prev, 10000);
  assert.equal(d.high, 11000);
});

test('the day is the round of the latest news; its previous close is the end of the last round', () => {
  const steps = Array.from({ length: 7 }, (_, i) => [[0, i % 2 ? -0.02 : 0.03]]);
  const path = pricePaths([{ start: 100 }], steps)[0];
  const d = dayStats(path, 7, 6); // round 2: news 7 out, prices through 6
  assert.equal(d.prev, path[5]);
  assert.equal(d.ltp, path[6]);
  assert.equal(dayStats(path, 5, 5).prev, path[0]);
});

const flat = (prices) => (k) => prices[k];

test('market orders: cash, average cost and realised profit', () => {
  const paths = pricePaths(STOCKS, MOVES);
  const b = newBook(10000);
  assert.equal(b.cash, 1000000);
  let r = placeOrder(b, { k: 0, side: 'B', type: 'MKT', qty: 50 }, ltpAt(paths, 0), 0, 1000);
  assert.ok(r.ok);
  assert.equal(b.cash, 1000000 - 50 * 10000);
  r = placeOrder(b, { k: 0, side: 'S', type: 'MKT', qty: 20 }, ltpAt(paths, 1), 1, 1010);
  assert.ok(r.ok);
  assert.equal(b.holdings[0].qty, 30);
  assert.equal(b.holdings[0].cost, 30 * 10000);
  assert.equal(r.order.realised, 20 * 1000);
  assert.equal(bookValue(b, ltpAt(paths, 1)).total, 1000000 + 50 * 1000);
});

test('refusals: not enough cash, bad stop-loss triggers, bad quantities', () => {
  const b = newBook(1000);
  const px = flat([10000, 10000, 10000]);
  assert.match(placeOrder(b, { k: 0, side: 'B', type: 'MKT', qty: 11 }, px, 0, 1).msg, /Not enough cash/);
  placeOrder(b, { k: 0, side: 'B', type: 'MKT', qty: 5 }, px, 0, 1);
  assert.match(placeOrder(b, { k: 0, side: 'S', type: 'SL', qty: 5, trigger: 120 }, px, 0, 1).msg, /below the last price/);
  assert.match(placeOrder(b, { k: 0, side: 'B', type: 'SL', qty: 5, trigger: 90 }, px, 0, 1).msg, /above the last price/);
  assert.equal(placeOrder(b, { k: 0, side: 'B', type: 'MKT', qty: 0 }, px, 0, 1).ok, false);
});

test('short selling: proceeds go to cash, full margin is held, profit when the price falls', () => {
  const b = newBook(10000); // ₹10,000
  const px = { 0: 10000, 1: 5000 };
  const ltp = (k) => px[k];
  // short 40 at ₹100: cash rises to ₹14,000; ₹8,000 is held (proceeds + 100% margin); ₹6,000 free
  const r = placeOrder(b, { k: 0, side: 'S', type: 'MKT', qty: 40 }, ltp, 0, 1);
  assert.ok(r.ok);
  assert.equal(b.holdings[0].qty, -40);
  assert.equal(b.cash, 1400000);
  assert.equal(availableCash(b, ltp), 600000);
  assert.equal(bookValue(b, ltp).total, 1000000);
  // the most it can still short of a ₹100 stock is 60 more; it cannot short 61
  assert.equal(maxQty(b, 0, 'S', 10000, ltp), 60);
  assert.match(placeOrder(b, { k: 0, side: 'S', type: 'MKT', qty: 61 }, ltp, 0, 1).msg, /margin/);
  // the price falls to ₹90: the short gains ₹400; buying back 40 realises it
  px[0] = 9000;
  assert.equal(bookValue(b, ltp).total, 1040000);
  const cover = placeOrder(b, { k: 0, side: 'B', type: 'MKT', qty: 40 }, ltp, 1, 2);
  assert.equal(cover.order.realised, 40000);
  assert.equal(b.holdings[0], undefined);
  assert.equal(b.cash, 1040000);
});

test('a short that goes wrong blocks new risk but can always be bought back', () => {
  const b = newBook(10000);
  const px = { 0: 10000, 1: 5000 };
  const ltp = (k) => px[k];
  placeOrder(b, { k: 0, side: 'S', type: 'MKT', qty: 100 }, ltp, 0, 1); // all-in short
  assert.equal(availableCash(b, ltp), 0);
  px[0] = 12000; // +20%
  assert.ok(availableCash(b, ltp) < 0);
  assert.equal(placeOrder(b, { k: 1, side: 'B', type: 'MKT', qty: 1 }, ltp, 1, 2).ok, false);
  assert.ok(placeOrder(b, { k: 0, side: 'B', type: 'MKT', qty: 30 }, ltp, 1, 2).ok); // covering is always allowed
  assert.equal(b.holdings[0].qty, -70);
  assert.equal(bookValue(b, ltp).total, 1000000 - 100 * 2000);
});

test('one sell can close a long and open a short; average prices stay right', () => {
  const b = newBook(100000);
  const px = { 0: 10000 };
  const ltp = (k) => px[k];
  placeOrder(b, { k: 0, side: 'B', type: 'MKT', qty: 10 }, ltp, 0, 1);
  px[0] = 11000;
  const r = placeOrder(b, { k: 0, side: 'S', type: 'MKT', qty: 30 }, ltp, 1, 2);
  assert.equal(r.order.realised, 10 * 1000);
  assert.deepEqual(b.holdings[0], { qty: -20, cost: -20 * 11000 });
  px[0] = 10000;
  assert.equal(bookValue(b, ltp).pnl, 20 * 1000);
});

test('a marketable limit fills at once at the last price; a resting one holds cash until filled', () => {
  const paths = pricePaths(STOCKS, MOVES);
  const b = newBook(100000);
  const now = placeOrder(b, { k: 0, side: 'B', type: 'LMT', qty: 10, limit: 105 }, ltpAt(paths, 0), 0, 1);
  assert.equal(now.order.status, 'DONE');
  assert.equal(now.order.fill, 10000);
  const rest = placeOrder(b, { k: 0, side: 'B', type: 'LMT', qty: 10, limit: 95 }, ltpAt(paths, 0), 0, 2);
  assert.equal(rest.order.status, 'OPEN');
  assert.equal(availableCash(b, ltpAt(paths, 0)), b.cash - 10 * 9500);
  // step 1: price 110, not reached; step 2: 104.50, not reached
  assert.equal(onPriceStep(b, ltpAt(paths, 1), 1, 3).length, 0);
  assert.equal(onPriceStep(b, ltpAt(paths, 2), 2, 4).length, 0);
  assert.ok(cancelOrder(b, rest.order.id));
  assert.equal(availableCash(b, ltpAt(paths, 2)), b.cash);
  // a sell limit at 108 fills when update 1 lifts the price to 110, at 110
  const sell = placeOrder(b, { k: 0, side: 'S', type: 'LMT', qty: 4, limit: 108 }, ltpAt(paths, 0), 0, 5);
  const f = onPriceStep(b, ltpAt(paths, 1), 1, 6);
  assert.equal(f.length, 1);
  assert.equal(sell.order.fill, 11000);
  assert.equal(b.trades.at(-1).auto, true);
  // a stop-loss below the price triggers when update 3 drops stock 2
  placeOrder(b, { k: 2, side: 'B', type: 'MKT', qty: 5 }, ltpAt(paths, 2), 2, 7);
  const sl = placeOrder(b, { k: 2, side: 'S', type: 'SL', qty: 5, trigger: 1100 }, ltpAt(paths, 2), 2, 8);
  assert.equal(sl.order.status, 'OPEN');
  onPriceStep(b, ltpAt(paths, 3), 3, 9);
  assert.equal(sl.order.status, 'DONE');
  assert.equal(sl.order.fill, 98900); // gaps through the trigger: fills at the new price
  // a buy stop above the price protects a short: stock 1 jumps 20% on update 2
  const b2 = newBook(100000);
  placeOrder(b2, { k: 1, side: 'S', type: 'MKT', qty: 10 }, ltpAt(paths, 0), 0, 1);
  const stop = placeOrder(b2, { k: 1, side: 'B', type: 'SL', qty: 10, trigger: 260 }, ltpAt(paths, 0), 0, 2);
  onPriceStep(b2, ltpAt(paths, 1), 1, 3);
  assert.equal(stop.order.status, 'OPEN');
  onPriceStep(b2, ltpAt(paths, 2), 2, 4);
  assert.equal(stop.order.status, 'DONE');
  assert.equal(b2.holdings[1], undefined);
  assert.equal(stop.order.realised, -10 * 5000);
});

test('report codes round-trip and refuse edits', () => {
  const b = newBook(1000000);
  placeOrder(b, { k: 2, side: 'B', type: 'MKT', qty: 300 }, () => 115000, 0, 1700000000);
  placeOrder(b, { k: 2, side: 'S', type: 'MKT', qty: 120 }, () => 98900, 3, 1700000500);
  b.trades[1].auto = true;
  const code = encodeReport('Bulls & Bears — टीम', b);
  const r = decodeReport(code);
  assert.equal(r.team, 'Bulls & Bears — टीम');
  assert.equal(r.capital, 1000000);
  assert.deepEqual(r.trades.map((t) => [t.p, t.k, t.side, t.qty, t.t, t.auto]), [[0, 2, 'B', 300, 1700000000, false], [3, 2, 'S', 120, 1700000500, true]]);
  const bad = code.slice(0, 10) + (code[10] === 'A' ? 'B' : 'A') + code.slice(11);
  assert.throws(() => decodeReport(bad), /changed or copied wrongly|damaged/);
  assert.throws(() => decodeReport('hello'), /starts with RPT-/);
});

test('replay rebuilds the value, voids stale and impossible trades, keeps resting fills', () => {
  const paths = pricePaths(STOCKS, MOVES);
  const t0 = 1700000000;
  const releasedAt = [null, (t0 + 100) * 1000, (t0 + 200) * 1000, (t0 + 300) * 1000];
  const report = {
    team: 'A', capital: 10000, trades: [
      { p: 0, k: 0, side: 'B', qty: 10, t: t0 + 50 },                 // fine
      { p: 0, k: 1, side: 'B', qty: 10, t: t0 + 250 },                // at old prices after update 1 moved them
      { p: 1, k: 0, side: 'S', qty: 10, t: t0 + 150 },                // fine: sells at 110
      { p: 2, k: 2, side: 'B', qty: 1000, t: t0 + 210 },              // not enough cash
      { p: 2, k: 1, side: 'B', qty: 5, t: t0 + 400, auto: true },     // a resting fill typed in late: kept
      { p: 3, k: 2, side: 'S', qty: 1, t: t0 + 310 },                 // a short at the latest prices: kept
    ],
  };
  const r = replay(report, { paths, applied: 3, releasedAt, graceSec: 45, capital: 10000 });
  assert.equal(r.kept, 4);
  assert.deepEqual(r.voided.map((v) => v.n), [2, 4]);
  assert.match(r.voided[0].why, /old prices/);
  const cash = 1000000 - 10 * 10000 + 10 * 11000 - 5 * 30000 + 98900;
  assert.equal(r.cash, cash);
  assert.equal(r.value, cash + 5 * 30000 - 98900);
  assert.equal(r.capitalMismatch, false);
  assert.equal(replay({ ...report, capital: 99999 }, { paths, applied: 3, capital: 10000 }).capitalMismatch, true);
});

test('codes are normalised and checked before any work', () => {
  assert.equal(normaliseCode(' abcd-ef23 '), 'ABCDEF23');
  assert.equal(codeProblem('ABCDEF23'), null);
  assert.match(codeProblem('ABCDEF2'), /8 letters/);
  assert.match(codeProblem('ABCDEF20'), /never use 0/);
  assert.equal(fmtRs(100000000), '₹10,00,000.00');
  assert.equal(fmtRs(-12345, { sign: true }), '−₹123.45');
  assert.equal(fmtPct(-0.0525), '−5.25%');
  assert.equal(fmtPct(0), '0.00%');
});

test('sealed updates: the latest price code opens everything before it, a news code opens only news', async () => {
  const salt = '00112233445566778899aabbccddeeff';
  const iter = 1000;
  const codes = { N: ['NNNN2222', 'NNNN3333', 'NNNN4444'], P: ['PPPP2222', 'PPPP3333', 'PPPP4444'] };
  const raw = { N: [], P: [] };
  for (const k of ['N', 'P']) for (const c of codes[k]) raw[k].push(await deriveRaw(c, salt, iter));
  const items = [];
  for (let i = 1; i <= 3; i++) {
    items[slotOf('N', i)] = await seal(raw.N[i - 1], { t: 'N', i, head: `News ${i}`, prev: i > 1 ? toB64(raw.N[i - 2]) : null });
    items[slotOf('P', i)] = await seal(raw.P[i - 1], { t: 'P', i, m: [[0, 0.01 * i]], prev: i > 1 ? toB64(raw.P[i - 2]) : null, n: toB64(raw.N[i - 1]) });
  }
  // a wrong key opens nothing
  assert.equal(await unseal(await aesKey(raw.P[0]), items[0]), null);
  const opened = new Map();
  const hit = await findSlot(items, 'NNNN3333', salt, iter, opened);
  assert.equal(hit.slot, slotOf('N', 2));
  await walkBack(items, hit.slot, hit.keyB64, opened);
  assert.deepEqual([...opened.values()].map((x) => x.t + x.i).sort(), ['N1', 'N2']);
  const hit2 = await findSlot(items, 'PPPP4444', salt, iter, opened);
  await walkBack(items, hit2.slot, hit2.keyB64, opened);
  assert.deepEqual([...opened.values()].map((x) => x.t + x.i).sort(), ['N1', 'N2', 'N3', 'P1', 'P2', 'P3']);
  assert.equal(await findSlot(items, 'PPPP4444', salt, iter, opened), null);
});

const secret = join(root, 'stockgame', 'secret', 'game.json');
test('with the secret data: prices match the organiser’s sheet after every update', { skip: !existsSync(secret) && 'no secret game data here' }, () => {
  const g = JSON.parse(readFileSync(secret, 'utf8'));
  const sheet = JSON.parse(readFileSync(join(root, 'stockgame', 'secret', 'excel-price-path.json'), 'utf8'));
  const tick = g.stocks.map((s) => s.t);
  const moves = g.updates.map((u) => u.moves.map((m) => [tick.indexOf(m.t), m.pct]));
  const paths = pricePaths(g.stocks, moves);
  assert.equal(g.updates.length, 45);
  for (const u of g.updates) assert.equal(u.moves.length, 4);
  for (let p = 0; p <= 45; p++) for (let k = 0; k < 10; k++) assert.equal(paths[k][p], Math.round(sheet[p][k] * 100), `stock ${tick[k]} after update ${p}`);
  const all = [...g.codes.N, ...g.codes.P];
  assert.equal(new Set(all).size, 90);
  for (const c of all) assert.equal(codeProblem(c), null);
});
