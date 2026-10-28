// The one ALEA function on Netlify. Every /api/* request comes here.
// Storage is Netlify Blobs; the game is in server/api.mjs. Follow-up work (delivering chips
// back to accounts, hand histories) runs after the reply when Netlify allows it.
import { handle } from '../../server/api.mjs';
import { blobsStore } from '../../server/storage-blobs.mjs';

let store;
export default async (request, context) => {
  store ||= blobsStore('alea');
  const defer = typeof context?.waitUntil === 'function' ? (p) => context.waitUntil(p) : null;
  return handle(request, store, { ADMIN_PASSWORD: process.env.ALEA_ADMIN_PASSWORD || '' }, { defer });
};

export const config = { path: ['/api/*'] };
