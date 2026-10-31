import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { isProfane, validateName } from './profanity.js';

export const WORLDS = ['block', 'roof', 'neon'];
const TOP_N = 10;                   // entries shown
const KEEP = 25;                    // entries stored per world
const MAX_SCORE = 2000;
const MAX_NONCES = 400;             // remembered session ids (stops a session being submitted twice)
const TOKEN_MAX_AGE_S = 12 * 3600;
const POINTS_PER_SECOND = 4;        // generous upper bound: a swish combo is 10 points and a shot takes >2 s

const emptyBoard = () => ({ v: 1, entries: [], nonces: [] });
export const normalizeBoard = d => ({
  v: 1,
  entries: Array.isArray(d?.entries) ? d.entries.filter(e => e && typeof e.n === 'string' && Number.isInteger(e.s)) : [],
  nonces: Array.isArray(d?.nonces) ? d.nonces.filter(n => typeof n === 'string') : []
});
const byRank = (a, b) => b.s - a.s || a.t - b.t;
const publicEntries = board => board.entries.filter(e => !isProfane(e.n)).sort(byRank).slice(0, TOP_N).map(e => ({ name: e.n, score: e.s, at: e.t }));

function sign(secret, payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return body + '.' + createHmac('sha256', secret).update(body).digest('base64url');
}
function verify(secret, token) {
  if (typeof token !== 'string' || token.length > 400) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const want = Buffer.from(createHmac('sha256', secret).update(body).digest('base64url')), got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString()); } catch (e) { return null; }
}

class Reject extends Error { constructor(status, error) { super(error); this.status = status; this.error = error; } }
function send(res, status, body, cache) {
  res.setHeader('Cache-Control', cache || 'no-store');
  res.status(status).json(body);
}

// store: { read(world) -> {data, etag}, update(world, fn(data) -> {data, result}) -> result }
export function createHandler({ store, getSecret, now = () => Date.now() }) {
  return async function handler(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const secret = getSecret();
      if (req.method === 'GET') {
        const world = String((req.query || {}).world || '');
        if (!WORLDS.includes(world)) throw new Reject(400, 'world_invalid');
        if (!secret) throw new Reject(503, 'unavailable');
        const { data } = await store.read(world);
        return send(res, 200, { world, entries: publicEntries(data) }, 'public, s-maxage=10, stale-while-revalidate=30');
      }
      if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); throw new Reject(405, 'method_not_allowed'); }
      if (!secret) throw new Reject(503, 'unavailable');
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
      if (!body || typeof body !== 'object') throw new Reject(400, 'bad_request');
      if (!WORLDS.includes(body.world)) throw new Reject(400, 'world_invalid');

      if (body.action === 'start') {                       // a game began: hand out a signed, single-use session
        return send(res, 200, { token: sign(secret, { w: body.world, t: now(), n: randomBytes(9).toString('base64url') }) });
      }
      if (body.action !== 'submit') throw new Reject(400, 'bad_request');

      const nameCheck = validateName(body.name);
      if (!nameCheck.ok) throw new Reject(422, nameCheck.error);
      const score = body.score;
      if (!Number.isInteger(score) || score < 1 || score > MAX_SCORE) throw new Reject(422, 'score_invalid');
      const session = verify(secret, body.token);
      if (!session || session.w !== body.world || typeof session.n !== 'string') throw new Reject(403, 'token_invalid');
      const elapsed = (now() - session.t) / 1000;
      if (elapsed > TOKEN_MAX_AGE_S) throw new Reject(403, 'token_expired');
      if (elapsed < Math.ceil(score / POINTS_PER_SECOND)) throw new Reject(422, 'too_fast');

      const result = await store.update(body.world, data => {
        if (data.nonces.includes(session.n)) throw new Reject(409, 'already_submitted');
        const key = nameCheck.name.toLowerCase();
        const entries = data.entries.slice();
        const i = entries.findIndex(e => e.n.toLowerCase() === key);
        let improved = true;
        if (i >= 0) {                                       // one row per name: keep the best score
          if (score > entries[i].s) entries[i] = { n: nameCheck.name, s: score, t: now() }; else improved = false;
        } else entries.push({ n: nameCheck.name, s: score, t: now() });
        entries.sort(byRank);
        const kept = entries.slice(0, KEEP);
        const rank = kept.findIndex(e => e.n.toLowerCase() === key) + 1;
        const next = { v: 1, entries: kept, nonces: data.nonces.concat(session.n).slice(-MAX_NONCES) };
        return { data: next, result: { rank: rank || null, improved, entries: publicEntries(next) } };
      });
      return send(res, 200, { ok: true, world: body.world, ...result });
    } catch (e) {
      if (e instanceof Reject) return send(res, e.status, { error: e.error });
      console.error('leaderboard error', e && e.message);
      return send(res, 503, { error: 'unavailable' });
    }
  };
}

export { emptyBoard };
