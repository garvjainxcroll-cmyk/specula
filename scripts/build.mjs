// Build the website into dist/: the web app plus the public engine code.
// The secret script (server/) is never copied. The build fails if any secret text
// from the script appears anywhere in dist/.
import { cpSync, rmSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { secretStrings } from '../server/script.mjs';
import { runsheetStrings } from '../server/runsheet.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(join(root, 'web'), dist, { recursive: true });
for (const d of ['engine', 'config', 'practice', 'bots']) cpSync(join(root, 'src', d), join(dist, 'src', d), { recursive: true });
const version = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
writeFileSync(join(dist, 'version.json'), JSON.stringify({ version, builtAt: new Date().toISOString() }));
// cache-bust module URLs so a redeploy is picked up straight away
const idx = join(dist, 'index.html');
writeFileSync(idx, readFileSync(idx, 'utf8').replaceAll('__V__', version));

// leak guard
const secrets = [...secretStrings(), ...runsheetStrings()];
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
let leaks = 0;
for (const f of walk(dist)) {
  if (!/\.(html|js|mjs|json|css|txt|md)$/.test(f)) continue;
  const txt = readFileSync(f, 'utf8');
  for (const s of secrets) if (txt.includes(s)) { console.error(`LEAK: secret script text found in ${f}: "${s.slice(0, 60)}…"`); leaks++; }
}
if (leaks) { console.error(`Build refused: ${leaks} piece(s) of the secret script would be public.`); process.exit(1); }
console.log(`Built dist/ (version ${version}); no secret script text in the public files.`);
