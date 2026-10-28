// Build the live stock game website into live/dist/ (Netlify runs this; it needs no secrets).
//   live/dist/index.html          home: the three desks side by side (join, Event Head sign-in, big screen)
//   live/dist/team/index.html     the team desk (broker app)
//   live/dist/desk/index.html     the Event Head desk (signs in with the game key)
//   live/dist/screen/index.html   the big screen for the projector (public)
// The game itself stays sealed in live/server/game-sealed.mjs and reaches pages only through
// the server, one released update at a time.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = (f) => readFileSync(join(here, '..', 'src', f), 'utf8');
const pub = JSON.parse(readFileSync(join(here, 'public-game.json'), 'utf8'));
const inline = (f) => src(f).replace(/^export /gm, '');
const forScript = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c');
const icon = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28"><rect width="28" height="28" rx="6" fill="#070302"/><rect x="2" y="2" width="24" height="24" rx="5" fill="none" stroke="#d8b870" stroke-width="2"/><rect x="6.5" y="11" width="3" height="7" fill="#d8b870"/><rect x="12.5" y="8" width="3" height="8" fill="none" stroke="#d8b870" stroke-width="1.2"/><rect x="18.5" y="10" width="3" height="6" fill="#d8b870"/></svg>')}`;

function page(template, payload) {
  let html = src(template);
  const parts = {
    '/*@THEME@*/': src('theme.css'), '/*@ENGINE@*/': inline('engine.mjs'), '/*@VAULT@*/': inline('vault.mjs'),
    '/*@CHART@*/': inline('chart.mjs'), '/*@PAYLOAD@*/': forScript(payload),
  };
  for (const [k, v] of Object.entries(parts)) html = html.split(k).join(v);
  // the template's title, fonts and styles go in the head; everything after them in the body
  const cut = html.indexOf('</style>') + '</style>'.length;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex"><link rel="icon" href="${icon}"><style>[hidden]{display:none!important}:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}img{max-width:100%}</style>
${html.slice(0, cut)}
</head><body>
${html.slice(cut)}
</body></html>
`;
}

const dist = join(here, 'dist');
rmSync(dist, { recursive: true, force: true });
for (const d of ['', 'team', 'desk', 'screen']) mkdirSync(join(dist, d), { recursive: true });
const home = page('home.html', {});
const team = page('market.html', { live: true, stocks: pub.stocks, capital: pub.capital, margin: pub.margin }).replace('<title>Markets</title>', '<title>Team Desk</title>');
const desk = page('desk.html', { live: true });
const screen = page('desk.html', { live: true, screenOnly: true }).replace('<title>Event Head Desk</title>', '<title>Big Screen</title>');
writeFileSync(join(dist, 'index.html'), home);
writeFileSync(join(dist, 'team', 'index.html'), team);
writeFileSync(join(dist, 'desk', 'index.html'), desk);
writeFileSync(join(dist, 'screen', 'index.html'), screen);

// leak guard: with the secret data on this machine, prove no story, reason or move is in the pages
const secretFile = join(here, '..', 'secret', 'game.json');
if (existsSync(secretFile)) {
  const g = JSON.parse(readFileSync(secretFile, 'utf8'));
  const secrets = [];
  for (const u of g.updates) { secrets.push(u.head); for (const p of u.body) secrets.push(p.slice(0, 48)); for (const m of u.moves) secrets.push(m.why); }
  const sealed = readFileSync(join(here, 'server', 'game-sealed.mjs'), 'utf8');
  for (const [name, txt] of [['home', home], ['team', team], ['desk', desk], ['screen', screen], ['game-sealed.mjs', sealed]]) {
    const hit = secrets.find((s) => txt.includes(s) || txt.includes(JSON.stringify(s).slice(1, -1)));
    if (hit) { console.error(`Build refused: secret text in ${name}: "${hit.slice(0, 60)}"`); process.exit(1); }
  }
}
console.log('Built live/dist: / (home), team/ (team desk), desk/ (Event Head), screen/ (big screen).');
