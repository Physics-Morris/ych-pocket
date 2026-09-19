# YCH Pocket — Nostalgia Game 1

A nostalgic, playable water ring-toss toy. Designed first for an iPhone held horizontally, with independent thumb pumps, 12 floating rings, timed challenges, optional fish, local leaderboards, sound, and customizable artwork inside the tank.

**[Play YCH Pocket](https://physics-morris.github.io/ych-pocket/)** · Opens directly in landscape, including in an upright browser. In Safari, choose Page Menu → Hide Toolbar for more playing space without installing. A Home Screen shortcut is optional.

## Run

No dependencies or build step:

```sh
git clone https://github.com/Physics-Morris/ych-pocket.git
cd ych-pocket
python3 -m http.server 8000 --bind 0.0.0.0
```

Open `http://localhost:8000` on the computer. On an iPhone connected to the same Wi-Fi network, open `http://<your-computers-local-IP>:8000` in Safari. Allow the Python server through the macOS firewall if prompted. Turn off Portrait Orientation Lock and rotate the phone sideways.

The live site is served by GitHub Pages from the root of the `main` branch. Push updates to `main` to publish them. `.nojekyll` keeps the site a plain static app. On iPhone, use Safari’s Page Menu → Hide Toolbar without installing, or optionally Share → Add to Home Screen to launch without Safari’s toolbar. The game resizes to the available viewport; it cannot automatically hide Safari’s controls or enter true element fullscreen on iPhone. The game always uses a landscape layout. In an upright browser, CSS rotates the entire game and its dialogs 90 degrees and swaps their logical viewport dimensions. There is no portrait gate or rotation prompt. The manifest also requests landscape; iOS controls native orientation locking.

## Play

- Choose **Classic** or **Color Match**, optionally turn **FISH ON**, then press **START**. The timer starts only when you start the round. Mode and fish settings stay fixed until RESET.
- Press the yellow buttons, A / D, or the left / right arrow keys. The left pump drives rings up and right, and the right pump drives them up and left. The bubbles follow the same direction. Both pumps support simultaneous touch.
- Rings sink faster and bounce less for a heavier feel. Time the pulses so rings fall over the tips of the posts. Classic accepts any ring on any of three pink posts. Color Match has four posts (red, yellow, green, blue); only same-color catches count. Catch all 12 at once to finish.
- Caught rings gain 25% more effective weight, reducing pump and fish impulses by 20% while threaded. They remain physically movable: pumps lift them up the posts, and a ring that clears a tip is released and removed from the score. It can be caught again. Fish mode brings the Ocean artwork’s three fish to life. The background fish are smaller now; they shrink a little more while cruising mostly left and right, with smooth turns, beating tails, gentle climbs and dives, and occasional pecks at nearby rings. They return to their original places and blend into the artwork after a round ends or resets. They also appear over the other scenes when fish mode is enabled.
- Finishing stops the timer and preserves the final tank scene without a win overlay. Enter a name above the toy and choose **SAVE**. **TIMES** shows the fastest ten names and completion times on this device, with separate boards for each of the four mode/fish combinations. Scores persist in browser storage; there is no online or shared leaderboard. A finished round can be submitted once. If storage is unavailable, scores remain available for the current visit.
- The timer shows minutes, seconds and hundredths. It measures active wall-clock time, pausing with the simulation while a dialog is open or the page is hidden. **NEW ROUND** returns to setup without automatically starting the clock.
- SCENE changes only the artwork behind the water. Choose Ocean, Sunset, Space, or a personal image. Uploaded photos can be zoomed and positioned by dragging or using sliders. Changes preserve game progress.
- Gravity/phone tilt is the default mode. On iPhone, the opening view asks you to enable motion with a tap; Safari still requires its permission prompt. Fixed real-world gravity pulls rings toward the lower edge of the phone with balanced strength; no calibration is used. Rotate like a steering wheel to guide them left/right. Lower the top edge to lift rings, then lower the bottom edge to settle them. Laying the screen flat removes the in-plane gravity force. Pumps remain usable, and caught rings can lift off the posts during play. Tap TILT to switch it off; that preference is remembered.
- Motion requires HTTPS and a supported phone sensor. Missing readings, denied permissions, and unsupported devices fall back to the pumps. Sensor readings stay in memory and are never uploaded or saved.
- RESET clears the current round and timer and returns to setup; press START when ready. SOUND toggles synthesized audio, off by default.
- Starting a round collapses the toolbars, mode/fish controls, and PLAYING button. Only a compact timer and **MENU** remain, giving the machine more screen space. MENU pauses the clock and physics and reveals Sound, Scene, Reset, Tilt, screen options, and Times; **RESUME** or Escape continues play. Setup and final name entry remain available outside the tank.
- Labels and artwork cannot be selected, dragged, or long-pressed into a callout while playing. Name entry still supports normal text editing and selection. The game blocks pinch, double-tap, trackpad pinch, and page zoom shortcuts; dialogs still scroll.
- Sound, Scene, Reset, Tilt, and the screen control are in a separate toolbar above the toy, outside its curved casing. Full Screen uses the browser API where supported. Where it is unavailable, the button reads MORE SCREEN and explains Safari’s manual Hide Toolbar option first. Home Screen installation is an optional, collapsed alternative. The same toolbar remains available when the page is rotated.
- Scene, photo, and sound preferences are saved locally where browser storage is available. Gameplay starts fresh on reload. Photos are resized and stored on the device; nothing is uploaded to a server.

## Implementation

Plain HTML, CSS, and JavaScript. The housing is CSS; all original artwork is SVG; the game is Canvas 2D. Physics use a fixed 120 Hz step with stronger downward acceleration, directional impulses, soft contacts, and a downward tip-crossing catch rule, movable threaded rings, and color validation in Color Match. Fish reuse the original SVG artwork as a separate animated layer over a fish-free Ocean background and deliver small velocity impulses at the rings. Their home positions use the same cover transform as the scenery so they blend back into it across viewport sizes. This is a stylized 2D simulation rather than a full fluid or 3D hoop simulation. Device-pixel-ratio-aware canvas rendering is capped at 2.5×. The simulation pauses when a dialog is open or the page is hidden. It stays playable in an upright browser. Decorative bubbles are reduced when Reduce Motion is enabled.

`tilt.js` maps device orientation into game-relative gravity for either landscape direction, including the CSS rotation used in an upright browser. The projection follows the actual lower screen edge, independent of the initial holding angle, including after screen rotation or an interruption. A small dead zone and smoothing reduce jitter; stale data returns to ordinary downward gravity. iOS permission is requested only from the Enable button.

`sw.js` adds offline caching on secure origins (HTTPS or localhost). Increment its cache version when publishing a changed asset set. No external libraries, fonts, trackers, or network image services are used.

## Visual direction

YCH branding with warm paper, ink outlines, hard offset shadows, bold type, and saturated blue/pink/lime accents, inspired by the supplied Round & Strong reference. The handheld silhouette and thumb pumps preserve the original water toy.

## Verification

- `node tests/game.test.cjs`: checks covering directional impulses and bubbles, heavier ring fall and lift, classic and color-matched catches, pump-driven release and recapture, start/timer/pause/finish/reset behavior, fish pecks, four isolated leaderboards, safe name rendering, duplicate prevention, storage fallback, long play, tilt startup, and layout rotation.
- `node tests/tilt.test.cjs`: nine checks covering permission lifecycle, both landscape directions and the rotated portrait browser, lift/settle, smoothing, rotation, missing/stale data, and cancellation.
- Open `/tests/browser.html` on the local server for real-browser checks of landscape layouts at 844×390, 852×393, 667×375, 844×290, 667×260, and upright browsers at 390×844, 375×667, 320×568, and 430×932; immediate landscape play and full-screen guidance; unclipped 44px toolbar and round controls; mode/fish selection, start and timed play, and leaderboard pauses; photo decoding and zoom; three-post preview, and scene/sound/reset/tilt interactions including simulated permission grant and denial; and completed-round name entry, final-scene visibility and score saving. The test page instruments only its own iframe to place rings deterministically; the shipped game exposes no test hooks. The page creates a synthetic test image locally and finishes on the Ocean preset.
- Desktop Chrome was visually checked for the YCH styling and live pump/ring motion. Actual iPhone hardware, iOS safe-area behavior, Home Screen installation, and real sensor sensitivity still need device testing. Phone motion was verified with deterministic sensor simulations, not physical iPhone hardware.
