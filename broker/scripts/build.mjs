// Build the website into dist/: the pages (web/) and the public list of stocks (src/).
// The price model (server/) is never copied: the build stops if any of it would be public.
import { cpSync, rmSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(join(root, 'web'), dist, { recursive: true });
cpSync(join(root, 'src'), join(dist, 'src'), { recursive: true });
const version = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
writeFileSync(join(dist, 'version.json'), JSON.stringify({ version }));
const idx = join(dist, 'index.html');
writeFileSync(idx, readFileSync(idx, 'utf8').replaceAll('__V__', version));

// leak guard: no line of the price model may appear in the public files
const secretLines = readFileSync(join(root, 'server', 'model.mjs'), 'utf8').split('\n')
  .map((l) => l.trim())
  .filter((l) => l.length > 40 && !l.startsWith('//') && !l.startsWith('import ') && !l.startsWith('*'));
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
let leaks = 0;
for (const f of walk(dist)) {
  if (!/\.(html|js|mjs|json|css|txt|md)$/.test(f)) continue;
  const txt = readFileSync(f, 'utf8');
  for (const l of secretLines) if (txt.includes(l)) { console.error(`LEAK: price-model code found in ${f}: "${l.slice(0, 60)}"`); leaks++; }
}
if (leaks) { console.error(`Build refused: ${leaks} line(s) of the price model would be public.`); process.exit(1); }
console.log(`Built dist/ (version ${version}); the price model stays on the server.`);
