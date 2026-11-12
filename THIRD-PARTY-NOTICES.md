# Third-Party Notices — Pulse Suite

Pulse Suite is original code (MIT, see `LICENSE`), but its audio-analysis
engine, live-code generator, lyrics lookup, and several looks are **adapted
from** the open-source projects below. No code was copied verbatim at scale
and no branding, names, or artwork from these projects carries over — the
engines were re-implemented in Pulse Suite's own architecture and re-skinned
in its Material 3 + Paper Mono UI. Full license texts live in `LICENSES/`.

## Toaster — MIT License (© 2026 Colin)

- Source: https://github.com/StopBanning/toaster (also runs at toaster.locust.lol)
- License: MIT — full text in `LICENSES/MIT-Toaster.txt`
- What was adapted (see `docs/port-notes.md` for the exact split):
  - the live audio-analysis engine: overtone-weighted chord templates,
    Krumhansl-Schmuckler key estimation, adaptive-threshold onset detection,
    kick-vs-bass discrimination (low-pass + autocorrelation pitch / YIN),
    timing hypotheses (BPM + phase + downbeat)
  - the live Strudel code generator (mini-notation lines, calm stabiliser,
    strudel.cc export link)
  - system-audio listening as a first-class input (desktopCapturer loopback)
  - the camera-look ideas: neon dot matrix, thermal, dither, motion-vision
  - **v0.2.3 — the Visualize tab's UI model**: Toaster's live-code-driven
    stage — the scene written out as live code the audio drives, the code
    panel as the hero of the tab. Pulse Suite's implementation is its own
    (the `scene:` line, the SCENES rail, the three new scenes, the syntax
    highlighting, the TUI status bar); no Toaster UI code, branding, or
    artwork was copied.
- What was NOT taken: Toaster's branding, name, artwork, XP takeover,
  hand/face tracking (MediaPipe), WebGL shaders, or its UI.

## Mousiki — Apache License 2.0 (© itx.ender)

- Source: https://github.com/itzender5820/mousiki
- License: Apache 2.0 — full text in `LICENSES/Apache-2.0-Mousiki.txt`
- What was adapted (see `docs/port-notes.md`):
  - the FFT band math: log-spaced edges 30 Hz–12 kHz into 16 half-bands,
    mirrored to 32 with the bass in the centre; dB = 10·log10(power) + 70;
    fast attack / fast release smoothing
  - the lyrics chain: local `.lrc` first, then LRCLIB
    (`https://lrclib.net/api/get`) for synced lyrics
  - the keyboard-driven queue model (shuffle / repeat / next / prev)
- What was NOT taken: any C++ code (Mousiki is a C++17 TUI; the port is a
  from-scratch JS re-implementation of its architecture), its TUI look, or
  its online-streaming sources.

## Paper Mono — SIL Open Font License 1.1

- Source: https://github.com/paper-design/paper-mono (paper.design/mono)
- License: OFL-1.1 — see `src/assets/fonts/OFL.txt`
- The suite's typeface. OpenType features enabled (verified against the
  font's GSUB table): `ss01` Duospace glyphs, `cv01` single-story 'a',
  `zero` slashed zero, `ss02` alternate M/W, `ss03` wider space,
  `ss04` alternate arrows.

## Gather · 聚 / FastDepth / Depth Anything V2 Small — MIT / Apache 2.0

- Technique and model choices: **Gather · 聚 Lite** by DAO —
  https://gather.be-of-dao.com/ — "Made something with Gather? It is yours to
  use in your own work. If you share it, please credit Gather · 聚 by DAO."
  FastDepth's ONNX file is fetched from Gather's own deployment
  (`depth/fastdepth.b64.txt`); the HuggingFace mirrors host no model files.
- **FastDepth** by Diana Wofk et al. — MIT License (see the model's repo,
  https://github.com/dwofk/fast-depth). Main depth model, 224×224 input.
- **Depth Anything V2 Small** by Lihe Yang et al. (HKU / TikTok) — Apache
  License 2.0 (https://github.com/DepthAnything/Depth-Anything-V2); ONNX
  conversion by onnx-community. Fallback model, 448 long side.
- The models are downloaded on first use into the app's user-data folder and
  are **not** bundled in the exe or the repo. If no model is available, an
  offline luminance heuristic stands in, always labelled "heuristic".
- See `docs/depth-notes.md` for the full detail.

## ONNX Runtime Web — MIT License

- Source: https://github.com/microsoft/onnxruntime
- License: MIT. Runs the depth models (Node build in the main process).

## gif.js — MIT License

- Source: https://github.com/jnordberg/gif.js
- License: MIT. Encodes the ASCII GIF loop export. Bundled in
  `src/assets/gif/` (MIT, same license).

## ASCII Magic — inspiration only

- Source: https://www.ascii-magic.com/
- The ASCII style library (families, palettes, dither algorithms, post-effects
  stack, recipes) is Pulse Suite's own from-scratch implementation, inspired
  by ASCII Magic's feature list. No code, assets, or branding was copied.
  The audio-reactive modulation on top is the suite's own twist.

- Source: https://github.com/material-components/material-web
- License: Apache 2.0 (see the package's own LICENSE in node_modules)
- Used for the Material 3 chrome (tabs, buttons, sliders, switches,
  dialogs, menus, progress) in the 0.2.x alpha. **Removed in 0.2.4** — no
  Material Web code ships in the app any more; all controls are hand-rolled
  native HTML/CSS.
