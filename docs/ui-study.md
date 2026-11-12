# UI study — patterns applied (0.2.1)

Two rounds of reference material from Austin, applied as **patterns only** —
no site's branding, logo, layout, code, or assets were copied. Everything
below was rebuilt from scratch in the suite's own Material 3 + Paper Mono UI.

## The five reference sites (Nov 12, 2026)

1. **geometric-art.com — "GEOMETRIC, Image + Motion Art Studio"**
   The live site is JS-driven; a text read returns only the title and
   "LOOK PRESET". Taken from the brief + the visible model: **the preset-pack
   model** — looks built from geometric primitives (lines, curves, triangles,
   squares, circles, rectangles) approximating an image. Implemented as:
   - the **Geometric look** in Visualize (spectrum re-rendered as shapes,
     shape + density from a grouped preset dropdown with plain-English
     descriptions, RANDOMIZE pairing)
   - the **Geometric layer** (post-effect: the frame re-drawn as shapes)
   - the **Geometric shapes** Cook recipe (the photo re-drawn as triangles)
   - Cook's **numbered workflow accordions (01–04)** whose headers show live
     state (photo name, song name, N effects on, cook level %) — the same
     "header shows state" idea as Geometric's numbered accordions.

2. **mmeshy.com — WebGL mesh-gradient editor by Isaiah Trotter**
   Repo: github.com/isaiahtrotter/meshy-gradient (static ES modules, no build
   step; `featured-gradients.json`; community gradients).
   **License check (Nov 12): the repo has NO LICENSE file** (root listing
   verified) — so **no code was reused**. The technique was rebuilt from
   scratch as a 2D-canvas mesh gradient (radial-gradient blobs, additive
   blending) instead of its WebGL shader. Taken:
   - **Mesh Gradient layer** (backdrop): animated colour blobs, palette
     presets (Aurora / Sunset / Ultraviolet / Candy / Mono), swirl + scale
     params that follow the beat and bass
   - **Draggable on-canvas colour nodes** (direct manipulation, mmeshy's
     signature): select a Mesh layer, flip "Drag colour nodes", drag the
     numbered handles on the canvas
   - **Mesh tint** Cook recipe (gradient wash that follows the bass)
   - The approachable tone for Cook mode.

3. **lab.alembic.space — Alembic Shader Lab (Basement Studio, May 2026)**
   "Like Photoshop but for shaders": 120+ stackable shader layers, start
   from a source, stack effects, export. OSS package
   @basementstudio/shader-lab. **This is the architectural model** for the
   suite's effects. Implemented as:
   - **The EFFECT LAYERS stack** in Visualize: add layers, reorder them
     (↑/↓), toggle, remove, tune each layer's parameters, save the stack as
     a preset (built-ins + localStorage + JSON-safe). 13 layer types:
     Mesh Gradient, Scanlines, CRT/VHS, Grain, Glow, Vignette, Corrupt
     Tiles, Geometric, Halftone, Pixel Sort, Dither, Gradient Map,
     Chromatic Aberration.
   - **Layer-add as a grid of icon+label tiles** (BROWSE/TEXT/SHAPE-style),
     not a long menu.
   - **Command palette (Ctrl+K)** as a primary entry point: tabs, looks,
     listen, export, randomize, add layer.
   - Empty state offering exactly one obvious action ("No layers — add one").

4. **dithr.app — Dithered Animation Studio**
   15 procedural fields (Caustics, Cellular, Halftone, Starfield, Moire,
   Smoke, Spiral, Tunnel…), 3 dither algorithms, node-based editor,
   GIF/Lottie/APNG exports, works on photos/video + ASCII style. Taken:
   - **The Dither look** in Visualize: 8 procedural fields (Spiral, Tunnel,
     Smoke, Halftone, Starfield, Moiré, Caustics, Cellular) rendered as
     animated dither loops, audio-reactive (field speed on the beat, Bayer
     threshold riding the bass), grouped preset dropdowns
     (Organic / Geometric / Retro) with a plain-English description per
     preset.
   - **Transport + frame counter** in the Visualize live strip
     (`FRAME 0123 · 0:07`).
   - Sliders paired with editable numeric boxes (applied app-wide).
   - GIF-loop export: **not built in this pass** — loops export as WebM via
     the existing Record path (Ctrl+R); stills export as PNG/JPEG. A real
     GIF encoder is a known gap, noted in the README.

