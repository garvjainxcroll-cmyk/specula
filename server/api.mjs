// The SPECULA server: storage, permissions and the live game.
// Runs inside the Netlify function (netlify/functions/store.mjs) and, for tests and the
// local dev server, against an in-memory store with the same interface.
//
// Permission rules (all tested in tests/api.test.mjs):
//  - Anyone may read the public state and public documents. They never contain the script
//    beyond what has already been revealed (the current round's headlines and question,
//    and crisis stages already released).
//  - Results are hidden: no public document holds another fund's value, profit, forecast
//    marks, auction bid or standing. A fund sees only its own (with its token). The final
//    standings become public only when the Event Head presses "Reveal the results".
//  - A team member (token from joining with the fund code) may place orders, forecasts and
//    an auction bid for their own fund only, only while the window is open, only at the
//    current prices (epoch). Late orders are refused.
//  - Only the Event Head (password) may create teams, open windows, release crises, settle,
//    reset and export. The Event Head is the only one who sees unreleased crises.

import { newGame, openQuarter, fireStage, settleQuarter, finalRelease, stagesFor, checkOrder, standingsNow } from '../src/engine/game.mjs';
import { carryRates, rupeePrice } from '../src/engine/market.mjs';
import { ruleText, smoothingText } from '../src/engine/macro.mjs';
import { ECON_ORDER } from '../src/config/economies.mjs';
import { INST_IDS, INST } from '../src/config/instruments.mjs';
import { RULES } from '../src/config/rules.mjs';
import { SCRIPT as LIVE_SCRIPT } from './script.mjs';
import { RUNSHEET, ROUND_SUMMARIES } from './runsheet.mjs';

const GRACE_MS = 1500;
const REOPEN_AFTER_LATE_CRISIS_MS = 30000;
const enc = new TextEncoder();
let SCRIPT = LIVE_SCRIPT;
export function useScript(s) { SCRIPT = s; } // tests only

// ---------------- small helpers ----------------

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra } });
}
const fail = (status, error, extra = {}) => json({ ok: false, error, ...extra }, status);
// A refusal (late order, over the limit, wrong code…) is a normal answer, not a failed
// request: it is sent with status 200 so browsers do not log it as an error.
const refuse = (code, error, extra = {}) => json({ ok: false, refused: true, code, error, ...extra }, 200);

const b64 = (buf) => Buffer.from(new Uint8Array(buf)).toString('base64url');
async function sha(pass, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 120000, hash: 'SHA-256' }, key, 256);
  return b64(bits);
}
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}
function randomId(n = 10, alphabet = 'abcdefghijkmnpqrstuvwxyz23456789') {
  const a = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(a, (x) => alphabet[x % alphabet.length]).join('');
}
const fundCode = () => randomId(6, 'ABCDEFGHJKMNPQRSTUVWXYZ23456789');
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// ---------------- storage wrappers ----------------

async function getJ(store, key) { return (await store.get(key)) ?? null; }
async function update(store, key, fn, { tries = 8 } = {}) {
  for (let k = 0; k < tries; k++) {
    const cur = await store.getMeta(key);
    const next = await fn(cur ? cur.data : null);
    if (next === undefined) return cur ? cur.data : null;
    const res = cur ? await store.set(key, next, { onlyIfMatch: cur.etag }) : await store.set(key, next, { onlyIfNew: true });
    if (res.modified) return next;
    await new Promise((r) => setTimeout(r, 15 + Math.random() * 40 * (k + 1)));
  }
  throw new Error(`Busy: could not save ${key}, please try again`);
}

let cache = { worldV: -1, world: null };
async function loadWorld(store, state) {
  if (cache.world && cache.worldV === state.worldV) return cache.world;
  const w = await getJ(store, 'world');
  cache = { worldV: state.worldV, world: w };
  return w;
}
async function saveWorld(store, world, state) {
  state.worldV = (state.worldV || 0) + 1;
  await store.set('world', world);
  cache = { worldV: state.worldV, world };
}

function freshState() {
  return { v: 1, phase: 'setup', q: 0, round: 0, timer: { endsAt: null, pausedLeft: null, seconds: RULES.windowSeconds }, epoch: 0, fired: [], teams: [], docs: {}, worldV: 0, scriptId: SCRIPT.id };
}
async function getState(store) { return (await getJ(store, 'state')) || freshState(); }
async function setState(store, mutate) {
  return update(store, 'state', async (cur) => {
    const s = cur || freshState();
    const out = await mutate(structuredClone(s));
    if (out === undefined) return undefined;
    out.v = (s.v || 0) + 1;
    return out;
  });
}

