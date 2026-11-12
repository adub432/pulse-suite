# Design system reference — Material Design 3 (no decision yet)

Kept on file 2026-11-11. Nothing here is adopted yet; the plan under discussion is
to build our **own custom design system in the M3 language** (Paper Mono +
Material 3 tokens), not to adopt a component package.

## References

- **Official M3 spec:** https://m3.material.io/
  - Components: https://m3.material.io/components
  - Web dev docs: https://m3.material.io/develop/web
  - The language to borrow from: **tokens, color roles, shape, motion, M3 Expressive**.
- **Google's web package:** `@material/web` on npm —
  GitHub: https://github.com/material-components/material-web
  - ⚠️ **In maintenance mode since June 2024: stable but frozen, no M3 Expressive
    features.** Do NOT adopt it as a dependency without asking Austin first.
- **MDUI (mdui):** https://www.mdui.org/ — the alternative lightweight M3 component
  kit for vanilla JS, if we ever want pre-built components instead of hand-rolling
  ours. Also not adopted; a fallback option only.

## Direction (undecided, under discussion)

- Custom design system, M3 language: Paper Mono as the typeface (already adopted
  in v0.2 — see `src/assets/fonts/`), M3 color roles / shape / motion tokens
  layered onto the suite's existing dark UI.
- The suite is vanilla JS + canvas (no framework), so a hand-rolled token set
  (CSS custom properties) fits better than a component library.
- If pre-built components are ever wanted, evaluate MDUI first — not @material/web.

## Alpha decision (2026-11-11) — @material/web test

Austin decided to **test Google's Material Web package for the alpha**, despite the
maintenance-mode note above. `@material/web` ^2.5.0 is now a dependency.

- **What it covers:** the chrome only — tabs/navigation, filled/tonal buttons,
  sliders, switches, icon buttons, dialogs, menus, progress indicators.
  Imported tree-shaken in `src/material.js`; loaded via an import map in
  `src/index.html` (no bundler). The bare specifiers it needs (`lit`,
  `lit-html`, `lit-element`, `@lit/reactive-element`, `@lit/context`, `tslib`)
  are mapped there and shipped in the package (see `package.json` build.files).
- **Theming:** `--md-sys-color-*` dark tokens in `src/styles.css`, deep blue/violet
  seed (`--md-sys-color-primary: #a8c7fa`), tonal dark-blue surfaces, existing
  `#0b1020` background kept.
- **Typography split:** Paper Mono for code/terminal areas (hex editor, ASCII view,
  queue, lyrics, readouts, canvas labels); system sans for Material labels only
  (`--md-ref-typeface-plain`).
- **Design rule — raw code inside, Material outside:** the working surfaces
  (visualizer canvas, hex grid, ASCII grid, piano roll) stay raw and terminal-like;
  the surrounding chrome (tab bar, transport bar, buttons, sliders, panels,
  dialogs) is Material 3.
- **Evaluation notes (fill in after use):** which components feel wrong or are
  missing, whether the import-map approach survives packaging, whether to keep
  it or hand-roll later.

## What to pull from M3 when the system is built

- Color roles: primary / secondary / tertiary, surface + surface-container levels,
  on-* colors, outline — mapped onto the suite's dark theme.
- Shape tokens: corner radii per component scale (buttons, cards, dialogs).
- Motion: M3 easing + duration tokens for tab switches, panel transitions, and
  the visualizer's beat pulses.
- M3 Expressive: the newer, more playful M3 variant — worth a look for the Glitch /
  ASCII tabs, where the suite can afford to be louder.
- Type scale: M3's type roles, but set in Paper Mono (the suite's chosen face).

## v0.2.3 decision (2026-11-12) — hand-coded HTML / TUI skin, everywhere

Austin, testing 0.2.2: the general UI looked too basic and "AI vibe coded".
Direction, refined across the evening: **"TUI with mouse navigation"** — as
raw as it can get while still user-navigable, not a keyboard-only TUI.

- **Hand-coded HTML across the board** (supersedes the earlier "Material
  chrome / Paper effects" split): the whole app — chrome included — looks
  hand-built in raw HTML. Square corners, flat 2px borders, no glass blur,
  no rounded pills, Paper Mono on every label. Material Web stays as the
  shell underneath (tabs, buttons, dialogs, sliders) but is re-skinned
  through its own tokens so no generic Material polish is visible.
- **TUI references:** Mousiki (the Play tab's model — dense three-pane
  layout, spectrum/waveform, queue, lyrics, status bar, TAB cycles panels,
  configurable keys; Apache 2.0, https://github.com/itzender5820/mousiki)
  and the classic TUIs in Austin's awesome-tuis fork (btop/htop, lazygit,
  k9s, ncspot/cmus-style players): dense information, box-drawing borders,
  status bars, keyboard-first with mouse support, everything visible at
  once, no wasted space.
- **What that means in the code:** `src/styles.css` v0.2.3 section (tokens +
  square-corner/hard-border overrides + status bar + rail headers);
  `src/index.html` box-drawing headers (`┌─ SCENES`, `├─ PULSE ─┤`,
  `┌─ LIVE CODE`); `src/app.js` status-bar fill + clickable key hints.
  No framework change, no component swap — a skin over the existing shell,
  so the smoke test still passes unchanged in shape.

## v0.2.4 decision (2026-11-12) — Material Web removed, controls hand-rolled

Austin, testing 0.2.3: apps built on component libraries "all look the same".
The suite contains no React at all (Electron + vanilla JS only) — the generic
feel came from the Material Web chrome. Fix: **strip Material Web out and
hand-roll the controls in raw HTML/CSS**, matching the raw hand-coded
direction the 0.2.3 skin started.

- **Removed:** `@material/web`, `lit`, `lit-html`, `lit-element`, `@lit/*`,
  `tslib` from `package.json` (dependencies + `build.files`); `src/material.js`
  deleted; the import map in `src/index.html` deleted. Zero `md-*` tags in
  the HTML; zero `var(--md-*)` in the CSS.
- **Native replacements:** `.paper-tab` (tab buttons), `.paper-btn` (+ primary /
  text / icon / hot variants), `.paper-switch` (checkbox toggle), `.paper-check`,
  `.paper-select` (native `<select>`), `.paper-range` (native range),
  `dialog.paper-dialog` (native `<dialog>`, same `.show()`/`.close()` API),
  `.paper-menu` + `.paper-menu-item` (class-toggle, not `md-menu .open`),
  `progress.paper-progress` (native `<progress>`).
- **JS touchpoints converted:** `.selected` on switches → `.checked` on native
  checkboxes; `md-slider .value` → range `.value`; `md-outlined-select` →
  native select; `md-tabs activeTabIndex` → native tab buttons; the label
  click-forward handler for `md-switch, md-checkbox` is unnecessary with
  native inputs and was removed.
- **Themes are CSS variables now** (`:root` + `body[data-theme="midnight|
  sunset|mono"]` overrides: `--app-bg`, `--app-surface`, `--app-border`,
  `--app-text`, `--app-accent`, …). The theme picker lives in the global
  header, `applyTheme()` sets `body.dataset.theme` + persists to
  `pulse-config.json`, and the choice is applied on launch. Every hardcoded
  blue is replaced with a theme variable except brand art and semantic
  colours (recording red, success green).
- **Scrollbars + text:** all left panels are grid children with
  `min-height: 0` and `grid-template-rows: minmax(0, 1fr)` so `overflow-y:
  auto` actually scrolls; visible thin theme-coloured scrollbars on every
  scrollable pane; text wraps (`overflow-wrap: anywhere`) or truncates with
  ellipsis instead of spilling out.