5. **backgrounds.supply/gradient-lab — Gradient Lab**
   20+ live shader modes, real-time colour tuning, still PNG / animated
   MP4/WebM export, plus Image-to-Gradient, Grain Texture Generator,
   Halftone Gradient Generator, Gradient Map. Taken:
   - **Looks as pill chips** (the lookbar is now chips, not a text list).
   - **Blend-mode segmented control with plain-English explanations** —
     each layer has a blend select (Normal / Screen / Overlay / Multiply /
     Lighten) with a one-line explanation of what it does. Applies to draw
     layers; image layers replace the frame (the UI says so).
   - **Gradient Map / duotone recolor** as a Cook recipe and a layer
     (recolour through a gradient: Riso / Sunset / Thermal / Mono).
   - **Grain and halftone-gradient as post-effects** (Grain layer, Halftone
     layer, and matching Cook recipes).
   - **Export as the single prominent white pill** in the top bar
     (⬇ EXPORT PNG) and on Cook (⬇ Download JPEG · 320×240 JPEG).

## The UI study (browser-task inspection of all 7 live editors)

Cross-cutting patterns applied everywhere:
- Dark-first, canvas dominant.
- Presets/looks are the primary entry point (chips, grouped dropdowns),
  not raw parameters.
- Every slider paired with an editable numeric value.
- Export is a prominent top-level action that states format/size.
- Empty states offer ONE obvious action instead of a blank panel.

Per-site steals:
- **ASCII Magic** — style library grouped by family (ASCII & TEXT, PIXEL &
  BLOCKS, PRINT & PAPER, GLITCH & SIGNAL, LIGHT & COLOR) with the family in
  each option; character ramp exposed as editable text; right panel split
  into labelled sections (/SOURCE, /GRID, /STYLE, /POST FX). (Live
  thumbnails / favourites / search are not built — the style list is small
  enough without them.)
- **Gather** — ultra-sparse presentation mode for Visualize (F): full-bleed
  canvas, single bottom strip, tiny uppercase mono type, keyboard shortcuts
  printed inline (SPACE play · 1–9 looks · F exit). Plain-language slider
  descriptions ("How hard — how much the song cooks the photo").
- **Geometric** — numbered workflow accordions with live state in headers;
  LOOK PRESET dropdown + RANDOMIZE ALL pairing; export options stating
  exact specs (JPEG size on the Cook button, PNG on the Visualize pill).
- **mmeshy** — draggable on-canvas colour nodes; floating bottom tool
  palette replaced here by the floating glass layer panel over the canvas.
- **Alembic Shader Lab** — command palette (Ctrl+K); layer-add tile grid;
  empty state with exactly one action.
- **Dithr** — grouped preset dropdowns with plain-English descriptions;
  transport + frame counter centred in the top bar; sliders + numeric boxes.
- **Gradient Lab** — pill chips; blend-mode control with plain-English
  explanations; Export as the single prominent white pill; floating
  translucent glass panels over the full-bleed live canvas (look-options
  row, layer panel).

## What was deliberately NOT built

- No WebGL shader lab (the layer stack is 2D canvas — same model, cheaper).
- No GIF-loop encoder (WebM covers loops; GIF is a known gap).
- No community-preset server (presets are local: built-ins + localStorage).
- No live thumbnails for the style library (the list is small).
- No code, assets, or branding from any reference site — inspiration only.
  The one license that mattered (mmeshy — none found) is handled by writing
  the shader from scratch.
