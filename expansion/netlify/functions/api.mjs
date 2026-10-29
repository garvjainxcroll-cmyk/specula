// The one function of the Round 4 control site. Every /api/* request comes here.
// Storage is Netlify Blobs; the logic is in server/api.mjs.
import { handle } from '../../server/api.mjs';
import { blobsStore } from '../../server/storage-blobs.mjs';

let store;
export default async (request) => {
  store ||= blobsStore('jaco-r4');
  return handle(request, store, {
    SETUP_CODE: process.env.JACO_SETUP_CODE || '',
    TOKEN_SECRET: process.env.JACO_TOKEN_SECRET || '',
    TOKEN_HOURS: Number(process.env.JACO_TOKEN_HOURS || 12),
  });
};

export const config = { path: ['/api/*'] };
