// The one function of the live stock game: every /api/* request comes here.
// Storage is Netlify Blobs; the game logic is in live/server/api.mjs.
import { handle } from '../../server/api.mjs';
import { blobsStore } from '../../server/storage-blobs.mjs';

let store;
export default async (request) => {
  store ||= blobsStore('jaco-stock-game');
  return handle(request, store);
};

export const config = { path: ['/api/*'] };
