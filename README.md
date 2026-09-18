# YCH Pocket — Nostalgia Game 1

A nostalgic, playable water ring-toss toy. Designed first for an iPhone held horizontally, with independent thumb pumps, 12 floating rings, three pink posts, sound, and customizable artwork inside the tank.

**[Play YCH Pocket](https://physics-morris.github.io/ych-pocket/)** · Turn your iPhone sideways. In Safari, choose Page Menu → Hide Toolbar for more playing space without installing. A Home Screen shortcut is optional.

## Run

No dependencies or build step:

```sh
git clone https://github.com/Physics-Morris/ych-pocket.git
cd ych-pocket
python3 -m http.server 8000 --bind 0.0.0.0
```

Open `http://localhost:8000` on the computer. On an iPhone connected to the same Wi-Fi network, open `http://<your-computers-local-IP>:8000` in Safari. Allow the Python server through the macOS firewall if prompted. Turn off Portrait Orientation Lock and rotate the phone sideways.

The live site is served by GitHub Pages from the root of the `main` branch. Push updates to `main` to publish them. `.nojekyll` keeps the site a plain static app. On iPhone, use Safari’s Page Menu → Hide Toolbar without installing, or optionally Share → Add to Home Screen to launch without Safari’s toolbar. The game resizes to the available viewport; it cannot automatically hide Safari’s controls or enter true element fullscreen on iPhone. The manifest requests landscape, but iOS controls whether orientation locking is honored; the in-app portrait screen asks the player to rotate.

## Play

- Press the yellow buttons, A / D, or the left / right arrow keys. The left pump drives rings up and right, and the right pump drives them up and left. The bubbles follow the same direction. Both pumps support simultaneous touch.
- Rings sink faster and bounce less for a heavier feel. Time the pulses so rings fall over the tips of the three posts. Catch all 12 to win. Captured rings remain on the posts.
- SCENE changes only the artwork behind the water. Choose Ocean, Sunset, Space, or a personal image. Uploaded photos can be zoomed and positioned by dragging or using sliders. Changes preserve game progress.
- Gravity/phone tilt is the default mode. On iPhone, the first landscape view asks you to enable motion with a tap; Safari still requires its permission prompt. Fixed real-world gravity pulls rings toward the lower edge of the phone with balanced strength; no calibration is used. Rotate like a steering wheel to guide them left/right. Lower the top edge to lift rings, then lower the bottom edge to settle them. Laying the screen flat removes the in-plane gravity force. Pumps remain usable, and caught rings stay caught. Tap TILT to switch it off; that preference is remembered.
- Motion requires HTTPS and a supported phone sensor. Missing readings, denied permissions, and unsupported devices fall back to the pumps. Sensor readings stay in memory and are never uploaded or saved.
- RESET starts a new round. SOUND toggles synthesized audio, off by default.
- Sound, Scene, Reset, Tilt, and the screen control are in a separate toolbar above the toy, outside its curved casing. Full Screen uses the browser API where supported. Where it is unavailable, the button reads MORE SCREEN and explains Safari’s manual Hide Toolbar option first. Home Screen installation is an optional, collapsed alternative. The same guide is available from the portrait screen.
- Scene, photo, and sound preferences are saved locally where browser storage is available. Gameplay starts fresh on reload. Photos are resized and stored on the device; nothing is uploaded to a server.

## Implementation

Plain HTML, CSS, and JavaScript. The housing is CSS; all original artwork is SVG; the game is Canvas 2D. Physics use a fixed 120 Hz step with stronger downward acceleration, directional impulses, soft contacts, and a downward tip-crossing catch rule. This is a stylized 2D simulation rather than a full fluid or 3D hoop simulation. Device-pixel-ratio-aware canvas rendering is capped at 2.5×. The simulation pauses in portrait, when a dialog is open, or when the page is hidden. Decorative bubbles are reduced when Reduce Motion is enabled.

`tilt.js` maps device orientation into screen-relative gravity for either landscape direction. The projection follows the actual lower screen edge, independent of the initial holding angle, including after screen rotation or an interruption. A small dead zone and smoothing reduce jitter; stale data returns to ordinary downward gravity. iOS permission is requested only from the Enable button.

`sw.js` adds offline caching on secure origins (HTTPS or localhost). Increment its cache version when publishing a changed asset set. No external libraries, fonts, trackers, or network image services are used.

## Visual direction

YCH branding with warm paper, ink outlines, hard offset shadows, bold type, and saturated blue/pink/lime accents, inspired by the supplied Round & Strong reference. The handheld silhouette and thumb pumps preserve the original water toy.

## Verification

- `node tests/game.test.cjs`: thirteen checks covering directional impulses and bubbles, heavier ring fall and lift, three posts, gravity-only play, independent touches, catches, scene changes, win/reset, long play, default tilt startup, and the iPhone permission prompt.
- `node tests/tilt.test.cjs`: eight checks covering permission lifecycle, both landscape directions, lift/settle, smoothing, rotation, missing/stale data, and cancellation.
- Open `/tests/browser.html` on the local server for real-browser checks of landscape layouts at 844×390, 852×393, 667×375, 844×290, and 667×260; portrait and full-screen guidance; unclipped 44px toolbar controls; photo decoding and zoom; three-post preview, and scene/sound/reset/tilt interactions including simulated permission grant and denial. The page creates a synthetic test image locally and finishes on the Ocean preset.
- Desktop Chrome was visually checked for the YCH styling and live pump/ring motion. Actual iPhone hardware, iOS safe-area behavior, Home Screen installation, and real sensor sensitivity still need device testing. Phone motion was verified with deterministic sensor simulations, not physical iPhone hardware.
