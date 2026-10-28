// Build the stock game's two pages from the secret game data.
//
//   node stockgame/build.mjs            (MARKET_URL=<published Markets link> to show it on the big screen)
//
// Reads stockgame/secret/game.json (made by tools/make-data.py; never committed) and writes
//   stockgame/dist/market.html  the team broker app: safe to share. Every update in it is
//                               sealed and opens only with its release code.
//   stockgame/dist/desk.html    the Event Head desk: SECRET. It holds every headline, price
//                               move, reason and release code.
// The build refuses to finish if any headline, story, reason or code would be readable in
// market.html.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveRaw, seal, toB64, slotOf } from './src/vault.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const src = (f) => readFileSync(join(here, 'src', f), 'utf8');
const secretFile = join(here, 'secret', 'game.json');
if (!existsSync(secretFile)) {
  console.error('No stockgame/secret/game.json. Make it with stockgame/tools/make-data.py (see stockgame/README.md).');
  process.exit(1);
}
const g = JSON.parse(readFileSync(secretFile, 'utf8'));
const tickers = g.stocks.map((s) => s.t);
const id = createHash('sha256').update(g.salt).digest('hex').slice(0, 10);

// ---------- seal every update for the team app ----------
const raw = { N: [], P: [] };
for (const kind of ['N', 'P']) {
  for (const code of g.codes[kind]) raw[kind].push(await deriveRaw(code, g.salt, g.iterations));
}
const items = [];
for (const u of g.updates) {
  const i = u.i;
  items[slotOf('N', i)] = await seal(raw.N[i - 1], {
    t: 'N', i, r: u.round, cat: u.cat, head: u.head, body: u.body,
    prev: i > 1 ? toB64(raw.N[i - 2]) : null,
  });
  items[slotOf('P', i)] = await seal(raw.P[i - 1], {
    t: 'P', i, m: u.moves.map((m) => [tickers.indexOf(m.t), m.pct]),
    prev: i > 1 ? toB64(raw.P[i - 2]) : null, n: toB64(raw.N[i - 1]),
  });
}
const stocks = g.stocks.map(({ t, name, sector, start }) => ({ t, name, sector, start }));
const marketPayload = { id, capital: g.capital, stocks, salt: g.salt, iterations: g.iterations, items };
// MARKET_URL (optional): the published Markets link, shown on the big screen's welcome.
const deskPayload = { id, capital: g.capital, stocks, updates: g.updates, codes: g.codes, salt: g.salt, iterations: g.iterations, marketUrl: process.env.MARKET_URL || '' };

// ---------- assemble the pages ----------
const inline = (f) => src(f).replace(/^export /gm, '');
const forScript = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c');
function page(template, payload) {
  const parts = {
    '/*@THEME@*/': src('theme.css'),
    '/*@ENGINE@*/': inline('engine.mjs'),
    '/*@VAULT@*/': inline('vault.mjs'),
    '/*@CHART@*/': inline('chart.mjs'),
    '/*@PAYLOAD@*/': forScript(payload),
  };
  let html = src(template);
  for (const [k, v] of Object.entries(parts)) html = html.split(k).join(v);
  return html;
}
const market = page('market.html', marketPayload);
const desk = page('desk.html', deskPayload);

// ---------- leak guard ----------
const secrets = [...g.codes.N, ...g.codes.P];
for (const u of g.updates) {
  secrets.push(u.head);
  for (const p of u.body) secrets.push(p.slice(0, 48), p.slice(-48));
  for (const m of u.moves) secrets.push(m.why);
}
const leaks = secrets.filter((s) => market.includes(s) || market.includes(JSON.stringify(s).slice(1, -1)));
if (leaks.length) {
  console.error(`Build refused: ${leaks.length} secret piece(s) would be readable in market.html, e.g. "${leaks[0].slice(0, 60)}"`);
  process.exit(1);
}
const missing = secrets.filter((s) => !desk.includes(JSON.stringify(s).slice(1, -1)));
if (missing.length) {
  console.error(`Build refused: the desk is missing ${missing.length} piece(s) of the game, e.g. "${missing[0].slice(0, 60)}"`);
  process.exit(1);
}

mkdirSync(join(here, 'dist'), { recursive: true });
writeFileSync(join(here, 'dist', 'market.html'), market);
writeFileSync(join(here, 'dist', 'desk.html'), desk);
console.log(`Built stockgame/dist/market.html (${(market.length / 1024).toFixed(0)} KB, every update sealed) and stockgame/dist/desk.html (${(desk.length / 1024).toFixed(0)} KB, SECRET). Game id ${id}.`);
