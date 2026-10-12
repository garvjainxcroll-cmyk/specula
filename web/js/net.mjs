// Talking to the server: requests with retries, server-time sync, offline detection,
// and the live-data store that every screen subscribes to.

const listeners = new Set();
export const net = {
  mode: 'unknown', // 'live' | 'single' | 'unknown'
  online: true,
  offset: 0,
  lastOk: 0,
  now: () => Date.now() + net.offset,
};

function emit() { for (const fn of listeners) { try { fn(live); } catch (e) { console.warn(e); } } }
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

async function raw(method, path, body, { timeout = 9000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(`/api/${path}`, {
      method, signal: ctl.signal, cache: 'no-store',
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (data && typeof data.now === 'number') net.offset = data.now - Date.now();
    if (res.status === 404 && !data) { const e = new Error('not-found'); e.status = 404; throw e; }
    if (res.status >= 500 && !data) { const e = new Error('server'); e.status = res.status; throw e; }
    setOnline(true);
    return { status: res.status, ok: res.ok, data: data || {} };
  } catch (e) {
    if (e.name === 'AbortError' || e instanceof TypeError || e.message === 'server') setOnline(false);
    throw e;
  } finally { clearTimeout(t); }
}

function setOnline(v) {
  if (net.online !== v) { net.online = v; emit(); }
  if (v) net.lastOk = Date.now();
}

export async function get(path) { return raw('GET', path); }
export async function post(path, body, { retries = 2 } = {}) {
  let last;
  for (let k = 0; k <= retries; k++) {
    try { return await raw('POST', path, body); } catch (e) { last = e; if (e.status === 404) throw e; await new Promise((r) => setTimeout(r, 400 * (k + 1))); }
  }
  throw last;
}

/** Is the live game server here? (No: this copy was deployed without its function.) */
export async function detect() {
  try {
    const r = await raw('GET', 'health', null, { timeout: 6000 });
    net.mode = r.data?.ok ? 'live' : 'single';
  } catch (e) {
    net.mode = e.status === 404 ? 'single' : (net.mode === 'live' ? 'live' : 'unknown');
    if (net.mode === 'unknown') { // maybe just offline: try again shortly
      setTimeout(async () => { if (net.mode === 'unknown') { await detect(); emit(); } }, 4000);
    }
  }
  emit();
  return net.mode;
}

// ---------------- live data ----------------

export const live = {
  state: null, me: null, orders: null, docs: {}, docV: {}, team: null, teamQ: null, results: {}, error: null,
};

const docOf = { quarter: 'quarter', standings: 'standings', history: 'history', final: 'final' };
let timer = null; let polling = false; let token = null; let fast = false;

export function setToken(t) { token = t; live.me = null; live.orders = null; live.team = null; }
export function getToken() { return token; }

export async function pollOnce() {
  if (polling) return;
  polling = true;
  try {
    const r = await get(`poll${token ? `?token=${encodeURIComponent(token)}` : ''}`);
    if (r.status === 401 && token) { live.error = 'signed-out'; live.state = r.data.state || live.state; emit(); return; }
    if (!r.ok) return;
    const prevV = live.state?.v; const prevOrdersRev = live.orders?.rev;
    live.state = r.data.state; live.me = r.data.me || null; live.error = null;
    if (r.data.orders) live.orders = r.data.orders;
    const docs = live.state.docs || {};
    const jobs = [];
    for (const [k, key] of Object.entries(docOf)) if (docs[k] && docs[k] !== live.docV[k]) jobs.push(fetchDoc(k, key, docs[k]));
    if (docs.result && docs.result !== live.docV.result) jobs.push(fetchDoc('result', `result/${docs.result}`, docs.result));
    if (token && live.me && (live.teamQ !== live.state.q || docs.standings !== live.docV.teamFor)) jobs.push(fetchMine(docs.standings));
    await Promise.all(jobs);
    if (prevV !== live.state.v || prevOrdersRev !== live.orders?.rev || jobs.length) emit();
  } catch { /* offline: shown by the banner */ emit(); } finally { polling = false; }
}

async function fetchDoc(k, key, v) {
  const r = await get(`doc?key=${key}`);
  if (r.ok) { live.docs[k] = r.data.doc; live.docV[k] = v; if (k === 'result') live.results[r.data.doc.q] = r.data.doc; }
}
async function fetchMine(v) {
  const q = live.state.docs?.result || 0;
  const r = await get(`mine?token=${encodeURIComponent(token)}${q ? `&q=${q}` : ''}`);
  if (r.ok) { live.team = r.data.team; live.teamQ = live.state.q; live.docV.teamFor = v; if (r.data.result) live.myResults = { ...(live.myResults || {}), [q]: r.data.result }; }
}

export async function fetchMyResult(q) {
  if (live.myResults?.[q]) return live.myResults[q];
  const r = await get(`mine?token=${encodeURIComponent(token)}&q=${q}`);
  if (r.ok && r.data.result) { live.myResults = { ...(live.myResults || {}), [q]: r.data.result }; return r.data.result; }
  return null;
}
export async function fetchResult(q) {
  if (live.results[q]) return live.results[q];
  const r = await get(`doc?key=result/${q}`);
  if (r.ok) { live.results[q] = r.data.doc; return r.data.doc; }
  return null;
}

export function startPolling(intervalFn = () => (live.state?.phase === 'open' ? 1500 : 2500)) {
  stopPolling();
  const loop = async () => { await pollOnce(); timer = setTimeout(loop, net.online ? intervalFn() : 4000); };
  loop();
  window.addEventListener('online', pollOnce);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pollOnce(); });
}
export function stopPolling() { if (timer) clearTimeout(timer); timer = null; }
export function forceEmit() { emit(); }

/** Seconds left on the clock, in server time. */
export function clockLeft() {
  const t = live.state?.timer;
  if (!t) return null;
  if (t.pausedLeft !== null && t.pausedLeft !== undefined) return t.pausedLeft;
  if (!t.endsAt) return null;
  return Math.max(0, t.endsAt - net.now());
}