// ---------------- public documents ----------------

function pickStagePublic(st, release) {
  return {
    id: st.id, crisisId: st.crisisId, crisisTitle: st.crisisTitle, stageNo: st.stageNo, of: st.of, title: st.title, headline: st.headline,
    posts: st.posts || [], rules: st.rules || [], M: st.M || null, spreadMult: st.spreadMult || null, pegBreak: !!st.pegBreak,
    defaultEntity: st.defaultEntity || null, revisions: (release?.revisions || []).filter((r) => r.label === st.title),
  };
}

function quarterDoc(world) {
  const run = world.run;
  const stages = run ? stagesFor(SCRIPT, run.q).filter((s) => run.fired.includes(s.id)) : [];
  const mods = world.round.mods;
  return {
    q: run ? run.q : world.q, roundName: run?.roundName,
    release: world.release,
    run: run ? {
      q: run.q, round: run.round, roundName: run.roundName, newRound: run.newRound, headlines: run.headlines, forecast: run.forecast,
      auction: run.auction, exp: run.exp, spreads: run.spreads, M: run.M, open: run.open,
      epochs: run.epochs, fired: run.fired, marked: publicMarks(run.marked),
      stages: stages.map((s) => pickStagePublic(s, world.release)),
    } : null,
    mkt: { econ: world.mkt.econ, glob: world.mkt.glob, px: world.mkt.px },
    sigma: world.sigma, round: world.round,
    rules: Object.fromEntries(ECON_ORDER.map((e) => [e, { rule: ruleText(e, mods), smoothing: smoothingText(e, mods) }])),
    carry: carryRates(world.mkt),
    lastPx: world.run ? world.lastPx : (world.prevPx || world.lastPx),
    prices: Object.fromEntries(INST_IDS.map((id) => [id, rupeePrice(world.mkt, id)])),
    final: world.final ? { release: world.final.release, marked: publicMarks(world.final.marked) } : null,
  };
}

// Which forecast was marked and the actual figure: public. Each fund's points: private.
function publicMarks(m) { return m ? { q: m.q, spec: m.spec, actual: m.actual } : null; }

// Public history: the economies and prices round by round, never the funds.
function publicHistory(history) {
  return history.map(({ q, econ, prices, fear, stages, decisions }) => ({ q, econ, prices, fear, stages, decisions }));
}

// The auction outcome as a central bank would publish it: no bidder, no individual bid.
function publicAuction(a) {
  if (!a) return null;
  const filled = a.bids.filter((b) => b.allotted > 0);
  const bidPaise = a.bids.reduce((x, b) => x + b.amount, 0);
  return {
    spec: a.spec, fair: a.fair, soldPaise: a.soldPaise, bidPaise, bidders: a.bids.length,
    cutoff: filled.length ? Math.min(...filled.map((b) => b.price)) : null,
    cover: a.spec.sizeCr ? Math.round((bidPaise / (a.spec.sizeCr * 1e9)) * 100) / 100 : null,
  };
}

function resultDoc(result) {
  return {
    q: result.q, round: result.round, decisions: result.decisions, market: result.market, rets: result.rets, crowd: result.crowd,
    carry: result.carry, stages: result.stages, epochs: result.epochs, pxOpen: result.pxOpen, pxBell: result.pxBell, pxSettled: result.pxSettled, release: result.release,
    auction: publicAuction(result.auction),
  };
}

// Everything about every fund: for the Event Head only (never under pub/).
function privateDoc(world, state) {
  const st = standingsNow(world);
  const names = Object.fromEntries(Object.values(world.teams).map((t) => [t.id, t.name]));
  return {
    standings: { rows: st.rows, best: st.best, forecastsScored: st.forecastsScored, final: !!world.final },
    history: world.history,
    final: world.final ? { standings: world.final.standings } : null,
    revealed: !!state.revealed,
    names,
  };
}

