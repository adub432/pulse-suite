# Port notes — Toaster + Mousiki → Pulse Suite 0.2.1

How the two engines were ported, what was adapted, and what was left out.
Sources were fetched from the public GitHub archives (codeload tarballs) on
2026-11-12: Toaster 0.5.6 (`StopBanning/toaster`, MIT) and Mousiki
(`itzender5820/mousiki`, Apache 2.0). No code was copied verbatim at scale;
the algorithms were re-implemented in Pulse Suite's architecture and the
UI is entirely Pulse Suite's own (Material 3 + Paper Mono).

## Toaster → src/analysis.js + src/codegen.js

Toaster's engine (`renderer/engine.js`, 3,212 lines) runs **three**
AnalyserNodes (fast/mid/slow FFT sizes), a 256-tick ring history, and a
fitted logistic kick detector. Pulse Suite has **one** AnalyserNode
(2048 FFT) and one shared render loop, so the port is adapted:

### Kept, algorithm-for-algorithm
- **Chord/key math**: overtone-weighted note templates (`OVERTONES`,
  `NOTE_TPL`, `CHORDS`), `bestChord` (with the bass-5th-overtone correction
  and the noise-floor subtraction), Krumhansl-Schmuckler profiles
  (`KK_MAJOR` / `KK_MINOR`), `keyFits` / `bestKey`, `chordModeEvidence`,
  `tonicOf`, `preferCurrentKey`. Verified offline: a C-major-ish chroma
  yields chord `C` and key `C:major`.
- **Onset detection**: `makeDetector` / `detectOnset` — adaptive threshold,
  robust median/MAD variant, refractory period, peak-relative floor.
- **Kick vs bass**: `lowPass` (RBJ biquad, 4-pole), `lowSlice`,
  `lowStrike` (first-15-ms jump vs the 40 ms before + pitch over 35 ms),
  `lowPitch` (autocorrelation pitch, 28–300 Hz), `bassYin` (YIN pitch).
  Rule kept from Toaster: a kick jumps hard (2–12×) or reads at the pitch
  floor (~30 Hz); a bass note barely jumps and starts at 45–60 Hz.
- **Timing hypotheses**: `timingHypotheses` — BPM + phase + downbeat scoring
  over recent kick/snare onsets and tonal frames (chord-change + section
  evidence). Runs every 2 s over a coarse sweep (70–180 BPM, step 2) until
  locked, then refines ±3 BPM.
