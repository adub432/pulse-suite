# GitHub inspiration for Pulse Suite v0.2
Mined 2026-11-11 from Austin's forks (adub432). Ideas + patterns only — respect each
repo's license; link, don't copy wholesale.

## 1. awesome-tuis (fork of rothgar/awesome-tuis) — TUI design patterns for the Play tab
Curated list of terminal UI apps. The **Multimedia** section (~60 apps) is the goldmine.

**Patterns to steal for the Play tab:**
- **Three-pane player layout** (cmus, kew, termusic, rmpc, waves): library/queue pane +
  now-playing pane + visualizer pane, all keyboard-driven (vim-style j/k navigation).
  Play tab should be keyboard-first even though it's a GUI: arrows/j/k move in the
  playlist, Space toggles, `[`/`]` seek.
- **Synced lyrics + live visualization in one view** (spotatui: Spotify client with
  synced lyrics and real-time audio visualization). Direct precedent for putting the
  LRC lyrics panel next to the spectrum, not hidden behind a toggle.
- **Spectrogram as an exportable view** (sgram-tui: calibrated spectrogram analyzer for
  live mic or audio files, with labeled PNG figure export + headless render mode).
  Pulse already snapshots PNGs; a spectrogram look would fit the Visualize tab.
- **Image-to-ANSI art** (chafa, timg, viu): chafa converts stills *and animated GIFs*
  to character art — so the ASCII tab should accept GIF/video frames, not just webcam.
- **Keyboard-driven pixel editing** (cmdpxl: command-line image editor) — precedent for
  keyboard ops in the Glitch hex editor (e.g. `r` randomize selection, `0` zero it).
- **Audio device picker** (wiremix, marstui-audio: TUI mixers like pavucontrol) — the
  System Audio source should be a selectable list (which loopback/device), not a
  single magic button.
- **Binary-analysis TUI** (binsider: TUI for analyzing Linux binaries, listed under
  Dashboards) — a hex + structure view in a terminal aesthetic is a proven pattern;
  supports the Glitch tab's "hex pane + structure pane" split.
- **TUI aesthetic (optional "Terminal" theme):** dense info, bordered panels, a status
  bar that always shows the keybindings, monospace type, mostly monochrome + one accent
  color. Cheap to add as a theme and very on-brand for Austin (Mousiki is a TUI).
- **btop++/bottom:** bar-graph meters in a terminal — spectrum rendering precedent.

## 2. rea (fork of morluto/rea, MIT) — the binary-analysis mindset for the Glitch tab
One MCP server + CLI for reverse engineering: native binaries (Hopper/Ghidra/IDA),
JS/Electron apps, .NET, APKs, firmware, EVM bytecode. Local analysis, Node 22+/24+.

**Concepts that upgrade the Glitch tab from "dumb hex editor" to "guided corruption":**
- **Evidence, not vibes.** REA returns every finding with its evidence and limitations.
  Glitch tab should do the same: before corrupting, *identify what the bytes are* —
  magic-byte file-type detection + a structure map (PNG chunks, JPEG markers, WAV
  header fields, MP3 frame headers). Clicking a field in the structure pane selects
  its bytes in the hex pane.
- **Format-aware safe zones.** REA's per-target layouts (ELF sections/segments, .NET
  metadata, APK manifest) map to per-format parsers in the Glitch tab: protect the PNG
  signature + IHDR by default, corrupt IDAT payload; protect WAV header, corrupt PCM
  data. This is the smarter version of a blanket "protect first N bytes."
- **Snapshots + comparisons.** REA's CLI has snapshots and run comparisons. Glitch tab:
  every Apply is a snapshot (seed + ops + changed-byte count) with undo to any
  snapshot, and a before/after hex diff count.
- **Reproducible recipes.** REA's DX-Ball showcase verifies a reconstruction against
  3,205 cases. Same spirit: export a corruption as a *recipe* (JSON: ops + ranges +
  seed) so the exact glitch can be re-applied to another file. Seeded RNG (already
  planned) is what makes this possible.
