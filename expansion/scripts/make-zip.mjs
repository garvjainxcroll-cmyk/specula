// Make jaco-r4-control.zip: the whole deployable project (source + a pre-built dist/),
// without node_modules, local data or test output. Usage: npm run zip
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || join(root, 'jaco-r4-control.zip');
if (existsSync(out)) rmSync(out);
const items = ['README.md', 'DEPLOY.md', 'MODEL.md', 'ADMIN_GUIDE.md', 'CHANGELOG.md', 'package.json', 'package-lock.json', 'netlify.toml', '.gitignore', 'netlify', 'server', 'src', 'web', 'scripts', 'tests', 'e2e', 'playwright.config.mjs', 'dist'];
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
                    z.write(full, os.path.join('jaco-r4-control', os.path.relpath(full, root)))
        elif os.path.exists(p):
            z.write(p, os.path.join('jaco-r4-control', it))
`, root, out, ...items]);
console.log(`Wrote ${out}`);
