(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const W = 640, H = 400, TOTAL = 12, RADIUS = 15;
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const tank = $('tank');
  const sceneDialog = $('scene-dialog');
  const helpDialog = $('help-dialog');
  const installDialog = $('install-dialog');
  const portrait = matchMedia('(max-width: 700px) and (orientation: portrait)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const colors = ['#f26974', '#ffdf3f', '#60c379', '#597bd4'];
  const posts = [{ x: 228, tip: 195, rings: [] }, { x: 412, tip: 195, rings: [] }];
  const pumpButtons = [$('pump-left'), $('pump-right')];
  const pointers = [new Set(), new Set()];
  const keySides = new Map();
  let rings = [], bubbles = [], pulses = [], caught = 0, tick = 0;
  let accumulator = 0, lastTime = 0, animation = 0;
  let soundEnabled = false, audioContext = null, noiseBuffer = null;
  let photoURL = null, photoSize = { width: 800, height: 500 };
  let scene = { name: 'ocean', zoom: 1, x: 50, y: 50 };
  const sceneImages = { ocean: 'assets/ocean.svg', sunset: 'assets/sunset.svg', space: 'assets/space.svg' };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const random = (lo, hi) => lo + Math.random() * (hi - lo);
  const announce = message => { $('announcement').textContent = message; };
  const paused = () => document.hidden || sceneDialog.open || helpDialog.open || installDialog.open || portrait.matches;

  function updateScore() {
    $('score').innerHTML = `${String(caught).padStart(2, '0')}<span> / ${TOTAL}</span>`;
    canvas.setAttribute('aria-label', `${caught} of ${TOTAL} rings caught. Use the left and right pumps to lift the remaining rings onto the pink posts.`);
  }

  function reset() {
    caught = 0;
    posts.forEach(post => { post.rings = []; });
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
    $('win-message').hidden = true;
    updateScore();
    releaseInputs();
    announce('A fresh handful of rings. Press the yellow buttons to begin.');
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
    if (paused() || caught === TOTAL) return;
    const sourceX = side === 0 ? 130 : 510;
    const targetX = posts[side].x;
    for (const ring of rings) {
      if (ring.caught) continue;
      const dx = Math.abs(ring.x - sourceX);
      const proximity = Math.exp(-(dx * dx) / (2 * 165 * 165));
      const height = .55 + .45 * (ring.y / H);
      const force = proximity * height;
      ring.vy = Math.max(-570, ring.vy - (505 + random(-25, 25)) * force);
      ring.vx += (clamp((targetX - ring.x) * .9, -125, 125) + random(-25, 25)) * force;
      ring.spin += random(-4, 4) * force;
    }
    pulses.push({ x: sourceX, age: 0 });
    for (let i = 0; i < (reducedMotion.matches ? 5 : 18); i++) {
      bubbles.push({ x: sourceX + random(-20, 20), y: H - 12 + random(-8, 8), vx: random(-27, 27), vy: random(-175, -85), r: random(1.5, 5), age: 0, life: random(.7, 1.8) });
    }
    if (bubbles.length > 180) bubbles.splice(0, bubbles.length - 180);
    if (pulses.length > 20) pulses.shift();
    playPumpSound();
  }

  function catchRing(ring, post) {
    ring.caught = true;
    ring.post = post;
    ring.slot = post.rings.length;
    ring.age = 0;
    post.rings.push(ring);
    caught++;
    updateScore();
    playCatchSound();
    announce(caught === TOTAL ? 'All twelve rings aboard! You caught them all.' : `${caught} of twelve rings caught.`);
  }

  function step(dt) {
    tick += dt;
    for (const ring of rings) {
      if (ring.caught) {
        ring.age += dt;
        const targetY = H - 39 - ring.slot * 10;
        ring.x += (ring.post.x - ring.x) * (1 - Math.exp(-10 * dt));
        ring.y += (targetY - ring.y) * (1 - Math.exp(-5 * dt));
        ring.angle *= Math.exp(-9 * dt);
        continue;
      }
      const previousY = ring.y;
      ring.vx += Math.sin(tick * 1.4 + ring.y * .025) * 8 * dt;
      ring.vx *= Math.exp(-1.13 * dt);
      ring.vy += 132 * dt;
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
        ring.vy = ring.vy > 18 ? -ring.vy * .22 : 0;
        ring.vx *= Math.exp(-5 * dt);
        ring.spin *= Math.exp(-5 * dt);
      }
      for (const post of posts) {
        // Crossing the tip while descending threads the open center of a hoop.
        // The tolerance is smaller than its hole; a side brush never counts.
        if (ring.vy > 0 && previousY <= post.tip && ring.y >= post.tip && Math.abs(ring.x - post.x) < 9.5 && Math.abs(ring.vx) < 110) {
          catchRing(ring, post);
          break;
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
    if (caught === TOTAL && rings.every(r => r.age > .9)) $('win-message').hidden = false;
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

  function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    for (const x of [130, 510]) {
      ellipse(x, H - 12, 19, 5, '#25778b42');
      ellipse(x, H - 14, 12, 3, '#07567560');
    }
    for (const post of posts) {
      ellipse(post.x, H - 23, 34, 9, '#395a6140');
      ellipse(post.x, H - 28, 27, 9, '#da5784');
      ellipse(post.x, H - 30, 24, 7, '#f28bad');
      const gradient = ctx.createLinearGradient(post.x - 5, 0, post.x + 5, 0);
      gradient.addColorStop(0, '#c54274'); gradient.addColorStop(.4, '#ffbbd0'); gradient.addColorStop(.65, '#f88aad'); gradient.addColorStop(1, '#be3b70');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(post.x - 5, H - 32); ctx.lineTo(post.x - 3.3, post.tip + 3);
      ctx.quadraticCurveTo(post.x, post.tip - 3, post.x + 3.3, post.tip + 3);
      ctx.lineTo(post.x + 5, H - 32); ctx.closePath(); ctx.fill();
    }
    for (const ring of rings.filter(r => r.caught)) drawRing(ring);
    for (const ring of rings.filter(r => !r.caught).sort((a, b) => a.y - b.y)) drawRing(ring);
    for (const pulse of pulses) {
      ctx.strokeStyle = `rgba(207,255,255,${(.5 - pulse.age) * .35})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(pulse.x, H - 16 - pulse.age * 110, 14 + pulse.age * 65, 5 + pulse.age * 10, 0, 0, Math.PI * 2); ctx.stroke();
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
      accumulator += elapsed;
      while (accumulator >= 1 / 120) { step(1 / 120); accumulator -= 1 / 120; }
      draw();
    } else accumulator = 0;
    animation = requestAnimationFrame(frame);
  }

  function resize() {
    const rect = tank.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
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
      if (paused()) return;
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
    if (event.altKey || event.metaKey || event.ctrlKey || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable || paused()) return;
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
  document.addEventListener('visibilitychange', () => { releaseInputs(); lastTime = 0; });
  portrait.addEventListener('change', () => { releaseInputs(); lastTime = 0; resize(); });

  $('restart').addEventListener('click', reset);
  $('play-again').addEventListener('click', reset);
  $('sound').addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    $('sound').setAttribute('aria-pressed', String(soundEnabled));
    $('sound').setAttribute('aria-label', `Turn sound ${soundEnabled ? 'off' : 'on'}`);
    $('sound-label').textContent = `SOUND ${soundEnabled ? 'ON' : 'OFF'}`;
    if (soundEnabled) playPumpSound();
    try { localStorage.setItem('aqua-sound', String(soundEnabled)); } catch { /* Storage is optional. */ }
  });

  function openDialog(dialog) { releaseInputs(); dialog.showModal(); renderScene(); }
  $('backgrounds').addEventListener('click', () => openDialog(sceneDialog));
  $('close-scenes').addEventListener('click', () => sceneDialog.close());
  $('done-scenes').addEventListener('click', () => sceneDialog.close());
  $('how-to').addEventListener('click', () => openDialog(helpDialog));
  $('close-help').addEventListener('click', () => helpDialog.close());
  $('got-it').addEventListener('click', () => helpDialog.close());
  $('close-install').addEventListener('click', () => installDialog.close());
  $('got-install').addEventListener('click', () => installDialog.close());
  $('portrait-fullscreen').addEventListener('click', () => openDialog(installDialog));

  const standaloneMode = matchMedia('(display-mode: standalone)');
  const fullscreenMode = matchMedia('(display-mode: fullscreen)');
  function updateScreenMode() {
    const installed = navigator.standalone === true || standaloneMode.matches;
    const fullscreen = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    const root = document.documentElement;
    const supported = Boolean(root.requestFullscreen || root.webkitRequestFullscreen) &&
      (document.fullscreenEnabled ?? document.webkitFullscreenEnabled) !== false;
    $('fullscreen').hidden = installed || (fullscreenMode.matches && !fullscreen);
    $('portrait-fullscreen').hidden = installed || fullscreenMode.matches;
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

  [sceneDialog, helpDialog, installDialog].forEach(dialog => {
    let downOutside = false;
    const outside = event => {
      const rect = dialog.getBoundingClientRect();
      return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    };
    dialog.addEventListener('pointerdown', event => { downOutside = outside(event); });
    dialog.addEventListener('pointerup', event => { if (downOutside && outside(event)) dialog.close(); downOutside = false; });
    dialog.addEventListener('close', () => { lastTime = 0; persistScene(); });
  });

  function sceneDimensions(element) {
    const rect = element.getBoundingClientRect();
    const ratio = Math.max(rect.width / photoSize.width, rect.height / photoSize.height) * scene.zoom;
    return { width: photoSize.width * ratio, height: photoSize.height * ratio, viewportW: rect.width, viewportH: rect.height };
  }

  function renderScene() {
    const isPhoto = scene.name === 'photo' && photoURL;
    const source = isPhoto ? photoURL : sceneImages[scene.name] || sceneImages.ocean;
    for (const element of [$('tank-art'), $('scene-preview')]) {
      element.style.backgroundImage = `url("${source}")`;
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
    if (extraX > 1) scene.x = clamp(dragging.sceneX - (event.clientX - dragging.x) / extraX * 100, 0, 100);
    if (extraY > 1) scene.y = clamp(dragging.sceneY - (event.clientY - dragging.y) / extraY * 100, 0, 100);
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
    const saved = JSON.parse(localStorage.getItem('aqua-scene'));
    if (saved && ['ocean', 'sunset', 'space', 'photo'].includes(saved.name)) {
      if (typeof saved.photoURL === 'string' && saved.photoURL.startsWith('data:image/')) photoURL = saved.photoURL;
      if (saved.photoSize && Number.isFinite(saved.photoSize.width) && saved.photoSize.width > 0 && Number.isFinite(saved.photoSize.height) && saved.photoSize.height > 0) photoSize = saved.photoSize;
      scene = { name: saved.name === 'photo' && !photoURL ? 'ocean' : saved.name, zoom: clamp(Number(saved.zoom) || 1, 1, 2.5), x: clamp(Number.isFinite(saved.x) ? saved.x : 50, 0, 100), y: clamp(Number.isFinite(saved.y) ? saved.y : 50, 0, 100) };
    }
    soundEnabled = localStorage.getItem('aqua-sound') === 'true';
    $('sound').setAttribute('aria-pressed', String(soundEnabled));
    $('sound').setAttribute('aria-label', `Turn sound ${soundEnabled ? 'off' : 'on'}`);
    $('sound-label').textContent = `SOUND ${soundEnabled ? 'ON' : 'OFF'}`;
  } catch { /* The toy also works with storage disabled. */ }

  new ResizeObserver(resize).observe(tank);
  new ResizeObserver(() => { if (sceneDialog.open) renderScene(); }).observe(preview);
  reset(); resize();
  animation = requestAnimationFrame(frame);
  window.addEventListener('pagehide', () => { cancelAnimationFrame(animation); releaseInputs(); });
  window.addEventListener('pageshow', event => { if (event.persisted) { lastTime = 0; animation = requestAnimationFrame(frame); } });
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* Offline install is optional. */ });
  }
})();
