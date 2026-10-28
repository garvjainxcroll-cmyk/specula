// Shared trading engine for the team broker app and the Event Head desk.
// Pure functions only: no DOM, no storage. The build inlines this file into both
// pages (it strips the `export` keywords), and tests/stockgame.test.mjs imports it.
// Money is integer paise.

export const PAISE = 100;
export const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// ---------- prices ----------

// moves[i-1] = [[stockIndex, pct], ...] for update i (only the updates applied so far).
// Prices compound in release order, exactly like the organiser's price sheet.
// All ten paths: paths[k][p] = price in paise of stock k after p updates applied.
export function pricePaths(stocks, moves) {
  return stocks.map((s, k) => {
    const path = [Math.round(s.start * PAISE)];
    let v = s.start;
    for (const step of moves) {
      for (const m of step) if (m[0] === k) v *= 1 + m[1];
      path.push(Math.round(v * PAISE));
    }
    return path;
  });
}

// The trading day is the round of the latest released news (round 1 before any news).
export function dayOf(newsCount) {
  return Math.max(1, Math.ceil(newsCount / 5));
}

// The step whose price is the previous close for the current day.
export function prevCloseStep(newsCount, applied) {
  return Math.min(applied, (dayOf(newsCount) - 1) * 5);
}

export function dayStats(path, newsCount, applied) {
  const from = prevCloseStep(newsCount, applied);
  const seg = path.slice(from, applied + 1);
  const ltp = path[applied];
  const prev = path[from];
  return {
    ltp, prev, open: prev,
    high: Math.max(...seg), low: Math.min(...seg),
    chg: ltp - prev, chgPct: prev ? (ltp - prev) / prev : 0,
    start: path[0], sinceStart: path[0] ? (ltp - path[0]) / path[0] : 0,
  };
}

// Equal-weighted index of the ten stocks, 1,000 at the start.
export function indexAt(paths, p) {
  let sum = 0;
  for (const path of paths) sum += path[p] / path[0];
  return (1000 * sum) / paths.length;
}

// ---------- formatting ----------

const inr2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
export const MINUS = '−';

export function fmtPrice(paise) {
  const s = inr2.format(Math.abs(paise) / PAISE);
  return paise < 0 ? MINUS + s : s;
}
export function fmtRs(paise, opts = {}) {
  const s = (opts.whole ? inr0.format(Math.round(Math.abs(paise) / PAISE)) : inr2.format(Math.abs(paise) / PAISE));
  const sign = paise < 0 ? MINUS : opts.sign && paise > 0 ? '+' : '';
  return sign + '₹' + s;
}
export function fmtPct(x, digits = 2) {
  const s = (Math.abs(x) * 100).toFixed(digits) + '%';
  if (Math.abs(x) < 0.5 * Math.pow(10, -digits - 2)) return (0).toFixed(digits) + '%';
  return (x < 0 ? MINUS : '+') + s;
}
export function fmtQty(n) { return inr0.format(n); }
export function pad2(n) { return String(n).padStart(2, '0'); }

export function normaliseCode(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}
export function prettyCode(c) {
  return c.length === 8 ? c.slice(0, 4) + '-' + c.slice(4) : c;
}
export function codeProblem(c) {
  if (!c) return 'Type the code shown on the big screen.';
  if (c.length !== 8) return 'Codes have 8 letters and digits (for example ABCD-EF23).';
  for (const ch of c) if (!ALPHABET.includes(ch)) return 'Codes never use 0, 1, I, L or O. Check the big screen again.';
  return null;
}

// ---------- the team's book ----------
// book  = { capital, cash, margin, holdings: {k: {qty, cost}}, orders: [...], trades: [...], nextId }
//         qty < 0 is a short position; cost is signed too (qty x average price), so the
//         profit on any position is qty x LTP - cost.
// order = { id, k, side: 'B'|'S', type: 'MKT'|'LMT'|'SL', qty, limit?, trigger?, status: 'OPEN'|'DONE'|'CANCELLED'|'REJECTED', at, p, fill?, note? }
// trade = { p, k, side, qty, price, t, id, auto }   (t = unix seconds; auto = a resting order filled by a price move)
//
// Shorting: selling more than you hold opens a short. The sale's proceeds go into cash,
// and margin (book.margin x the short's current value, 100% unless set otherwise) is held
// from your own money, so cash available = cash - held for open buy orders
// - (1 + margin) x the value of every short at its last price.
// A trade that only reduces a position (selling shares you hold, buying back a short) is
// always allowed; any other trade must leave cash available at zero or above.

