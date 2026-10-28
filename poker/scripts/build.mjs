// Build the website into dist/: the web app plus the public game code it uses (the engine,
// the table rules and the bots, for bet sizing on screen and offline practice).
// The server code (server/) is never copied, and the build fails if any page tries to load it.
import { cpSync, rmSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(join(root, 'web'), dist, { recursive: true });
for (const d of ['engine', 'room', 'bots']) cpSync(join(root, 'src', d), join(dist, 'src', d), { recursive: true });
const version = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
writeFileSync(join(dist, 'version.json'), JSON.stringify({ version, builtAt: new Date().toISOString() }));
const idx = join(dist, 'index.html');
writeFileSync(idx, readFileSync(idx, 'utf8').replaceAll('__V__', version));

// guard: nothing in the public files may reach the server code or Node-only modules
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
let bad = 0;
for (const f of walk(dist)) {
  if (!/\.(m?js|html)$/.test(f)) continue;
  const txt = readFileSync(f, 'utf8');
  if (/from\s+['"][^'"]*server\//.test(txt) || /from\s+['"]node:/.test(txt) || /\bMath\.random\b/.test(txt) && f.includes(`${join('src', 'engine')}`)) { console.error(`Refused: ${f} loads server or Node code`); bad++; }
}
if (bad) process.exit(1);
console.log(`Built dist/ (version ${version}).`);
