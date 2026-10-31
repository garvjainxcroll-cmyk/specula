// The one SPECULA function. Every /api/* request comes here.
// Storage is Netlify Blobs; the game logic is in server/api.mjs.
//
// The Blobs store is opened for EVERY request, never kept between requests. Netlify hands
// each request its own short-lived Blobs token; a store kept from an earlier request still
// holds that request's token, and once it expires every read and write fails with
// "Netlify Blobs has generated an internal error (401 status code)". Opening a store is
// cheap (no network). tests/netlify-token.test.mjs checks this.
import { handle } from '../../server/api.mjs';
import { blobsStore } from '../../server/storage-blobs.mjs';

export default async (request) => handle(request, blobsStore('specula'), { ADMIN_PASSWORD: process.env.SPECULA_ADMIN_PASSWORD || '' });

export const config = { path: ['/api/*'] };
