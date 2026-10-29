// The one function of the live stock game: every /api/* request comes here.
// Storage is Netlify Blobs; the game logic is in live/server/api.mjs.
import { handle } from '../../server/api.mjs';
import { blobsStore } from '../../server/storage-blobs.mjs';

// Netlify gives each call its own short-lived Blobs token, so the store is made for every
// request. A store kept between calls holds an old token and fails with "Netlify Blobs has
// generated an internal error (401)" once that token expires (tests/netlify-blobs-token.test.mjs).
export default async (request) => handle(request, blobsStore('jaco-stock-game'));

export const config = { path: ['/api/*'] };