function finalDoc(world) {
  const rows = world.final.standings.rows.map(({ id, name, rank, nav, total, rar, forecast, discipline, stats, steps }) => ({ id, name, rank, nav, total, rar, forecast, discipline, stats, steps }));
  return {
    standings: { rows, best: world.final.standings.best, forecastsScored: world.final.standings.forecastsScored, maxF: world.final.standings.maxF },
    release: world.final.release, marked: publicMarks(world.final.marked),
    navPaths: Object.fromEntries(Object.values(world.teams).map((t) => [t.id, t.navHist])),
  };
}

async function writeDocs(store, world, state, { result = null } = {}) {
  state.docs = state.docs || {};
  await store.set('pub/quarter', quarterDoc(world));
  state.docs.quarter = (state.docs.quarter || 0) + 1;
  await store.set('admin/private', privateDoc(world, state));
  state.docs.priv = (state.docs.priv || 0) + 1;
  await store.set('pub/history', publicHistory(world.history));
  state.docs.history = (state.docs.history || 0) + 1;
  if (result) {
    await store.set(`pub/result/${result.q}`, resultDoc(result));
    state.docs.result = result.q;
    for (const [id, r] of Object.entries(result.teams)) await store.set(`team/${id}/r/${result.q}`, r);
  }
  for (const t of Object.values(world.teams)) await store.set(`team/${t.id}`, { team: t, q: world.q });
  // each fund's own refresh signal (its team document changed)
  state.docs.mine = (state.docs.mine || 0) + 1;
  if (world.final && state.revealed) { await store.set('pub/final', finalDoc(world)); state.docs.final = (state.docs.final || 0) + 1; }
}

// ---------------- auth ----------------

async function adminOk(store, body, env) {
  const pass = String(body.password || '');
  if (env?.ADMIN_PASSWORD) return pass.length > 0 && safeEqual(pass, env.ADMIN_PASSWORD);
  const cfg = await getJ(store, 'config');
  if (!cfg?.adminHash) return false;
  return safeEqual(await sha(pass, cfg.salt), cfg.adminHash);
}

async function memberFromToken(store, token) {
  if (typeof token !== 'string' || token.split('.').length !== 3) return null;
  const [teamId, memberId, sig] = token.split('.');
  const sec = await getJ(store, 'secrets');
  if (!sec?.hmacKey) return null;
  const good = await hmac(sec.hmacKey, `${teamId}.${memberId}`);
  if (!safeEqual(sig, good)) return null;
  return { teamId, memberId };
}

// ---------------- handler ----------------

export async function handle(request, store, env = {}) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, '').replace(/^\.netlify\/functions\/store\/?/, '');
  try {
    if (request.method === 'GET') {
      if (path === 'health') return json({ ok: true, storage: store.kind || 'blobs', now: Date.now(), script: SCRIPT.id });
      if (path === 'poll') return await poll(store, url);
      if (path === 'doc') return await doc(store, url);
      if (path === 'mine') return await mine(store, url);
      return fail(404, 'Not found');
    }
    if (request.method !== 'POST') return fail(405, 'Method not allowed');
    let body;
    try { body = await request.json(); } catch { return fail(400, 'Bad request'); }
    if (path === 'join') return await join(store, body);
    if (path === 'order') return await order(store, body);
    if (path === 'forecast') return await forecast(store, body);
    if (path === 'bid') return await bid(store, body);
    if (path === 'admin') return await admin(store, body, env);
    return fail(404, 'Not found');
  } catch (e) {
    return fail(500, e.message || 'Server error');
  }
}

async function poll(store, url) {
  const state = await getState(store);
  const out = { ok: true, now: Date.now(), state: publicState(state) };
  const token = url.searchParams.get('token');
  if (token) {
    const m = await memberFromToken(store, token);
    if (!m) return refuse(401, 'Your sign-in has expired. Join your fund again with its code.', { state: out.state, now: out.now });
    out.me = m;
    if (state.q) out.orders = (await getJ(store, `orders/${state.q}/${m.teamId}`)) || { orders: [], rev: 0 };
  }
  return json(out);
}

function publicState(s) {
  const { worldV, ...rest } = s;
  return { ...rest, teams: (s.teams || []).map((t) => ({ id: t.id, name: t.name, members: (t.members || []).map((m) => ({ id: m.id, name: m.name })) })) };
}