export const DEFAULT_MARGIN = 1;

export function newBook(capitalRupees, margin = DEFAULT_MARGIN) {
  const capital = Math.round(capitalRupees * PAISE);
  return { capital, cash: capital, margin, holdings: {}, orders: [], trades: [], nextId: 1 };
}
const marginOf = (book) => (book.margin ?? DEFAULT_MARGIN);
export const qtyOf = (book, k) => book.holdings[k]?.qty || 0;

export function reservedCash(book, exceptId = null) {
  let r = 0;
  for (const o of book.orders) if (o.status === 'OPEN' && o.side === 'B' && o.type === 'LMT' && o.id !== exceptId) r += o.qty * o.limit;
  return r;
}
export function shortMargin(book, ltpOf) {
  let m = 0;
  for (const k in book.holdings) { const q = book.holdings[k].qty; if (q < 0) m += (1 + marginOf(book)) * -q * ltpOf(+k); }
  return Math.round(m);
}
export function availableCash(book, ltpOf, exceptId = null) {
  return book.cash - reservedCash(book, exceptId) - shortMargin(book, ltpOf);
}

// Can `dq` shares (signed: + buy, - sell) of stock k fill at `price` now?
export function canFill(book, k, dq, price, ltpOf, exceptId = null) {
  const q = qtyOf(book, k);
  if (q !== 0 && Math.sign(dq) !== Math.sign(q) && Math.abs(dq) <= Math.abs(q)) return { ok: true }; // only reduces a position
  const h = { ...book.holdings, [k]: { qty: q + dq, cost: 0 } };
  const after = { ...book, cash: book.cash - dq * price, holdings: h };
  const avail = availableCash(after, (j) => (j === k ? price : ltpOf(j)), exceptId);
  if (avail >= 0) return { ok: true };
  const now = availableCash(book, ltpOf, exceptId);
  const shorting = dq < 0;
  return {
    ok: false,
    msg: shorting
      ? `Not enough free cash to hold margin for this short. You have ${fmtRs(Math.max(0, now))} available; a short needs its full value as margin.`
      : `Not enough cash. This order needs ${fmtRs(dq * price)} and you have ${fmtRs(Math.max(0, now))} available.`,
  };
}

// Change a position by dq shares at price; returns the profit realised by any part that closed.
function applyFill(book, k, dq, price) {
  const h = book.holdings[k] || { qty: 0, cost: 0 };
  let realised = 0;
  book.cash -= dq * price;
  if (h.qty === 0 || Math.sign(h.qty) === Math.sign(dq)) {
    h.qty += dq; h.cost += dq * price;
  } else {
    const close = Math.sign(dq) * Math.min(Math.abs(dq), Math.abs(h.qty)); // opposite sign to the position
    const avg = h.cost / h.qty;
    realised = Math.round(-close * (price - avg));
    h.cost = h.qty + close === 0 ? 0 : Math.round(h.cost + close * avg);
    h.qty += close;
    const rest = dq - close; // a sell bigger than the long (or a buy bigger than the short) flips it
    if (rest) { h.qty += rest; h.cost += rest * price; }
  }
  if (h.qty === 0) delete book.holdings[k]; else book.holdings[k] = h;
  return realised;
}

function fill(book, o, price, p, t, auto = false) {
  o.realised = applyFill(book, o.k, o.side === 'B' ? o.qty : -o.qty, price);
  o.status = 'DONE'; o.fill = price; o.filledAt = t; o.fillP = p;
  book.trades.push({ p, k: o.k, side: o.side, qty: o.qty, price, t, id: o.id, auto });
}

