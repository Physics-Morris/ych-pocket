/* Deterministic phone-sensor tests; run with `node tests/tilt.test.cjs`. */
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '..', 'tilt.js'), 'utf8');

function fixture({ permission = 'granted', secure = true, sensor = true, angle = 90 } = {}) {
  const listeners = new Map(), timers = new Map();
  let clock = 0, requests = 0, changes = 0;
  const win = {
    isSecureContext: secure,
    orientation: angle,
    addEventListener(name, handler) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(handler); },
    removeEventListener(name, handler) { listeners.get(name)?.delete(handler); }
  };
  if (sensor) win.DeviceOrientationEvent = { requestPermission() { requests++; return typeof permission === 'function' ? permission() : Promise.resolve(permission); } };
  const doc = { hidden: false };
  vm.runInNewContext(source, {
    window: win, document: doc, performance: { now: () => clock },
    setTimeout(fn) { const id = Symbol(); timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); }
  });
  const tilt = new win.YCHTilt(() => changes++);
  return {
    tilt, win, doc, timers,
    get requests() { return requests; }, get changes() { return changes; },
    emit(name, values = {}) { for (const handler of listeners.get(name) || []) handler(values); },
    listenerCount(name) { return listeners.get(name)?.size || 0; },
    advance(ms) { clock += ms; },
    expireTimers() { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } },
    settle() { let force; for (let i = 0; i < 120; i++) force = tilt.sample(1 / 120); return force; }
  };
}

async function runTests() {
  const results = [];
  const test = async (name, fn) => { await fn(); results.push('PASS ' + name); };
  await test('no permission or sensor subscription until explicitly enabled', async () => {
    const f = fixture();
    assert.equal(f.requests, 0); assert.equal(f.listenerCount('deviceorientation'), 0);
    await f.tilt.start();
    assert.equal(f.requests, 1); assert(f.tilt.enabled); assert(!f.tilt.ready);
    f.emit('deviceorientation', { beta: 0, gamma: -45 });
    assert(f.tilt.ready); assert.equal(f.timers.size, 0);
    assert(Math.abs(f.tilt.sample(.1).x) < .001); assert(f.tilt.sample(.1).y > 230 && f.tilt.force.y < 240);
  });
  await test('both landscape orientations steer toward the lower screen edge', async () => {
    for (const angle of [90, 270]) {
      const f = fixture({ angle }), sign = angle === 90 ? 1 : -1;
      await f.tilt.start();
      f.emit('deviceorientation', { beta: 0, gamma: -45 * sign });
      f.emit('deviceorientation', { beta: 20 * sign, gamma: -45 * sign });
      assert(f.settle().x > 100, 'lowering the right edge should pull right');
      f.emit('deviceorientation', { beta: -20 * sign, gamma: -45 * sign });
      assert(f.settle().x < -100, 'lowering the left edge should pull left');
      f.emit('deviceorientation', { beta: 0, gamma: 45 * sign });
      assert(f.settle().y < -230, 'lowering the top edge should lift rings');
      f.emit('deviceorientation', { beta: 0, gamma: 0 });
      assert(Math.abs(f.settle().y) < .1, 'flat screen should have no in-plane gravity');
      f.emit('deviceorientation', { beta: 0, gamma: -45 * sign });
      assert(f.settle().y > 230, 'lowering the bottom edge should settle rings');
    }
  });
  await test('small hand tremors are ignored and steering is smoothed', async () => {
    const f = fixture(); await f.tilt.start();
    f.emit('deviceorientation', { beta: 0, gamma: -45 });
    f.emit('deviceorientation', { beta: .5, gamma: -45 });
    assert.equal(f.settle().x, 0);
    f.emit('deviceorientation', { beta: 30, gamma: -45 });
    assert(f.tilt.sample(1 / 120).x > 0 && f.tilt.force.x < 60);
    assert(f.settle().x > 160);
  });
  await test('gravity is fixed to the world, independent of startup or screen rotation', async () => {
    const f = fixture(); await f.tilt.start();
    f.emit('deviceorientation', { beta: 25, gamma: -20 });
    assert(f.settle().x > 130 && f.settle().y > 90, 'first reading must already apply actual gravity');
    f.tilt.refresh(); f.emit('deviceorientation', { beta: 25, gamma: -20 });
    assert(f.settle().x > 130 && f.settle().y > 90, 'refresh must not redefine neutral');
    f.win.orientation = 270; f.emit('orientationchange'); assert(!f.tilt.ready);
    f.emit('deviceorientation', { beta: -25, gamma: 20 });
    assert(f.settle().x > 130 && f.settle().y > 90, 'flipped landscape must follow the same physical edge');
  });
  await test('permission denial and errors leave pumps usable with no active sensor', async () => {
    for (const permission of ['denied', () => Promise.reject(new Error('blocked'))]) {
      const f = fixture({ permission }); await f.tilt.start();
      assert(!f.tilt.enabled && !f.tilt.requesting && f.tilt.error);
      assert.equal(f.listenerCount('deviceorientation'), 0);
      assert.equal(f.tilt.sample(.1).y, 240);
    }
  });
  await test('unsupported, insecure, null and missing readings have clear fallbacks', async () => {
    for (const options of [{ secure: false }, { sensor: false }]) {
      const f = fixture(options); await f.tilt.start();
      assert(!f.tilt.enabled && f.tilt.error); assert.equal(f.requests, 0);
    }
    const f = fixture(); await f.tilt.start();
    f.emit('deviceorientation', { beta: null, gamma: null });
    f.emit('deviceorientation', { beta: NaN, gamma: 20 });
    assert(!f.tilt.ready);
    f.expireTimers(); assert(!f.tilt.enabled && f.tilt.error.includes('No motion'));
  });
  await test('cancelling an in-flight permission request cannot enable tilt later', async () => {
    let resolve;
    const f = fixture({ permission: () => new Promise(r => { resolve = r; }) });
    const pending = f.tilt.start(); f.tilt.stop(); resolve('granted'); await pending;
    assert(!f.tilt.enabled && !f.tilt.requesting);
    assert.equal(f.listenerCount('deviceorientation'), 0);
  });
  await test('stale or hidden sensor data cannot leave a stuck sideways force', async () => {
    const f = fixture(); await f.tilt.start();
    f.emit('deviceorientation', { beta: 0, gamma: -45 });
    f.emit('deviceorientation', { beta: 30, gamma: -45 }); assert(f.settle().x > 160);
    f.advance(1500); assert.equal(f.tilt.sample(.1).x, 0); assert.equal(f.tilt.sample(.1).y, 240);
    f.doc.hidden = true; f.emit('deviceorientation', { beta: -30, gamma: -45 });
    f.doc.hidden = false; f.emit('deviceorientation', { beta: -30, gamma: -45 });
    assert(f.settle().x < -160);
    f.tilt.stop(); assert.equal(f.listenerCount('deviceorientation'), 0);
    assert.equal(f.listenerCount('orientationchange'), 0);
    await f.tilt.start(); await f.tilt.start(); assert.equal(f.listenerCount('deviceorientation'), 1);
  });
  return results;
}
if (require.main === module) runTests().then(results => console.log(results.join('\n'))).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = runTests;
