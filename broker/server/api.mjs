// The server: accounts, prices, trades, loans, updates and the host's controls.
// It runs inside the Netlify function (netlify/functions/api.mjs) and, for tests and the
// local server, against an in-memory store with the same interface.
//
// Who may see what (tests/api.test.mjs checks every rule):
//  - An investor sees prices, their own account, their own loans (with the other party's
//    name) and the host's updates. Never another investor's money, holdings or details,
//    never the host's price moves, levels or the price seed.
//  - The host (password) sees everything: every account, every loan, every move.
//  - Prices are worked out here only, from the time and a secret seed, so nobody can
//    read a future price from the website.

import { STOCKS, TICKERS, BY_T, START_CASH } from '../src/stocks.mjs';
import { priceAt, pricesAt, levelsAt, levelAt, marketTime, isRunning, setRunning, wallTimeOf, LEVEL_MIN, LEVEL_MAX } from './model.mjs';

const KEY = 'state';
const TOKEN_MS = 30 * 864e5;
const MAX_TRADES = 5000;
const enc = new TextEncoder();

// ---------------- responses ----------------

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
const ok = (body = {}) => json({ ok: true, ...body });
// A refusal (not enough cash, market closed, wrong password…) is an ordinary answer.
const refuse = (error, extra = {}) => json({ ok: false, refused: true, error, ...extra });
const denied = (error = 'Please sign in again.') => json({ ok: false, auth: true, error }, 401);
class Refusal { constructor(msg) { this.msg = msg; } }
const no = (msg) => { throw new Refusal(msg); };

// ---------------- crypto ----------------

const b64 = (buf) => Buffer.from(buf).toString('base64url');
async function pbkdf2(pass, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' }, key, 256);
  return b64(new Uint8Array(bits));
}
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(msg))));
}
function randomId(n = 16, abc = 'abcdefghijkmnpqrstuvwxyz23456789') {
  return Array.from(crypto.getRandomValues(new Uint8Array(n)), (x) => abc[x % abc.length]).join('');
}
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function makeToken(s, sub, now) {
  const body = b64(enc.encode(JSON.stringify({ s: sub, x: now + TOKEN_MS })));
  return `${body}.${await hmac(s.secret, body)}`;
}
async function readToken(s, tok, now) {
  if (typeof tok !== 'string' || tok.length > 400) return null;
  const [body, sig] = tok.split('.');
  if (!body || !sig || !safeEqual(sig, await hmac(s.secret, body))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return p.x > now ? p.s : null;
  } catch { return null; }
}

// ---------------- the stored game ----------------

function freshState(now, keep = {}) {
  return {
    v: 1,
    created: now,
    secret: keep.secret || randomId(32),
    seed: randomId(16),
    host: keep.host || null, // { salt, hash, hv }
    clock: [[now, 0, 0]],
    moves: {}, // ticker -> [[marketTime, fromLevel, toLevel, durationMs, wallTime, label]]
    users: keep.users || [],
    loans: [],
    updates: [],
    n: { user: keep.users ? keep.n.user : 0, loan: 0, update: 0 },
    uv: 0,
  };
}
function freshAccount(u, now) {
  u.cash = START_CASH; u.h = {}; u.rz = 0; u.tr = []; u.reset = now;
  return u;
}

async function load(store, now) {
  let r = await store.getMeta(KEY);
  if (!r) {
    await store.set(KEY, freshState(now), { onlyIfNew: true });
    r = await store.getMeta(KEY);
  }
  return r;
}

const hasDue = (s, now) => s.loans.some((L) => L.status === 'ongoing' && L.due <= now);

/** Read, change and save the game, safely even when many people act at once. */
async function mutate(store, now, fn) {
  for (let k = 0; k < 12; k++) {
    const cur = await load(store, now);
    const s = structuredClone(cur.data);
    const settled = settleDue(s, now);
    let out;
    try { out = await fn(s); } catch (e) {
      if (!(e instanceof Refusal)) throw e;
      if (settled) { s.v = (cur.data.v || 0) + 1; s.wid = randomId(10); await store.set(KEY, s, { onlyIfMatch: cur.etag }); } // keep the settlement
      throw e;
    }
    if (out === NOCHANGE && !settled) return { s: cur.data, out };
    s.v = (cur.data.v || 0) + 1;
    s.wid = randomId(10); // this write's own stamp, to confirm it really landed
    const res = await store.set(KEY, s, { onlyIfMatch: cur.etag });
    if (res.modified && (res.etag || (await store.getMeta(KEY))?.data?.wid === s.wid)) return { s, out };
    await new Promise((r) => setTimeout(r, 8 + Math.random() * 25 * (k + 1)));
  }
  throw new Error('busy');
}
const NOCHANGE = Symbol('nochange');