async function doc(store, url) {
  const key = url.searchParams.get('key') || '';
  if (!/^(quarter|history|final|result\/\d{1,2})$/.test(key)) return fail(400, 'Unknown document');
  const d = await getJ(store, `pub/${key}`);
  if (!d) return fail(404, 'Not published yet');
  return json({ ok: true, doc: d });
}

async function mine(store, url) {
  const m = await memberFromToken(store, url.searchParams.get('token'));
  if (!m) return refuse(401, 'Sign in with your fund code');
  const t = await getJ(store, `team/${m.teamId}`);
  const q = Number(url.searchParams.get('q') || 0);
  const r = q ? await getJ(store, `team/${m.teamId}/r/${q}`) : null;
  return json({ ok: true, me: m, team: t?.team || null, result: r });
}

async function join(store, body) {
  const code = String(body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const name = String(body.name || '').trim().slice(0, 24);
  if (!code) return refuse(400, 'Enter your fund code.');
  if (!name) return refuse(400, 'Enter your name.');
  const sec = await getJ(store, 'secrets');
  const teamId = sec && Object.entries(sec.codes || {}).find(([, c]) => c === code)?.[0];
  if (!teamId) return refuse(403, 'That fund code is not recognised. Check it with the Event Head.');
  const memberId = randomId(8);
  const state = await setState(store, (s) => {
    const t = s.teams.find((x) => x.id === teamId);
    if (!t) return undefined;
    t.members = [...(t.members || []), { id: memberId, name, at: Date.now() }].slice(-8);
    return s;
  });
  const token = `${teamId}.${memberId}.${await hmac(sec.hmacKey, `${teamId}.${memberId}`)}`;
  const team = state.teams.find((x) => x.id === teamId);
  return json({ ok: true, token, teamId, memberId, teamName: team?.name });
}

function windowCheck(state, body) {
  if (state.phase !== 'open') return state.phase === 'data' ? 'The window is not open yet.' : 'The window is closed. Late orders are refused.';
  if (Number(body.q) !== state.q) return 'That order was for a different round. Late orders are refused.';
  if (state.timer.pausedLeft !== null && state.timer.pausedLeft !== undefined) return 'The Event Head has paused the market.';
  if (!state.timer.endsAt || Date.now() > state.timer.endsAt + GRACE_MS) return 'The bell has rung. Late orders are refused.';
  return null;
}

async function order(store, body) {
  const m = await memberFromToken(store, body.token);
  if (!m) return refuse(401, 'Sign in with your fund code');
  const state = await getState(store);
  const late = windowCheck(state, body);
  if (late) return refuse(409, late, { late: true });
  if (Number(body.epoch) !== state.epoch) return refuse(409, 'Prices have just moved: a crisis has broken. Check the desk and place your order again.', { stale: true });
  if (!INST[body.inst]) return fail(400, 'Unknown instrument');
  if (!['buy', 'sell', 'close'].includes(body.side)) return fail(400, 'Unknown order type');
  const world = await loadWorld(store, state);
  const id = String(body.id || randomId(12)).slice(0, 40);
  let outcome = null;
  const docKey = `orders/${state.q}/${m.teamId}`;
  await update(store, docKey, async (cur) => {
    const d = cur || { orders: [], rev: 0 };
    if (d.orders.some((o) => o.id === id)) { outcome = { ok: true, duplicate: true }; return undefined; }
    const resolved = d.orders.map((o) => ({ inst: o.inst, delta: o.delta, epoch: o.epoch }));
    const chk = checkOrder(world, m.teamId, resolved, { inst: body.inst, side: body.side, amountCr: Number(body.amountCr) });
    if (!chk.ok) { outcome = { ok: false, reason: chk.reason }; return undefined; }
    const o = { id, inst: body.inst, side: body.side, amountCr: body.side === 'close' ? null : Number(body.amountCr), delta: chk.delta, epoch: state.epoch, by: m.memberId, at: Date.now() };
    outcome = { ok: true, order: o };
    return { ...d, orders: [...d.orders, o], rev: d.rev + 1 };
  });
  if (!outcome.ok) return refuse(422, outcome.reason);
  const doc2 = await getJ(store, docKey);
  return json({ ok: true, order: outcome.order || null, duplicate: !!outcome.duplicate, orders: doc2 });
}

async function forecast(store, body) {
  const m = await memberFromToken(store, body.token);
  if (!m) return refuse(401, 'Sign in with your fund code');
  const state = await getState(store);
  const late = windowCheck(state, body);
  if (late) return refuse(409, late, { late: true });
  const raw = body.value;
  const value = raw === null || raw === '' ? null : Number(raw);
  if (value !== null && (!Number.isFinite(value) || Math.abs(value) > 100)) return refuse(400, 'Enter a percentage, for example 4.25');
  const d = await update(store, `orders/${state.q}/${m.teamId}`, (cur) => {
    const x = cur || { orders: [], rev: 0 };
    return { ...x, forecast: { value: value === null ? null : Math.round(value * 100) / 100, by: m.memberId, at: Date.now() }, rev: x.rev + 1 };
  });
  return json({ ok: true, orders: d });
}

async function bid(store, body) {
  const m = await memberFromToken(store, body.token);
  if (!m) return refuse(401, 'Sign in with your fund code');
  const state = await getState(store);
  const late = windowCheck(state, body);
  if (late) return refuse(409, late, { late: true });
  const world = await loadWorld(store, state);
  if (!world.run?.auction) return refuse(400, 'There is no auction this round.');
  const price = Number(body.price); const amountCr = Number(body.amountCr);
  if (body.cancel) {
    const d = await update(store, `orders/${state.q}/${m.teamId}`, (cur) => ({ ...(cur || { orders: [], rev: 0 }), bid: null, rev: (cur?.rev || 0) + 1 }));
    return json({ ok: true, orders: d });
  }
  if (!(price > 0) || !(amountCr > 0)) return refuse(400, 'Enter a price and an amount above zero.');
  const navCr = world.teams[m.teamId].navHist.at(-1) / 1e9;
  const maxCr = Math.floor(navCr * world.run.auction.maxPctOfFund) / 100;
  if (amountCr > maxCr + 1e-9) return refuse(422, `The most you may bid for is ${world.run.auction.maxPctOfFund}% of your fund value: ₹${maxCr.toFixed(2)} Cr.`);
  const d = await update(store, `orders/${state.q}/${m.teamId}`, (cur) => {
    const x = cur || { orders: [], rev: 0 };
    return { ...x, bid: { price: Math.round(price * 10000) / 10000, amountCr: Math.round(amountCr * 100) / 100, by: m.memberId, at: Date.now() }, rev: x.rev + 1 };
  });
  return json({ ok: true, orders: d });
}

// ---------------- the Event Head ----------------

async function admin(store, body, env) {
  const action = body.action;
  if (action === 'setup') {
    if (env?.ADMIN_PASSWORD) return refuse(400, 'The Event Head password is set on Netlify. Sign in with it.');
    const pass = String(body.password || '');
    if (pass.length < 6) return refuse(400, 'Choose a password of at least 6 characters.');
    const cfg = await getJ(store, 'config');
    if (cfg?.adminHash) return refuse(403, 'A password has already been set. Sign in with it.');
    const salt = randomId(16);
    const res = await store.set('config', { adminHash: await sha(pass, salt), salt, at: Date.now() }, { onlyIfNew: true });
    if (!res.modified) return refuse(403, 'A password has already been set.');
    await store.set('secrets', { hmacKey: randomId(32), codes: {} });
    await setState(store, (s) => { if (s.phase === 'setup') s.phase = 'lobby'; return s; });
    return json({ ok: true });
  }
  if (action === 'status-public') {
    const cfg = await getJ(store, 'config');
    return json({ ok: true, hasPassword: !!cfg?.adminHash || !!env?.ADMIN_PASSWORD });
  }
  if (!(await adminOk(store, body, env))) return refuse(401, 'Wrong Event Head password.');
  if (env?.ADMIN_PASSWORD) {
    const sec = await getJ(store, 'secrets');
    if (!sec) await store.set('secrets', { hmacKey: randomId(32), codes: {} });
    const s = await getState(store);
    if (s.phase === 'setup') await setState(store, (x) => { x.phase = 'lobby'; return x; });
  }
  switch (action) {
    case 'login': return json({ ok: true });
    case 'status': return adminStatus(store);
    case 'teams': return adminTeams(store, body);
    case 'start': return adminStart(store);
    case 'openWindow': return adminOpenWindow(store, body);
    case 'pause': return adminTimer(store, 'pause', body);
    case 'resume': return adminTimer(store, 'resume', body);
    case 'extend': return adminTimer(store, 'extend', body);
    case 'fire': return adminFire(store, body);
    case 'settle': return adminSettle(store, body);
    case 'next': return adminNext(store);
    case 'final': return adminFinal(store);
    case 'reveal': return adminReveal(store);
    case 'private': return json({ ok: true, private: await getJ(store, 'admin/private') });
    case 'export': return adminExport(store);
    case 'reset': return adminReset(store, body);
    default: return fail(400, 'Unknown action');
  }
}

async function adminStatus(store) {
  const state = await getState(store);
  const sec = await getJ(store, 'secrets');
  const out = { ok: true, state: publicState(state), codes: sec?.codes || {}, now: Date.now(), rounds: SCRIPT === LIVE_SCRIPT ? ROUND_SUMMARIES : [] };
  if (state.q) {
    const world = await loadWorld(store, state);
    const stages = world.run ? stagesFor(SCRIPT, world.run.q) : [];
    out.stages = stages.map((s) => ({ ...pickStagePublic(s, null), fired: world.run.fired.includes(s.id), jumps: s.jumps || null, data: s.data || null, needs: s.needs || null, needsTitle: s.needs ? stages.find((x) => x.id === s.needs)?.title || null : null, advice: SCRIPT === LIVE_SCRIPT && s.stageNo === 1 ? RUNSHEET[world.run.q]?.crises?.[s.crisisId] || null : null }));
    out.subs = {};
    for (const t of state.teams) {
      const d = await getJ(store, `orders/${state.q}/${t.id}`);
      out.subs[t.id] = { orders: d?.orders?.length || 0, forecast: d?.forecast?.value ?? null, bid: d?.bid || null, last: d?.orders?.at(-1)?.at || d?.forecast?.at || null };
    }
    out.runsheet = SCRIPT === LIVE_SCRIPT ? RUNSHEET[state.q] || null : null;
    out.nextQuarter = state.q < SCRIPT.quarters.length ? { q: state.q + 1, headlines: SCRIPT.quarters[state.q].headlines, forecast: SCRIPT.quarters[state.q].forecast, crises: (SCRIPT.quarters[state.q].crises || []).map((c) => c.title) } : null;
    // the auction in full (who bid what): only for the Event Head
    const aq = SCRIPT.quarters.findIndex((x) => x.auction) + 1;
    if (aq && state.q >= aq) {
      const full = await getJ(store, `resultfull/${aq}`);
      if (full?.auction) out.auction = { q: aq, ...full.auction, bids: full.auction.bids.map((b) => ({ ...b, name: state.teams.find((t) => t.id === b.id)?.name || b.id })) };
    }
  }
  return json(out);
}

async function adminTeams(store, body) {
  const state = await getState(store);
  if (state.phase !== 'lobby') return refuse(409, 'Teams can only be changed before the game starts.');
  const names = (body.names || []).map((n) => String(n).trim().slice(0, 28)).filter(Boolean);
  if (names.length < 1 || names.length > 30) return refuse(400, 'Enter between 1 and 30 fund names.');
  if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) return refuse(400, 'Each fund needs a different name.');
  const sec = (await getJ(store, 'secrets')) || { hmacKey: randomId(32), codes: {} };
  const old = state.teams;
  const teams = names.map((name, i) => {
    const prev = old.find((t) => t.name === name);
    return prev ? { ...prev } : { id: `f${String(i + 1).padStart(2, '0')}${randomId(3)}`, name, members: [] };
  });
  const codes = {};
  for (const t of teams) codes[t.id] = sec.codes[t.id] || fundCode();
  await store.set('secrets', { ...sec, codes });
  await setState(store, (s) => { s.teams = teams; return s; });
  return json({ ok: true, codes, teams });
}

