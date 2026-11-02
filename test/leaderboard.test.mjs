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

// ---------- Blob store adapter (against a fake SDK with the same conditional-write semantics) ----------
import { createBlobStore } from '../lib/blob-store.js';
function fakeSdk() {
  class BlobPreconditionFailedError extends Error {}
  const files = new Map(), log = { puts: 0, conflicts: 0, interfere: null };
  let ver = 0;
  return {
    files, log, BlobPreconditionFailedError,
    async get(path, opts) {
      assert.equal(opts.access, 'private'); assert.equal(opts.useCache, false);
      const f = files.get(path); if (!f) return null;
      return { statusCode: 200, stream: new Blob([f.body]).stream(), blob: { etag: f.etag } };
    },
    async put(path, body, opts) {
      assert.equal(opts.access, 'private'); assert.equal(opts.addRandomSuffix, false);
      if (log.interfere) { const f = log.interfere; log.interfere = null; f(); }          // another request sneaks in before this write
      const cur = files.get(path);
      if (!cur && opts.allowOverwrite) throw new Error('no such blob');
      if (cur && !opts.allowOverwrite) throw new Error('This blob already exists');
      if (cur && opts.ifMatch !== cur.etag) { log.conflicts++; throw new BlobPreconditionFailedError('precondition failed'); }
      files.set(path, { body, etag: 'v' + (++ver) }); log.puts++;
      return { pathname: path };
    }
  };
}
const addScore = (name, s) => data => ({ data: { v: 1, entries: data.entries.concat({ n: name, s, t: 1 }), nonces: data.nonces }, result: data.entries.length + 1 });

test('blob store: first write creates the file, later writes are conditional on the ETag', async () => {
  const sdk = fakeSdk(), store = createBlobStore(sdk);
  assert.deepEqual((await store.read('block')).data, emptyBoard());
  assert.equal(await store.update('block', addScore('A', 5)), 1);
  assert.equal(await store.update('block', addScore('B', 6)), 2);
  assert.deepEqual(JSON.parse(sdk.files.get('leaderboard/block.json').body).entries.map(e => e.n), ['A', 'B']);
  assert.equal(sdk.log.conflicts, 0);
});
test('blob store: a concurrent write causes a re-read and retry, so no update is lost', async () => {
  const sdk = fakeSdk(), store = createBlobStore(sdk);
  await store.update('roof', addScore('A', 1));
  sdk.log.interfere = () => { const f = sdk.files.get('leaderboard/roof.json'); const d = JSON.parse(f.body); d.entries.push({ n: 'Rival', s: 9, t: 1 }); sdk.files.set('leaderboard/roof.json', { body: JSON.stringify(d), etag: 'rival-write' }); };
  assert.equal(await store.update('roof', addScore('Me', 3)), 3);                      // saw A and Rival on the retry
  assert.deepEqual(JSON.parse(sdk.files.get('leaderboard/roof.json').body).entries.map(e => e.n), ['A', 'Rival', 'Me']);
  assert.equal(sdk.log.conflicts, 1);
});
test('blob store: two racing first-ever writes both end up stored', async () => {
  const sdk = fakeSdk(), store = createBlobStore(sdk);
  sdk.log.interfere = () => sdk.files.set('leaderboard/neon.json', { body: JSON.stringify({ v: 1, entries: [{ n: 'First', s: 7, t: 1 }], nonces: [] }), etag: 'first' });
  await store.update('neon', addScore('Second', 2));
  assert.deepEqual(JSON.parse(sdk.files.get('leaderboard/neon.json').body).entries.map(e => e.n), ['First', 'Second']);
});
test('blob store: a rejected update (throw inside fn) writes nothing; persistent conflicts eventually error', async () => {
  const sdk = fakeSdk(), store = createBlobStore(sdk);
  await assert.rejects(store.update('block', () => { throw new Error('nope'); }), /nope/);
  assert.equal(sdk.log.puts, 0);
  await store.update('block', addScore('A', 1));
  const always = () => sdk.files.set('leaderboard/block.json', { body: sdk.files.get('leaderboard/block.json').body, etag: 'x' + Math.random() });
  const orig = sdk.put.bind(sdk); sdk.put = async (...a) => { always(); return orig(...a); };
  await assert.rejects(store.update('block', addScore('B', 2)), e => e instanceof sdk.BlobPreconditionFailedError);
});

// ---------- Background music engine (extracted from index.html and run against a stub audio context) ----------
function loadMusicEngine() {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const m = html.match(/const MusicEngine = \(\(\) => \{[\s\S]*?\n\}\)\(\);/);
  assert.ok(m, 'MusicEngine block missing from index.html');
  return new Function(m[0] + '; return MusicEngine;')();
}
function stubAudio() {
  const log = { osc: 0, noise: 0, bad: [] };
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => ({ connect() {}, start() {}, stop() {}, frequency: param(), gain: param(), Q: param(), detune: param(), type: '' });
  return {
    log,
    ac: {
      createOscillator() { log.osc++; return node(); }, createBufferSource() { log.noise++; return node(); },
      createGain: node, createBiquadFilter: node
    }
  };
}
test('music: every world has a complete 4-bar groove that schedules sound on every bar and never throws', () => {
  const M = loadMusicEngine();
  assert.deepEqual(Object.keys(M.GROOVES).sort(), ['block', 'neon', 'roof']);
  for (const [id, g] of Object.entries(M.GROOVES)) {
    assert.ok(g.bpm >= 70 && g.bpm <= 130, id + ' bpm');
    for (const k of ['kick', 'snare', 'hat', 'drib']) { assert.equal(g[k].length, 4, id + ' ' + k); g[k].forEach(p => assert.equal(p.length, 16, `${id} ${k} bar length`)); }
    assert.equal(g.chords.length, 4); assert.equal(g.bassRoot.length, 4);
    const { ac, log } = stubAudio(), stub = {};
    for (let bar = 0; bar < 8; bar++) {                                    // two full loops, covering the hook, fills and variations
      const before = log.osc + log.noise;
      for (let s = 0; s < 16; s++) M.step(ac, stub, {}, id, bar * 16 + s, 0);
      assert.ok(log.osc + log.noise - before > 20, `${id} bar ${bar} should contain plenty of sound`);
    }
  }
});