- **Safety model.** Static inspection reads files without running them; runtime capture
  is opt-in and described. Same for us: corruption happens only on a temp copy, the
  original is read-only — REA's framing validates the design.
- **Static JS/Electron analysis needs no native engine** — REA can analyze an Electron
  app's modules/IPC. Not needed for v0.2, but REA (`npx rea-agents`) could audit Pulse
  Suite itself later.

## 3. felhaven (Austin's own project, MIT) — structural reference for the whole suite
Local-first personal dashboard (Python/Tk) built on the Metis Toolbox. ~30 modules,
"Anti-Legion principle: one module, one job." No database, no server, no cloud.

**Architecture to mirror in Electron:**
- **Three shared infra pieces; modules know the infra, never each other.** Felhaven:
  Kairos (one clock/heartbeat), Pythia (the only tool registry), Harmonia (the one
  audio output device). Pulse Suite equivalent:
  - *Kairos* → the single rAF render heartbeat + a shared clock for beat time.
  - *Harmonia* → the single AudioContext/analyser — the one audio device. Every tab
    reads analysis from it; nothing else touches audio output.
  - *Registry* → a small shared media store (loaded track, playlist, temp glitch
    copies). Tabs read/write state only through this store, never directly.
- **Code layout:** app root (entry + shared infra + config), `tools/` (headless logic),
  `panels/` (display surfaces). Map to: `main.js`/`preload.js` = shared infra,
  `src/core/` = headless logic (hex corruption, beat detection, ASCII conversion),
  `src/tabs/` = one module per tab. Keeps the single `app.js` from becoming a monolith.
- **Split failure policy (the core design idea):** the heartbeat "may raise — the panel
  holds its last good state"; the tool registry "never raises — errors come back as
  data." Apply it: render loop errors → freeze on last good frame, never a blank
  crash; corruption/file ops return `{ ok, error }` result objects instead of throwing.
- **Local-first config:** playlists, presets, and settings as JSON files; UI order
  follows file order; adding a playlist is an edit, never a code change. Effect
  presets in the Glitch/ASCII tabs should be JSON files in userData for the same reason.
- **Graceful degradation everywhere:** locked vault / missing key / missing binary →
  placeholder or clean error, never a crash. Directly applies to: system-audio loopback
  unavailable on Linux → clean message; no webcam → ASCII tab placeholder.
- **Views + tabs within views:** sidebar picks the view; views like Moderati have seven
  tabs, Vox Array four. Our top tab bar already matches; a future settings view can
  follow the same pattern.
- **Auto-DJ (Awen):** picks the next song when one ends, from a hand-edited taste list
  (Euterpe) it reads but never writes to. Future Play-tab feature: DJ mode that
  advances the queue from a taste list without mutating it.
- **Log format is load-bearing:** Felhaven's `|`-delimited logs are parsed by another
  tool, so the format can't change unilaterally. If the suite ever logs corruption
  recipes or session history, freeze the format early.

## What NOT to take
- The local-LLM repos (Soup, airllm, colibri, heretic, opensmash) — not needed for the
  suite unless a dependency helps; ignored per brief.
- awesome-tuis license wasn't verified in this pass — treat it as a link list, don't
  copy text from it.

## Priority for v0.2 (cheapest, highest-value first)
1. Glitch tab: magic-byte detection + a minimal structure pane (PNG/JPEG/WAV/MP3) and
   format-aware protected header. (rea)
2. Glitch tab: snapshot history + recipe export (JSON ops + seed). (rea)
3. Play tab: three-pane layout + keyboard-first nav + lyrics beside spectrum. (awesome-tuis)
4. Suite-wide: result-object error handling + last-good-frame render policy. (felhaven)
5. Suite-wide: `src/core/` + `src/tabs/` split if app.js gets unwieldy. (felhaven)
6. Later: Terminal theme, spectrogram look, Auto-DJ mode, GIF input for ASCII.
