// The live random source: Node's cryptographically secure generator. Every shuffle at a real
// table uses this (Fisher–Yates with unbiased integers, see src/engine/cards.mjs).
import { randomInt, randomBytes } from 'node:crypto';

export const secureRng = {
  int(n) { return randomInt(n); },
  float() { return randomInt(0x800000000000) / 0x800000000000; }, // 2^47: randomInt's range must stay below 2^48
};

const ALPHA = 'abcdefghijkmnpqrstuvwxyz23456789';
const CODE = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function randomId(n = 12, alphabet = ALPHA) {
  let s = '';
  for (let i = 0; i < n; i++) s += alphabet[randomInt(alphabet.length)];
  return s;
}
export const roomCode = () => randomId(6, CODE);
export const secretKey = () => randomBytes(32).toString('base64url');