- **Strudel codegen** (`src/codegen.js`, from Toaster's `codegen.js`):
  `stepParts` / `slotParts` / `beatRuns` / `bassParts` mini-notation,
  `calm()` (code lines change more calmly than the learned patterns),
  `strudelProgram` + `strudelLink` (base64 code in the strudel.cc `#`).
  Verified offline: a four-on-the-floor test state produces
  `kick: s("bd*4").bank("RolandTR909").duck("2:3")`,
  `bassline: note("<c3 g2 a2 f2>")`, `chords: chord("<C G Am F>")`.

### Adapted / simplified (honest deltas)
- **One analyser instead of three.** Band fluxes read from its dB data
  (level = clamp((dB + 100) / 70)); chroma from `pitchMap` over its bins.
- **The fitted KD logistic kick detector is NOT ported.** It was fit on
  48 kHz *mid-analyser* bins (4096 FFT, 11.7 Hz bins) that Pulse Suite
  doesn't have. Kicks come from the band-onset detector + the `lowStrike`
  jump/f0 test instead — Toaster's other kick path, which it kept alongside
  the KD detector.
- **Bar/voice learning is a 4-bar rolling count**, not Toaster's full
  machinery (relabelling, calm bars, per-voice hold bars, tape). A step is
  "on" when it holds ≥ half the busiest step's weight over the last 4 bars.
- **Closed/open hats** split by ring time (band still ringing 120 ms after
  the onset = open), not by a second detector.
- **No MediaPipe hand/face tracking, no WebGL, no XP takeover, no
  Spotify/Windows song metadata.** The "song" the code panel names is the
  loaded file (or "system audio").

### Camera looks (ASCII tab)
- **Neon dots**: a canvas-2D approximation of Toaster's `dotcam.js` WebGL
  dot matrix — violet→magenta→pink dots sized by luminance, swelling on
  the kick, palette sliding on each new chord, red/teal lens fringe.
  No glow/trail framebuffers (those need WebGL).
- **Thermal / dither**: the same ideas as Toaster's camera-window tints
  (two-colour mapping, Bayer ordered dither), implemented in 2D.
- **Vision**: motion detection by frame differencing with flood-filled
  bounding boxes labelled `MOTION nn%` — real detection, honestly labelled
  (no fake object names).

## Mousiki → Play tab + spectrum

Mousiki is C++17; nothing was ported literally. Its *architecture* was
re-implemented in JS:

- **FFT band math** (`src/fft_visualizer.cpp`): Hann window, kiss_fftr,
  log-spaced edges 30 Hz–12 kHz → 16 half-bands → mirrored to 32 (bass in
  the centre, treble to both edges), `dB = 10·log10(power) + 70` clamped
  0–70, smoothing attack 0.97 / release 0.93. Pulse Suite reads the same
  bands from the Web Audio analyser's dB data (0 dBFS = full scale) and
  renders the mirrored layout in the Spectrum look and the Play-tab mini
  spectrum.
- **Lyrics** (`src/lyrics_fetcher.cpp`): local `.lrc` first, then LRCLIB
  (`GET https://lrclib.net/api/get?track_name=&artist_name=&duration=`).
  Mousiki probes metadata with ffprobe; Pulse Suite parses
  `Artist - Title` from the filename instead (no ffprobe on the target PC).
- **Queue model**: playlist with shuffle / repeat (off/all/one), next/prev,
  keyboard navigation (↑/↓, Enter, n/b, p, m, r) — the TUI's keybindings
  adapted to the GUI.

## Looks rebuilt from Austin's saves/reels (inspiration only)

No assets, code, or branding from any of these were copied — the looks were
rebuilt from scratch in Pulse Suite's own canvas engine:

- **Oto ORBIT** (@milkoi124 reels): orbital rings of dots, radius swelling
  with spectrum bands, kick ripple — the Visualize tab's Orbit look.
- **Synkit Nexus**: Pixel Sort + Corrupt Tiles (Glitch effect lab).
- **GLAZE CRT** (@glassface): CRT/VHS — scanlines, chromatic aberration,
  tracking band, vignette, noise (Glitch effect lab).
- **Ditherboy / Script Slayer**: Bayer ordered dither (ASCII + Glitch).
- **Machine vision** (@criswvr "Synthetic Urban"): motion-detection boxes
  (ASCII Vision filter).
- **cnrd.art**: geometric riso-glyph motion patterns (Visualize Pattern look).
- **TouchDesigner audioreactive ASCII** (@null.mpeg): the ASCII tab's
  audio-reactive density/glitch.

## Paper Mono OpenType features (verified, not guessed)

The paper-mono repo README and `documentation/DESCRIPTION.en_us.html`
document **no** feature tags (the description is literally "To-Do"), so the
tags were read from the font file itself with fontTools (`GSUB` table,
`PaperMono[wght].ttf`):

| tag | what it does (from the GSUB substitutions + name table) |
|-----|----------------------------------------------------------|
| `ss01` | Duospace glyphs (font name ID 268: "Duospace glyphs"; 52 chained-contextual substitutions) |
| `cv01` | single-story 'a' (`a` → `a.cv01`, incl. accented a's) |
| `zero` | slashed zero (`zero` → `zero.zero`) |
| `ss02` | alternate M / W / m / w / AE / OE glyphs (16 glyphs) |
| `ss03` | wider space (`space` → `space.ss03`) |
| `ss04` | alternate arrows |

Enabled together in `src/styles.css` as
`font-feature-settings: "ss01" 1, "cv01" 1, "zero" 1, "ss02" 1, "ss03" 1, "ss04" 1;`.
The smoke test proves they render: it measures text width at 40 px with the
features on vs off (space and narrow-glyph widths must differ).

## v0.2.3 — Toaster's UI model → the Visualize tab (live-code stage)

0.2.1 ported Toaster's *engine*; 0.2.3 ports its *UI model*: the Visualize
tab is now a live-code stage, the way Toaster is — the scene is written out
as code the audio drives, and the code panel is the hero of the tab.

- **SCENES rail** (`src/index.html` `#lookbar`, `src/app.js` `SCENES`): the
  10 looks are scenes now, in a PULSE family, plus three TOASTER scenes —
  **ASCII** (the spectrum re-drawn as live ASCII text, Halftone/ASCII/Braille
  + Game Boy/PICO-8 palettes, grid breathing with the bass, kick punching the
  density), **Mesh** (the mmeshy animated mesh gradient as the scene itself,
  palette selectable), **Glitch** (spectrum + scope with live corrupt tiles
  and pixel-sort streaks on the kick/dynamics). All three are Pulse Suite's
  own renderers, built on the suite's existing effect families (ASCII style
  library, mesh gradient, corrupt tiles / pixel sort) — no Toaster UI code,
  branding, or artwork was copied.
- **The `scene:` line** (`src/codegen.js` `CG_LINE_IDS` + `out.scene`,
  `src/app.js` `sceneLine()`): the scene definition as live Strudel-style
  code — scene call + one chained call per enabled layer + audio-reactive
  numbers (dither density, depth, mesh swirl, ascii density) that breathe
  with the kick/bass/level at every 500 ms code tick. The renderers read the
  same state object the line is composed from, so the code on screen IS the
  scene definition — the same relationship Toaster's code panel has to its
  scenes. Honest limit: the line is a transcript, not an interpreter — hand
  edits in the pop-out code editor land in `state.customCode` (appended
  below the generated lines, as before), they don't re-parse into scene
  state.
- **Syntax highlighting** (`highlightCodeLine`): Visualize panel only —
  the `scene:` line hot pink, Strudel keywords sky, comments/muted lines dim.
  Mission Control + pop-out keep plain text. Code is HTML-escaped before
  highlighting; nothing from the audio engine reaches the DOM unescaped.
- **TUI status bar** (`#viz-status`): Mousiki model — transport, BPM/key/
  chord/section, scene, layers, frame across the top of the stage, with
  clickable `[SPACE] [F] [^K]` hints (the mouse twins of the keyboard
  shortcuts). The old `#viz-live` pill is gone; `updateVizLive()` fills the
  bar now.
- Keys 1–9, 0 still select the 10 PULSE scenes; the TOASTER scenes are on
  the rail + the command palette (Ctrl+K).

## v0.2.3 — hand-coded HTML / TUI skin (Mousiki + classic TUIs)

Austin's direction, testing 0.2.2: the app looked too basic / "AI vibe
coded". The fix is a skin, not a rewrite — `src/styles.css` v0.2.3 section:

- **Hand-coded HTML across the board** (chrome included): square corners,
  flat 2px borders, no glass blur, no rounded pills, Paper Mono on every
  label — including the Material components, re-skinned through their own
  tokens (`--md-*-container-shape: 0px`, `--md-*-label-text-font: Paper
  Mono`). Material Web is still the shell underneath (tabs, buttons,
  dialogs); it just doesn't look like it.
- **TUI with a mouse** (Mousiki model, verified against the public repo —
  "Highly customizable TUI music player… fast and lightweight", Apache 2.0;
  dense panels, spectrum/waveform/lyrics/queue at once, TAB cycles panels,
  configurable keys): dense panels, box-drawing section headers (`┌─ SCENES`,
  `├─ PULSE ─┤`, `┌─ LIVE CODE`), a status bar, keyboard shortcuts printed
  on screen with a clickable twin for each one. As raw as it can get while
  staying navigable with a mouse — NOT a keyboard-only TUI. The Play tab
  already mirrors Mousiki's three-pane layout (queue / stage / lyrics);
  0.2.3 extends the same grammar to the Visualize stage.
- The earlier "Material chrome / Paper effects" split is superseded by this:
  the hand-coded look is the app's identity everywhere.
- **Layout fixes found by screenshot + probe (1360 px default window):**
  the rail was centred (first chip above the fold) and too tall for 13
  chips; the tab bar / transport / viz-actions ran ~40 px past the right
  edge. Fixed by densifying the rail, `flex-start`, tighter brand/tab
  labels, and hiding the ⌘K button + sys-status under 1400 px. The smoke
  test's `layout` step now guards all four (tabbar / transport /
  viz-actions / rail) after `document.fonts.ready`.
