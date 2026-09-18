# YCH Pocket

A nostalgic, playable water ring-toss toy. Designed first for an iPhone held horizontally, with independent thumb pumps, 12 floating rings, two pink posts, sound, and customizable artwork inside the tank.

**[Play YCH Pocket](https://physics-morris.github.io/ych-pocket/)** · Turn your iPhone sideways. In Safari, choose Share → Add to Home Screen for the full-screen toy.

## Run

No dependencies or build step:

```sh
git clone https://github.com/Physics-Morris/ych-pocket.git
cd ych-pocket
python3 -m http.server 8000 --bind 0.0.0.0
```

Open `http://localhost:8000` on the computer. On an iPhone connected to the same Wi-Fi network, open `http://<your-computers-local-IP>:8000` in Safari. Allow the Python server through the macOS firewall if prompted. Turn off Portrait Orientation Lock and rotate the phone sideways.

The live site is served by GitHub Pages from the root of the `main` branch. Push updates to `main` to publish them. `.nojekyll` keeps the site a plain static app. On iPhone, use Safari → Share → Add to Home Screen to remove the browser toolbar. The manifest requests landscape, but iOS controls whether orientation locking is honored; the in-app portrait screen asks the player to rotate.

## Play

- Press the yellow buttons, A / D, or the left / right arrow keys. Each press creates one localized water pulse; both pumps support simultaneous touch.
- Time the pulses so rings fall over the tips of the posts. Catch all 12 to win. Captured rings remain on the posts.
- SCENE changes only the artwork behind the water. Choose Ocean, Sunset, Space, or a personal image. Uploaded photos can be zoomed and positioned by dragging or using sliders. Changes preserve game progress.
- RESET starts a new round. SOUND toggles synthesized audio, off by default.
- Scene, photo, and sound preferences are saved locally where browser storage is available. Gameplay starts fresh on reload. Photos are resized and stored on the device; nothing is uploaded to a server.

## Implementation

Plain HTML, CSS, and JavaScript. The housing is CSS; all original artwork is SVG; the game is Canvas 2D. Physics use a fixed 120 Hz step with drag, local impulses, soft contacts, and a downward tip-crossing catch rule. This is a stylized 2D simulation rather than a full fluid or 3D hoop simulation. Device-pixel-ratio-aware canvas rendering is capped at 2.5×. The simulation pauses in portrait, when a dialog is open, or when the page is hidden. Decorative bubbles are reduced when Reduce Motion is enabled.

`sw.js` adds offline caching on secure origins (HTTPS or localhost). Increment its cache version when publishing a changed asset set. No external libraries, fonts, trackers, or network image services are used.

## Visual direction

YCH branding with warm paper, ink outlines, hard offset shadows, bold type, and saturated blue/pink/lime accents, inspired by the supplied Round & Strong reference. The handheld silhouette and thumb pumps preserve the original water toy.

## Verification

- `node tests/game.test.cjs`: seven checks covering localized impulses, independent pointer release, valid/invalid catches, scene changes, win/reset, and stable long-running physics.
- Open `/tests/browser.html` on the local server: 24 real-browser checks for landscape layouts at 844×390, 852×393, 667×375, and 844×290; portrait guidance; unclipped 44px controls; photo decoding and zoom; and scene/reset interactions. These passed in desktop Safari. The page creates a synthetic test image locally and finishes on the Ocean preset.
- Desktop Chrome was visually checked for the YCH styling and live pump/ring motion. Actual iPhone hardware, iOS safe-area behavior, and Home Screen installation still need device testing.