async function readState(store, now) {
  const cur = await load(store, now);
  if (hasDue(cur.data, now)) return (await mutate(store, now, () => NOCHANGE)).s;
  return cur.data;
}

const userById = (s, id) => s.users.find((u) => u.id === id) || null;
const tIndex = (t) => TICKERS.indexOf(t);

// ---------------- money ----------------

function accrued(L, w) {
  const f = Math.min(1, Math.max(0, (w - L.start) / Math.max(1, L.due - L.start)));
  return L.amount + Math.round((L.final - L.amount) * f);
}

/** An account in figures. Liquidable = cash + what the shares would sell for now. */
function summary(s, u, now, prices) {
  let hv = 0; let inv = 0;
  for (const [t, [q, c]] of Object.entries(u.h)) { hv += q * prices[t]; inv += c; }
  let rec = 0; let pay = 0;
  for (const L of s.loans) {
    if (L.status !== 'ongoing') continue;
    if (L.lender === u.id) rec += accrued(L, now);
    if (L.borrower === u.id) pay += accrued(L, now);
  }
  const liq = u.cash + hv;
  const nw = liq + rec - pay;
  const pnl = nw - START_CASH;
  return { cash: u.cash, hv, inv, upl: hv - inv, rpl: u.rz, liq, rec, pay, nw, pnl, pct: Math.round((pnl / START_CASH) * 1e6) / 1e4 };
}

function buy(u, t, q, p, w, m) {
  const cost = q * p;
  if (cost > u.cash) {
    const max = Math.max(0, Math.floor(u.cash / p));
    no(u.cash <= 0 ? 'You have no cash to buy with.' : `Not enough cash: ${q} × ₹${(p / 100).toFixed(2)} costs ₹${(cost / 100).toFixed(2)}. You can buy up to ${max}.`);
  }
  u.cash -= cost;
  const h = (u.h[t] ||= [0, 0]);
  h[0] += q; h[1] += cost;
  u.tr.push([w, m, tIndex(t), q, p]);
  if (u.tr.length > MAX_TRADES) u.tr.splice(0, u.tr.length - MAX_TRADES);
}

function sell(u, t, q, p, w, m, forced = 0) {
  const h = u.h[t];
  if (!h || h[0] < q) no(h ? `You hold only ${h[0]} ${t}.` : `You do not hold any ${t}.`);
  const costOut = Math.round((h[1] * q) / h[0]);
  h[0] -= q; h[1] -= costOut;
  if (h[0] === 0) delete u.h[t];
  const proceeds = q * p;
  u.cash += proceeds;
  u.rz += proceeds - costOut;
  u.tr.push(forced ? [w, m, tIndex(t), -q, p, 1] : [w, m, tIndex(t), -q, p]);
  if (u.tr.length > MAX_TRADES) u.tr.splice(0, u.tr.length - MAX_TRADES);
}

// ---------------- loans ----------------

/** Repay every loan whose deadline has passed, at its deadline. Returns true if any. */
function settleDue(s, now) {
  const due = s.loans.filter((L) => L.status === 'ongoing' && L.due <= now).sort((a, b) => a.due - b.due);
  for (const L of due) settleLoan(s, L, L.due);
  return due.length > 0;
}

