/* Run with `node tests/game.test.cjs`. Exercises the real game source in a small DOM harness. */
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');

function runTests() {
  const elements = new Map();
  const context2d = new Proxy({}, { get: (_, key) => key === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}, set: () => true });
  class Element {
    constructor(id) { this.id = id; this.value = ''; this.children = []; this.listeners = {}; this.open = false; this.hidden = false; this.dataset = {}; this.style = {}; this.tagName = 'BUTTON'; this.clientWidth = 560; this.clientHeight = 350; this.classes = new Set(); this.classList = { add: n => this.classes.add(n), remove: n => this.classes.delete(n), toggle: (n, value) => value ? this.classes.add(n) : this.classes.delete(n) }; }
    addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
    emit(name, values = {}) { for (const listener of this.listeners[name] || []) listener({ target: this, preventDefault() {}, pointerId: 1, pointerType: 'touch', button: 0, ...values }); }
    removeEventListener(name, fn) { this.listeners[name] = (this.listeners[name] || []).filter(listener => listener !== fn); }
    setAttribute(name, value) { this[name] = value; }
    getBoundingClientRect() { return { width: 560, height: 350, left: 0, top: 0, right: 560, bottom: 350 }; }
    getContext() { return context2d; }
    setPointerCapture() {}
    replaceChildren() { this.children = []; }
    appendChild(child) { this.children.push(child); }
    focus() {}
    showModal() { this.open = true; }
    close() { this.open = false; this.emit('close'); }
  }
  const element = id => { if (!elements.has(id)) elements.set(id, new Element(id)); return elements.get(id); };
  const presets = ['ocean', 'sunset', 'space'].map(name => { const el = element(name); el.dataset.scene = name; return el; });
  const doc = new Element('document'); doc.hidden = false; doc.getElementById = element; doc.querySelectorAll = () => presets; doc.documentElement = new Element('html');
  doc.createElement = tag => new Element(tag);
  const win = new Element('window'); win.devicePixelRatio = 2; win.isSecureContext = false;
  const storage = new Map();
  let seed = 71821, now = 0;
  const math = Object.create(Math); math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const sidewaysQuery = { matches: false, listeners: [], addEventListener(name, fn) { this.listeners.push(fn); } };
  const sandbox = { document: doc, window: win, navigator: {}, localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) }, matchMedia: query => query === '(orientation: portrait)' ? sidewaysQuery : ({ matches: false, addEventListener() {} }), ResizeObserver: class { observe() {} }, requestAnimationFrame() { return 1; }, cancelAnimationFrame() {}, setTimeout, clearTimeout, performance: { now: () => now }, Math: math, console };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'tilt.js'), 'utf8'), sandbox);
  const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const instrumented = source.replace(/\}\)\(\);\s*$/, 'globalThis.testGame = { reset, startRound, pump, step, frame, syncClock, moveFish, tilt, get fishes() { return fishes; }, get state() { return roundState; }, get elapsed() { return elapsedMs; }, get leaderboard() { return leaderboard; }, get bubbles() { return bubbles; }, get rings() { return rings; }, get caught() { return caught; }, posts, get scene() { return scene; } }; })();');
  vm.runInNewContext(instrumented, sandbox);
  const game = sandbox.testGame;
  const results = [];
  const test = (name, fn) => { game.tilt.stop(); game.reset(); element('game-mode').emit('change', { target: { value: 'classic' } }); if (element('fish-toggle')['aria-pressed'] === 'true') element('fish-toggle').emit('click'); game.startRound(); fn(); results.push(`PASS ${name}`); };
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
    for (let i = 0; i < 500; i++) game.step(1 / 120);
    assert(ring.caught); assert.equal(post.rings.filter(r => r === ring).length, 1);
  });
  test('pumps lift threaded rings and can blow them off, decrementing the score', () => {
    const ring = game.rings[0], post = game.posts[0];
    place(ring, post.x, post.tip - .3, 80); game.step(1 / 120);
    for (let i = 0; i < 400; i++) game.step(1 / 120);
    const settledY = ring.y;
    const looseRing = game.rings[1]; place(looseRing, ring.x, ring.y, 0);
    game.pump(0);
    assert(Math.abs(ring.vy) < Math.abs(looseRing.vy) * .65, 'threaded hoops should resist the same jet more than loose hoops');
    game.step(1 / 120);
    assert(ring.y < settledY, 'caught rings must respond to the jet immediately');
    for (let i = 0; i < 240; i++) game.step(1 / 120);
    assert(ring.caught, 'one pump should leave a settled, heavier hoop on its post');
    let escaped = false;
    for (let i = 0; i < 240; i++) {
      if (i % 20 === 0) game.pump(0);
      game.step(1 / 120);
      if (!ring.caught) { escaped = true; break; }
    }
    assert(escaped, 'repeated pumps must lift a hoop clear of the tip');
    assert.equal(game.caught, 0); assert.equal(post.rings.length, 0);
    place(ring, post.x, post.tip - .3, 80); game.step(1 / 120);
    assert.equal(game.caught, 1); assert.equal(post.rings.length, 1);
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
  const completeRound = () => {
    for (let i = 0; i < 12; i++) {
      const ring = game.rings[i], post = game.posts.find(p => p.color === ring.color) || game.posts[i % 3];
      place(ring, post.x, post.tip - .3, 80); game.step(1 / 120);
    }
  };
  test('all 12 catches freeze the timer and preserve the visible final scene; reset returns to setup', () => {
    now += 43210; completeRound();
    for (let i = 0; i < 140; i++) game.step(1 / 120);
    assert.equal(game.caught, 12); assert.equal(game.state, 'finished');
    assert.equal(game.elapsed, 43210); assert.equal(element('timer').textContent, '00:43.21');
    assert.equal(element('score-entry').hidden, false);
    assert(!fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').includes('win-message'));
    const velocities = game.rings.map(r => r.vy);
    game.pump(0); game.pump(1); now += 5000; game.frame(now);
    assert.equal(game.elapsed, 43210); assert.deepEqual(game.rings.map(r => r.vy), velocities);
    game.reset(); assert.equal(game.caught, 0); assert(game.posts.every(p => p.rings.length === 0)); assert.equal(game.state, 'ready'); assert.equal(game.elapsed, 0);
  });
  test('start gates pumps, gravity and timer; reset and restart clear elapsed time', () => {
    game.reset(); const before = JSON.stringify(game.rings);
    game.pump(0); game.step(1); now += 2000; game.frame(now);
    assert.equal(JSON.stringify(game.rings), before); assert.equal(game.elapsed, 0);
    element('start-game').emit('click'); now += 2350; game.frame(now);
    assert.equal(game.elapsed, 2350); assert.equal(element('timer').textContent, '00:02.35');
    assert(element('game-mode').disabled && element('fish-toggle').disabled);
    element('restart').emit('click'); assert.equal(game.elapsed, 0); assert.equal(game.state, 'ready');
  });
  test('timer counts real elapsed time despite frame caps and excludes dialogs and hidden time', () => {
    now += 1200; game.frame(now); assert.equal(game.elapsed, 1200);
    now += 300; element('backgrounds').emit('click'); assert.equal(game.elapsed, 1500);
    now += 10000; game.frame(now); element('done-scenes').emit('click'); game.frame(now);
    now += 500; game.frame(now); assert.equal(game.elapsed, 2000);
    doc.hidden = true; doc.emit('visibilitychange'); now += 20000; game.frame(now);
    doc.hidden = false; doc.emit('visibilitychange'); game.frame(now); now += 700; game.frame(now);
    assert.equal(game.elapsed, 2700);
  });
  test('play menu pauses inputs and the clock, then resumes without losing progress', () => {
    place(game.rings[0], game.posts[0].x, game.posts[0].tip - .3, 80); game.step(1 / 120);
    now += 1200; game.frame(now);
    element('play-menu').emit('click');
    assert.equal(element('play-menu')['aria-expanded'], 'true');
    assert.equal(element('timer-label').textContent, 'PAUSED');
    const positions = () => JSON.stringify(game.rings.map(({ post, ...ring }) => ring));
    const before = positions();
    now += 8000; game.pump(0); game.frame(now);
    assert.equal(positions(), before); assert.equal(game.elapsed, 1200);
    element('backgrounds').emit('click'); element('done-scenes').emit('click');
    now += 2000; game.frame(now); assert.equal(game.elapsed, 1200, 'closing a dialog keeps the menu paused');
    doc.emit('keydown', { key: 'Escape' });
    assert.equal(element('play-menu')['aria-expanded'], 'false'); assert.equal(game.caught, 1);
    game.frame(now); now += 500; game.frame(now); assert.equal(game.elapsed, 1700);
    element('play-menu').emit('click'); element('restart').emit('click');
    assert.equal(game.state, 'ready'); assert.equal(element('play-menu').hidden, true);
    assert(!element('app').classes.has('is-running'));
  });
  test('Color Match provides all four targets and rejects wrong-color catches', () => {
    game.reset(); element('game-mode').emit('change', { target: { value: 'color' } }); game.startRound();
    assert.equal(game.posts.length, 4);
    assert(game.rings.every(r => game.posts.some(p => p.color === r.color)));
    const ring = game.rings[0], wrong = game.posts[1], right = game.posts[0];
    place(ring, wrong.x, wrong.tip - .3, 80); game.step(1 / 120);
    assert.equal(game.caught, 0); assert(!ring.caught);
    place(ring, right.x, right.tip - .3, 80); game.step(1 / 120);
    assert.equal(game.caught, 1); assert.equal(ring.post, right);
    completeRound(); assert.equal(game.state, 'finished');
  });
  test('fish toggle animates exactly three background fish whose pecks change ring velocity', () => {
    assert.equal(game.fishes.length, 3);
    assert.equal(element('fish-toggle')['aria-pressed'], 'false');
    game.reset(); element('fish-toggle').emit('click'); game.startRound();
    assert.equal(game.fishes.length, 3);
    const fish = game.fishes[0], ring = game.rings[0];
    place(ring, 250, 150, 0); Object.assign(fish, { x: 231, y: 150, vx: 0, vy: 0, facing: 1, turn: 1, target: ring, chaseTime: 2.5, cooldown: 0 });
    game.moveFish(1 / 120);
    assert(ring.vx > 0 && ring.vy < 0 && fish.peck > 0); assert.equal(fish.target, null);
    game.reset(); element('fish-toggle').emit('click');
    const before = JSON.stringify(game.rings);
    for (let i = 0; i < 1200; i++) game.step(1 / 120);
    assert.equal(JSON.stringify(game.rings), before, 'returning fish cannot disturb rings after reset');
    assert(fish.blend < .001 && fish.target === null, 'fish should return and merge into the backdrop');
    assert(Math.abs(fish.x - 124) < .01 && Math.abs(fish.y - 168.8) < .01);
    game.startRound(); for (let i = 0; i < 1200; i++) game.moveFish(1 / 120);
    assert.equal(JSON.stringify(game.rings), before, 'fish off means no pecks');
  });
  test('fish cruise both ways with more sideways travel than vertical travel and stay in the water', () => {
    game.reset(); element('fish-toggle').emit('click'); game.startRound();
    const tracks = game.fishes.map(fish => {
      fish.cooldown = Infinity; // Observe ordinary swimming independently of pecking.
      return { x: fish.x, y: fish.y, horizontal: 0, vertical: 0, minX: fish.x, maxX: fish.x, minY: fish.y, maxY: fish.y, left: false, right: false };
    });
    for (let frame = 0; frame < 60 * 45; frame++) {
      game.moveFish(1 / 60);
      game.fishes.forEach((fish, i) => {
        const track = tracks[i];
        track.horizontal += Math.abs(fish.x - track.x); track.vertical += Math.abs(fish.y - track.y);
        track.left ||= fish.vx < -20; track.right ||= fish.vx > 20;
        track.minX = Math.min(track.minX, fish.x); track.maxX = Math.max(track.maxX, fish.x);
        track.minY = Math.min(track.minY, fish.y); track.maxY = Math.max(track.maxY, fish.y);
        track.x = fish.x; track.y = fish.y;
        assert(Number.isFinite(fish.x) && Number.isFinite(fish.y));
        assert(fish.x >= 25 && fish.x <= 615 && fish.y >= 35 && fish.y <= 376);
      });
    }
    for (const track of tracks) {
      assert(track.left && track.right && track.maxX - track.minX > 400, 'each fish should cross the tank and turn around');
      assert(track.maxY - track.minY > 50, 'fish should visibly rise and dive');
      assert(track.horizontal > track.vertical * 1.7, 'ordinary swimming should be mostly horizontal');
    }
    game.reset(); for (let i = 0; i < 900; i++) game.step(1 / 120);
    assert(game.fishes.every(fish => fish.blend < .001 && fish.vx === 0 && fish.vy === 0), 'fish settle into the background after cruising stops');
  });
  test('leaderboards persist named times, sort fastest first, separate all four challenges and prevent duplicate saves', () => {
    storage.delete('ych-times-v1');
    const finishAndSave = (ms, name) => {
      now += ms; completeRound(); element('player-name').value = name; element('score-entry').emit('submit');
    };
    finishAndSave(5000, 'Slow'); element('score-entry').emit('submit');
    assert.equal(game.leaderboard['classic-calm'].length, 1);
    game.reset(); game.startRound(); finishAndSave(2000, '<img onerror=oops>');
    assert.equal(game.leaderboard['classic-calm'][0].ms, 2000);
    element('leaderboard-open').emit('click');
    assert.equal(element('leaderboard-rows').children[0].children[1].textContent, '<img onerror=oops>');
    element('close-leaderboard').emit('click');
    game.reset(); element('fish-toggle').emit('click'); game.startRound(); finishAndSave(3000, 'Fish');
    game.reset(); element('game-mode').emit('change', { target: { value: 'color' } }); game.startRound(); finishAndSave(4000, 'Match fish');
    game.reset(); element('fish-toggle').emit('click'); game.startRound(); finishAndSave(1000, 'Match');
    const saved = JSON.parse(storage.get('ych-times-v1'));
    assert.deepEqual(Object.keys(saved).sort(), ['classic-calm', 'classic-fish', 'color-calm', 'color-fish']);
    assert.equal(saved['classic-fish'][0].name, 'Fish'); assert.equal(saved['color-calm'][0].name, 'Match'); assert.equal(saved['color-fish'][0].name, 'Match fish');
  });
  test('empty names cannot save and storage failures retain an honest session-only board', () => {
    now += 500; completeRound(); element('player-name').value = '   '; element('score-entry').emit('submit');
    assert(!element('save-time').disabled);
    const setItem = sandbox.localStorage.setItem;
    sandbox.localStorage.setItem = () => { throw new Error('Storage unavailable'); };
    element('player-name').value = 'Guest'; element('score-entry').emit('submit');
    assert(element('score-feedback').textContent.includes('this visit'));
    assert(game.leaderboard['classic-calm'].some(entry => entry.name === 'Guest'));
    sandbox.localStorage.setItem = setItem;
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
  test('opening upright keeps pumps active and rotating preserves catches', () => {
    sidewaysQuery.matches = true; sidewaysQuery.listeners.forEach(fn => fn());
    game.rings.forEach((r, i) => place(r, i === 0 ? 130 : 600, 360, 0));
    game.pump(0); assert(game.rings[0].vy < -400, 'upright browser must not pause gameplay');
    place(game.rings[0], game.posts[0].x, game.posts[0].tip - .3, 80); game.step(1 / 120);
    assert.equal(game.caught, 1);
    sidewaysQuery.matches = false; sidewaysQuery.listeners.forEach(fn => fn());
    assert.equal(game.caught, 1); assert(game.rings[0].caught);
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
