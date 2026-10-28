// Random sources. The engine never makes its own randomness: callers pass one of these in.
//  - seeded(seed): deterministic (tests, simulations, replays). Never used for live cards.
//  - The server passes a source built on crypto.randomInt (server/rng.mjs); the browser's
//    offline practice uses crypto.getRandomValues (web/js/local.mjs).

function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; };
}

/** sfc32, seeded from a string or number. */
export function seeded(seed = 1) {
  const s = xmur3(String(seed));
  let a = s(); let b = s(); let c = s(); let d = s();
  const next32 = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); d = (d + 1) | 0; t = (t + d) | 0; c = (c + t) | 0;
    return t >>> 0;
  };
  for (let i = 0; i < 12; i++) next32();
  return fromUint32(next32);
}

/** Build {int, float} from any uniform 32-bit source, without modulo bias. */
export function fromUint32(next32) {
  return {
    int(n) {
      if (!(n >= 1) || n > 0x100000000) throw new Error(`rng.int: bad range ${n}`);
      const lim = Math.floor(0x100000000 / n) * n;
      let x;
      do { x = next32(); } while (x >= lim);
      return x % n;
    },
    float() { return next32() / 0x100000000; },
  };
}