- **Fix #4 — the "Present looks cut off" report was a contrast bug, not a
  clip:** a DOM probe in the demo window measured the viz-actions row
  fitting (Present 1289–1348) while the screenshot looked clipped. Pixel
  scans showed the outlined buttons are transparent, so where they hang
  over the light canvas margin (sky theme gradient at the stage edge) the
  light text washes out. The token fix does NOT work — Material Web 2.5's
  `md-outlined-button` hard-codes `--_container-color: none` and never
  reads `--md-outlined-button-container-color` (same for the
  `aria-pressed` toggle fills — Shuffle/Repeat, Cook split/depth-view —
  which therefore show only a label/outline colour change, no fill; a
  known gap carried forward). `Open MIDI` and `Present` are now native
  `.paper-btn` buttons with a solid dark container, matching the scene
  chips; verified by pixel scan (dark 1289–1346, sky margin only after
  the button edge).

## v0.2.4 — single shared audio engine

0.2.3 let a track play in several tabs at once at different positions: every
`play()` created a new BufferSource without stopping the old one, and
`loadAudioFile`/`loadVideoFile` were async, so two overlapping loads each
called `play()` and the first source kept sounding. The Cut preview video
also had native `controls` and was not muted in HTML, so its audio reached
the speakers alongside the track.

