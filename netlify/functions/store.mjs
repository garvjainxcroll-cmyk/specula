// The one SPECULA function. Every /api/* request comes here.
// Storage is Netlify Blobs; the game logic is in server/api.mjs.
import { handle } from '../../server/api.mjs';
import { blobsStore } from '../../server/storage-blobs.mjs';

let store;
export default async (request) => {
  store ||= blobsStore('specula');
  return handle(request, store, { ADMIN_PASSWORD: process.env.SPECULA_ADMIN_PASSWORD || '' });
};

export const config = { path: ['/api/*'] };
