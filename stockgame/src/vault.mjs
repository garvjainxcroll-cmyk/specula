// Locked news and price moves for the team broker app.
// Every update's news (N) and price move (P) is sealed with AES-GCM under its own key.
// A key comes from an 8-character release code through PBKDF2, so the page can hold
// all 45 updates without a curious team being able to read ahead.
// Each sealed item also carries the key of the one before it (and a price move carries
// the key of its own news), so the latest code a team types opens everything earlier.
// Works the same in the browser and in Node (WebCrypto). The build inlines this file.

export function toB64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
export function fromB64(s) {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
function hexBytes(hex) {
  return Uint8Array.from(hex.match(/../g), (h) => parseInt(h, 16));
}

export async function deriveRaw(code, saltHex, iterations) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: hexBytes(saltHex), iterations }, base, 256);
  return new Uint8Array(bits);
}

export function aesKey(raw, use = 'decrypt') {
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, [use]);
}

export async function seal(raw, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await aesKey(raw, 'encrypt');
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
  return { iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
}

export async function unseal(key, item) {
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(item.iv) }, key, fromB64(item.ct));
    return JSON.parse(new TextDecoder().decode(pt));
  } catch {
    return null;
  }
}

// Slot of an item in the sealed list: N1, P1, N2, P2, ...
export function slotOf(kind, i) {
  return 2 * (i - 1) + (kind === 'P' ? 1 : 0);
}

// Walk back from a known key: returns every item it opens, newest first.
// keyB64 opens slot `slot`; each item names the key of the item before it.
export async function walkBack(items, slot, keyB64, seen = new Map()) {
  const out = [];
  let todo = [[slot, keyB64]];
  while (todo.length) {
    const next = [];
    for (const [s, kb] of todo) {
      if (seen.has(s) || !items[s]) continue;
      const item = await unseal(await aesKey(fromB64(kb)), items[s]);
      if (!item) continue;
      seen.set(s, item);
      out.push(item);
      if (item.prev) next.push([slotOf(item.t, item.i - 1), item.prev]);
      if (item.t === 'P' && item.n) next.push([slotOf('N', item.i), item.n]);
    }
    todo = next;
  }
  return out;
}

// Try a typed code against every slot not opened yet. Returns { slot, keyB64 } or null.
export async function findSlot(items, code, saltHex, iterations, opened) {
  const raw = await deriveRaw(code, saltHex, iterations);
  const key = await aesKey(raw);
  for (let s = 0; s < items.length; s++) {
    if (opened.has(s)) continue;
    const item = await unseal(key, items[s]);
    if (item) return { slot: s, keyB64: toB64(raw), item };
  }
  return null;
}
