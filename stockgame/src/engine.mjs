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
// state = { capital, cash, holdings: {k: {qty, cost}}, orders: [...], trades: [...], nextId }
// order = { id, k, side: 'B'|'S', type: 'MKT'|'LMT'|'SL', qty, limit?, trigger?, status: 'OPEN'|'DONE'|'CANCELLED'|'REJECTED', at, p, fill?, note? }
// trade = { p, k, side, qty, price, t, id, auto }   (t = unix seconds; auto = a resting order filled by a price move)

export function newBook(capitalRupees) {
  const capital = Math.round(capitalRupees * PAISE);
  return { capital, cash: capital, holdings: {}, orders: [], trades: [], nextId: 1 };
}

export function reservedCash(book) {
  let r = 0;
  for (const o of book.orders) if (o.status === 'OPEN' && o.side === 'B') r += o.qty * o.limit;
  return r;
}
export function reservedQty(book, k) {
  let r = 0;
  for (const o of book.orders) if (o.status === 'OPEN' && o.side === 'S' && o.k === k) r += o.qty;
  return r;
}
export function availableCash(book) { return book.cash - reservedCash(book); }
export function freeQty(book, k) { return (book.holdings[k]?.qty || 0) - reservedQty(book, k); }

function fill(book, o, price, p, t, auto = false) {
  const amount = o.qty * price;
  const h = book.holdings[o.k] || { qty: 0, cost: 0 };
  if (o.side === 'B') {
    book.cash -= amount;
    h.qty += o.qty; h.cost += amount;
  } else {
    const avg = h.qty ? h.cost / h.qty : 0;
    const costOut = Math.round(avg * o.qty);
    book.cash += amount;
    h.qty -= o.qty; h.cost -= costOut;
    if (h.qty === 0) h.cost = 0;
    o.realised = amount - costOut;
  }
  if (h.qty === 0) delete book.holdings[o.k]; else book.holdings[o.k] = h;
  o.status = 'DONE'; o.fill = price; o.filledAt = t; o.fillP = p;
  book.trades.push({ p, k: o.k, side: o.side, qty: o.qty, price, t, id: o.id, auto });
}

// Place an order at price state p. ltp = current price (paise) of the stock.
// Returns { ok, order, msg }. Market orders and marketable limits fill at once.
export function placeOrder(book, req, ltp, p, t) {
  const qty = Math.floor(Number(req.qty));
  const o = { id: book.nextId, k: req.k, side: req.side, type: req.type, qty, at: t, p, status: 'OPEN' };
  if (!(qty >= 1) || qty > 1000000) return { ok: false, msg: 'Enter a quantity between 1 and 10,00,000.' };
  if (req.type === 'LMT') {
    o.limit = Math.round(Number(req.limit) * PAISE);
    if (!(o.limit > 0)) return { ok: false, msg: 'Enter a limit price above zero.' };
  }
  if (req.type === 'SL') {
    if (req.side !== 'S') return { ok: false, msg: 'Stop-loss orders are for selling shares you hold.' };
    o.trigger = Math.round(Number(req.trigger) * PAISE);
    if (!(o.trigger > 0)) return { ok: false, msg: 'Enter a trigger price above zero.' };
    if (o.trigger >= ltp) return { ok: false, msg: 'A stop-loss trigger must be below the last price.' };
  }
  if (req.side === 'S' && freeQty(book, req.k) < qty) {
    const free = Math.max(0, freeQty(book, req.k));
    return { ok: false, msg: free ? `You can sell at most ${fmtQty(free)} shares (the rest are in open orders).` : 'You hold no free shares of this stock. Selling short is not allowed.' };
  }
  const marketable = req.type === 'MKT' || (req.type === 'LMT' && (req.side === 'B' ? ltp <= o.limit : ltp >= o.limit));
  if (req.side === 'B') {
    // a buy that fills now costs qty x price; a resting limit buy holds qty x limit
    const need = qty * (marketable ? ltp : o.limit);
    if (availableCash(book) < need) return { ok: false, msg: `Not enough cash. This order needs ${fmtRs(need)} and you have ${fmtRs(availableCash(book))} available.` };
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
// in the order they were placed. Returns the orders filled.
export function onPriceStep(book, ltpOf, p, t) {
  const filled = [];
  for (const o of book.orders) {
    if (o.status !== 'OPEN') continue;
    const ltp = ltpOf(o.k);
    let go = false;
    if (o.type === 'LMT') go = o.side === 'B' ? ltp <= o.limit : ltp >= o.limit;
    if (o.type === 'SL') go = ltp <= o.trigger;
    if (!go) continue;
    if (o.side === 'B') {
      // the reserved cash (qty x limit) covers the fill because ltp <= limit
      const others = reservedCash(book) - o.qty * o.limit;
      if (book.cash - others < o.qty * ltp) { o.status = 'REJECTED'; o.note = 'Not enough cash when the price was reached.'; continue; }
    } else if ((book.holdings[o.k]?.qty || 0) < o.qty) {
      o.status = 'REJECTED'; o.note = 'Not enough shares when the price was reached.'; continue;
    }
    fill(book, o, ltp, p, t, true);
    filled.push(o);
  }
  return filled;
}

export function bookValue(book, ltpOf) {
  let hv = 0, cost = 0;
  for (const k in book.holdings) { hv += book.holdings[k].qty * ltpOf(+k); cost += book.holdings[k].cost; }
  return { cash: book.cash, holdingsValue: hv, invested: cost, total: book.cash + hv, pnl: hv - cost };
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
export function replay(report, { paths, applied, releasedAt, graceSec = 45, capital }) {
  const cap = Math.round(capital * PAISE);
  const book = { capital: cap, cash: cap, holdings: {}, orders: [], trades: [], nextId: 1 };
  const voided = [];
  let prevP = 0;
  report.trades.forEach((tr, j) => {
    const why = (msg) => voided.push({ ...tr, n: j + 1, why: msg });
    if (tr.k < 0 || tr.k >= paths.length || !(tr.qty >= 1)) return why('not a real order');
    if (tr.p > applied) return why(`made after update ${tr.p}, which the desk has not applied`);
    if (tr.p < prevP) return why('out of order');
    const next = releasedAt && releasedAt[tr.p + 1];
    if (!tr.auto && next && tr.t * 1000 > next + graceSec * 1000) return why(`placed at old prices after update ${tr.p + 1} had moved them`);
    const price = paths[tr.k][tr.p];
    const o = { id: j + 1, k: tr.k, side: tr.side, qty: tr.qty };
    if (tr.side === 'B' && book.cash < tr.qty * price) return why('not enough cash');
    if (tr.side === 'S' && (book.holdings[tr.k]?.qty || 0) < tr.qty) return why('sold shares it did not hold');
    fill(book, o, price, tr.p, tr.t, tr.auto);
    prevP = tr.p;
  });
  const v = bookValue(book, (k) => paths[k][applied]);
  const capitalMismatch = report.capital !== Math.round(cap / PAISE);
  return { team: report.team, fills: report.trades.length, kept: book.trades.length, voided, book, value: v.total, ret: v.total / cap - 1, cash: book.cash, capitalMismatch };
}
