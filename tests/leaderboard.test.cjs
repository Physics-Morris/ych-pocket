/* Run with node tests/leaderboard.test.cjs. No network calls or production scores. */
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const gameHarness = require('./game.test.cjs');

async function runTests() {
  const results = [];
  const test = async (name, check) => { await check(); results.push(`PASS ${name}`); };
  const calls = [];
  let response = [], status = 200;
  const sandbox = { window: {}, URL, AbortController, atob, setTimeout, clearTimeout,
    fetch: async (url, options) => { calls.push({ url, ...options }); return { ok: status === 200, json: async () => response }; }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../leaderboard.js'), 'utf8'), sandbox);
  const create = sandbox.window.YCHLeaderboard.create;
  const client = create({ url: 'https://example.supabase.co', publishableKey: 'sb_publishable_test' });
  const id = '37c859bb-bc11-4a8e-ab87-b61e0d20be0d';

  await test('only public keys are accepted; unconfigured games keep local boards', () => {
    assert.equal(create({}), null);
    for (const publishableKey of ['sb_secret_private', `x.${btoa(JSON.stringify({ role: 'service_role' }))}.x`]) {
      assert.throws(() => create({ url: 'https://example.supabase.co', publishableKey }));
    }
    assert.throws(() => create({ url: 'http://example.supabase.co', publishableKey: 'sb_publishable_test' }));
  });
  await test('shared reads select a challenge and disable response caching', async () => {
    response = [{ name: '<img src=x>', ms: 2100 }];
    assert.equal((await client.list('color-fish'))[0].name, '<img src=x>');
    const call = calls.at(-1);
    assert.equal(call.url, 'https://example.supabase.co/rest/v1/rpc/ych_leaderboard');
    assert.deepEqual(JSON.parse(call.body), { p_board: 'color-fish' });
    assert.equal(call.cache, 'no-store'); assert.equal(call.credentials, 'omit');
    assert.equal(call.headers.Authorization, undefined);
  });
  await test('legacy anon keys use the required bearer header', async () => {
    const key = `x.${btoa(JSON.stringify({ role: 'anon' }))}.x`;
    await create({ url: 'https://example.supabase.co', publishableKey: key }).list('classic-calm');
    assert.equal(calls.at(-1).headers.Authorization, `Bearer ${key}`);
  });
  await test('saves send one stable submission ID and require server confirmation', async () => {
    response = { rank: 3 };
    assert.equal(await client.save({ id, key: 'classic-fish', ms: 1234 }, 'Player'), 3);
    assert.deepEqual(JSON.parse(calls.at(-1).body), { p_id: id, p_board: 'classic-fish', p_name: 'Player', p_ms: 1234 });
    status = 503;
    await assert.rejects(client.save({ id, key: 'classic-fish', ms: 1234 }, 'Player'));
    status = 200;
  });
  await test('invalid modes, values and malformed server data are rejected', async () => {
    await assert.rejects(client.list('bad-board'));
    await assert.rejects(client.save({ id, key: 'classic-calm', ms: -1 }, 'Player'));
    response = [{ name: 'Bad', ms: -1 }]; await assert.rejects(client.list('classic-calm'));
    response = { rank: 0 }; await assert.rejects(client.save({ id, key: 'classic-calm', ms: 2 }, 'Player'));
  });

  const pending = [];
  const shared = {
    list: async board => [{ name: board, ms: 3000 }],
    save: (round, name) => new Promise((resolve, reject) => pending.push({ round, name, resolve, reject }))
  };
  const h = gameHarness({ shared }), { game, element, advance } = h;
  const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
  const finish = () => {
    game.reset(); game.startRound(); advance(5500);
    game.rings.forEach((ring, i) => Object.assign(ring, { x: game.posts[i % 3].x, y: game.posts[i % 3].tip - .3, vx: 0, vy: 80 }));
    game.step(1 / 120);
    assert.equal(game.state, 'finished');
  };
  await test('double taps share one request, and a lost response can retry the same score', async () => {
    finish(); element('player-name').value = 'Cross-device';
    const first = element('score-entry').emit('submit');
    element('score-entry').emit('submit'); assert.equal(pending.length, 1);
    assert.equal(element('save-time').textContent, 'SAVING…');
    pending[0].reject(new Error('response lost')); await first;
    assert.equal(element('save-time').textContent, 'RETRY');
    assert(!element('save-time').disabled);
    element('player-name').value = 'Changed after timeout';
    const retry = element('score-entry').emit('submit');
    assert.equal(pending[1].round.id, pending[0].round.id);
    assert.equal(pending[1].name, 'Cross-device');
    pending[1].resolve(1); await retry;
    assert.equal(element('save-time').textContent, 'SAVED');
    assert(element('score-feedback').textContent.includes('Saved online'));
    assert.equal(h.storage.get('ych-times-v1'), undefined);
  });
  await test('shared board reads show server data and never local-device scores', async () => {
    element('leaderboard-open').emit('click'); await flush();
    assert.equal(element('leaderboard-rows').children[0].children[1].textContent, 'classic-calm');
    assert(element('leaderboard-note').textContent.includes('across all devices'));
    element('board-fish').emit('click'); await flush();
    assert.equal(element('leaderboard-rows').children[0].children[1].textContent, 'classic-fish');
    element('close-leaderboard').emit('click');
  });
  await test('a slow save from an old round cannot overwrite the next round UI', async () => {
    finish(); element('player-name').value = 'Old round';
    const save = element('score-entry').emit('submit');
    game.reset(); game.startRound();
    pending.at(-1).resolve(2); await save;
    assert.equal(game.state, 'running');
    assert.equal(element('save-time').textContent, 'SAVE');
    assert.equal(element('score-feedback').textContent, '');
    assert.equal(element('player-name').readOnly, false);
  });
  await test('read failures expose retry and recover without pretending the board is empty', async () => {
    shared.list = async () => { throw new Error('offline'); };
    element('leaderboard-open').emit('click'); await flush();
    assert.equal(element('leaderboard-retry').hidden, false);
    assert.equal(element('leaderboard-empty').hidden, true);
    shared.list = async () => [];
    await element('leaderboard-retry').emit('click');
    assert.equal(element('leaderboard-status').hidden, true);
    assert.equal(element('leaderboard-empty').hidden, false);
  });
  await test('out-of-order reads cannot replace the currently selected challenge', async () => {
    const reads = [];
    shared.list = board => new Promise(resolve => reads.push({ board, resolve }));
    element('board-color').emit('click');
    element('board-fish').emit('click');
    reads[1].resolve([{ name: 'Latest board', ms: 2000 }]); await flush();
    reads[0].resolve([{ name: 'Previous board', ms: 1000 }]); await flush();
    assert.equal(element('leaderboard-rows').children[0].children[1].textContent, 'Latest board');
  });
  return results;
}
if (require.main === module) runTests().then(results => console.log(results.join('\n'))).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = runTests;
