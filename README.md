# Pulse Suite v0.2.7 — All-in-one media studio

A desktop app for playing music, watching it drawn live, corrupting files at the
byte level, turning video into ASCII, and cutting clips to the beat — all in one
window, Photoshop/Darktable-style: one tab per stage of the workflow, all sharing
a single media pipeline.

Built for Austin, in the spirit of [Oto](https://otoinstrument.shop/en). **v0.2.7
is Austin's live-test batch from 0.2.6:** the corner resize grip now travels
with its panel when dragged (three real causes fixed — absolute panels
unpinned on drag start, docked reorder snapshotted so it stops oscillating,
and the Mission Control column's grip actually attached), **panels move
between zones** — drag the live map out of Mission Control to the top of the
screen, or free-float it anywhere; **Studio quadrants swap on right-click**
— pick which visualizers show and how many (1–8); **Glitch auto-starts**
when music starts; the **spectrum analyzer has Mousiki-style themes**
(Mousiki / ASCII / VU Meter / Neon / Matrix / Mono Line — the real Mousiki
spring-damper bar motion ported from `fft_visualizer.cpp`, per-visualizer
and persisted); the **live map** gained bass/vocal/beat/bar/drop/pitch
blips, kick flash + shockwaves, beat pulse rings, connecting trails, colour
themes, grid styles, shapes and per-type on/off + colours; and **every one
of the 50 Visualize scenes now provably reacts to the music** — the Mesh
Gradient (and mesh-aurora / mesh-waves) got stronger bass/kick swell, blob
position/speed/hue driven by bands/centroid/level, plus a reactivity
control, and a smoke test draws each scene quiet vs loud and asserts the
frame changes with the audio. **Audit follow-up:** a static audit of all
50 scenes + 13 layers found the scenes the frame test can't see — ones
that pass while still mostly drifting on their own clock — so pattern /
dither / plasma / grad-aurora / neon-grid / dither-moire / tunnel /
radar / slices got their motion itself tied to the music (beat-driven
phase, level-driven speed, kick-stepped palettes), mesh-aurora's blobs
got a real radial falloff (both gradient stops were the same colour, so
they drew as hard discs), the depth look's heat map breathes with the
level and the photo zooms with the bass, and all 8 static effect layers
(scanlines, grain, glow, vignette, halftone, dither, gradient map,
chromatic aberration) plus CRT, geometric and pixel sort now read the
audio bundle — which also makes the live-code `scene:` line truthful
about them. **v0.2.5
is the fix-up build:** one shared audio engine (one track, one player — load
once from Play and it carries to every tab, never doubles up), a global theme
picker (Sky / Midnight / Sunset / Mono, applied app-wide from any tab and
persisted), Material Web stripped out and every control hand-rolled in raw
HTML/CSS, Play rebuilt as a faithful Mousiki port and Visualize as a faithful
Toaster port, every left panel scrolling with a visible scrollbar, and text
that fits its box at the 1360px default window. **v0.2.3** ports Toaster into
the Visualize tab — the tab is now a Toaster-style live-code stage: 13 scenes
(the 10 looks + ASCII / Mesh / Glitch) in a **scenes** menu, a live `scene:`
line in the code panel that IS the scene definition (scene + layer stack +
audio-reactive numbers, breathing with the kick/bass), syntax-highlighted live
code, a one-row Toaster bar across the top — and the whole app wears the
hand-coded HTML / TUI skin (Mousiki model: dense panels, box-drawing headers,
square corners, flat borders, Paper Mono everywhere, keyboard shortcuts
printed on screen with a clickable twin for each one).
v0.2.2 added the ASCII Magic-style style library with audio-reactive
modulation, the Gather depth family (FastDepth / Depth Anything V2, on-demand
models), the Mission Control tab, and pop-out panels for the live code editor
and the hex editor. v0.2.1 ports the real engines from
[Toaster](https://github.com/StopBanning/toaster) (live audio analysis:
beat/kick/bass/chords/key + live Strudel code generation) and
[Mousiki](https://github.com/itzender5820/mousiki) (FFT band math, LRCLIB
synced lyrics, keyboard queue) into Pulse Suite's own UI. See
[Attribution](#attribution) and `docs/port-notes.md` for the exact split of
what was ported, adapted, and left out.

## The tabs

| Tab | What it does |
| --- | --- |
| **▶ Play** | **Faithful Mousiki port (v0.2.4), with mouse support Mousiki itself doesn't have.** Mousiki's vertical layout, top to bottom: now-playing metadata → progress bar with clickable seek → search/filter bar → LIBRARY and QUEUE side by side → status line. The whole tab fits on screen without scrolling. Local media browser (open a folder, click a track to play it), queue/playlist building, real-time spectrum + waveform (Mousiki's mirrored bass-centre band math, **v0.2.7: Mousiki-style themes** — Mousiki / ASCII / VU / Neon / Matrix / Mono Line, with the real Mousiki spring-damper bar motion, per-visualizer and persisted), synced lyrics from a same-named `.lrc` file — or looked up on **LRCLIB** when the file is named `Artist - Title`. Mouse layer added on top of Mousiki's keyboard model: clickable queue rows, clickable seek bar, clickable transport buttons, mouse-wheel scrolling in the lists. **Mission Control lives here now (v0.2.6)** — scroll down past the player for the live map (kick/snare/hat/chord blips, **v0.2.7: + bass/vocal/beat/bar/drop/pitch blips, kick flash + shockwaves, beat pulse rings, connecting trails, colour themes, grid styles, shapes, per-type on/off + colours**), the pipeline x-ray (SOURCE → DECODE → FFT → DETECTION → LAYERS → OUTPUT), the stat tiles, and the live code + live hex panels, all fed by the same track. **Every module is editable (v0.2.6)**: click a module to open its editor (bands, colours, sensitivity…), right-click for a menu (edit / hide / reset layout) — Mousiki's per-element settings model, with a mouse instead of keys. **Every panel drags and resizes (v0.2.6, grip fixed + cross-zone in v0.2.7)**: grab the ⋮⋮ grip to move a panel, the corner grip to resize it — the corner grip now travels with the panel, and panels drag into other zones or free-float; the layout persists in `pulse-config.json` and survives restarts, with a reset-layout option in the module menu. **▶ LISTEN TO MY PC** is the hero here: system audio is first-class — press it and play anything on your PC (Spotify, YouTube, a game) with no track loaded; every visual, the ASCII cam, and the code panel follow the live mix. A `sys audio: LIVE` pill shows while it's listening. One shared audio engine: the track loaded here is THE track — Visualize, Glitch, ASCII, Cut, Cook and Mission Control all read from it, and play/pause/seek from any tab controls the same playback. |
| **Visualize** | **Toaster-model live-code stage (v0.2.3, bar reworked in v0.2.4).** A **scenes ▾** menu in the one-row Toaster bar holds **50 scenes (v0.2.6: 13 original + 37 new)** in five families — **PULSE**: Spectrum, Scope, **Orbit** (rebuilt as Oto's ORBIT — orbital rings of dots swelling with the spectrum, kick ripple, chord in the middle), Piano Roll (needs the matching `.mid` file), Fountain, **Pattern** (generative geometric riso-glyph motion), the Studio dashboard, **Geometric** (the spectrum re-rendered as triangles/circles/squares/lines, shape + density from a grouped preset dropdown with a Randomize button), **Dither** (procedural fields — Spiral, Tunnel, Smoke, Halftone, Starfield, Moiré, Caustics, Cellular — rendered as animated dither loops, audio-reactive), and **Depth** (the photo's depth map as a heat backdrop with the photo parallaxed live over it, near/far layers moving apart with the kick); **TOASTER**: **ASCII** (the spectrum re-drawn as live ASCII text — Halftone / ASCII / Braille / Game Boy / PICO-8, grid breathing with the bass, kick punching the density), **Mesh** (the mmeshy animated mesh gradient as the scene itself, blobs swelling with the bass, palette selectable, **v0.2.7: reactivity control + much stronger music response**), **Glitch** (spectrum + scope with live corrupt tiles and pixel-sort streaks driven by the kick/dynamics). **Studio quadrants swap on right-click (v0.2.7)** — pick any of the 50 scenes per slot, add/remove slots (1–8), or reset to the classic four; the picks persist. A **one-row Toaster bar** across the top — status tag, `source ▾`, `scenes ▾`, the track name, then layers / card / cam / ● rec / strudel ↗ / ⬇ PNG / present / ? — fits at 1360px with nothing clipped; the live BPM / key / chord / section sit in the code panel's status line instead, and the keyboard shortcuts live in the `?` dialog. A **LIVE CODE** panel writes what the engine hears as Strudel code, bar by bar — syntax-highlighted, with a **`scene:` line** that is the scene definition itself (`scene: orbit().mesh("aurora", .5).dither("bayer8", .62)…` — scene + layer stack + audio-reactive numbers that visibly move while the music plays). Copy it or open it in Strudel. **EFFECT LAYERS** (the Alembic Shader Lab model): a stackable layer system over the look — Mesh Gradient, Scanlines, CRT/VHS, Grain, Glow, Vignette, Corrupt Tiles, Geometric, Halftone, Pixel Sort, Dither, Gradient Map, Chromatic Aberration — add, reorder, toggle, tune each layer's parameters, pick a blend mode, save the stack as a preset; every enabled layer also appears as a chained call on the `scene:` line. The Mesh Gradient layer has draggable colour nodes on the canvas. **⬇ PNG** sits in the top bar next to the other action buttons; **F** switches to a sparse presentation mode (full-bleed canvas, one bottom strip). **Shift+F (v0.2.6) is true fullscreen for the visualization itself**, with panels draggable on top of it. The live-code panel's **Hide button (v0.2.6) collapses the whole box** now, not just its text. Record to WebM, snapshot to PNG. 4 themes. |
| **Glitch** | **Real byte-level corruption, not fake filters.** A hex editor over a *copy* of any file (your original is never touched) with format detection (PNG/JPEG/GIF/WAV/MP3/MP4/WebM/ZIP…), a structure note per format, and corruption ops — randomize, zero out, bit-shift, invert, byte-swap, repeat chunk — with intensity, a seed, and header protection so the file stays parseable. Snapshots with one-click restore, recipe export (JSON) so a glitch is reproducible. Plus a live preview with shader-style effects: pixel sort, corrupt tiles, scanlines, chromatic aberration, CRT/VHS, **dither**. **AUDIO CORRUPT**: while a track plays, every kick corrupts a small random range of the working copy, so the hex view changes live with the music. Double-click any byte to hand-edit it in place. |
| **ASCII** | Live ASCII video from your webcam or a video file, with Toaster-style camera looks grouped by family: ASCII & TEXT (character grid), LIGHT & COLOR (Thermal heat camera, Neon dots), PIXEL & BLOCKS (solid Blocks, Halftone print dots), PRINT & PAPER (Dither, Bayer ordered dither), GLITCH & SIGNAL (Vision — real motion-detection boxes, honestly labelled MOTION). The **character ramp is editable text** — the grid uses exactly the characters you type, darkest first. Adjustable resolution, color/invert, and an audio-reactive mode where density and glitch follow the music. Snapshot to PNG. **v0.2.2 style library** (the ASCII Magic model, rebuilt from scratch): 8 more styles — Pixel Art, Mosaic, Halftone/CMYK, Voxel/Cube, LEGO bricks, LED matrix, Braille matrix, error-diffusion Dither — with palettes (1-bit B&W, Game Boy, PICO-8, Commodore 64, risograph, custom), 7 dither algorithms (Floyd–Steinberg, Atkinson, Burkes, Stucki, Sierra, Sierra two-row, Sierra lite + Bayer 2/4/8), a stackable post-effects panel (Vignette, Scan Lines, CRT Curvature, Chromatic Aberration, Bloom, Character Bloom, Film Grain, Glitch, RGB Split, Blur, Halftone, Pixelate, Film Dust, Color Overlay), and **recipes** — one-click full looks, saveable and shareable as JSON. The audio twist ASCII Magic does *not* have: the beat/bass/dynamics modulate the style live — dither density pulses with the kick, the grid breathes with the bass. Export stills at 1×/2×/4×, or an animated **GIF loop** (3 s). |
| **Cut** | **BEAT-CUT — chop a folder of clips to the beat of the shared track.** Drop a folder of clips, Pulse finds the beats of the track loaded in Play and cuts the clips to them (the moviepy + librosa recipe, done live). Preview the cut in-app and export the timeline as JSON. Full render comes later. |
| **🍳 Cook** | **Big ▶ START COOKING button at the top (v0.2.4)** — the flow reads 1 pick photo → 2 pick song (the shared track from Play, already there) → 3 START COOKING → 4 export JPEG. Photo + song: load an image and play a track (or system audio) and the image **cooks cumulatively** on the music — the beat nudges pixels, the bass warps colours, the dynamics drive pixel sort / corrupt tiles / CRT / dither / **gradient map (duotone) / grain / halftone / geometric shapes / mesh tint / an ASCII-library style pass**, plus **v0.2.6 recipe effects: wave, mirror, chroma, swirl, slitscan, posterize, solarize, vignette**. The left modules panel scrolls (v0.2.6). **Warp + displacement fixed (v0.2.6)**: both now render from the source image every frame with the amount tied to the live music level, so they breathe with the song instead of blasting to 100% and pegging — and they relax back to the cooked base when the music stops. The final frame depends on the song — a different song gives a different result from the same photo. Numbered workflow accordions (01 Photo, 02 Song, 03 Recipe, 04 Export, **05 Depth**) show their live state in the header. **⬇ Download JPEG** states the exact size; snapshot any mid-cook frame; hold-to-compare and side-by-side before/after. **05 DEPTH** estimates a depth map from the photo (FastDepth, Depth Anything V2 Small fallback — downloaded on first use, see [Depth](#depth)) and uses it for audio-driven parallax sway, depth blur, and depth-sliced styling. |
| **🛰 Mission Control** | Everything at once: a **live map** where every detected audio event (kick, snare, hat, chord change) pops on as a labelled blip and fades, a **pipeline x-ray** (SOURCE → DECODE → FFT → BEAT/BASS/CHORD/KEY → EFFECT LAYERS → OUTPUT) with live values flowing through each stage, stat tiles (transport, source, look, system audio, layers, BPM, chord/key, FPS), the **live code** panel, and a **live hex** panel showing the working copy's bytes as they change (AUDIO CORRUPT on the Glitch tab makes it genuinely live). |

## Run it (dev)

```sh
npm install
npm start
```

Requires Node 20+ (developed on Node 24).

## Build the Windows exe

```sh
npm run dist:win   # portable exe in dist/ — no installer, just run it
```

The exe is unsigned, so Windows SmartScreen will ask on first run — click
**More info → Run anyway**. The packaged exe is ~110 MB and is distributed via
GitHub Releases, not in this repo (see `.gitignore`).

```sh
npm run dist:mac   # macOS .dmg — run this ON a Mac (Apple Silicon + Intel)
```

On a Mac the build needs Xcode Command Line Tools: `xcode-select --install`.
First launch of an unsigned build: right-click → Open, or run
`xattr -cr /Applications/Pulse\ Suite.app`.

## Use it

- **Open media** (Ctrl+O) or drag files onto the window: MP3, WAV, FLAC, OGG, M4A,
  AIFF, MP4, WebM, MOV, MKV, PNG, JPG, GIF. Audio/video go to the queue; images
  dropped on their own open in the Glitch tab.
- **Open MIDI** (Ctrl+M) or drag a `.mid` file in: the Piano Roll look draws the
  notes. If a MIDI file sits next to the track with the same name (`song.mp3` +
  `song.mid`), it attaches automatically. Same for `.lrc` lyrics files.
- **Tabs** (Ctrl+1…7): Play, Visualize, Glitch, ASCII, Cut, Cook, Mission Control.
- **Looks** (keys 1–9 and 0, on the Visualize tab): Spectrum, Scope, Orbit, Piano Roll,
  Fountain, Pattern, Studio, Geometric, Dither, Depth. The three TOASTER scenes
  (ASCII, Mesh, Glitch) are on the SCENES rail and the command palette (Ctrl+K).
- **Pop-out panels**: the live code editor (Ctrl+Shift+C) and the hex editor
  (Ctrl+Shift+H) each open in their own OS window — move them anywhere, put
  them on a second monitor. They stay live-synced both ways (hand edits in a
  popped-out hex editor apply to the working copy immediately; code changes
  apply to the running effects), and closing a popped-out window docks the
  panel back. Window positions survive restarts (saved in the app config).
  The six tabs stay docked — only the two extra panels pop out.
- **Command palette** (Ctrl+K): tabs, looks, listen, export, randomize, add layer.
- **Presentation mode** (F, on the Visualize tab): full-bleed canvas, one bottom
  strip, Esc exits.
- **Queue keys** (Play tab): ↑/↓ move, Enter plays, `n`/`b` next/previous, `p` or
  Space play/pause, `m` shuffle, `r` cycles repeat.
- **Record** (Ctrl+R): records the Visualize canvas + audio to a `.webm` video.
- **Snapshot** (Ctrl+S): saves the current tab's canvas (Visualize / ASCII / Glitch
  preview) as a PNG.
- **System Audio**: on Windows/macOS the Play tab can listen to your PC's loopback
  audio. On Linux there is no loopback source, so it says so instead of faking it.

## Look & feel (v0.2.4) — hand-coded HTML / TUI with a mouse

The whole app is hand-built in raw HTML/CSS now, chrome included — **Material
Web is gone (v0.2.4)**: no `md-*` elements anywhere, every tab, button, switch,
slider, select, dialog, menu and progress bar is a hand-rolled native control
(`.paper-btn`, `.paper-tab`, `.paper-switch`, `.paper-select`, `dialog.paper-dialog`,
`.paper-menu`) on theme CSS variables (`--app-bg`, `--app-accent`, …) — so
picking a theme in the global header picker recolors the whole app, every tab,
and the choice persists across restarts in `pulse-config.json`. Square corners,
flat 2px borders, no glass blur, no rounded pills, Paper Mono on every label.
The reference is [Mousiki](https://github.com/itzender5820/mousiki) and the
classic TUIs (btop, lazygit, k9s): dense panels, box-drawing section headers
(`┌─ SCENES`, `├─ PULSE ─┤`, `┌─ LIVE CODE`), a one-row Toaster bar across the
top of the Visualize stage, keyboard shortcuts printed on screen with a
clickable twin for each one. As raw as it can get while staying navigable with
a mouse — not a keyboard-only TUI. See `docs/design-system.md`. **Layout rule
(v0.2.4):** left to right, top to bottom — the primary action of every tab
sits top-left and the flow reads that way; nothing important is buried at the
bottom of a panel. Every scrollable panel scrolls with a visible thin
theme-coloured scrollbar; text wraps or truncates instead of spilling out.

## Glitch tab, in more detail

1. **Open file to corrupt** — Pulse copies it to your OS temp folder and works on
   the copy. The original is never written to.
2. The hex view shows 4 KB at a time (red bytes = changed vs. the original).
   Click/drag bytes to select a range, or **Corrupt whole file**.
3. Pick ops, set intensity and a seed, keep **Protect file header** on (it uses the
   format's real header size — e.g. 8 bytes for PNG, 44 for WAV — so the file
   usually still opens).
4. **Corrupt selection** applies the ops. Every apply is a snapshot; click one to
   restore it exactly (seeded RNG makes corruption deterministic).
5. **Export recipe** saves the ops + seed as JSON — same file + same recipe =
   same glitch, on any machine.
6. Preview an image/video copy live, stack the effect-lab toggles, then
   **Load corrupted copy in Play** to hear a glitched track, or **Export** it.

## Project layout

- `main.js` — Electron main process (window, menus, file dialogs, system-audio sources)
- `preload.js` — secure bridge: file IO, MIDI parsing, glitch-lab byte ops (seeded RNG, magic-byte format detection)
- `src/index.html`, `src/styles.css`, `src/app.js` — the whole suite (Web Audio analysis + canvas rendering, no framework)
- `src/analysis.js` — the live audio-analysis engine (Toaster port: beat/kick/bass/chords/key, timing hypotheses)
- `src/codegen.js` — live Strudel code generation (Toaster port)
- `src/audio-engine.js` — the single shared audio engine (v0.2.5 fix kept: play() awaits `audioCtx.resume()` and verifies the state is running; a blocked context shows a visible message and auto-recovers): one AudioContext, one source, one analyser; load/play/pause/seek/system-audio all go through it (Material Web was removed in 0.2.4 — there is no `src/material.js` any more)
- `src/ascii-styles.js` — the ASCII style library: palettes, dither algorithms, style renderers, post-effects stack, recipes
- `src/depth.js` — renderer side of depth estimation (model status/download/estimate, heuristic fallback, depth masks)
- `src/popout.html` + `src/popout.js` — the pop-out code-editor and hex-editor windows
- `LICENSES/` + `THIRD-PARTY-NOTICES.md` — the licenses of the projects the engines were ported from
- `docs/port-notes.md` — exactly what was ported from Toaster/Mousiki, what was adapted, and what was left out
- `docs/depth-notes.md` — the depth family: model sources, preprocessing, on-demand download, heuristic fallback
- `docs/ui-study.md` — the UI patterns taken from the five reference sites (geometric-art, mmeshy, Alembic Shader Lab, dithr, Gradient Lab) + the 7-site UI study, and what was deliberately not built
- `docs/github-inspiration.md` — notes mined from Austin's GitHub forks (awesome-tuis, rea, felhaven) that shaped the design
- `docs/design-system.md` — Material Design 3 references + the alpha decision

## Depth

The Depth family estimates a monocular depth map from a single photo and
uses it for audio-driven parallax, depth blur, and depth-sliced styling (Cook
step 05, the Visualize **Depth** look, and depth-sliced ASCII styles). The
technique and the model choices come from
**Gather · 聚 Lite** (https://gather.be-of-dao.com/) by DAO, which runs depth
models in the browser with ONNX Runtime Web.

- **FastDepth** (MIT, Diana Wofk et al.) is the main model; **Depth Anything V2
  Small** (Apache 2.0, HKU/TikTok, onnx-community conversion) is the fallback.
- The models are **not bundled** in the exe or the repo: they are downloaded
  on first use into the app's user-data folder (`<userData>/models/` —
  FastDepth ~1.7 MB from Gather's own deployment, Depth Anything V2 Small
  ~27 MB from HuggingFace) and cached for offline use afterwards.
- If no model is available, an **offline heuristic** (luminance + gradient)
  stands in — always labelled "heuristic", never presented as model output.
- Full detail: `docs/depth-notes.md`. Credits: see [Attribution](#attribution).

## Attribution

- **Toaster** by Colin — [MIT License](https://github.com/StopBanning/toaster/blob/main/LICENSE).
  The live analysis engine (beat/kick/bass/chords/key, timing hypotheses) and
  the live Strudel code generator were ported from Toaster's engine and
  re-implemented in `src/analysis.js` / `src/codegen.js`; system-audio
  listening and the camera-look ideas (neon dots, thermal, dither, vision)
  are adapted from it too. Full license text: `LICENSES/MIT-Toaster.txt`.
- **Mousiki** by itx.ender — [Apache License 2.0](https://github.com/itzender5820/mousiki/blob/main/LICENSE).
  The FFT band math (log-spaced mirrored bands), the lyrics chain (local
  `.lrc`, then LRCLIB), and the keyboard-driven queue model were ported
  from its architecture and re-implemented in JS. Full license text:
  `LICENSES/Apache-2.0-Mousiki.txt`.
- **Material Web** by Google — [Apache License 2.0](https://github.com/material-components/material-web/blob/main/LICENSE).
  The alpha chrome (tabs, buttons, sliders, switches, dialogs, menus, progress)
  was built with `@material/web` 2.5.0 components, imported tree-shaken via an
  import map. **Removed in 0.2.4** — all controls are now hand-rolled native
  HTML/CSS; no Material code ships in the app. See `docs/design-system.md`.
- **Gather · 聚** by DAO — the depth technique and model choices come from
  Gather Lite (https://gather.be-of-dao.com/). Credit per the site's request:
  "Gather · 聚 by DAO". FastDepth's ONNX file is fetched from Gather's own
  deployment (the HuggingFace mirrors host no model files).
- **FastDepth** by Diana Wofk, Joseph Kee, Jean-Jacques Slotine, V. Saligrama —
  [MIT License](https://github.com/dwofk/fast-depth/blob/master/LICENSE).
- **Depth Anything V2 Small** by Lihe Yang et al. (HKU / TikTok) —
  [Apache License 2.0](https://github.com/DepthAnything/Depth-Anything-V2/blob/main/LICENSE).
  ONNX conversion by onnx-community.
- **ONNX Runtime Web** by Microsoft — [MIT License](https://github.com/microsoft/onnxruntime/blob/main/LICENSE).
  Runs the depth models (Node build, in the main process). The runtime files
  are unpacked from the asar on install so Node can load them (see
  `package.json` `asarUnpack`).
- **gif.js** by Jake Archibald — [MIT License](https://github.com/jnordberg/gif.js/blob/master/LICENSE).
  Encodes the ASCII GIF loop export. Bundled in `src/assets/gif/`.
- **ASCII Magic** (https://www.ascii-magic.com/) — the style library's model:
  the style families, palettes, dither algorithms, post-effects stack, and
  recipes are Pulse Suite's own from-scratch implementation, inspired by
  ASCII Magic's feature list. The audio-reactive modulation on top is the
  suite's own twist — ASCII Magic does not do that.
- **Oto** — the visualizer that started it: https://otoinstrument.shop/en
- **Paper Mono** by Paper Design — the suite's typeface (paper.design/mono),
  licensed under the SIL Open Font License 1.1; bundled in `src/assets/fonts/`
  with its `OFL.txt`. Copyright 2025 The Paper-Mono.Git Project Authors.
  OpenType features enabled (verified against the font's GSUB table):
  `ss01` Duospace, `cv01` single-story 'a', `zero` slashed zero, `ss02`
  alternate M/W, `ss03` wider space, `ss04` alternate arrows.

The ported engines are adaptations, not verbatim copies — see
`docs/port-notes.md` for the exact split. Pulse Suite's own license is MIT —
see [LICENSE](LICENSE). Full third-party notices: [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

## Notes

- Google Drive delivery: the 0.1.0 portable exe was delivered via Drive; from 0.2.0
  the exe ships via GitHub Releases.
- Mac builds must be made on a Mac (`npm run dist:mac`); the NSIS installer is
  intentionally not used — the portable exe is the distribution format.
- **Smoke test**: `electron . --smoke-test` (under Xvfb on Linux) exercises every
  tab, the glitch lab, ASCII, the beat-cut preview, the native controls (no
  Material anywhere), the single shared audio engine (one context, one live
  source across tab switches, pause-from-anywhere, seek matches across tabs,
  double-load race), the global theme (follows to every tab, persists),
  panel scrolling, text overflow, the Mousiki Play fit (now with Mission
  Control merged in), the Cook hero button, the left-to-right pipeline,
  the Paper Mono feature proof, the analysis engine + codegen, the layer stack
  (mesh + scanlines + a preset, Geometric + Dither looks, command palette,
  presentation mode), the Cook recipes (incl. the v0.2.6 warp/displacement
  relax check), the ASCII style library (dither +
  Neon Voxel recipe, 2× still PNG + GIF loop exports), the depth family
  (FastDepth estimate + heuristic fallback + masks), Mission Control inside
  Play (blips, x-ray, tiles, live hex), the pop-out panels (0 → 1 → 2 → 0), the Toaster
  scenes (ASCII / Mesh / Glitch render, the `scene:` line is present and its
  numbers move while audio plays, the status bar lights up), the v0.2.6
  additions (hi-res analysis: 32/64 bands, centroid/flux/RMS, chroma,
  instrument heuristics, offline sections/loudness/chroma; the 37 new
  scenes; layout drag/hide persistence; module click/right-click editing;
  Visualize fullscreen; the live-code Hide fix), and the
  system-audio graceful failure — results land in
  `/tmp/pulse-smoke-results.json`. The test fixtures (120 BPM drum-pattern
  `tone.wav`, `gradient.png`, two test clips) live in `/tmp/pulse-test/`; if
  they are ever missing (e.g. after a VM `/tmp` wipe), regenerate them with
  `scripts/make-test-fixtures.sh` (needs node, python3 + PIL, ffmpeg).
- **Known gaps**: MP4 export is not feasible in-browser (loops export as WebM
  via Record, GIF via the ASCII exporter); the live BPM lock is approximate
  (±5% — the offline file analysis is exact and anchors the grid for loaded
  files, system audio uses the live lock; v0.2.6 adds sections, a loudness
  curve and a chroma timeline to the offline scan); the mmeshy mesh-gradient technique
  was rebuilt from scratch in 2D canvas because that repo has no LICENSE file
  — no code was reused; depth estimation runs once per photo, not per video
  frame; the first depth use needs a network connection to fetch the model(s).
