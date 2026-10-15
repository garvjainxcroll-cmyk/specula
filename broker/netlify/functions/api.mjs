// The one server function. Every /api/* request comes here.
// Storage is Netlify Blobs (switched on automatically); the logic is in server/api.mjs.
import { handle } from '../../server/api.mjs';
import { blobsStore } from '../../server/storage-blobs.mjs';

let store;
export default async (request, context) => {
  store ||= blobsStore('market');
  // context.ip is the visitor's internet address, set by Netlify (used only to count wrong host passwords)
  return handle(request, store, { HOST_PASSWORD: process.env.HOST_PASSWORD || '', ip: context?.ip || '' });
};

export const config = { path: ['/api/*'] };