// At the deadline the borrower repays the loan plus interest to the lender. If the
// borrower's cash is short, their shares are sold (largest holding first, at the price at
// the deadline) until it is covered. If even that is not enough, the borrower's cash goes
// below zero: the lender is always paid in full.
function settleLoan(s, L, at) {
  const b = userById(s, L.borrower);
  const l = userById(s, L.lender);
  const sold = [];
  if (b && b.cash < L.final) {
    const m = marketTime(s.clock, at);
    const hs = Object.entries(b.h).map(([t, [q]]) => ({ t, q, p: priceAt(s, t, m) })).sort((x, y) => y.q * y.p - x.q * x.p);
    for (const x of hs) {
      const need = L.final - b.cash;
      if (need <= 0) break;
      const q = Math.min(x.q, Math.ceil(need / x.p));
      sell(b, x.t, q, x.p, at, m, 1);
      sold.push([x.t, q, x.p]);
    }
  }
  if (b) b.cash -= L.final;
  if (l) l.cash += L.final;
  L.status = 'elapsed';
  L.settledAt = at;
  L.sold = sold;
  L.short = b && b.cash < 0 ? -b.cash : 0;
}

function loanForHost(L, now) {
  return { ...L, now: L.status === 'ongoing' ? accrued(L, now) : null };
}
function loanForUser(L, uid) {
  const role = L.lender === uid ? 'lender' : 'borrower';
  return {
    id: L.id, n: L.n, role, other: role === 'lender' ? L.borrowerName : L.lenderName,
    amount: L.amount, rate: L.rate, final: L.final, start: L.start, due: L.due, mins: L.mins,
    status: L.status, settledAt: L.settledAt || null, cancelledAt: L.cancelledAt || null,
    sold: role === 'borrower' ? (L.sold || []) : [], short: role === 'borrower' ? (L.short || 0) : 0,
  };
}

// ---------------- documents ----------------

function market(s, now) {
  const m = marketTime(s.clock, now);
  return { g: s.created, open: isRunning(s.clock), m, p: pricesAt(s, m), o: pricesAt(s, 0) };
}
const updatesDoc = (s) => s.updates.slice().sort((a, b) => a.n - b.n).map((x) => ({ id: x.id, n: x.n, text: x.text, at: x.at, ed: x.ed || null }));
const tradeDoc = (r) => ({ w: r[0], t: TICKERS[r[2]], q: r[3], p: r[4], f: r[5] ? 1 : 0 });
const holdingsDoc = (u) => Object.entries(u.h).map(([t, [q, c]]) => ({ t, q, cost: c }));

function meDoc(s, u, now, prices) {
  return {
    id: u.id, name: u.name, email: u.email, phone: u.phone, org: u.org, joined: u.joined,
    cash: u.cash, h: holdingsDoc(u), sum: summary(s, u, now, prices),
    tr: u.tr.slice(-150).map(tradeDoc).reverse(), ntr: u.tr.length,
    loans: s.loans.filter((L) => L.lender === u.id || L.borrower === u.id).map((L) => loanForUser(L, u.id)),
  };
}

function hostUserRow(s, u, now, prices) {
  const last = u.tr.length ? u.tr[u.tr.length - 1][0] : null;
  return {
    id: u.id, no: u.no, name: u.name, email: u.email, phone: u.phone, org: u.org, joined: u.joined, last: u.last || null,
    lastTrade: last, ntr: u.tr.length, h: holdingsDoc(u), sum: summary(s, u, now, prices),
  };
}

function moveLog(s, limit = 150) {
  const out = [];
  for (const [t, list] of Object.entries(s.moves)) for (const x of list) out.push({ t, m: x[0], from: x[1], to: x[2], dur: x[3], w: x[4], label: x[5] || '' });
  return out.sort((a, b) => b.w - a.w).slice(0, limit);
}

const RANGES = { '5m': [300e3, 2e3], '30m': [1800e3, 10e3], '1h': [3600e3, 20e3], '1d': [86400e3, 480e3] };

/** Prices over a range of market time (the history every stock already has included). */
function priceHistory(s, tickers, range, now) {
  const [span, step] = RANGES[range] || RANGES['30m'];
  const m = marketTime(s.clock, now);
  const xs = [];
  for (let x = Math.ceil((m - span) / step) * step; x < m; x += step) xs.push(x);
  xs.push(m);
  const ws = xs.map((x) => Math.round(wallTimeOf(s.clock, x, now)));
  const p = {};
  for (const t of tickers) p[t] = xs.map((x) => priceAt(s, t, x));
  return { g: s.created, m, xs, ws, p };
}