- **`src/audio-engine.js`** (new): `createAudioEngine(state, hooks)` owns
  everything audible. One AudioContext (analyser 2048 FFT + slow analyser
  8192 FFT, gain, mediaDest), one live source at a time. `play()` is
  idempotent (no-op if already playing with a live source); `loadAudio()` /
  `loadVideo()` are generation-guarded (a load-generation counter; synchronous
  `stopAll()` before any await; stale-check after each await) so a second
  load always kills the first. System audio goes through the same engine
  (gain 0 while listening, file playback stopped first). `debug()` returns
  `{ audioContexts, sourcesCreated, liveSources, playing, … }` for the smoke
  test.
- **Consumers read the shared analyser:** spectrum, BPM, onsets, live code,
  hex AUDIO CORRUPT, ASCII — all see the same audio, not their own copy.
  `state.source` / `state.playing` / `state.trackName` are the single source
  of truth; `app.js` keeps thin wrappers (`play`/`pause`/`togglePlay`/
  `seekTo`/`currentTime`/`loadAudioFile`/`loadVideoFile`/
  `startSystemAudio`/`stopSystemAudio`) that delegate to the engine.
- **Cook reads the shared track:** `cookSongName()` / `cookHasSong()` — Cook
  uses `state.trackName` unless it picked its own song; the smoke `cook`
  step fails unless the shared track shows up there.

## v0.2.4 — Play is Mousiki, Visualize is Toaster (UI-model ports)

Austin, testing 0.2.3: Play scrolled and wasn't Mousiki; Visualize was a
different app, not Toaster. Both tabs were rebuilt as faithful ports of the
real layouts (verified from the cloned repos, `/tmp/mousiki`
`itzender5820/mousiki`, Apache 2.0; `/tmp/toaster` `StopBanning/toaster`, MIT).

- **Play = Mousiki, vertical, no page scroll.** Mousiki's real frame, top to
  bottom: metadata panel (now playing) → progress panel → search bar →
  list | queue side by side 50/50 → status line; the frame is sized to the
  terminal height and `clamp_output_rows` guarantees it structurally cannot
  scroll. The port keeps that order (`#play-top` → `#play-progress` →
  `#play-search` → `#play-panels` LIBRARY | QUEUE | LYRICS → `#play-status`)
  and fits on screen without scrolling at 1360px (smoke `play-fits` step).
  Keybindings kept: `/` filter, `p`/Enter play-pause, `n`/`b` next/prev,
  arrows seek, `1`/`2` volume, `m` shuffle, `r` repeat, TAB cycles panels,
  `a` add to queue, `d` remove, `f` folder filter, `c` clear filter.
  **Mouse support is added on top — Mousiki is fully keyboard-driven**
  (zero mouse handling in its source; README says so; confirmed live by
  Austin): clickable queue rows, clickable seek bar, clickable transport
  buttons, mouse-wheel scrolling in the lists.
- **Visualize = Toaster, one-row bar + live code as the stage.** Toaster's
  real model: top bar = status tag, app name, source / scenes ▾ / blocks /
  card / cam / ● rec / strudel ↗ / mini / 9:16 / ?; main content IS the live
  code over a full-bleed visual canvas; scenes picked from the scenes menu.
  The port: `#viz-status.toaster-bar` (tag, appname, `source ▾`, `scenes ▾`,
  track, layers, card, cam, ● rec, strudel ↗, ⬇ PNG, present, `?`) — one
  row at 1360px, proven by the smoke `layout` step measuring every button
  inside the bar rect (v0.2.4 caught the first version clipping `present`
  and `?`: the bar had carried the live BPM/key/chord/section/scene/frame
  spans plus `[SPACE]`/`[F]`/`[^K]` hints, which overflowed it — those
  spans moved to the code panel's status line, which already showed
  BPM/key/section, and the hints moved to the `?` dialog). The scenes rail
  became a `scenes ▾` dropdown menu with the same 13 chips; the code panel
  moved to a left column over the canvas; the 0.2.3 status-bar key hints
  were removed with the spans.
- **Pipeline order:** Play → Visualize → Glitch → ASCII → Cut → Cook →
  Mission Control, all off the one shared track. Cut's tab now says in one
  line that it is the beat-cut tool (chop a folder of clips to the beat of
  the shared track). Cook's hero is a big ▶ START COOKING at the top of
  the tab (flow: 1 pick photo → 2 pick song (shared track) → 3 START
  COOKING → 4 export JPEG).
- **Standing layout rule (Austin, 0.2.4):** left to right, top to bottom —
  primary controls top-left, flow reads left → right, top → bottom, nothing
  important buried at the bottom of a panel. Applied everywhere, not just
  the tab order.