async function adminStart(store) {
  const state = await getState(store);
  if (state.phase !== 'lobby') return refuse(409, 'The game has already started. Reset it first to start again.');
  if (!state.teams.length) return refuse(400, 'Add the funds first.');
  let world = newGame(state.teams.map((t) => ({ id: t.id, name: t.name })), SCRIPT);
  world = openQuarter(world, SCRIPT, 1);
  const s2 = await setState(store, async (s) => {
    if (s.phase !== 'lobby') return undefined;
    await saveWorld(store, world, s);
    await writeDocs(store, world, s);
    Object.assign(s, { phase: 'data', q: 1, round: 1, epoch: 0, fired: [], timer: { endsAt: null, pausedLeft: null, seconds: RULES.windowSeconds }, startedAt: Date.now() });
    return s;
  });
  return json({ ok: true, state: publicState(s2) });
}

async function adminOpenWindow(store, body) {
  const seconds = Math.max(15, Math.min(900, Number(body.seconds) || RULES.windowSeconds));
  const s2 = await setState(store, (s) => {
    if (s.phase !== 'data') return undefined;
    s.phase = 'open'; s.timer = { endsAt: Date.now() + seconds * 1000, pausedLeft: null, seconds }; s.openedAt = Date.now();
    return s;
  });
  if (s2.phase !== 'open') return refuse(409, 'The window can only be opened after the data drop.');
  return json({ ok: true, state: publicState(s2) });
}

