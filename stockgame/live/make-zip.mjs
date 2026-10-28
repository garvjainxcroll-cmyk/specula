// Make jaco-stock-game-netlify.zip: everything the live site needs (and nothing secret).
//   node stockgame/live/make-zip.mjs [output.zip]
// It refuses to include the secret folder or the single-file desk.
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] || join(root, 'jaco-stock-game-netlify.zip'));
execFileSync('node', [join(root, 'live', 'build.mjs')], { stdio: 'inherit' });
const items = ['package.json', 'package-lock.json', 'netlify.toml', 'DEPLOY.md', 'README.md',
  'live/build.mjs', 'live/dev-server.mjs', 'live/seal.mjs', 'live/make-zip.mjs', 'live/public-game.json', 'live/server', 'live/netlify', 'live/dist',
  'src/engine.mjs', 'src/vault.mjs', 'src/chart.mjs', 'src/theme.css', 'src/home.html', 'src/market.html', 'src/desk.html'];
execFileSync('python3', ['-I', '-c', `
import zipfile, os, sys
root, out, items = sys.argv[1], sys.argv[2], sys.argv[3:]
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for it in items:
        assert not it.startswith(('secret', 'dist')), it
        p = os.path.join(root, it)
        files = [os.path.join(d, f) for d, _, fs in os.walk(p) for f in fs] if os.path.isdir(p) else [p]
        for full in sorted(files):
            z.write(full, os.path.join('jaco-stock-game', os.path.relpath(full, root)))
`, root, out, ...items]);
console.log(`Wrote ${out}`);
