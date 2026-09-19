(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const W = 640, H = 400, TOTAL = 12, RADIUS = 15;
  const CAUGHT_WEIGHT = 1.25;
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const tank = $('tank');
  const sceneDialog = $('scene-dialog');
  const helpDialog = $('help-dialog');
  const installDialog = $('install-dialog');
  const tiltDialog = $('tilt-dialog');
  const leaderboardDialog = $('leaderboard-dialog');
  const sidewaysLayout = matchMedia('(orientation: portrait)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const colors = ['#f26974', '#ffdf3f', '#60c379', '#597bd4'];
  const fishHomes = [
    { x: 155, y: 211, angle: -8, facing: 1, scale: .45 },
    { x: 608, y: 187, angle: 8, facing: -1, scale: .45 },
    { x: 389, y: 325, angle: 0, facing: 1, scale: .75 }
  ];
  const posts = [];
  const tilt = new window.YCHTilt(updateTiltUI, () => sidewaysLayout.matches ? 90 : 0);
  const pumpButtons = [$('pump-left'), $('pump-right')];
  const pointers = [new Set(), new Set()];
  const keySides = new Map();
  let rings = [], bubbles = [], pulses = [], caught = 0, tick = 0;
  let fishes = [], mode = 'classic', fishEnabled = false, roundState = 'ready';
  let controlsOpen = false;
  let elapsedMs = 0, clockAnchor = null, roundResult = null;
  let leaderboard = {};
  let selectedBoard = 'classic-calm';
  const leaderboardKey = 'ych-times-v1';
  let accumulator = 0, lastTime = 0, animation = 0;
  let soundEnabled = false, audioContext = null, noiseBuffer = null;
  let tiltWanted = true, tiltPromptPending = false, closeTiltWhenReady = false;
  let photoURL = null, photoSize = { width: 800, height: 500 };
  let scene = { name: 'ocean', zoom: 1, x: 50, y: 50 };
  const sceneImages = { ocean: 'assets/ocean.svg', sunset: 'assets/sunset.svg', space: 'assets/space.svg' };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const random = (lo, hi) => lo + Math.random() * (hi - lo);
  const announce = message => { $('announcement').textContent = message; };
  const dialogOpen = () => sceneDialog.open || helpDialog.open || installDialog.open || tiltDialog.open || leaderboardDialog.open;
  const paused = () => document.hidden || controlsOpen || dialogOpen();

  function formatTime(ms) {
    const centiseconds = Math.floor(ms / 10);
    return `${String(Math.floor(centiseconds / 6000)).padStart(2, '0')}:${String(Math.floor(centiseconds / 100) % 60).padStart(2, '0')}.${String(centiseconds % 100).padStart(2, '0')}`;
  }

  const boardKey = () => `${mode}-${fishEnabled ? 'fish' : 'calm'}`;
  function syncClock(now = performance.now()) {
    if (roundState === 'running' && clockAnchor !== null) elapsedMs += Math.max(0, now - clockAnchor);
    clockAnchor = roundState === 'running' ? now : null;
    $('timer').textContent = formatTime(elapsedMs);
  }
  function pauseClock() { syncClock(); clockAnchor = null; accumulator = 0; lastTime = 0; }

  function updateRoundUI() {
    const running = roundState === 'running', finished = roundState === 'finished';
    $('app').classList.toggle('is-running', running);
    $('app').classList.toggle('controls-open', running && controlsOpen);
    $('play-menu').hidden = !running;
    $('play-menu').textContent = controlsOpen ? 'RESUME ▶' : '☰ MENU';
    $('play-menu').setAttribute('aria-expanded', String(running && controlsOpen));
    $('start-game').disabled = running;
    $('start-game').textContent = finished ? 'NEW ROUND' : running ? 'PLAYING' : 'START';
    $('game-mode').value = mode;
    $('game-mode').disabled = running;
    $('fish-toggle').disabled = running;
    $('fish-toggle').setAttribute('aria-pressed', String(fishEnabled));
    $('fish-toggle').textContent = fishEnabled ? 'FISH ON · 3' : 'FISH OFF';
    $('round-options').hidden = finished;
    $('score-entry').hidden = !finished;
    $('timer-label').textContent = finished ? 'FINISHED' : running ? controlsOpen ? 'PAUSED' : 'TIME' : 'READY';
    $('water-status').textContent = finished ? '12 / 12 · COMPLETE' : !running ? 'PRESS START' : mode === 'color' ? 'MATCH THE COLORS' : tilt.ready ? 'TILT TO STEER' : 'CATCH ALL 12';
    pumpButtons.forEach(button => { button.disabled = !running; });
  }

  function startRound() {
    if (roundState !== 'ready' || paused()) return;
    roundState = 'running';
    clockAnchor = performance.now();
    lastTime = 0;
    updateRoundUI();
    pumpButtons[0].focus({ preventScroll: true });
    announce(`${mode === 'color' ? 'Color Match' : 'Classic'} started${fishEnabled ? ' with three fish' : ''}. Catch all twelve rings. Pumps can blow caught rings off the posts.`);
  }

  function finishRound() {
    if (roundState !== 'running') return;
    syncClock();
    roundState = 'finished';
    clockAnchor = null;
    roundResult = { key: boardKey(), ms: Math.max(1, Math.floor(elapsedMs)), saved: false };
    rings.forEach(ring => { ring.vx = 0; ring.vy = 0; });
    releaseInputs();
    updateRoundUI();
    announce(`All twelve rings caught in ${formatTime(elapsedMs)}. Enter your name above the toy to save your time.`);
  }

  function updateScore() {
    $('score').innerHTML = `${String(caught).padStart(2, '0')}<span> / ${TOTAL}</span>`;
    canvas.setAttribute('aria-label', `${caught} of ${TOTAL} rings caught. ${mode === 'color' ? 'Match each ring to its same-colored post: red, yellow, green, blue.' : 'Catch rings on any of the three pink posts.'}${fishEnabled ? ' Three fish occasionally peck the rings.' : ''}`);
  }

  function reset() {
    caught = 0;
    roundState = 'ready'; controlsOpen = false; elapsedMs = 0; clockAnchor = null; roundResult = null;
    accumulator = 0; lastTime = 0;
    posts.splice(0, posts.length, ...(mode === 'color' ? [140, 260, 380, 500] : [190, 320, 450]).map((x, i) => ({ x, tip: 195, rings: [], color: mode === 'color' ? colors[i] : null })));
    rings = Array.from({ length: TOTAL }, (_, i) => ({
      x: 55 + i * 48 + random(-9, 9),
      y: H - RADIUS - 10 - random(0, 35),
      vx: random(-18, 18), vy: random(-15, 0),
      angle: random(0, Math.PI * 2), spin: random(-1, 1),
      tilt: random(0, Math.PI), color: colors[i % colors.length],
      caught: false, post: null, slot: 0, age: 0
    }));
    bubbles = [];
    pulses = [];
    if (!fishes.length) fishes = fishHomes.map((home, i) => ({ ...fishHome(i), vx: 0, vy: 0, facing: home.facing, turn: 1, phase: i * 2, swimTime: 0, peck: 0, blend: 0 }));
    fishes.forEach((fish, i) => {
      fish.target = null; fish.cooldown = 3 + i * 1.2; fish.peck = 0; fish.chaseTime = 0;
      fish.swimDirection = fishHomes[i].facing;
      fish.cruiseY = clamp(fishHome(i).y, 75, H - 65); fish.laneTime = 2 + i * 1.5;
    });
    $('timer').textContent = formatTime(0);
    $('save-time').disabled = false;
    $('save-time').textContent = 'SAVE';
    $('score-feedback').textContent = '';
    updateRoundUI();
    updateScore();
    releaseInputs();
    announce('Choose a mode and optional fish, then press Start.');
    draw();
  }

  function makeAudio() {
    if (!soundEnabled) return null;
    try {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return null;
      if (!audioContext) audioContext = new AudioCtor();
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
      return audioContext;
    } catch { return null; }
  }

  function playPumpSound() {
    const audio = makeAudio();
    if (!audio) return;
    const t = audio.currentTime;
    if (!noiseBuffer) {
      noiseBuffer = audio.createBuffer(1, Math.floor(audio.sampleRate * .16), audio.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const source = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const gain = audio.createGain();
    source.buffer = noiseBuffer;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(950, t);
    filter.frequency.exponentialRampToValueAtTime(180, t + .15);
    gain.gain.setValueAtTime(.12, t);
    gain.gain.exponentialRampToValueAtTime(.001, t + .16);
    source.connect(filter).connect(gain).connect(audio.destination);
    source.start(t); source.stop(t + .16);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    const pop = audio.createOscillator(), popGain = audio.createGain();
    pop.frequency.setValueAtTime(240, t);
    pop.frequency.exponentialRampToValueAtTime(65, t + .07);
    popGain.gain.setValueAtTime(.11, t);
    popGain.gain.exponentialRampToValueAtTime(.001, t + .075);
    pop.connect(popGain).connect(audio.destination);
    pop.start(t); pop.stop(t + .08);
    pop.onended = () => { pop.disconnect(); popGain.disconnect(); };
  }

  function playCatchSound() {
    const audio = makeAudio();
    if (!audio) return;
    [660, 880].forEach((frequency, i) => {
      const t = audio.currentTime + i * .08;
      const oscillator = audio.createOscillator(), gain = audio.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, t);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(.055, t + .008);
      gain.gain.exponentialRampToValueAtTime(.001, t + .19);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(t); oscillator.stop(t + .2);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    });
  }

  function pump(side) {
    if (paused() || roundState !== 'running') return;
    const sourceX = side === 0 ? 130 : 510;
    const direction = side === 0 ? 1 : -1;
    for (const ring of rings) {
      const dx = Math.abs(ring.x - sourceX);
      const proximity = Math.exp(-(dx * dx) / (2 * 165 * 165));
      const height = .55 + .45 * (ring.y / H);
      const force = proximity * height * (ring.caught ? .72 / CAUGHT_WEIGHT : 1);
      ring.vy = Math.max(-550, ring.vy - (480 + random(-18, 18)) * force);
      // Each jet drives across the tank, regardless of the nearest post.
      ring.vx = clamp(ring.vx + direction * (220 + random(-15, 15)) * force, -380, 380);
      ring.spin += random(-2.5, 2.5) * force;
    }
    pulses.push({ x: sourceX, direction, age: 0 });
    for (let i = 0; i < (reducedMotion.matches ? 5 : 18); i++) {
      bubbles.push({ x: sourceX + random(-20, 20), y: H - 12 + random(-8, 8), vx: direction * random(45, 90), vy: random(-175, -85), r: random(1.5, 5), age: 0, life: random(.7, 1.8) });
    }
    if (bubbles.length > 180) bubbles.splice(0, bubbles.length - 180);
    if (pulses.length > 20) pulses.shift();
    playPumpSound();
  }

  function catchRing(ring, post) {
    if (ring.caught || (mode === 'color' && ring.color !== post.color)) return;
    ring.caught = true;
    ring.post = post;
    ring.slot = post.rings.length;
    ring.age = 0;
    ring.vx *= .15;
    ring.vy = Math.max(30, ring.vy * .4);
    post.rings.push(ring);
    caught++;
    updateScore();
    playCatchSound();
    announce(caught === TOTAL ? 'All twelve rings aboard! You caught them all.' : `${caught} of twelve rings caught.`);
  }

  function releaseRing(ring) {
    const post = ring.post;
    post.rings.splice(post.rings.indexOf(ring), 1);
    post.rings.forEach((other, slot) => { other.slot = slot; });
    ring.caught = false; ring.post = null; ring.age = 0;
    ring.vx = clamp(ring.vx, -180, 180);
    ring.spin += random(-2, 2);
    caught--;
    updateScore();
    announce(`A ring slipped off! ${caught} of twelve rings caught.`);
  }

  function fishSpace() {
    const width = tank.clientWidth || W, height = tank.clientHeight || H;
    const scale = Math.max(width / 800, height / 500);
    return { sx: width / W / scale, sy: height / H / scale, offsetX: (800 - width / scale) / 2, offsetY: (500 - height / scale) / 2 };
  }

  function fishHome(index) {
    const space = fishSpace(), home = fishHomes[index];
    return { x: (home.x - space.offsetX) / space.sx, y: (home.y - space.offsetY) / space.sy };
  }

  function moveFish(dt) {
    const swimming = fishEnabled && roundState === 'running';
    fishes.forEach((fish, index) => {
      const home = fishHome(index);
      fish.swimTime += dt;
      fish.peck = Math.max(0, fish.peck - dt);
      let desiredX = 0, desiredY = 0;
      if (swimming) {
        fish.cooldown -= dt;
        fish.laneTime -= dt;
        if (fish.laneTime <= 0) {
          fish.cruiseY = random(65, H - 55);
          fish.laneTime = random(4, 7);
        }
        if (fish.x < 55) fish.swimDirection = 1;
        if (fish.x > W - 55) fish.swimDirection = -1;
        if (fish.target) {
          fish.chaseTime -= dt;
          if (fish.chaseTime <= 0) { fish.target = null; fish.cooldown = random(3, 5); }
        }
        if (fish.cooldown <= 0 && !fish.target) {
          // Investigate a nearby hoop, then go back to cruising across the tank.
          fish.target = rings.reduce((nearest, ring) => Math.hypot(ring.x - fish.x, ring.y - fish.y) < Math.hypot(nearest.x - fish.x, nearest.y - fish.y) ? ring : nearest, rings[0]);
          if (fish.target && Math.hypot(fish.target.x - fish.x, fish.target.y - fish.y) < 165) fish.chaseTime = 2.5;
          else { fish.target = null; fish.cooldown = random(.8, 1.6); }
        }
        if (fish.target) {
          const approach = Math.abs(fish.target.x - fish.x) > 25 ? Math.sign(fish.target.x - fish.x) : fish.facing;
          desiredX = clamp((fish.target.x - approach * 19 - fish.x) * 3, -95, 95);
          desiredY = clamp((fish.target.y - fish.y) * 3, -65, 65);
        } else {
          // Long sideways passes with independently changing depths and a small undulation.
          desiredX = fish.swimDirection * (49 + index * 6 + Math.sin(fish.swimTime * 1.3 + fish.phase) * 7);
          desiredY = clamp((fish.cruiseY - fish.y) * .65 + Math.sin(fish.swimTime * 1.8 + fish.phase) * 10, -24, 24);
        }
      } else {
        fish.target = null;
        desiredX = clamp((home.x - fish.x) * 2.5, -115, 115);
        desiredY = clamp((home.y - fish.y) * 2.5, -85, 85);
      }
      // Steering has inertia, so turns and dives trace curves instead of straight darts.
      const steering = 1 - Math.exp(-3.5 * dt);
      fish.vx += (desiredX - fish.vx) * steering;
      fish.vy += (desiredY - fish.vy) * steering;
      fish.x += fish.vx * dt; fish.y += fish.vy * dt;
      if (swimming) {
        if (fish.x < 25) { fish.x = 25; fish.vx = Math.max(0, fish.vx); fish.swimDirection = 1; }
        if (fish.x > W - 25) { fish.x = W - 25; fish.vx = Math.min(0, fish.vx); fish.swimDirection = -1; }
        fish.y = clamp(fish.y, 35, H - 24);
      }
      if (Math.abs(fish.vx) > 5) fish.facing = Math.sign(fish.vx);
      const atHome = !swimming && Math.hypot(fish.x - home.x, fish.y - home.y) < .3 && Math.hypot(fish.vx, fish.vy) < 1;
      if (atHome) { fish.x = home.x; fish.y = home.y; fish.vx = fish.vy = 0; fish.facing = fishHomes[index].facing; }
      fish.blend += ((atHome ? 0 : 1) - fish.blend) * (1 - Math.exp(-8 * dt));
      fish.turn += (fish.facing / fishHomes[index].facing - fish.turn) * (1 - Math.exp(-9 * dt));
      if (fish.target && Math.abs(fish.turn) > .7 && Math.hypot(fish.target.x - (fish.x + fish.facing * 19), fish.target.y - fish.y) < 9) {
        const ring = fish.target;
        const weight = ring.caught ? CAUGHT_WEIGHT : 1;
        ring.vx = clamp(ring.vx + fish.facing * random(42, 65) / weight, -380, 380);
        ring.vy = Math.max(-550, ring.vy - random(65, 95) / weight);
        ring.spin += fish.facing * 1.8 / weight;
        fish.peck = .25;
        fish.target = null;
        fish.cooldown = random(4, 7);
        fish.swimDirection = fish.facing;
      }
    });
  }

  function step(dt) {
    tick += dt;
    moveFish(dt);
    if (roundState === 'ready') return;
    const gravity = tilt.sample(dt);
    for (const ring of rings) {
      if (ring.caught) {
        ring.age += dt;
        const targetY = H - 39 - ring.slot * 10;
        if (roundState === 'finished') {
          ring.x += (ring.post.x - ring.x) * (1 - Math.exp(-10 * dt));
          ring.y += (targetY - ring.y) * (1 - Math.exp(-5 * dt));
        } else {
          ring.vy = (ring.vy + gravity.y * dt) * Math.exp(-1.4 * dt);
          ring.y += ring.vy * dt;
          ring.vx *= Math.exp(-2 * dt);
          ring.x = ring.post.x + clamp(ring.vx * .025, -4, 4);
          if (ring.y >= targetY) { ring.y = targetY; ring.vy = Math.min(0, ring.vy); }
          // The ring stays threaded until a jet lifts its center above the tip.
          if (ring.y < ring.post.tip - 3 && ring.vy < 0) releaseRing(ring);
        }
        ring.angle *= Math.exp(-9 * dt);
        continue;
      }
      const previousY = ring.y;
      ring.vx += (gravity.x + Math.sin(tick * 1.4 + ring.y * .025) * 4) * dt;
      ring.vx *= Math.exp(-1.13 * dt);
      ring.vy += gravity.y * dt;
      ring.vy *= Math.exp(-1.12 * dt);
      ring.spin *= Math.exp(-1.4 * dt);
      ring.angle += ring.spin * dt;
      ring.tilt += (.65 + Math.abs(ring.vy) * .003) * dt;
      ring.x += ring.vx * dt;
      ring.y += ring.vy * dt;
      if (ring.x < RADIUS + 6) { ring.x = RADIUS + 6; ring.vx = Math.abs(ring.vx) * .45; }
      if (ring.x > W - RADIUS - 6) { ring.x = W - RADIUS - 6; ring.vx = -Math.abs(ring.vx) * .45; }
      if (ring.y < RADIUS + 7) { ring.y = RADIUS + 7; ring.vy = Math.abs(ring.vy) * .25; }
      if (ring.y > H - RADIUS - 9) {
        ring.y = H - RADIUS - 9;
        ring.vy = ring.vy > 24 ? -ring.vy * .12 : 0;
        ring.vx *= Math.exp(-5 * dt);
        ring.spin *= Math.exp(-5 * dt);
      }
      for (const post of posts) {
        // Crossing the tip while descending threads the open center of a hoop.
        // The tolerance is smaller than its hole; a side brush never counts.
        if (ring.vy > 0 && previousY <= post.tip && ring.y >= post.tip && Math.abs(ring.x - post.x) < 9.5 && Math.abs(ring.vx) < 110) {
          if (mode !== 'color' || ring.color === post.color) {
            catchRing(ring, post);
            break;
          }
          // The wrong target deflects the hoop without adding to the score.
          ring.x = post.x + (ring.vx < 0 ? -1 : 1) * (RADIUS + 4);
          ring.vx = (ring.vx < 0 ? -1 : 1) * 45;
        }
        // A rising ring or a missed descending ring can glance off the stem.
        if (ring.y > post.tip + RADIUS && ring.y < H - 27 && Math.abs(ring.x - post.x) < RADIUS + 3) {
          const direction = ring.x >= post.x ? 1 : -1;
          ring.x = post.x + direction * (RADIUS + 3);
          ring.vx = direction * Math.max(12, Math.abs(ring.vx) * .4);
        }
      }
    }
    // Soft hoop contacts keep the handful loose instead of a rigid pile of discs.
    for (let i = 0; i < rings.length; i++) {
      const a = rings[i];
      if (a.caught) continue;
      for (let j = i + 1; j < rings.length; j++) {
        const b = rings[j];
        if (b.caught) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const distance = Math.hypot(dx, dy), spacing = RADIUS * 1.65;
        if (distance > 0 && distance < spacing) {
          const nx = dx / distance, ny = dy / distance;
          const overlap = (spacing - distance) * .4;
          a.x -= nx * overlap; a.y -= ny * overlap;
          b.x += nx * overlap; b.y += ny * overlap;
          const closing = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (closing < 0) {
            const impulse = -closing * .54;
            a.vx -= nx * impulse; a.vy -= ny * impulse;
            b.vx += nx * impulse; b.vy += ny * impulse;
          }
        }
      }
      a.x = clamp(a.x, RADIUS + 6, W - RADIUS - 6);
      a.y = clamp(a.y, RADIUS + 7, H - RADIUS - 9);
    }
    for (const bubble of bubbles) {
      bubble.age += dt;
      bubble.x += (bubble.vx + Math.sin(bubble.age * 6) * 10) * dt;
      bubble.y += bubble.vy * dt;
    }
    bubbles = bubbles.filter(b => b.age < b.life && b.y > 0);
    pulses.forEach(p => { p.age += dt; });
    pulses = pulses.filter(p => p.age < .5);
    if (caught === TOTAL) finishRound();
  }

  function ellipse(x, y, rx, ry, fill) {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = fill; ctx.fill();
  }

  function drawRing(ring) {
    const settling = ring.caught ? Math.min(1, ring.age * 3) : 0;
    const height = ring.caught ? 1 - settling * .65 : .64 + .36 * Math.abs(Math.cos(ring.tilt));
    ctx.save();
    ctx.translate(ring.x, ring.y);
    ctx.rotate(ring.angle);
    ctx.scale(1, height);
    ctx.lineWidth = 6.5;
    ctx.strokeStyle = '#163e6355';
    ctx.beginPath(); ctx.ellipse(1.1, 2, RADIUS - 2, RADIUS - 2, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = ring.color;
    ctx.beginPath(); ctx.arc(0, 0, RADIUS - 2, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#ffffff90';
    ctx.beginPath(); ctx.arc(-.5, -.8, RADIUS - 2.5, Math.PI * 1.03, Math.PI * 1.78); ctx.stroke();
    ctx.strokeStyle = '#24435135';
    ctx.beginPath(); ctx.arc(.4, 1, RADIUS - 2, .1, 2.8); ctx.stroke();
    ctx.restore();
  }

  function renderFishArt() {
    $('fish-art').style.display = scene.name === 'ocean' || fishEnabled ? '' : 'none';
    const space = fishSpace();
    fishes.forEach((fish, index) => {
      const home = fishHomes[index];
      const x = fish.x * space.sx + space.offsetX, y = fish.y * space.sy + space.offsetY;
      const scale = home.scale * (1 - fish.blend * .22);
      const stroke = Math.sin(fish.swimTime * 10 + fish.phase);
      const pitch = clamp(Math.atan2(fish.vy, Math.max(25, Math.abs(fish.vx))) * 180 / Math.PI, -24, 24) * fish.facing;
      const angle = home.angle * (1 - fish.blend) + (pitch + stroke * 1.5) * fish.blend;
      const peck = fish.peck > 0 ? Math.sin(fish.peck / .25 * Math.PI) * 4 * fish.facing : 0;
      $('fish-art-' + index).setAttribute('transform', `translate(${x + peck} ${y}) rotate(${angle}) scale(${scale * fish.turn} ${scale})`);
      const tailBase = [-42, 53, -18][index];
      $('fish-tail-' + index).setAttribute('transform', `translate(${tailBase} 0) rotate(${stroke * 12 * fish.blend}) scale(${1 - Math.abs(stroke) * .14 * fish.blend} 1) translate(${-tailBase} 0)`);
    });
  }

  function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    renderFishArt();
    for (const x of [130, 510]) {
      ellipse(x, H - 12, 19, 5, '#25778b42');
      ellipse(x, H - 14, 12, 3, '#07567560');
    }
    for (const post of posts) {
      ellipse(post.x, H - 23, 34, 9, '#395a6140');
      ellipse(post.x, H - 28, 27, 9, post.color || '#da5784');
      ellipse(post.x, H - 30, 24, 7, post.color || '#f28bad');
      const gradient = ctx.createLinearGradient(post.x - 5, 0, post.x + 5, 0);
      gradient.addColorStop(0, post.color || '#c54274'); gradient.addColorStop(.4, post.color ? '#ffffff' : '#ffbbd0'); gradient.addColorStop(.65, post.color || '#f88aad'); gradient.addColorStop(1, post.color || '#be3b70');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(post.x - 5, H - 32); ctx.lineTo(post.x - 3.3, post.tip + 3);
      ctx.quadraticCurveTo(post.x, post.tip - 3, post.x + 3.3, post.tip + 3);
      ctx.lineTo(post.x + 5, H - 32); ctx.closePath(); ctx.fill();
      if (post.color) ellipse(post.x, post.tip + 4, 7, 6, post.color);
    }
    for (const ring of rings.filter(r => r.caught)) drawRing(ring);
    for (const ring of rings.filter(r => !r.caught).sort((a, b) => a.y - b.y)) drawRing(ring);
    for (const pulse of pulses) {
      ctx.strokeStyle = `rgba(207,255,255,${(.5 - pulse.age) * .35})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(pulse.x + pulse.direction * pulse.age * 90, H - 16 - pulse.age * 110, 14 + pulse.age * 65, 5 + pulse.age * 10, 0, 0, Math.PI * 2); ctx.stroke();
    }
    for (const bubble of bubbles) {
      const alpha = Math.min(.65, (bubble.life - bubble.age) * 1.5);
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(240,255,255,${alpha})`;
      ctx.fillStyle = `rgba(215,253,255,${alpha * .17})`;
      ctx.beginPath(); ctx.arc(bubble.x, bubble.y, bubble.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ellipse(bubble.x - bubble.r * .3, bubble.y - bubble.r * .35, bubble.r * .2, bubble.r * .2, `rgba(255,255,255,${alpha})`);
    }
  }

  function frame(time) {
    const elapsed = lastTime ? Math.min((time - lastTime) / 1000, .06) : 0;
    lastTime = time;
    if (!paused()) {
      if (roundState === 'running') syncClock(time);
      accumulator += elapsed;
      while (accumulator >= 1 / 120) { step(1 / 120); accumulator -= 1 / 120; }
      draw();
    } else { accumulator = 0; clockAnchor = null; }
    animation = requestAnimationFrame(frame);
  }

  function resize() {
    // client dimensions are local to the toy, before its portrait rotation.
    const width = tank.clientWidth, height = tank.clientHeight;
    if (!width || !height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    renderScene();
    draw();
  }

  function setPressed(side) {
    pumpButtons[side].classList.toggle('pressed', pointers[side].size > 0 || [...keySides.values()].includes(side));
  }

  function releaseInputs() {
    pointers.forEach(p => p.clear());
    keySides.clear();
    pumpButtons.forEach(b => b.classList.remove('pressed'));
  }

  pumpButtons.forEach((button, side) => {
    button.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      if (paused() || roundState !== 'running') return;
      button.setPointerCapture(event.pointerId);
      pointers[side].add(event.pointerId);
      setPressed(side);
      pump(side);
    });
    const release = event => { pointers[side].delete(event.pointerId); setPressed(side); };
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
    button.addEventListener('click', event => {
      // Native keyboard and assistive-technology activation has no pointer click count.
      if (event.detail === 0) {
        pump(side); button.classList.add('pressed');
        setTimeout(() => setPressed(side), 110);
      }
    });
    button.addEventListener('contextmenu', event => event.preventDefault());
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && controlsOpen && !dialogOpen()) {
      event.preventDefault(); togglePlayMenu(); return;
    }
    if (event.altKey || event.metaKey || event.ctrlKey || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable || paused() || roundState !== 'running') return;
    const sides = { a: 0, ArrowLeft: 0, d: 1, ArrowRight: 1 };
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (!(key in sides)) return;
    event.preventDefault();
    if (event.repeat || keySides.has(key)) return;
    keySides.set(key, sides[key]); setPressed(sides[key]); pump(sides[key]);
  });
  document.addEventListener('keyup', event => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const side = keySides.get(key);
    if (side === undefined) return;
    keySides.delete(key); setPressed(side);
  });
  window.addEventListener('blur', releaseInputs);
  document.addEventListener('visibilitychange', () => { pauseClock(); releaseInputs(); if (!document.hidden) tilt.refresh(); });
  sidewaysLayout.addEventListener('change', () => { releaseInputs(); lastTime = 0; tilt.refresh(); resize(); });

  // Repeated touches and long presses should operate the toy, not select its labels.
  const editingText = target => /^(INPUT|TEXTAREA)$/.test(target.tagName) || target.isContentEditable;
  ['selectstart', 'dragstart', 'contextmenu'].forEach(type => document.addEventListener(type, event => {
    if (!editingText(event.target)) event.preventDefault();
  }));
  // Safari gesture events cover devices that ignore the viewport zoom limits.
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(type => document.addEventListener(type, event => event.preventDefault(), { passive: false }));
  document.addEventListener('wheel', event => { if (event.ctrlKey) event.preventDefault(); }, { passive: false });
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && ['+', '=', '-', '0'].includes(event.key)) event.preventDefault();
  });

  function togglePlayMenu() {
    if (roundState !== 'running' || dialogOpen()) return;
    pauseClock(); releaseInputs();
    controlsOpen = !controlsOpen;
    updateRoundUI();
    announce(controlsOpen ? 'Paused. Game controls are open. Choose Resume to keep playing.' : 'Resumed.');
  }
  $('play-menu').addEventListener('click', togglePlayMenu);

  $('restart').addEventListener('click', reset);
  $('start-game').addEventListener('click', () => roundState === 'finished' ? reset() : startRound());
  $('game-mode').addEventListener('change', event => {
    if (roundState === 'running') return;
    mode = event.target.value === 'color' ? 'color' : 'classic';
    reset();
  });
  $('fish-toggle').addEventListener('click', () => {
    if (roundState === 'running') return;
    fishEnabled = !fishEnabled;
    reset();
  });

  function validBoards(value) {
    const cleaned = {};
    for (const key of ['classic-calm', 'classic-fish', 'color-calm', 'color-fish']) {
      cleaned[key] = (Array.isArray(value?.[key]) ? value[key] : [])
        .filter(entry => entry && typeof entry.name === 'string' && entry.name.trim() && Number.isFinite(entry.ms) && entry.ms > 0)
        .map(entry => ({ name: entry.name.trim().slice(0, 20), ms: entry.ms }))
        .sort((a, b) => a.ms - b.ms).slice(0, 10);
    }
    return cleaned;
  }

  function renderLeaderboard() {
    const colorBoard = selectedBoard.startsWith('color-'), fishBoard = selectedBoard.endsWith('-fish');
    $('leaderboard-mode').dataset.challenge = selectedBoard;
    $('board-classic').setAttribute('aria-pressed', String(!colorBoard));
    $('board-color').setAttribute('aria-pressed', String(colorBoard));
    $('board-fish').setAttribute('aria-pressed', String(fishBoard));
    $('board-fish-text').textContent = fishBoard ? 'FISH ON · 3' : 'FISH OFF';
    const entries = leaderboard[selectedBoard] || [];
    const body = $('leaderboard-rows');
    body.replaceChildren();
    entries.forEach((entry, index) => {
      const row = document.createElement('tr');
      for (const value of [String(index + 1).padStart(2, '0'), entry.name, formatTime(entry.ms)]) {
        const cell = document.createElement('td'); cell.textContent = value; row.appendChild(cell);
      }
      body.appendChild(row);
    });
    $('leaderboard-empty').hidden = entries.length > 0;
  }
  $('leaderboard-open').addEventListener('click', () => {
    selectedBoard = boardKey(); renderLeaderboard(); openDialog(leaderboardDialog);
  });
  [['board-classic', 'classic'], ['board-color', 'color']].forEach(([id, boardMode]) => {
    $(id).addEventListener('click', () => {
      selectedBoard = `${boardMode}-${selectedBoard.endsWith('-fish') ? 'fish' : 'calm'}`;
      renderLeaderboard();
    });
  });
  $('board-fish').addEventListener('click', () => {
    selectedBoard = `${selectedBoard.startsWith('color-') ? 'color' : 'classic'}-${selectedBoard.endsWith('-fish') ? 'calm' : 'fish'}`;
    renderLeaderboard();
  });
  $('close-leaderboard').addEventListener('click', () => leaderboardDialog.close());
  $('score-entry').addEventListener('submit', event => {
    event.preventDefault();
    const name = $('player-name').value.trim().slice(0, 20);
    if (!roundResult || roundResult.saved) return;
    if (!name) { $('score-feedback').textContent = 'Enter your name first.'; $('player-name').focus(); return; }
    // Merge any scores saved in another tab before adding this finished round.
    try { leaderboard = validBoards(JSON.parse(localStorage.getItem(leaderboardKey)) || leaderboard); } catch { /* Keep in-memory scores. */ }
    const entries = leaderboard[roundResult.key] || [];
    const entry = { name, ms: roundResult.ms };
    entries.push(entry);
    entries.sort((a, b) => a.ms - b.ms);
    const rank = entries.indexOf(entry) + 1;
    leaderboard[roundResult.key] = entries.slice(0, 10);
    let persisted = true;
    try { localStorage.setItem(leaderboardKey, JSON.stringify(leaderboard)); } catch { persisted = false; }
    roundResult.saved = true;
    $('save-time').disabled = true;
    $('save-time').textContent = 'SAVED';
    const message = rank > 10 ? 'Outside the fastest 10. Try another round!' : !persisted ? 'Saved for this visit; device storage is unavailable.' : `Saved · #${rank} on this device.`;
    $('score-feedback').textContent = message;
    announce(message);
  });
  $('sound').addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    $('sound').setAttribute('aria-pressed', String(soundEnabled));
    $('sound').setAttribute('aria-label', `Turn sound ${soundEnabled ? 'off' : 'on'}`);
    $('sound-label').textContent = `SOUND ${soundEnabled ? 'ON' : 'OFF'}`;
    if (soundEnabled) playPumpSound();
    try { localStorage.setItem('aqua-sound', String(soundEnabled)); } catch { /* Storage is optional. */ }
  });

  function openDialog(dialog) { pauseClock(); releaseInputs(); dialog.showModal(); renderScene(); }
  $('backgrounds').addEventListener('click', () => openDialog(sceneDialog));
  $('close-scenes').addEventListener('click', () => sceneDialog.close());
  $('done-scenes').addEventListener('click', () => sceneDialog.close());
  $('how-to').addEventListener('click', () => openDialog(helpDialog));
  $('close-help').addEventListener('click', () => helpDialog.close());
  $('got-it').addEventListener('click', () => helpDialog.close());
  $('close-install').addEventListener('click', () => installDialog.close());
  $('got-install').addEventListener('click', () => installDialog.close());

  function updateTiltUI() {
    $('tilt-control').setAttribute('aria-pressed', String(tilt.ready));
    $('tilt-label').textContent = tilt.ready ? 'TILT ON' : tilt.enabled ? 'TILT WAIT' : tiltPromptPending ? 'ENABLE TILT' : 'TILT OFF';
    updateRoundUI();
    $('enable-tilt').hidden = tilt.enabled;
    $('enable-tilt').disabled = tilt.requesting;
    $('enable-tilt').textContent = tilt.requesting ? 'Waiting for permission…' : 'Enable phone tilt →';
    $('disable-tilt').hidden = !tilt.enabled && !tilt.requesting;
    $('tilt-status').textContent = tilt.error || (tilt.ready ? 'Ready! Rings follow real gravity toward the lower edge. No calibration needed.' : tilt.enabled ? 'Waiting for your phone’s motion sensor…' : tilt.requesting ? 'Allow Motion & Orientation Access if your phone asks.' : 'Hold your phone sideways and enable tilt. No calibration needed.');
    $('tilt-status').classList.toggle('motion-error', Boolean(tilt.error));
    updateScore();
    if (tilt.ready && closeTiltWhenReady) {
      closeTiltWhenReady = false;
      tiltDialog.close();
      announce('Gravity mode is on. Lower an edge to guide rings that way.');
    }
  }
  function rememberTilt(enabled) {
    tiltWanted = enabled;
    try { localStorage.setItem('ych-tilt-enabled', String(enabled)); } catch { /* Preference is optional. */ }
  }
  function showDefaultTiltPrompt() {
    if (!tiltPromptPending || paused()) return;
    tiltPromptPending = false;
    updateTiltUI();
    openDialog(tiltDialog);
  }
  $('tilt-control').addEventListener('click', () => { updateTiltUI(); openDialog(tiltDialog); });
  $('enable-tilt').addEventListener('click', () => { rememberTilt(true); closeTiltWhenReady = true; tilt.start(); });
  $('disable-tilt').addEventListener('click', () => { rememberTilt(false); closeTiltWhenReady = false; tilt.stop(); });
  $('close-tilt').addEventListener('click', () => tiltDialog.close());
  $('done-tilt').addEventListener('click', () => tiltDialog.close());
  tiltDialog.addEventListener('close', () => { closeTiltWhenReady = false; if (tilt.requesting) tilt.stop(); });
  updateTiltUI();

  const standaloneMode = matchMedia('(display-mode: standalone)');
  const fullscreenMode = matchMedia('(display-mode: fullscreen)');
  function updateScreenMode() {
    const installed = navigator.standalone === true || standaloneMode.matches;
    const fullscreen = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    const root = document.documentElement;
    const supported = Boolean(root.requestFullscreen || root.webkitRequestFullscreen) &&
      (document.fullscreenEnabled ?? document.webkitFullscreenEnabled) !== false;
    $('fullscreen').hidden = installed || (fullscreenMode.matches && !fullscreen);
    $('fullscreen-label').textContent = fullscreen ? 'EXIT SCREEN' : supported ? 'FULL SCREEN' : 'MORE SCREEN';
    $('fullscreen').setAttribute('aria-label', fullscreen ? 'Exit full screen' : supported ? 'Full screen or browser display options' : 'More screen space without installing');
  }
  $('fullscreen').addEventListener('click', async () => {
    const root = document.documentElement;
    const fullscreen = document.fullscreenElement || document.webkitFullscreenElement;
    const request = root.requestFullscreen || root.webkitRequestFullscreen;
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    const enabled = document.fullscreenEnabled ?? document.webkitFullscreenEnabled;
    releaseInputs();
    try {
      if (fullscreen && exit) await exit.call(document);
      else if (request && enabled !== false) await request.call(root);
      else openDialog(installDialog);
    } catch {
      // Unsupported or denied fullscreen: offer manual Safari toolbar hiding first.
      openDialog(installDialog);
    }
    updateScreenMode();
  });
  document.addEventListener('fullscreenchange', updateScreenMode);
  document.addEventListener('webkitfullscreenchange', updateScreenMode);
  standaloneMode.addEventListener('change', updateScreenMode);
  fullscreenMode.addEventListener('change', updateScreenMode);
  updateScreenMode();

  [sceneDialog, helpDialog, installDialog, tiltDialog, leaderboardDialog].forEach(dialog => {
    let downOutside = false;
    const outside = event => {
      const rect = dialog.getBoundingClientRect();
      return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    };
    dialog.addEventListener('pointerdown', event => { downOutside = outside(event); });
    dialog.addEventListener('pointerup', event => { if (downOutside && outside(event)) dialog.close(); downOutside = false; });
    dialog.addEventListener('close', () => { lastTime = 0; persistScene(); showDefaultTiltPrompt(); });
  });

  function sceneDimensions(element) {
    const width = element.clientWidth, height = element.clientHeight;
    const ratio = Math.max(width / photoSize.width, height / photoSize.height) * scene.zoom;
    return { width: photoSize.width * ratio, height: photoSize.height * ratio, viewportW: width, viewportH: height };
  }

  function renderScene() {
    const isPhoto = scene.name === 'photo' && photoURL;
    const source = isPhoto ? photoURL : sceneImages[scene.name] || sceneImages.ocean;
    for (const element of [$('tank-art'), $('scene-preview')]) {
      element.style.backgroundImage = `url("${element === $('tank-art') && scene.name === 'ocean' ? 'assets/ocean-water.svg' : source}")`;
      if (isPhoto) {
        const size = sceneDimensions(element);
        element.style.backgroundSize = `${size.width}px ${size.height}px`;
        element.style.backgroundPosition = `${scene.x}% ${scene.y}%`;
      } else {
        element.style.backgroundSize = 'cover';
        element.style.backgroundPosition = '50% 50%';
      }
    }
    document.querySelectorAll('.preset').forEach(button => {
      const selected = button.dataset.scene === scene.name;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    $('photo-controls').hidden = !isPhoto;
    $('scene-preview').classList.toggle('photo-active', Boolean(isPhoto));
    $('preview-caption').textContent = isPhoto ? 'Drag your photo to find its happy place.' : 'The same little toy. A different little world.';
    $('zoom').value = scene.zoom;
    $('zoom-value').textContent = `${scene.zoom.toFixed(1)}×`;
    $('position-x').value = scene.x;
    $('position-y').value = scene.y;
    renderFishArt();
  }

  function persistScene() {
    try {
      localStorage.setItem('aqua-scene', JSON.stringify({ ...scene, photoURL, photoSize }));
    } catch {
      $('upload-error').hidden = false;
      $('upload-error').textContent = 'Your background works for this visit, but this browser could not save it for next time.';
    }
  }

  document.querySelectorAll('.preset').forEach(button => button.addEventListener('click', () => {
    scene = { name: button.dataset.scene, zoom: 1, x: 50, y: 50 };
    $('upload-error').hidden = true;
    renderScene(); persistScene();
  }));
  [['zoom', 'zoom'], ['position-x', 'x'], ['position-y', 'y']].forEach(([id, property]) => {
    $(id).addEventListener('input', event => { scene[property] = Number(event.target.value); renderScene(); });
    $(id).addEventListener('change', persistScene);
  });

  const preview = $('scene-preview');
  let dragging = null;
  preview.addEventListener('pointerdown', event => {
    if (scene.name !== 'photo') return;
    dragging = { id: event.pointerId, x: event.clientX, y: event.clientY, sceneX: scene.x, sceneY: scene.y };
    preview.setPointerCapture(event.pointerId);
  });
  preview.addEventListener('pointermove', event => {
    if (!dragging || dragging.id !== event.pointerId) return;
    const size = sceneDimensions(preview);
    const extraX = size.width - size.viewportW, extraY = size.height - size.viewportH;
    const screenX = event.clientX - dragging.x, screenY = event.clientY - dragging.y;
    const dx = sidewaysLayout.matches ? screenY : screenX;
    const dy = sidewaysLayout.matches ? -screenX : screenY;
    if (extraX > 1) scene.x = clamp(dragging.sceneX - dx / extraX * 100, 0, 100);
    if (extraY > 1) scene.y = clamp(dragging.sceneY - dy / extraY * 100, 0, 100);
    renderScene();
  });
  const endDrag = () => { if (dragging) persistScene(); dragging = null; };
  preview.addEventListener('pointerup', endDrag);
  preview.addEventListener('pointercancel', endDrag);
  preview.addEventListener('lostpointercapture', endDrag);

  $('photo').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    $('upload-error').hidden = true;
    if (file.size > 25 * 1024 * 1024) {
      $('upload-error').textContent = 'Choose a photo smaller than 25 MB.';
      $('upload-error').hidden = false;
      event.target.value = '';
      return;
    }
    let objectURL;
    try {
      objectURL = URL.createObjectURL(file);
      const image = await new Promise((resolve, reject) => {
        const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = objectURL;
      });
      const scale = Math.min(1, 1400 / Math.max(image.naturalWidth, image.naturalHeight));
      const buffer = document.createElement('canvas');
      buffer.width = Math.max(1, Math.round(image.naturalWidth * scale));
      buffer.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const bufferContext = buffer.getContext('2d');
      bufferContext.fillStyle = '#bee5de'; bufferContext.fillRect(0, 0, buffer.width, buffer.height);
      bufferContext.drawImage(image, 0, 0, buffer.width, buffer.height);
      photoURL = buffer.toDataURL('image/jpeg', .84);
      photoSize = { width: buffer.width, height: buffer.height };
      scene = { name: 'photo', zoom: 1, x: 50, y: 50 };
      renderScene(); persistScene();
      announce('Your photo is now the tank background.');
    } catch {
      $('upload-error').textContent = 'This browser couldn’t open that image. Try a JPG, PNG, or WebP photo.';
      $('upload-error').hidden = false;
    } finally {
      if (objectURL) URL.revokeObjectURL(objectURL);
      event.target.value = '';
    }
  });

  try {
    leaderboard = validBoards(JSON.parse(localStorage.getItem(leaderboardKey)));
  } catch { leaderboard = validBoards(null); }

  try {
    const saved = JSON.parse(localStorage.getItem('aqua-scene'));
    if (saved && ['ocean', 'sunset', 'space', 'photo'].includes(saved.name)) {
      if (typeof saved.photoURL === 'string' && saved.photoURL.startsWith('data:image/')) photoURL = saved.photoURL;
      if (saved.photoSize && Number.isFinite(saved.photoSize.width) && saved.photoSize.width > 0 && Number.isFinite(saved.photoSize.height) && saved.photoSize.height > 0) photoSize = saved.photoSize;
      scene = { name: saved.name === 'photo' && !photoURL ? 'ocean' : saved.name, zoom: clamp(Number(saved.zoom) || 1, 1, 2.5), x: clamp(Number.isFinite(saved.x) ? saved.x : 50, 0, 100), y: clamp(Number.isFinite(saved.y) ? saved.y : 50, 0, 100) };
    }
    soundEnabled = localStorage.getItem('aqua-sound') === 'true';
    tiltWanted = localStorage.getItem('ych-tilt-enabled') !== 'false';
    $('sound').setAttribute('aria-pressed', String(soundEnabled));
    $('sound').setAttribute('aria-label', `Turn sound ${soundEnabled ? 'off' : 'on'}`);
    $('sound-label').textContent = `SOUND ${soundEnabled ? 'ON' : 'OFF'}`;
  } catch { /* The toy also works with storage disabled. */ }

  new ResizeObserver(resize).observe(tank);
  new ResizeObserver(() => { if (sceneDialog.open) renderScene(); }).observe(preview);
  reset(); resize();
  if (tiltWanted && window.isSecureContext && window.DeviceOrientationEvent) {
    if (typeof window.DeviceOrientationEvent.requestPermission === 'function') {
      // iPhone needs a user gesture; offer it as the default way to start playing.
      tiltPromptPending = true;
      updateTiltUI();
      showDefaultTiltPrompt();
    } else tilt.start();
  }
  animation = requestAnimationFrame(frame);
  window.addEventListener('pagehide', () => { pauseClock(); cancelAnimationFrame(animation); releaseInputs(); tilt.stop(); });
  window.addEventListener('pageshow', event => { if (event.persisted) { lastTime = 0; animation = requestAnimationFrame(frame); } });
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* Offline install is optional. */ });
  }
})();