/** An account's net worth over time, rebuilt from its trades, loans and the prices. */
function accountHistory(s, u, now, range) {
  const spans = { '30m': 1800e3, '1h': 3600e3, '1d': 86400e3 };
  const start0 = Math.max(u.reset || u.joined, s.created);
  const from = Math.max(start0, now - (spans[range] || spans['1d']));
  const ev = [];
  for (const r of u.tr) ev.push([r[0], 0, -r[3] * r[4], r[2], r[3]]);
  const mine = s.loans.filter((L) => L.lender === u.id || L.borrower === u.id);
  for (const L of mine) {
    const sign = L.lender === u.id ? -1 : 1;
    ev.push([L.start, 1, sign * L.amount]);
    if (L.status === 'elapsed') ev.push([L.settledAt, 2, -sign * L.final]);
    if (L.status === 'cancelled') ev.push([L.cancelledAt, 2, -sign * L.amount]);
  }
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const N = 160;
  const ws = [];
  for (let k = 0; k < N; k++) ws.push(Math.round(from + ((now - from) * k) / N));
  ws.push(now);
  let cash = START_CASH; const q = new Array(TICKERS.length).fill(0); let i = 0;
  const nw = []; const lq = [];
  for (const w of ws) {
    while (i < ev.length && ev[i][0] <= w) {
      const e = ev[i++];
      cash += e[2];
      if (e[1] === 0) q[e[3]] += e[4];
    }
    const m = marketTime(s.clock, w);
    let hv = 0;
    for (let k = 0; k < q.length; k++) if (q[k]) hv += q[k] * priceAt(s, TICKERS[k], m);
    let rec = 0; let pay = 0;
    for (const L of mine) {
      const end = L.settledAt || L.cancelledAt || Infinity;
      if (L.start <= w && w < end) { if (L.lender === u.id) rec += accrued(L, w); else pay += accrued(L, w); }
    }
    lq.push(cash + hv);
    nw.push(cash + hv + rec - pay);
  }
  return { ws, nw, lq };
}

