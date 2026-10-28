// Seal the game for the live server.
//
//   node stockgame/live/seal.mjs
//
// Reads stockgame/secret/game.json and the game key in stockgame/secret/live-key.txt (made
// the first time, then kept), and writes live/server/game-sealed.mjs: the whole game
// encrypted (AES-GCM, key from PBKDF2). That file is safe to commit and deploy. The
// server opens it only when the Event Head signs in with the game key.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto as wc } from 'node:crypto';
import { ALPHABET } from '../src/engine.mjs';
import { sealGame } from './server/sealing.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const secret = join(here, '..', 'secret');
const game = JSON.parse(readFileSync(join(secret, 'game.json'), 'utf8'));
const keyFile = join(secret, 'live-key.txt');
if (!existsSync(keyFile)) {
  const r = wc.getRandomValues(new Uint8Array(16));
  const k = Array.from(r, (x) => ALPHABET[x % ALPHABET.length]).join('');
  writeFileSync(keyFile, k.match(/.{4}/g).join('-') + '\n');
  console.log('Made a new game key in stockgame/secret/live-key.txt');
}
const key = readFileSync(keyFile, 'utf8').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
const plain = {
  v: 1, capital: game.capital, margin: 1,
  stocks: game.stocks,
  updates: game.updates.map(({ i, round, cat, head, body, moves }) => ({ i, round, cat, head, body, moves })),
};
const sealed = await sealGame(plain, key);
const out = `// The whole game, sealed. Opened only by the server when the Event Head signs in with the game key.
// Made by live/seal.mjs. Safe to commit: without the key it is unreadable.
export default ${JSON.stringify(sealed)};
`;
writeFileSync(join(here, 'server', 'game-sealed.mjs'), out);
// the public part (already known to every team): the ten stocks and the starting money
const pub = { capital: plain.capital, margin: plain.margin, stocks: plain.stocks.map(({ t, name, sector, start }) => ({ t, name, sector, start })) };
writeFileSync(join(here, 'public-game.json'), JSON.stringify(pub, null, 1) + '\n');
console.log(`Sealed ${plain.updates.length} updates into live/server/game-sealed.mjs (${(out.length / 1024).toFixed(0)} KB).`);
