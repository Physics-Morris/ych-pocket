/* Real-world gravity projected into either landscape screen orientation. */
(() => {
  'use strict';
  const GRAVITY = 240;
  const TILT_STRENGTH = 340;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const deadzone = value => Math.sign(value) * Math.max(0, Math.abs(value) - .025);

  class YCHTilt {
    constructor(onChange = () => {}, layoutRotation = () => 0) {
      this.onChange = onChange;
      this.layoutRotation = layoutRotation;
      this.enabled = false;
      this.ready = false;
      this.requesting = false;
      this.error = '';
      this.generation = 0;
      this.target = { x: 0, y: GRAVITY };
      this.force = { ...this.target };
      this.lastSample = 0;
      this.timer = null;
      this.handleOrientation = event => this.read(event);
      this.handleRotation = () => this.refresh();
    }

    static project(beta, gamma, angle) {
      const radians = Math.PI / 180;
      const x = Math.cos(beta * radians) * Math.sin(gamma * radians);
      const y = Math.sin(beta * radians);
      const turn = angle * radians;
      return { x: x * Math.cos(turn) + y * Math.sin(turn), y: y * Math.cos(turn) - x * Math.sin(turn) };
    }

    async start() {
      if (this.enabled || this.requesting) return;
      this.error = '';
      if (!window.isSecureContext) {
        this.error = 'Tilt needs a secure connection. Open the published HTTPS game to use phone motion. The pumps still work here.';
        this.onChange(); return;
      }
      const sensor = window.DeviceOrientationEvent;
      if (!sensor) {
        this.error = 'This browser has no phone-motion sensor available. You can still play with the yellow pumps.';
        this.onChange(); return;
      }
      const generation = ++this.generation;
      this.requesting = true;
      this.onChange();
      try {
        // Keep the iOS permission request in the Enable button's user gesture.
        if (typeof sensor.requestPermission === 'function' && await sensor.requestPermission() !== 'granted') {
          if (generation === this.generation) this.stop('Motion access wasn’t allowed. Check Safari’s motion permissions to try again, or keep playing with the pumps.');
          return;
        }
        if (generation !== this.generation) return;
        this.requesting = false;
        this.enabled = true;
        window.addEventListener('deviceorientation', this.handleOrientation);
        window.addEventListener('orientationchange', this.handleRotation);
        window.screen?.orientation?.addEventListener('change', this.handleRotation);
        this.refresh();
      } catch {
        if (generation === this.generation) this.stop('Phone motion couldn’t start. The yellow pumps still work; you can try enabling tilt again.');
      }
    }

    refresh() {
      if (!this.enabled) return;
      this.ready = false;
      this.target = { x: 0, y: GRAVITY };
      this.force = { ...this.target };
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        if (!this.ready) this.stop('No motion readings arrived. Try Safari on your phone and allow motion access, or play with the pumps.');
      }, 5000);
      this.onChange();
    }

    read(event) {
      if (!this.enabled || document.hidden || !Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
      const angle = window.screen?.orientation?.angle ?? window.orientation ?? 0;
      const projected = YCHTilt.project(event.beta, event.gamma, angle + this.layoutRotation());
      const now = performance.now();
      const first = !this.ready || now - this.lastSample > 1000;
      this.lastSample = now;
      // No neutral offset: rings always follow the lower physical screen edge.
      this.target = {
        x: clamp(deadzone(projected.x) * TILT_STRENGTH, -TILT_STRENGTH, TILT_STRENGTH),
        y: clamp(deadzone(projected.y) * TILT_STRENGTH, -TILT_STRENGTH, TILT_STRENGTH)
      };
      if (first) {
        this.force = { ...this.target };
        this.ready = true;
        clearTimeout(this.timer);
        this.onChange();
      }
    }

    sample(dt) {
      if (!this.enabled || !this.ready || performance.now() - this.lastSample > 1000) {
        this.force = { x: 0, y: GRAVITY };
        return this.force;
      }
      const smoothing = 1 - Math.exp(-8 * dt);
      this.force.x += (this.target.x - this.force.x) * smoothing;
      this.force.y += (this.target.y - this.force.y) * smoothing;
      return this.force;
    }

    stop(error = '') {
      this.generation++;
      clearTimeout(this.timer);
      window.removeEventListener('deviceorientation', this.handleOrientation);
      window.removeEventListener('orientationchange', this.handleRotation);
      window.screen?.orientation?.removeEventListener('change', this.handleRotation);
      this.enabled = this.ready = this.requesting = false;
      this.target = { x: 0, y: GRAVITY };
      this.force = { ...this.target };
      this.error = error;
      this.onChange();
    }
  }
  window.YCHTilt = YCHTilt;
})();