// Place an order at price state p; ltpOf(k) gives each stock's last price (paise).
// Returns { ok, order, msg }. Market orders and marketable limits fill at once.
export function placeOrder(book, req, ltpOf, p, t) {
  const ltp = ltpOf(req.k);
  const qty = Math.floor(Number(req.qty));
  const side = req.side === 'S' ? 'S' : 'B';
  const o = { id: book.nextId, k: req.k, side, type: req.type, qty, at: t, p, status: 'OPEN' };
  if (!(qty >= 1) || qty > 1000000) return { ok: false, msg: 'Enter a quantity between 1 and 10,00,000.' };
  if (!['MKT', 'LMT', 'SL'].includes(req.type)) return { ok: false, msg: 'Choose market, limit or stop-loss.' };
  if (req.type === 'LMT') {
    o.limit = Math.round(Number(req.limit) * PAISE);
    if (!(o.limit > 0)) return { ok: false, msg: 'Enter a limit price above zero.' };
  }
  if (req.type === 'SL') {
    o.trigger = Math.round(Number(req.trigger) * PAISE);
    if (!(o.trigger > 0)) return { ok: false, msg: 'Enter a trigger price above zero.' };
    if (side === 'S' && o.trigger >= ltp) return { ok: false, msg: 'A sell stop-loss trigger must be below the last price.' };
    if (side === 'B' && o.trigger <= ltp) return { ok: false, msg: 'A buy stop-loss trigger must be above the last price.' };
  }
  const dq = side === 'B' ? qty : -qty;
  const marketable = req.type === 'MKT' || (req.type === 'LMT' && (side === 'B' ? ltp <= o.limit : ltp >= o.limit));
  if (marketable) {
    const c = canFill(book, req.k, dq, ltp, ltpOf);
    if (!c.ok) return { ok: false, msg: c.msg };
  } else if (side === 'B' && req.type === 'LMT') {
    // a resting limit buy holds qty x limit of cash until it fills or is cancelled
    const need = qty * o.limit, avail = availableCash(book, ltpOf);
    if (avail < need) return { ok: false, msg: `Not enough cash. This order holds ${fmtRs(need)} and you have ${fmtRs(Math.max(0, avail))} available.` };
  }
  book.nextId++;
  book.orders.push(o);
  if (marketable) fill(book, o, ltp, p, t);
  return { ok: true, order: o };
}

export function cancelOrder(book, id) {
  const o = book.orders.find((x) => x.id === id);
  if (!o || o.status !== 'OPEN') return false;
  o.status = 'CANCELLED';
  return true;
}

// Prices have just moved to state p. Fill any open orders whose condition is met,
// in the order they were placed, at the new price. Returns the orders filled.
export function onPriceStep(book, ltpOf, p, t) {
  const filled = [];
  for (const o of book.orders) {
    if (o.status !== 'OPEN') continue;
    const ltp = ltpOf(o.k);
    let go = false;
    if (o.type === 'LMT') go = o.side === 'B' ? ltp <= o.limit : ltp >= o.limit;
    if (o.type === 'SL') go = o.side === 'S' ? ltp <= o.trigger : ltp >= o.trigger;
    if (!go) continue;
    const c = canFill(book, o.k, o.side === 'B' ? o.qty : -o.qty, ltp, ltpOf, o.id);
    if (!c.ok) { o.status = 'REJECTED'; o.note = 'Not enough free cash when the price was reached.'; continue; }
    fill(book, o, ltp, p, t, true);
    filled.push(o);
  }
  return filled;
}

// The most shares an order could be for, at `price`, given the rules above.
export function maxQty(book, k, side, price, ltpOf) {
  if (!(price > 0)) return 0;
  const sign = side === 'B' ? 1 : -1;
  let lo = 0, hi = 1000000;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (canFill(book, k, sign * mid, price, ltpOf).ok) lo = mid; else hi = mid - 1;
  }
  return lo;
}

export function bookValue(book, ltpOf) {
  let long = 0, short = 0, invested = 0, pnl = 0;
  for (const k in book.holdings) {
    const h = book.holdings[k], v = h.qty * ltpOf(+k);
    if (h.qty > 0) { long += v; invested += h.cost; } else short += -v;
    pnl += v - h.cost;
  }
  return { cash: book.cash, longValue: long, shortValue: short, holdingsValue: long - short, invested, pnl, total: book.cash + long - short };
}

// ---------- report code ----------
// A compact record of every fill, for the Event Head to check and rank a team.
// Layout (bytes): 'R' 1 | version | name length + UTF-8 name | capital (rupees, varint)
// | base time (seconds, varint) | count | per fill: p, k*4+auto*2+side, qty varint, dt varint | FNV-1a check (4 bytes)

