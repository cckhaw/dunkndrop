import { get, put, BlobPreconditionFailedError } from '@vercel/blob';
import { emptyBoard, normalizeBoard } from './handler.js';

// One private JSON file per world. Updates are optimistic: write only if the ETag we read is still current
// (or, for the very first write, only if the file does not exist yet), and retry on conflict.
const pathFor = world => `leaderboard/${world}.json`;

async function read(world) {
  const r = await get(pathFor(world), { access: 'private', useCache: false });
  if (!r || r.statusCode !== 200) return { data: emptyBoard(), etag: null };
  return { data: normalizeBoard(JSON.parse(await new Response(r.stream).text())), etag: r.blob.etag };
}

export const blobStore = {
  read,
  async update(world, fn) {
    for (let attempt = 0; ; attempt++) {
      const { data, etag } = await read(world);
      const out = fn(data);
      try {
        await put(pathFor(world), JSON.stringify(out.data), {
          access: 'private', contentType: 'application/json', addRandomSuffix: false,
          allowOverwrite: etag !== null, ifMatch: etag === null ? undefined : etag
        });
        return out.result;
      } catch (e) {
        const conflict = e instanceof BlobPreconditionFailedError || /already exists/i.test((e && e.message) || '');
        if (!conflict || attempt >= 5) throw e;
      }
    }
  }
};
