// Test harness: the real server (server/api.mjs) on an in-memory store, called the way the
// console calls it. Nothing here bypasses the server's own checks.
import { handle } from '../server/api.mjs';
import { memoryStore } from '../server/storage-memory.mjs';
import { inflateRawSync } from 'node:zlib';
import { PRACTICE_AUCTION, PRACTICE_DEPLOYMENTS, practiceComplianceFor } from '../src/data/practice.mjs';

export const ENV = { SETUP_CODE: 'test-setup-code', TOKEN_SECRET: 'a-long-test-signing-secret-for-tokens', TOKEN_HOURS: 12, PBKDF2_ITERATIONS: 1000 };
export const PW = 'Control-2026-test';
export const L = (lakh) => Math.round(lakh * 1e7); // ₹ lakh → paise

export function server(env = ENV) {
  const store = memoryStore();
  async function call(method, path, { body, token, raw = false } = {}) {
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await handle(new Request(`http://test.local/api/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), store, env);
    const bytes = Buffer.from(await res.arrayBuffer());
    if (raw) return { status: res.status, headers: res.headers, bytes };
    let json = null;
    try { json = JSON.parse(bytes.toString('utf8')); } catch { /* not JSON */ }
    return { status: res.status, json, headers: res.headers };
  }
  const h = {
    store, env, call,
    async setup(username = 'head') {
      const r = await call('POST', 'setup', { body: { setupCode: env.SETUP_CODE, username, name: 'Event Head', password: PW } });
      if (!r.json?.ok) throw new Error(`setup failed: ${JSON.stringify(r.json)}`);
      return r.json.token;
    },
    async login(username, password = PW) { return (await call('POST', 'login', { body: { username, password } })).json?.token || null; },
    async addUser(token, username, role, grants = []) {
      const r = await call('POST', 'users', { token, body: { op: 'create', username, name: username, role, grants, password: PW } });
      if (!r.json?.ok) throw new Error(`user create failed: ${JSON.stringify(r.json)}`);
      return h.login(username);
    },
    async session(token, mode = 'practice', name = mode === 'official' ? 'Official event' : 'Rehearsal') {
      const r = await call('POST', 'sessions', { token, body: { op: 'create', mode, name } });
      if (!r.json?.ok) throw new Error(`session create failed: ${JSON.stringify(r.json)}`);
      return r.json.session.id;
    },
    async act(token, id, type, payload = {}) { return (await call('POST', `session/${id}/act`, { token, body: { type, payload } })).json; },
    async must(token, id, type, payload = {}) {
      const j = await h.act(token, id, type, payload);
      if (!j?.ok) throw new Error(`${type} refused: ${j?.code} ${j?.error}`);
      return j;
    },
    async view(token, id) { return (await call('GET', `session/${id}`, { token })).json; },
    async audit(token, id, q = '') { return (await call('GET', `session/${id}/audit?limit=500${q}`, { token })).json; },
    async exportFile(token, id, kind, format, extra = '') { return call('GET', `session/${id}/export?kind=${kind}&format=${format}${extra}`, { token, raw: true }); },
  };
  return h;
}

/** Record the sample auction outcome the way an operator does it in the room. */
export async function recordAuction(h, token, id, outcome = PRACTICE_AUCTION) {
  for (const [teamId, list] of Object.entries(outcome)) {
    for (const [employeeId, lakh] of list) {
      await h.must(token, id, 'auction.start', { employeeId });
      await h.must(token, id, 'auction.sell', { employeeId, teamId, amount: L(lakh), confirm: true, ackBudget: true });
    }
  }
}

/** Enter every written allocation, record the compliance facts, approve or record as blocked. */
export async function recordRound2(h, token, id, plan = PRACTICE_DEPLOYMENTS) {
  for (const [teamId, list] of Object.entries(plan)) {
    for (const d of list) await h.must(token, id, 'deploy.create', { teamId, ...d });
    await h.must(token, id, 'submission.set', { teamId, received: true, reference: `Form ${teamId}` });
  }
  let v = await h.view(token, id);
  for (const d of v.doc.deployments) {
    for (const e of v.results.deployments[d.id].compliance.evals) {
      if (e.source !== 'manual') continue;
      const c = practiceComplianceFor(d, e.ruleId);
      await h.must(token, id, 'compliance.set', { deploymentId: d.id, ruleId: e.ruleId, status: c.status, evidence: c.evidence });
    }
  }
  v = await h.view(token, id);
  for (const d of v.doc.deployments) {
    if (v.results.deployments[d.id].operational) await h.must(token, id, 'deploy.approve', { id: d.id });
    else await h.must(token, id, 'deploy.recordBlocked', { id: d.id, reason: 'Permit still awaited at the deadline' });
  }
}

/** A whole official event through the server: rules approved, auction, Round 1 locked, Round 2, calculation. */
export async function officialEvent(h, token, { finalise = true } = {}) {
  const id = await h.session(token, 'official');
  await h.must(token, id, 'rule.approve', { all: true });
  await recordAuction(h, token, id);
  await h.must(token, id, 'round1.lock', { confirm: true });
  await recordRound2(h, token, id);
  await h.must(token, id, 'calc.run');
  if (finalise) await h.must(token, id, 'round2.finalise', { confirm: true });
  return id;
}

// ---------------- reading the files we export ----------------

/** Read a ZIP file (XLSX files are ZIPs): name → Buffer. */
export function unzip(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = {};
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28); const extraLen = buf.readUInt16LE(p + 30); const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    out[name] = method === 8 ? inflateRawSync(data) : Buffer.from(data);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const unxml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** Every sheet of an XLSX as { name: { A1: { v, f } } } (values as written, formulas as text). */
export function readXlsx(buf) {
  const files = unzip(buf);
  const wb = files['xl/workbook.xml'].toString();
  const rels = files['xl/_rels/workbook.xml.rels'].toString();
  const sheets = {};
  for (const m of wb.matchAll(/<sheet [^>]*name="([^"]*)"[^>]*r:id="([^"]*)"/g)) {
    const target = new RegExp(`Id="${m[2]}"[^>]*Target="([^"]*)"`).exec(rels)?.[1] || new RegExp(`Target="([^"]*)"[^>]*Id="${m[2]}"`).exec(rels)?.[1];
    const xml = files[`xl/${target.replace(/^\/?xl\//, '')}`].toString();
    const cells = {};
    for (const c of xml.matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const inner = c[3] || '';
      const f = /<f>([\s\S]*?)<\/f>/.exec(inner)?.[1];
      const t = /<t[^>]*>([\s\S]*?)<\/t>/.exec(inner)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      const isBool = /t="b"/.test(c[2]);
      cells[c[1]] = { v: t !== undefined ? unxml(t) : v === undefined ? null : isBool ? v === '1' : Number(v), f: f ? unxml(f) : null };
    }
    sheets[unxml(m[1])] = cells;
  }
  return sheets;
}

/** The value in column `col` on the row whose column A reads `label`. */
export function rowValue(cells, label, col = 'B') {
  const ref = Object.keys(cells).find((k) => /^A\d+$/.test(k) && cells[k].v === label);
  if (!ref) return undefined;
  return cells[`${col}${ref.slice(1)}`]?.v;
}
