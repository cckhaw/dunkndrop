import { createHandler } from '../lib/handler.js';
import { blobStore } from '../lib/blob-store.js';

// The signing secret is derived from the Blob store's own server-side token, so no extra secret has to be configured.
export default createHandler({
  store: blobStore,
  getSecret: () => process.env.LEADERBOARD_SECRET || process.env.BLOB_READ_WRITE_TOKEN || ''
});