async function adminTimer(store, kind, body) {
  const s2 = await setState(store, (s) => {
    if (s.phase !== 'open') return undefined;
    const t = s.timer;
    if (kind === 'pause' && t.pausedLeft === null) { t.pausedLeft = Math.max(0, t.endsAt - Date.now()); t.endsAt = null; }
    else if (kind === 'resume' && t.pausedLeft !== null) { t.endsAt = Date.now() + t.pausedLeft; t.pausedLeft = null; }
    else if (kind === 'extend') {
      const add = Math.max(5, Math.min(300, Number(body.seconds) || 30)) * 1000;
      if (t.pausedLeft !== null) t.pausedLeft += add; else t.endsAt = Math.max(Date.now(), t.endsAt) + add;
    } else return undefined;
    return s;
  });
  return json({ ok: true, state: publicState(s2) });
}

async function adminFire(store, body) {
  const state = await getState(store);
  if (state.phase !== 'open') return refuse(409, 'A crisis can only be released while the window is open.');
  const world = await loadWorld(store, state);
  if (world.run.fired.includes(body.stageId)) return json({ ok: true, already: true, state: publicState(state) });
  let res;
  try { res = fireStage(world, SCRIPT, body.stageId); } catch (e) { return refuse(400, e.message); }
  const s2 = await setState(store, async (s) => {
    if (s.epoch !== state.epoch || s.phase !== 'open') return undefined;
    await saveWorld(store, res.world, s);
    await writeDocs(store, res.world, s);
    s.epoch = res.world.run.epochs.length - 1;
    s.fired = [...res.world.run.fired];
    s.lastCrisisAt = Date.now();
    // the desk stays open through a crisis: if it breaks after the bell, reopen briefly
    if (s.timer.pausedLeft === null && (!s.timer.endsAt || s.timer.endsAt - Date.now() < REOPEN_AFTER_LATE_CRISIS_MS / 2)) s.timer.endsAt = Date.now() + REOPEN_AFTER_LATE_CRISIS_MS;
    return s;
  });
  if (!s2 || s2.epoch !== res.world.run.epochs.length - 1) return refuse(409, 'Someone else changed the game at the same moment. Refresh and try again.');
  return json({ ok: true, state: publicState(s2) });
}

