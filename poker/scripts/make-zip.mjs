// Make artha-vyuha-netlify.zip for a drag-and-drop deploy on Netlify. Usage: npm run zip
//
// The zip is ready to serve as it is — no build step needed:
//  - at its root, the built website (index.html, js, css, img and the public game code);
//  - netlify/functions/api.mjs, the whole server bundled into one file (Netlify Blobs included);
//  - netlify.toml: publish "." and no build command.
// If Netlify deploys the function from the zip, the live game works (check /api/health).
// If it does not, the site shows "Single device" and only practice works: use the GitHub way.
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync, mkdirSync, cpSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const stage = join(root, '.zip-stage');
const out = join(root, 'artha-vyuha-netlify.zip');
if (!existsSync(join(dist, 'index.html'))) throw new Error('Run npm run build first (npm run zip does both).');
rmSync(stage, { recursive: true, force: true });
if (existsSync(out)) rmSync(out);
mkdirSync(stage, { recursive: true });

// 1. the website
cpSync(dist, stage, { recursive: true });

// 2. the server function, bundled into one self-contained file
await build({
  entryPoints: [join(root, 'netlify', 'functions', 'api.mjs')],
  outfile: join(stage, 'netlify', 'functions', 'api.mjs'),
  bundle: true, platform: 'node', format: 'esm', target: 'node20', logLevel: 'warning',
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});

// 3. the settings: serve this folder as it is; the function answers /api/*
const toml = readFileSync(join(root, 'netlify.toml'), 'utf8')
  .replace(/\[build\][\s\S]*?(?=\n\[)/, '[build]\n  publish = "."\n  command = ""\n');
writeFileSync(join(stage, 'netlify.toml'), `# Artha Vyūha, ready to serve: drag this zip onto your Netlify project's Deploys page.\n${toml.replace(/^#.*\n/gm, '')}`);
cpSync(join(root, 'DEPLOY.md'), join(stage, 'DEPLOY.md'));

execFileSync('python3', ['-I', '-c', `
import zipfile, os, sys
stage, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for d, _, fs in os.walk(stage):
        for f in fs:
            full = os.path.join(d, f)
            z.write(full, os.path.relpath(full, stage))
`, stage, out]);
rmSync(stage, { recursive: true, force: true });
console.log(`Wrote ${out}`);
