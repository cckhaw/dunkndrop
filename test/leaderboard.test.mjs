import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isProfane, validateName } from '../lib/profanity.js';
import { createHandler, normalizeBoard, emptyBoard } from '../lib/handler.js';

// ---------- profanity ----------
test('blocks profanity, leetspeak, spacing and stretching', () => {
  for (const n of ['fuck', 'FUCK', 'fuuuck', 'f.u.c.k', 'f u c k', 'sh1t', '5h!t', 'b1tch', 'a$$hole', 'ass', 'a s s', 'dick', 'N1gga', 'pussy', 'cunt',
    'motherfucker', 'asshole99', 'xX_shit_Xx', 'wh0re', 'sl_ut', 'Hitler', 'porn']) assert.equal(isProfane(n), true, n);
});
test('allows ordinary names (no Scunthorpe-style false positives for common words)', () => {
  for (const n of ['Alex', 'Sam', 'Dickson', 'Hancock', 'Cockburn', 'class', 'Cassie', 'Bassist', 'Assange', 'Essex', 'Grape', 'Therapist', 'Analyst', 'Cumberland',
    'Titan', 'Shooter', 'Hoops', 'Swish', 'Dunk_King', 'Mia-2', 'Mr. T', 'Michael J', 'Sk8r', 'Pass', 'Scoop']) assert.equal(isProfane(n), false, n);
});
test('name validation', () => {
  assert.deepEqual(validateName('  Mia   Lee '), { ok: true, name: 'Mia Lee' });
  assert.equal(validateName('a').error, 'name_length');
  assert.equal(validateName('x'.repeat(15)).error, 'name_length');
  assert.equal(validateName('Mia<script>').error, 'name_chars');
  assert.equal(validateName('émile').error, 'name_chars');
  assert.equal(validateName('...').error, 'name_chars');
  assert.equal(validateName('go.com').error, 'name_link');
  assert.equal(validateName('fuck you').error, 'name_profane');
  assert.equal(validateName(42).error, 'name_invalid');
});
test('client copy of the filter in index.html matches the server module', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const m = html.match(/\/\* PROFANITY:START \*\/([\s\S]*?)\/\* PROFANITY:END \*\//);
  assert.ok(m, 'PROFANITY block missing from index.html');
  const client = new Function(m[1] + '; return { isProfane, validateName };')();
  const server = readFileSync(new URL('../lib/profanity.js', import.meta.url), 'utf8').match(/\/\* PROFANITY:START \*\/([\s\S]*?)\/\* PROFANITY:END \*\//)[1];
  assert.equal(m[1].trim(), server.trim(), 'embedded block differs from lib/profanity.js');
  for (const n of ['fuck', 'Alex', 'sh1t', 'Dickson', 'a s s', 'ok name', 'x'.repeat(20)]) assert.deepEqual(client.validateName(n), validateName(n), n);
});

// ---------- API ----------
function memoryStore() {
  const boards = {}, calls = { updates: 0 };
  return {
    boards, calls,
    async read(w) { return { data: normalizeBoard(boards[w] || emptyBoard()), etag: 'x' }; },
    async update(w, fn) { calls.updates++; const out = fn(normalizeBoard(boards[w] || emptyBoard())); boards[w] = out.data; return out.result; }
  };
}
function call(handler, method, { query, body } = {}) {
  return new Promise(resolve => {
    const headers = {};
    const res = { setHeader: (k, v) => { headers[k] = v; }, status(code) { this.code = code; return this; }, json(b) { resolve({ status: this.code, body: b, headers }); } };
    handler({ method, query, body }, res);
  });
}
function setup(startMs = 1_000_000_000_000) {
  const clock = { t: startMs }, store = memoryStore();
  const handler = createHandler({ store, getSecret: () => 'test-secret', now: () => clock.t });
  const start = async world => (await call(handler, 'POST', { body: { action: 'start', world } })).body.token;
  const submit = (world, token, name, score) => call(handler, 'POST', { body: { action: 'submit', world, token, name, score } });
  return { clock, store, handler, start, submit };
}

test('GET lists a world, rejects unknown worlds, and is unavailable without a secret', async () => {
  const { handler } = setup();
  const ok = await call(handler, 'GET', { query: { world: 'neon' } });
  assert.equal(ok.status, 200); assert.deepEqual(ok.body, { world: 'neon', entries: [] });
  assert.match(ok.headers['Cache-Control'], /s-maxage/);
  assert.equal((await call(handler, 'GET', { query: { world: 'mars' } })).status, 400);
  const noSecret = createHandler({ store: memoryStore(), getSecret: () => '' });
  assert.equal((await call(noSecret, 'GET', { query: { world: 'neon' } })).status, 503);
  assert.equal((await call(handler, 'DELETE', {})).status, 405);
});

test('submit: stores the score, ranks it, keeps the best per name, and is per world', async () => {
  const t = setup();
  let tok = await t.start('block'); t.clock.t += 60_000;
  let r = await t.submit('block', tok, 'Mia', 40);
  assert.equal(r.status, 200); assert.equal(r.body.rank, 1); assert.deepEqual(r.body.entries.map(e => [e.name, e.score]), [['Mia', 40]]);
  tok = await t.start('block'); t.clock.t += 60_000;
  r = await t.submit('block', tok, 'Zed', 55); assert.equal(r.body.rank, 1);
  tok = await t.start('block'); t.clock.t += 60_000;
  r = await t.submit('block', tok, 'mia', 20);                      // same name (any case), lower score: no change
  assert.equal(r.body.improved, false); assert.equal(r.body.entries.length, 2);
  tok = await t.start('block'); t.clock.t += 60_000;
  r = await t.submit('block', tok, 'MIA', 70);                      // higher score replaces it
  assert.equal(r.body.improved, true); assert.deepEqual(r.body.entries.map(e => [e.name, e.score]), [['MIA', 70], ['Zed', 55]]);
  assert.deepEqual((await call(t.handler, 'GET', { query: { world: 'roof' } })).body.entries, []);   // other worlds untouched
});

test('submit: rejects bad names, scores, tokens, replays, wrong world and impossible speed', async () => {
  const t = setup();
  const tok = await t.start('roof'); t.clock.t += 120_000;
  assert.equal((await t.submit('roof', tok, 'sh1t', 10)).body.error, 'name_profane');
  assert.equal((await t.submit('roof', tok, 'ok', 0)).body.error, 'score_invalid');
  assert.equal((await t.submit('roof', tok, 'ok', 2.5)).body.error, 'score_invalid');
  assert.equal((await t.submit('roof', tok, 'ok', 5000)).body.error, 'score_invalid');
  assert.equal((await t.submit('roof', 'garbage', 'ok', 10)).body.error, 'token_invalid');
  assert.equal((await t.submit('roof', tok.slice(0, -2) + 'xx', 'ok', 10)).body.error, 'token_invalid');
  assert.equal((await t.submit('neon', tok, 'ok', 10)).body.error, 'token_invalid');                 // token is bound to its world
  assert.equal((await t.submit('roof', tok, 'ok', 1000)).body.error, 'too_fast');                    // 1000 pts in 2 minutes
  assert.equal((await t.submit('roof', tok, 'ok', 10)).status, 200);
  assert.equal((await t.submit('roof', tok, 'someone else', 12)).body.error, 'already_submitted');   // single-use session
  const old = await t.start('roof'); t.clock.t += 13 * 3600_000;
  assert.equal((await t.submit('roof', old, 'late', 10)).body.error, 'token_expired');
});

test('only the top entries are stored and shown, profane stored names are hidden on read', async () => {
  const t = setup();
  for (let i = 1; i <= 30; i++) { const tok = await t.start('neon'); t.clock.t += 600_000; await t.submit('neon', tok, 'P' + i, i * 3); }
  const board = (await call(t.handler, 'GET', { query: { world: 'neon' } })).body.entries;
  assert.equal(board.length, 10); assert.equal(board[0].name, 'P30'); assert.equal(board[9].name, 'P21');
  assert.equal(t.store.boards.neon.entries.length, 25);
  t.store.boards.neon.entries.push({ n: 'fuck', s: 999, t: 1 });                                   // e.g. added before the list grew
  assert.ok(!(await call(t.handler, 'GET', { query: { world: 'neon' } })).body.entries.some(e => e.name === 'fuck'));
});