function varint(out, n) {
  n = Math.floor(n);
  while (n >= 0x80) { out.push((n % 0x80) | 0x80); n = Math.floor(n / 0x80); }
  out.push(n);
}
function readVarint(bytes, pos) {
  let n = 0, mul = 1, b;
  do {
    if (pos.i >= bytes.length) throw new Error('cut');
    b = bytes[pos.i++];
    n += (b & 0x7f) * mul; mul *= 0x80;
  } while (b & 0x80);
  return n;
}
function fnv(bytes) {
  let h = 0x811c9dc5;
  const salt = [74, 65, 67, 79]; // makes casual edits fail; not a signature
  for (const b of [...salt, ...bytes]) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function encodeReport(team, book) {
  const out = [0x52, 1];
  const name = [...new TextEncoder().encode(String(team).slice(0, 40))];
  out.push(name.length, ...name);
  varint(out, Math.round(book.capital / PAISE));
  const base = book.trades.length ? book.trades[0].t : 0;
  varint(out, base);
  varint(out, book.trades.length);
  let last = base;
  for (const tr of book.trades) {
    out.push(tr.p, tr.k * 4 + (tr.auto ? 2 : 0) + (tr.side === 'S' ? 1 : 0));
    varint(out, tr.qty);
    varint(out, Math.max(0, tr.t - last));
    last = Math.max(last, tr.t);
  }
  const h = fnv(out);
  out.push((h >>> 24) & 255, (h >>> 16) & 255, (h >>> 8) & 255, h & 255);
  return 'RPT-' + b64url(out);
}

export function decodeReport(code) {
  const s = String(code || '').trim().replace(/\s+/g, '');
  if (!s.startsWith('RPT-')) throw new Error('A report code starts with RPT-. Ask the team to copy it again.');
  let bytes;
  try { bytes = unb64url(s.slice(4)); } catch { throw new Error('This report code is damaged. Ask the team to copy it again.'); }
  if (bytes.length < 8) throw new Error('This report code is too short. Ask the team to copy it again.');
  const body = [...bytes.slice(0, -4)];
  const h = fnv(body);
  const tail = bytes.slice(-4);
  const check = ((tail[0] << 24) | (tail[1] << 16) | (tail[2] << 8) | tail[3]) >>> 0;
  if (h !== check) throw new Error('This report code has been changed or copied wrongly. Ask the team to copy it again.');
  try {
    const pos = { i: 2 };
    const n = body[pos.i++];
    const team = new TextDecoder().decode(new Uint8Array(body.slice(pos.i, pos.i + n)));
    pos.i += n;
    const capital = readVarint(body, pos);
    let t = readVarint(body, pos);
    const count = readVarint(body, pos);
    const trades = [];
    for (let j = 0; j < count; j++) {
      const p = body[pos.i++];
      const ks = body[pos.i++];
      const qty = readVarint(body, pos);
      t += readVarint(body, pos);
      trades.push({ p, k: ks >> 2, side: ks & 1 ? 'S' : 'B', auto: !!(ks & 2), qty, t });
    }
    return { team, capital, trades };
  } catch {
    throw new Error('This report code is damaged. Ask the team to copy it again.');
  }
}

// Replay a team's fills against the official prices.
// paths: official paths; applied: prices applied so far on the desk;
// releasedAt: releasedAt[p] = ms when the prices for update p were applied (1-based);
// graceSec: allowance for typing the code. An order the team placed at price state p
// after update p+1's prices were out (plus grace) used stale prices and is voided.
// Resting orders filled by a price move (auto) fill at that move's own price, so they
// are never stale, even when the team types a round's price code late.
export function replay(report, { paths, applied, releasedAt, graceSec = 45, capital, margin = DEFAULT_MARGIN }) {
  const book = newBook(capital, margin);
  const cap = book.capital;
  const voided = [];
  let prevP = 0;
  report.trades.forEach((tr, j) => {
    const why = (msg) => voided.push({ ...tr, n: j + 1, why: msg });
    if (tr.k < 0 || tr.k >= paths.length || !(tr.qty >= 1)) return why('not a real order');
    if (tr.p > applied) return why(`made after update ${tr.p}, which the desk has not applied`);
    if (tr.p < prevP) return why('out of order');
    const next = releasedAt && releasedAt[tr.p + 1];
    if (!tr.auto && next && tr.t * 1000 > next + graceSec * 1000) return why(`placed at old prices after update ${tr.p + 1} had moved them`);
    const ltpOf = (k) => paths[k][tr.p];
    const c = canFill(book, tr.k, tr.side === 'B' ? tr.qty : -tr.qty, ltpOf(tr.k), ltpOf);
    if (!c.ok) return why(tr.side === 'B' ? 'not enough cash' : 'not enough margin for the short');
    fill(book, { id: j + 1, k: tr.k, side: tr.side, qty: tr.qty }, ltpOf(tr.k), tr.p, tr.t, tr.auto);
    prevP = tr.p;
  });
  const v = bookValue(book, (k) => paths[k][applied]);
  const capitalMismatch = report.capital !== Math.round(cap / PAISE);
  return { team: report.team, fills: report.trades.length, kept: book.trades.length, voided, book, value: v.total, ret: v.total / cap - 1, cash: book.cash, capitalMismatch };
}