// ---------------- input checks ----------------

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanText = (v, max) => String(v ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, max);
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
function rupeesToPaise(v) {
  const n = Number(String(v ?? '').replace(/[₹,\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

// ---------------- the handler ----------------

export async function handle(request, store, env = {}) {
  const now = env.now ? env.now() : Date.now();
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, '').replace(/\/+$/, '');
  const method = request.method.toUpperCase();
  let body = {};
  if (method === 'POST') {
    const text = await request.text();
    if (text.length > 20000) return refuse('That is too long.');
    try { body = text ? JSON.parse(text) : {}; } catch { return refuse('That request could not be read.'); }
  }
  const token = request.headers.get('x-token') || '';
  try {
    return await route({ path, method, body, url, token, store, env, now });
  } catch (e) {
    if (e instanceof Refusal) return refuse(e.msg);
    if (e.message === 'busy') return json({ ok: false, error: 'The server is busy. Please try again.' }, 503);
    console.error(e);
    return json({ ok: false, error: 'Something went wrong on the server. Please try again.' }, 500);
  }
}

async function route(c) {
  const { path, method, body, url, token, store, env, now } = c;
  const POST = method === 'POST';

  if (path === 'health') return ok({ storage: store.kind, now });

  // ---- public: prices ----
  if (path === 'market' && !POST) {
    const s = await readState(store, now);
    return ok({ now, mk: market(s, now) });
  }
  if (path === 'history' && !POST) {
    const s = await readState(store, now);
    const t = url.searchParams.get('t') || 'all';
    const tickers = t === 'all' ? TICKERS : t.split(',').filter((x) => BY_T[x]);
    if (!tickers.length) return refuse('Unknown stock.');
    return ok({ now, ...priceHistory(s, tickers, url.searchParams.get('r') || '30m', now) });
  }

  // ---- investors: sign up and sign in ----
  if (path === 'signup' && POST) {
    const name = clean(body.name, 60); const email = clean(body.email, 120).toLowerCase();
    const phone = clean(body.phone, 20); const org = clean(body.org, 80); const pass = String(body.password ?? '');
    if (name.length < 2) no('Please type your full name.');
    if (!isEmail(email)) no('Please type a valid email address.');
    if (!/^[+\d][\d\s-]{6,19}$/.test(phone)) no('Please type a valid phone number.');
    if (pass.length < 6 || pass.length > 100) no('Choose a password of at least 6 characters.');
    const salt = randomId(16);
    const hash = await pbkdf2(pass, salt);
    const { s, out: u } = await mutate(store, now, (s) => {
      if (s.users.some((x) => x.email === email)) no('An account with that email already exists. Please sign in.');
      s.n.user += 1;
      const u = freshAccount({ id: `u${s.n.user}${randomId(4)}`, no: s.n.user, name, email, phone, org, salt, hash, joined: now, last: now }, now);
      s.users.push(u);
      return u;
    });
    const m = marketTime(s.clock, now);
    return ok({ token: await makeToken(s, `u:${u.id}`, now), me: meDoc(s, userById(s, u.id), now, pricesAt(s, m)) });
  }
  if (path === 'login' && POST) {
    const email = clean(body.email, 120).toLowerCase(); const pass = String(body.password ?? '');
    const s0 = await readState(store, now);
    const u0 = s0.users.find((x) => x.email === email);
    if (!u0 || !safeEqual(await pbkdf2(pass, u0.salt), u0.hash)) no('That email and password do not match an account.');
    const { s } = await mutate(store, now, (s) => { const u = userById(s, u0.id); if (!u) no('That account no longer exists.'); u.last = now; });
    return ok({ token: await makeToken(s, `u:${u0.id}`, now) });
  }

  // ---- the host ----
  if (path.startsWith('host/') || path === 'host') return hostRoute(c);

  // ---- investors: signed in ----
  const s = await readState(store, now);
  const sub = await readToken(s, token, now);
  const me = sub && sub.startsWith('u:') ? userById(s, sub.slice(2)) : null;
  if (!me) return denied();

  if (path === 'poll' && !POST) {
    const mk = market(s, now);
    const uv = Number(url.searchParams.get('uv'));
    return ok({ now, mk, me: meDoc(s, me, now, mk.p), uv: s.uv, ...(uv !== s.uv ? { updates: updatesDoc(s) } : {}) });
  }
  if (path === 'me/history' && !POST) {
    return ok({ now, ...accountHistory(s, me, now, url.searchParams.get('r') || '1d') });
  }
  if (path === 'trade' && POST) {
    const t = String(body.t || ''); const side = body.side === 'sell' ? 'sell' : body.side === 'buy' ? 'buy' : null;
    const q = Number(body.q);
    if (!BY_T[t]) no('Unknown stock.');
    if (!side) no('Choose Buy or Sell.');
    if (!Number.isInteger(q) || q < 1 || q > 10000000) no('Quantity must be a whole number of shares, at least 1.');
    const { s: s2, out } = await mutate(store, now, (s) => {
      if (!isRunning(s.clock)) no('The market is closed. Orders open when the host opens the market.');
      const u = userById(s, me.id);
      if (!u) no('That account no longer exists.');
      const m = marketTime(s.clock, now);
      const p = priceAt(s, t, m);
      if (side === 'buy') buy(u, t, q, p, now, m); else sell(u, t, q, p, now, m);
      return { t, side, q, p, value: q * p, at: now };
    });
    const mk = market(s2, now);
    return ok({ fill: out, now, mk, me: meDoc(s2, userById(s2, me.id), now, mk.p) });
  }
  return json({ ok: false, error: 'Not found' }, 404);
}

async function hostRoute(c) {
  const { path, method, body, url, token, store, env, now } = c;
  const POST = method === 'POST';
  const envPass = env.HOST_PASSWORD || '';

  if (path === 'host/status' && !POST) {
    const s = await readState(store, now);
    return ok({ setup: !!(s.host || envPass) });
  }
  if (path === 'host/setup' && POST) {
    if (envPass) no('The host password is set on the server. Use it to sign in.');
    const pass = String(body.password ?? '');
    if (pass.length < 6) no('Choose a password of at least 6 characters.');
    const salt = randomId(16); const hash = await pbkdf2(pass, salt);
    const { s } = await mutate(store, now, (s) => {
      if (s.host) no('The host password has already been chosen. Sign in with it.');
      s.host = { salt, hash, hv: 1 };
    });
    return ok({ token: await makeToken(s, `host:${s.host.hv}`, now) });
  }
  if (path === 'host/login' && POST) {
    const pass = String(body.password ?? '');
    const s = await readState(store, now);
    const hv = s.host?.hv || 0;
    const good = envPass ? safeEqual(pass, envPass) : (s.host && safeEqual(await pbkdf2(pass, s.host.salt), s.host.hash));
    if (!good) no(s.host || envPass ? 'Wrong host password.' : 'No host password yet: choose one first.');
    return ok({ token: await makeToken(s, `host:${hv}`, now) });
  }

  const s = await readState(store, now);
  const sub = await readToken(s, token, now);
  if (!sub || sub !== `host:${s.host?.hv || 0}`) return denied('Please sign in as the host.');

  // ---- reading ----
  if (path === 'host/poll' && !POST) {
    const mk = market(s, now);
    const m = mk.m;
    return ok({
      now, mk: { ...mk, lv: levelsAt(s, m), base: Object.fromEntries(STOCKS.map((x) => [x.t, x.base])) },
      moves: moveLog(s),
      users: s.users.map((u) => hostUserRow(s, u, now, mk.p)),
      loans: s.loans.map((L) => loanForHost(L, now)),
      updates: updatesDoc(s), uv: s.uv,
      env: !!envPass, storage: store.kind,
    });
  }
  if (path === 'host/user' && !POST) {
    const u = userById(s, url.searchParams.get('id'));
    if (!u) no('That investor was not found.');
    const mk = market(s, now);
    return ok({
      now, user: { ...hostUserRow(s, u, now, mk.p), tr: u.tr.map(tradeDoc).reverse() },
      loans: s.loans.filter((L) => L.lender === u.id || L.borrower === u.id).map((L) => loanForHost(L, now)),
      hist: accountHistory(s, u, now, url.searchParams.get('r') || '1d'),
    });
  }

  if (!POST) return json({ ok: false, error: 'Not found' }, 404);

  // ---- the market ----
  if (path === 'host/market') {
    const { s: s2 } = await mutate(store, now, (s) => {
      const next = setRunning(s.clock, now, !!body.open);
      if (next === s.clock) return NOCHANGE;
      s.clock = next;
    });
    return ok({ open: isRunning(s2.clock) });
  }
  if (path === 'host/move') {
    const t = String(body.t || '');
    if (!BY_T[t]) no('Unknown stock.');
    const mode = ['pct', 'price', 'base'].includes(body.mode) ? body.mode : null;
    if (!mode) no('Choose how to move the price.');
    const value = Number(String(body.value ?? '').replace(/[₹,%\s]/g, ''));
    if (mode !== 'base' && !Number.isFinite(value)) no('Type a number.');
    if (mode === 'pct' && (value <= -95 || value > 1000)) no('Choose a change between −95% and +1000%.');
    if (mode === 'price' && value <= 0) no('Type a price above zero.');
    const secs = Math.round(Number(body.secs) || 0);
    if (secs < 0 || secs > 7200) no('Choose a time between instant and 2 hours.');
    const { out } = await mutate(store, now, (s) => {
      const m = marketTime(s.clock, now);
      const list = (s.moves[t] ||= []);
      const from = levelAt(list, m);
      let to = mode === 'pct' ? from * (1 + value / 100) : mode === 'price' ? (value * 100) / BY_T[t].base : 1;
      to = Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, to));
      const label = mode === 'pct' ? `${value > 0 ? '+' : ''}${value}%` : mode === 'price' ? `to ₹${value}` : 'back to listed price';
      list.push([m, from, to, secs * 1000, now, label]);
      if (list.length > 400) list.splice(0, list.length - 400);
      return { t, from, to, secs, label };
    });
    return ok({ move: out });
  }

  // ---- loans ----
  if (path === 'host/loan') {
    const amount = rupeesToPaise(body.amount);
    const rate = Number(body.rate);
    const mins = Number(body.mins);
    if (!Number.isFinite(amount) || amount < 100) no('Type a loan amount of at least ₹1.');
    if (!Number.isFinite(rate) || rate < 0 || rate > 1000) no('Type an interest rate between 0% and 1000%.');
    if (!Number.isFinite(mins) || mins < 0.1 || mins > 30 * 24 * 60) no('Choose a deadline between 6 seconds (0.1 min) and 30 days.');
    const { out } = await mutate(store, now, (s) => {
      const l = userById(s, body.lender); const b = userById(s, body.borrower);
      if (!l || !b) no('Choose both the lender and the borrower.');
      if (l.id === b.id) no('The lender and the borrower must be different people.');
      if (l.cash < amount) no(`${l.name} has only ₹${(l.cash / 100).toFixed(2)} in cash, less than the loan.`);
      s.n.loan += 1;
      const L = {
        id: `L${s.n.loan}`, n: s.n.loan, lender: l.id, borrower: b.id, lenderName: l.name, borrowerName: b.name,
        amount, rate, final: Math.round(amount * (1 + rate / 100)), start: now, due: now + Math.round(mins * 60000), mins,
        status: 'ongoing', settledAt: null, cancelledAt: null, sold: [], short: 0,
      };
      l.cash -= amount; b.cash += amount;
      s.loans.push(L);
      return L;
    });
    return ok({ loan: out });
  }
  if (path === 'host/loan/cancel') {
    await mutate(store, now, (s) => {
      const L = s.loans.find((x) => x.id === body.id);
      if (!L) no('That loan was not found.');
      if (L.status !== 'ongoing') no('Only an ongoing loan can be cancelled.');
      const l = userById(s, L.lender); const b = userById(s, L.borrower);
      if (b) b.cash -= L.amount;
      if (l) l.cash += L.amount;
      L.status = 'cancelled'; L.cancelledAt = now;
    });
    return ok();
  }

  // ---- updates ----
  if (path === 'host/update') {
    const text = cleanText(body.text, 4000);
    if (!text) no('Type the update first.');
    const { out } = await mutate(store, now, (s) => {
      s.n.update += 1;
      const x = { id: `U${s.n.update}`, n: s.n.update, text, at: now };
      s.updates.push(x); s.uv += 1;
      return x;
    });
    return ok({ update: out });
  }
  if (path === 'host/update/edit') {
    const text = cleanText(body.text, 4000);
    if (!text) no('An update cannot be empty.');
    await mutate(store, now, (s) => {
      const x = s.updates.find((u) => u.id === body.id);
      if (!x) no('That update was not found.');
      x.text = text; x.ed = now; s.uv += 1;
    });
    return ok();
  }
  if (path === 'host/update/delete') {
    await mutate(store, now, (s) => {
      const i = s.updates.findIndex((u) => u.id === body.id);
      if (i < 0) no('That update was not found.');
      s.updates.splice(i, 1); s.uv += 1;
    });
    return ok();
  }

  // ---- accounts and the game ----
  if (path === 'host/user/delete') {
    await mutate(store, now, (s) => {
      const u = userById(s, body.id);
      if (!u) no('That investor was not found.');
      if (s.loans.some((L) => L.status === 'ongoing' && (L.lender === u.id || L.borrower === u.id))) no('This investor has an ongoing loan. Cancel it or wait for it to end first.');
      s.users = s.users.filter((x) => x.id !== u.id);
    });
    return ok();
  }
  if (path === 'host/password') {
    if (envPass) no('The host password is set on the server (HOST_PASSWORD); change it there.');
    const pass = String(body.password ?? '');
    if (pass.length < 6) no('Choose a password of at least 6 characters.');
    if (!s.host || !safeEqual(await pbkdf2(String(body.old ?? ''), s.host.salt), s.host.hash)) no('The current password is wrong.');
    const salt = randomId(16); const hash = await pbkdf2(pass, salt);
    const { s: s2 } = await mutate(store, now, (s) => { s.host = { salt, hash, hv: (s.host?.hv || 1) + 1 }; });
    return ok({ token: await makeToken(s2, `host:${s2.host.hv}`, now) });
  }
  if (path === 'host/reset') {
    if (body.confirm !== 'RESET') no('Type RESET to confirm.');
    const everything = body.mode === 'everything';
    const { s: s2 } = await mutate(store, now, (s) => {
      const users = everything ? [] : s.users.map((u) => freshAccount(u, now));
      const next = freshState(now, { host: s.host, secret: everything ? null : s.secret, users: everything ? null : users, n: s.n });
      Object.keys(s).forEach((k) => delete s[k]);
      Object.assign(s, next);
    });
    return ok({ token: await makeToken(s2, `host:${s2.host?.hv || 0}`, now) });
  }
  return json({ ok: false, error: 'Not found' }, 404);
}