async function adminSettle(store, body) {
  const state = await getState(store);
  if (state.phase === 'results' && state.docs?.result === state.q) return json({ ok: true, already: true, state: publicState(state) });
  if (state.phase !== 'open' && state.phase !== 'settling') return refuse(409, 'There is no open window to settle.');
  if (state.phase === 'open' && state.timer.endsAt && Date.now() < state.timer.endsAt && !body.early) {
    return refuse(409, 'The clock is still running. Wait for the bell, or ring it now.', { early: true });
  }
  const world = await loadWorld(store, state);
  // crises are the Event Head's choice: a round may settle with any, all or none released
  // lock the desk first, so no order can slip in while we settle
  await setState(store, (s) => { if (s.phase !== 'open' && s.phase !== 'settling') return undefined; s.phase = 'settling'; s.timer.endsAt = Math.min(s.timer.endsAt || Date.now(), Date.now()); s.timer.pausedLeft = null; return s; });
  let after = world;
  let result = null;
  if (world.q !== state.q) {
    const inputs = { orders: {}, forecasts: {}, bids: {} };
    for (const t of state.teams) {
      const d = await getJ(store, `orders/${state.q}/${t.id}`);
      inputs.orders[t.id] = (d?.orders || []).map((o) => ({ inst: o.inst, delta: o.delta, epoch: o.epoch }));
      inputs.forecasts[t.id] = d?.forecast?.value ?? null;
      if (d?.bid) inputs.bids[t.id] = d.bid;
    }
    const out = settleQuarter(world, SCRIPT, inputs);
    after = out.world; result = out.result;
    await store.set(`resultfull/${state.q}`, result);
  } else {
    result = await getJ(store, `resultfull/${state.q}`); // recovering a settlement interrupted half-way
  }
  const s2 = await setState(store, async (s) => {
    if (s.phase !== 'settling') return undefined;
    if (after !== world) await saveWorld(store, after, s);
    await writeDocs(store, after, s, { result });
    s.phase = 'results'; s.settledAt = Date.now();
    return s;
  });
  return json({ ok: true, state: publicState(s2 || (await getState(store))) });
}

