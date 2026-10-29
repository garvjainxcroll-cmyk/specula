// Build the console into dist/: the web app plus the engine's pure formula code (labels,
// formatting, formula text). Event data never goes into dist/: every CV, region, rule,
// assumption and result is served only by the signed-in API. The build fails if any
// sample-data text appears in a public file.
import { cpSync, rmSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sampleEmployees } from '../src/data/employees.mjs';
import { sampleRules } from '../src/data/rules.mjs';
import { sampleCities, sampleContinents } from '../src/data/regions.mjs';
import { defaultRoles } from '../src/data/defaults.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(join(root, 'web'), dist, { recursive: true });
cpSync(join(root, 'src', 'engine'), join(dist, 'engine'), { recursive: true });
const version = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
writeFileSync(join(dist, 'version.json'), JSON.stringify({ version, builtAt: new Date().toISOString() }));
const idx = join(dist, 'index.html');
writeFileSync(idx, readFileSync(idx, 'utf8').replaceAll('__V__', version));

// leak guard: sample data stays on the server
const secrets = [
  ...sampleEmployees().flatMap((e) => [e.name, e.headline, ...(e.strategic.strengths || [])]),
  ...sampleRules().map((r) => r.description),
  ...sampleCities().map((c) => c.description),
  ...sampleContinents().map((c) => c.description),
  ...defaultRoles().map((r) => JSON.stringify(r.weights)),
].filter((s) => s && s.length >= 8);
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
let leaks = 0;
for (const f of walk(dist)) {
  if (!/\.(html|js|mjs|json|css|txt|md)$/.test(f)) continue;
  const txt = readFileSync(f, 'utf8');
  for (const s of secrets) if (txt.includes(s)) { console.error(`LEAK: event data found in ${f}: "${s.slice(0, 60)}"`); leaks++; }
}
if (leaks) { console.error(`Build refused: ${leaks} piece(s) of event data would be public.`); process.exit(1); }
console.log(`Built dist/ (version ${version}); no event data in the public files.`);
