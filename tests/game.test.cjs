/* Run with `node tests/game.test.cjs`. Exercises the real game source in a small DOM harness. */
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');

function runTests() {
  const elements = new Map();
  const context2d = new Proxy({}, { get: (_, key) => key === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}, set: () => true });
  class Element {
    constructor(id) { this.id = id; this.listeners = {}; this.open = false; this.hidden = false; this.dataset = {}; this.style = {}; this.tagName = 'BUTTON'; this.classes = new Set(); this.classList = { add: n => this.classes.add(n), remove: n => this.classes.delete(n), toggle: (n, value) => value ? this.classes.add(n) : this.classes.delete(n) }; }
    addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
    emit(name, values = {}) { for (const listener of this.listeners[name] || []) listener({ target: this, preventDefault() {}, pointerId: 1, pointerType: 'touch', button: 0, ...values }); }
    removeEventListener(name, fn) { this.listeners[name] = (this.listeners[name] || []).filter(listener => listener !== fn); }
    setAttribute(name, value) { this[name] = value; }
    getBoundingClientRect() { return { width: 560, height: 350, left: 0, top: 0, right: 560, bottom: 350 }; }
    getContext() { return context2d; }
    setPointerCapture() {}
    showModal() { this.open = true; }
    close() { this.open = false; this.emit('close'); }
  }
  const element = id => { if (!elements.has(id)) elements.set(id, new Element(id)); return elements.get(id); };
  const presets = ['ocean', 'sunset', 'space'].map(name => { const el = element(name); el.dataset.scene = name; return el; });
  const doc = new Element('document'); doc.hidden = false; doc.getElementById = element; doc.querySelectorAll = () => presets; doc.documentElement = new Element('html');
  const win = new Element('window'); win.devicePixelRatio = 2; win.isSecureContext = false;
  const storage = new Map();
  let seed = 71821;
  const math = Object.create(Math); math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const sandbox = { document: doc, window: win, navigator: {}, localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) }, matchMedia: () => ({ matches: false, addEventListener() {} }), ResizeObserver: class { observe() {} }, requestAnimationFrame() { return 1; }, cancelAnimationFrame() {}, setTimeout, clearTimeout, performance: { now: () => 0 }, Math: math, console };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'tilt.js'), 'utf8'), sandbox);
  const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const instrumented = source.replace(/\}\)\(\);\s*$/, 'globalThis.testGame = { reset, pump, step, tilt, get bubbles() { return bubbles; }, get rings() { return rings; }, get caught() { return caught; }, posts, get scene() { return scene; } }; })();');
  vm.runInNewContext(instrumented, sandbox);
  const game = sandbox.testGame;
  const results = [];
  const test = (name, fn) => { game.tilt.stop(); game.reset(); fn(); results.push(`PASS ${name}`); };
  const place = (ring, x, y, vy) => Object.assign(ring, { x, y, vx: 0, vy });

  test('left jet drives rings and bubbles up and right, with localized force', () => {
    game.rings.forEach((r, i) => place(r, i === 0 ? 130 : 600, 360, 0));
    game.pump(0);
    assert(game.rings[0].vy < -400);
    assert(Math.abs(game.rings[0].vy) > Math.abs(game.rings[1].vy) * 3);
    assert(game.rings.every(r => r.vx > 0));
    assert(game.bubbles.every(b => b.vx > 0 && b.vy < 0));
  });
  test('right jet drives left even when rings are left of the posts', () => {
    game.rings.forEach((r, i) => place(r, i === 0 ? 510 : 200, 360, 0));
    game.pump(1);
    assert(game.rings[0].vy < -400);
    assert(game.rings.every(r => r.vx < 0));
    assert(game.bubbles.every(b => b.vx < 0 && b.vy < 0));
  });
  test('heavier rings sink faster but a single nearby pump still clears a post', () => {
    game.rings.splice(1);
    const ring = game.rings[0];
    place(ring, 60, 120, 0);
    for (let i = 0; i < 60; i++) game.step(1 / 120);
    assert(ring.vy > 85 && ring.y > 140, 'rings should sink decisively');
    place(ring, 130, 360, 0); game.pump(0);
    let peak = ring.y;
    for (let i = 0; i < 130; i++) { game.step(1 / 120); peak = Math.min(peak, ring.y); }
    assert(peak < 190, `one strong pulse must lift a ring over a post (peak: ${peak.toFixed(1)})`);
  });
  test('three distinct posts each accept descending rings', () => {
    assert.equal(game.posts.length, 3);
    assert.equal(new Set(game.posts.map(p => p.x)).size, 3);
    game.posts.forEach((post, i) => {
      place(game.rings[i], post.x, post.tip - .3, 80); game.step(1 / 120);
      assert.equal(post.rings.length, 1);
    });
    assert.equal(game.caught, 3);
  });
  test('phone gravity alone lifts and steers a ring; turning it off restores sinking', () => {
    win.isSecureContext = true; win.DeviceOrientationEvent = {}; win.orientation = 90;
    game.tilt.start();
    win.emit('deviceorientation', { beta: 0, gamma: -45 });
    game.rings.splice(1); const ring = game.rings[0];
    place(ring, 65, 340, 0);
    win.emit('deviceorientation', { beta: 18, gamma: 35 });
    for (let i = 0; i < 240; i++) game.step(1 / 120);
    assert(ring.x > 90 && ring.y < 195, `no pump should be needed to lift and steer (x: ${ring.x.toFixed(1)}, y: ${ring.y.toFixed(1)})`);
    game.tilt.stop(); place(ring, 65, 120, 0);
    for (let i = 0; i < 60; i++) game.step(1 / 120);
    assert(ring.vy > 85);
  });
  test('two simultaneous touches release independently', () => {
    const left = element('pump-left'), right = element('pump-right');
    left.emit('pointerdown', { pointerId: 11 }); right.emit('pointerdown', { pointerId: 22 });
    assert(left.classes.has('pressed') && right.classes.has('pressed'));
    left.emit('pointerup', { pointerId: 11 });
    assert(!left.classes.has('pressed') && right.classes.has('pressed'));
    right.emit('pointercancel', { pointerId: 22 });
    assert(!right.classes.has('pressed'));
  });
  test('descending through the open center catches once', () => {
    const ring = game.rings[0], post = game.posts[0];
    place(ring, post.x, post.tip - .3, 80);
    game.step(1 / 120);
    assert.equal(game.caught, 1); assert(ring.caught);
    for (let i = 0; i < 500; i++) { if (i % 25 === 0) game.pump(i % 2); game.step(1 / 120); }
    assert(ring.caught); assert.equal(post.rings.filter(r => r === ring).length, 1);
  });
  test('rising and side-brushing rings do not count', () => {
    const ring = game.rings[0], post = game.posts[0];
    place(ring, post.x, post.tip + .3, -80); game.step(1 / 120);
    assert.equal(game.caught, 0);
    place(ring, post.x + 15, post.tip - .3, 80); game.step(1 / 120);
    assert.equal(game.caught, 0);
  });
  test('changing artwork preserves progress and pauses pumping', () => {
    place(game.rings[0], game.posts[0].x, game.posts[0].tip - .3, 80); game.step(1 / 120);
    const before = game.rings[1].vy;
    element('backgrounds').emit('click'); game.pump(0);
    assert.equal(game.rings[1].vy, before);
    element('space').emit('click'); assert.equal(game.scene.name, 'space'); assert.equal(game.caught, 1);
    element('done-scenes').emit('click');
    assert(!element('scene-dialog').open);
  });
  test('all 12 catches win; reset clears score and posts', () => {
    for (let i = 0; i < 12; i++) {
      place(game.rings[i], game.posts[i % 3].x, game.posts[i % 3].tip - .3, 80); game.step(1 / 120);
    }
    for (let i = 0; i < 140; i++) game.step(1 / 120);
    assert.equal(game.caught, 12); assert.equal(element('win-message').hidden, false);
    game.reset(); assert.equal(game.caught, 0); assert(game.posts.every(p => p.rings.length === 0)); assert.equal(element('win-message').hidden, true);
  });
  test('long play remains finite and rings stay within the tank', () => {
    for (let i = 0; i < 24000; i++) { if (i % 180 === 0) game.pump(Math.floor(i / 180) % 2); game.step(1 / 120); }
    for (const ring of game.rings) {
      assert(Number.isFinite(ring.x) && Number.isFinite(ring.y));
      assert(ring.x >= 20 && ring.x <= 620 && ring.y >= 20 && ring.y <= 377);
    }
    assert(game.caught > 0, 'ordinary alternating pumps should naturally produce catches');
    results.push(`Simulation: ${game.caught}/12 rings caught with simple alternating pulses.`);
  });
  test('gravity starts by default when the browser does not require a gesture', () => {
    delete win.DeviceOrientationEvent.requestPermission;
    win.isSecureContext = true;
    storage.delete('ych-tilt-enabled');
    vm.runInNewContext(instrumented, sandbox);
    const fresh = sandbox.testGame;
    assert(fresh.tilt.enabled);
    fresh.tilt.stop();
  });
  test('iPhone default prompts for a tap without requesting permission on load', () => {
    let requests = 0;
    win.DeviceOrientationEvent = { requestPermission() { requests++; return Promise.resolve('granted'); } };
    element('tilt-dialog').open = false;
    vm.runInNewContext(instrumented, sandbox);
    assert(element('tilt-dialog').open); assert.equal(requests, 0);
    assert(!sandbox.testGame.tilt.enabled);
    element('tilt-dialog').open = false;
    storage.set('ych-tilt-enabled', 'false');
    vm.runInNewContext(instrumented, sandbox);
    assert(!element('tilt-dialog').open && !sandbox.testGame.tilt.enabled, 'an explicit off preference must be respected');
    assert.equal(requests, 0);
  });
  return results;
}

if (require.main === module) console.log(runTests().join('\n'));
module.exports = runTests;