async function adminNext(store) {
  const state = await getState(store);
  if (state.phase !== 'results') return refuse(409, 'Settle the round first.');
  if (state.q >= SCRIPT.quarters.length) return refuse(409, 'That was the last round. Publish the final release.');
  const world = await loadWorld(store, state);
  const next = openQuarter(world, SCRIPT, state.q + 1);
  const s2 = await setState(store, async (s) => {
    if (s.phase !== 'results' || s.q !== state.q) return undefined;
    await saveWorld(store, next, s);
    await writeDocs(store, next, s);
    Object.assign(s, { phase: 'data', q: state.q + 1, round: next.round.n, epoch: 0, fired: [], timer: { endsAt: null, pausedLeft: null, seconds: s.timer.seconds || RULES.windowSeconds } });
    return s;
  });
  return json({ ok: true, state: publicState(s2 || (await getState(store))) });
}

async function adminFinal(store) {
  const state = await getState(store);
  if (state.phase === 'final') return json({ ok: true, already: true, state: publicState(state) });
  if (state.phase !== 'results' || state.q !== SCRIPT.quarters.length) return refuse(409, 'The final release comes after the last round settles.');
  const world = await loadWorld(store, state);
  const fin = finalRelease(world, SCRIPT);
  const s2 = await setState(store, async (s) => {
    if (s.phase !== 'results') return undefined;
    await saveWorld(store, fin, s);
    await writeDocs(store, fin, s);
    s.phase = 'final'; s.finishedAt = Date.now();
    return s;
  });
  return json({ ok: true, state: publicState(s2 || (await getState(store))) });
}

// The scores stay sealed until the Event Head reveals them (on the Big Screen and every desk).
async function adminReveal(store) {
  const state = await getState(store);
  if (state.phase !== 'final') return refuse(409, 'Publish the final release first; then reveal the results.');
  if (state.revealed) return json({ ok: true, already: true, state: publicState(state) });
  const world = await loadWorld(store, state);
  const s2 = await setState(store, async (s) => {
    if (s.phase !== 'final' || s.revealed) return undefined;
    s.revealed = true; s.revealedAt = Date.now();
    await writeDocs(store, world, s);
    return s;
  });
  return json({ ok: true, state: publicState(s2 || (await getState(store))) });
}

async function adminExport(store) {
  const keys = await store.list('');
  const out = {};
  for (const k of keys) if (!k.startsWith('config') && !k.startsWith('secrets')) out[k] = await store.get(k);
  return json({ ok: true, exportedAt: new Date().toISOString(), data: out });
}

async function adminReset(store, body) {
  if (body.confirm !== 'RESET') return refuse(400, 'Type RESET to confirm.');
  const before = await getState(store);
  const keys = await store.list('');
  for (const k of keys) if (k !== 'config' && k !== 'secrets') await store.del(k);
  const sec = await getJ(store, 'secrets');
  await store.set('secrets', { hmacKey: randomId(32), codes: body.keepTeams ? (sec?.codes || {}) : {} });
  cache = { worldV: -1, world: null };
  const fresh = freshState();
  fresh.phase = 'lobby';
  // keeping the funds keeps their names and codes; everyone signs in again
  if (body.keepTeams) fresh.teams = (before.teams || []).map((t) => ({ id: t.id, name: t.name, members: [] }));
  await store.set('state', fresh);
  return json({ ok: true });
}
