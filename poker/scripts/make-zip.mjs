// Make artha-vyuha-netlify.zip: the whole deployable project (source + a pre-built dist/),
// without node_modules or tests. Netlify builds it (npm install + npm run build) and deploys the
// function. Usage: npm run zip
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'artha-vyuha-netlify.zip');
if (existsSync(out)) rmSync(out);
const items = ['package.json', 'package-lock.json', 'netlify.toml', 'netlify', 'server', 'src', 'web', 'scripts/build.mjs', 'scripts/dev-server.mjs', 'dist', 'DEPLOY.md', 'README.md'];
execFileSync('python3', ['-I', '-c', `
import zipfile, os, sys
root, out, items = sys.argv[1], sys.argv[2], sys.argv[3:]
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for it in items:
        p = os.path.join(root, it)
        if os.path.isdir(p):
            for d, _, fs in os.walk(p):
                for f in fs:
                    full = os.path.join(d, f)
                    z.write(full, os.path.relpath(full, root))
        elif os.path.exists(p):
            z.write(p, it)
`, root, out, ...items]);
console.log(`Wrote ${out}`);
