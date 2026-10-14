// Talking to the server: requests, server-time sync and the online/offline state.
const listeners = new Set();
export const net = { online: true, offset: 0, now: () => Date.now() + net.offset };
export function onNet(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function setOnline(v) { if (net.online !== v) { net.online = v; for (const fn of listeners) fn(v); } }

const TOKENS = { team: 'teamToken', host: 'hostToken' };
export function token(kind) { try { return localStorage.getItem(TOKENS[kind]) || ''; } catch { return ''; } }
export function setToken(kind, t) { try { if (t) localStorage.setItem(TOKENS[kind], t); else localStorage.removeItem(TOKENS[kind]); } catch { /* private mode */ } }

export async function api(method, path, body, tok = '') {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const res = await fetch(`/api/${path}`, {
      method, cache: 'no-store', signal: ctl.signal,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(tok ? { 'x-token': tok } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!data) { const e = new Error(res.status === 404 ? 'no-server' : 'server'); e.status = res.status; throw e; }
    if (typeof data.now === 'number') net.offset = data.now - Date.now();
    setOnline(true);
    data.status = res.status;
    return data;
  } catch (e) {
    if (e.name === 'AbortError' || e instanceof TypeError || e.message === 'server') setOnline(false);
    throw e;
  } finally { clearTimeout(timer); }
}
export const get = (path, tok) => api('GET', path, null, tok);
export const post = (path, body, tok) => api('POST', path, body || {}, tok);

/** Run fn every `every` ms (slower when the tab is hidden), and once at once. */
export function loop(fn, every = 1500, hiddenEvery = 8000) {
  let t = null; let stopped = false; let busy = false;
  const run = async () => {
    if (stopped) return;
    if (!busy) { busy = true; try { await fn(); } catch { /* shown by the offline bar */ } busy = false; }
    if (!stopped) t = setTimeout(run, document.hidden ? hiddenEvery : net.online ? every : 4000);
  };
  const wake = () => { if (!document.hidden && !stopped) { clearTimeout(t); run(); } };
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('online', wake);
  run();
  return { stop() { stopped = true; clearTimeout(t); document.removeEventListener('visibilitychange', wake); window.removeEventListener('online', wake); }, now: wake };
}
