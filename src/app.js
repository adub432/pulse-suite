'use strict';
/* Pulse Suite v0.2.6 — all-in-one desktop media studio.
   Tabs share one audio engine (one AudioContext + analyser, like Felhaven's
   "Harmonia: the one audio output device") and one media store.
   Engines ported (adapted, not copied — see src/analysis.js, src/codegen.js,
   docs/port-notes.md and THIRD-PARTY-NOTICES.md):
     - Toaster (MIT): live audio analysis (beat/kick/bass/chords/key),
       live Strudel code generation, system-audio listening, ASCII camera
       looks (thermal, dither, neon dots, motion-vision) — v0.2.3 ports its
       UI model too: the Visualize tab is now a Toaster-style live-code
       stage, the scene written out as a `scene:` line the audio drives
     - Mousiki (Apache 2.0): log-spaced FFT band math (bass-centre mirrored
       spectrum), synced lyrics via LRCLIB, keyboard-driven queue
   Looks rebuilt from Austin's saves/reels (inspiration only, no assets):
   Oto ORBIT + piano roll, Synkit Nexus pixel sort / corrupt tiles,
   GLAZE CRT/VHS analog math, Ditherboy dither, machine-vision overlay,
   cnrd.art geometric patterns.
   Layer stack (Alembic Shader Lab model), mesh gradients (mmeshy model —
   shader written from scratch in 2D canvas; the mmeshy repo has no LICENSE
   file, so no code was reused), geometric presets (geometric-art model),
   dither fields (dithr model), gradient maps (Gradient Lab model) —
   see docs/ui-study.md.
   v0.2.2 adds: the ASCII Magic-style library (src/ascii-styles.js — dither
   algorithms, palettes, pixel/mosaic/halftone/voxel/LEGO/LED/braille styles,
   stackable post-FX, recipes, 4x stills + GIF export, audio-reactive
   modulation), the Gather depth family (src/depth.js + main-process ONNX:
   FastDepth primary, Depth Anything V2 Small fallback, on-demand download),
   the Mission Control tab (live map + pipeline x-ray + live code/hex), and
   pop-out panels for the code editor and hex editor (own OS windows, IPC
   live-synced, layout memory).
   v0.2.3 adds: the Toaster-model Visualize tab — 13 scenes in a SCENES rail
   (the 10 looks + ASCII / Mesh / Glitch scenes), a live `scene:` line in the
   code panel that IS the scene definition (scene + layers + audio-reactive
   numbers, breathing with the kick/bass), syntax-highlighted live code, and
   the hand-coded HTML skin across the whole app (chrome included): square
   corners, hard borders, brutalist shadows, Paper Mono everywhere, no
   generic Material polish visible.
   v0.2.6 adds: Mission Control folded INTO the Play tab (live map +
   pipeline x-ray + stat tiles + live code/hex, one tab); every panel
   draggable / resizable / editable with layout persisted in
   pulse-config.json; modules clickable + right-clickable to edit (Mousiki
   settings model: per-element on/off, colours, animation params);
   hi-res analysis (32/64 bands, centroid/flux/RMS, chroma, beat phase,
   offline full-file analysis, instrument heuristics); ~50 Visualize
   scenes; Visualize fullscreen + a Hide button that hides the whole live
   code box; Cook warp/displacement fixed to breathe from the source
   image, more recipe effects, scrolling modules panel. */

const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const ctx = canvas.getContext('2d');
/* Dithr pattern: every slider is paired with an editable numeric box, both
   ways in sync. The slider's own 'input' listeners keep working because the
   number box re-dispatches 'input' on the slider when edited. */
function pairSliderNum(sliderId, numId) {
  const s = $(sliderId), n = $(numId);
  if (!s || !n) return;
  s.addEventListener('input', () => { n.value = s.value; });
  n.addEventListener('change', () => {
    const v = Math.min(Number(s.max), Math.max(Number(s.min), Number(n.value) || Number(s.value)));
    s.value = v; n.value = v;
    s.dispatchEvent(new Event('input'));
  });
}

const THEMES = {
  sky: {
    bg: ['#8ec9f5', '#cfe9ff', '#fdf3d8'],
    bar: ['#2563eb', '#7c3aed', '#db2777'],
    accent: '#1d4ed8', text: '#16324f', dim: 'rgba(22,50,79,.55)',
    panel: 'rgba(255,255,255,.55)', grid: 'rgba(22,50,79,.14)', wave: '#1e40af'
  },
  midnight: {
    bg: ['#04060f', '#0b1020', '#101a3a'],
    bar: ['#22d3ee', '#818cf8', '#e879f9'],
    accent: '#7dd3fc', text: '#eef2ff', dim: 'rgba(238,242,255,.55)',
    panel: 'rgba(148,163,184,.08)', grid: 'rgba(148,163,184,.16)', wave: '#7dd3fc'
  },
  sunset: {
    bg: ['#2b0a3d', '#7c2d12', '#f59e0b'],
    bar: ['#fbbf24', '#fb7185', '#c084fc'],
    accent: '#fde68a', text: '#fff7ed', dim: 'rgba(255,247,237,.6)',
    panel: 'rgba(0,0,0,.22)', grid: 'rgba(255,247,237,.16)', wave: '#fde68a'
  },
  mono: {
    bg: ['#000000', '#111111', '#1c1c1c'],
    bar: ['#ffffff', '#a3a3a3', '#525252'],
    accent: '#ffffff', text: '#f5f5f5', dim: 'rgba(245,245,245,.55)',
    panel: 'rgba(255,255,255,.06)', grid: 'rgba(255,255,255,.14)', wave: '#ffffff'
  }
};

const state = {
  look: 'studio',
  theme: 'sky',
  audioCtx: null, analyser: null, analyserSlow: null, gain: null, mediaDest: null,
  source: null, mediaElSource: null, buffer: null, duration: 0,
  playing: false, startedAt: 0, offset: 0,
  trackName: '', trackPath: '', bpm: 0, barSeconds: 4, lastBeats: null,
  midi: null, midiName: '',
  beat: 0, prevEnergy: 0, smoothLow: 0, smoothMid: 0, smoothHigh: 0,
  particles: [], recording: null, recChunks: [], recStart: 0,
  playlist: [], playIndex: -1, shuffle: false, repeat: 'off',
  videoMode: false,
  sysAudio: false, sysStream: null, sysSource: null, sysStartedAt: 0,
  lyrics: [], lyricsActive: -1,
  geoShape: 'triangles', geoDensity: 1, ditherField: 'smoke',
  asciiSceneStyle: 'halftone', meshScenePalette: 'aurora', meshSceneReact: 1,
  // v0.2.7 item 2: Studio is no longer a fixed four — the user picks
  // which visualizers show and how many, by right-clicking a quadrant.
  // Persisted in pulse-config.json as cfg.studioSlots.
  studioSlots: ['scope', 'spectrum', 'roll', 'orbit'],
  studioRects: [], // last drawn slot rects, canvas coords (hit-testing)
  presenting: false, frameCount: 0, frameDt: 1 / 60,
  // v0.2.7 item 5: the Visualize spectrum/scope theme — its own bundle,
  // separate from the Play spectrum/waveform themes (persisted as
  // cfg.vizThemes.sceneViz). Default is the Mousiki preset (literal here
  // because the SPECTRUM_THEMES registry is declared further down).
  sceneVizTheme: { name: 'mousiki', style: 'blocks', colorMode: 'gradient', colorLeft: '#7dd3fc', colorRight: '#f472b6', fluidity: 10, degradation: 10, viscosity: 1 },
  customCode: '' // user Strudel lines from the (popped-out) code editor
};

// Console-error collector for the smoke test + alpha verification.
window.__errors = [];
window.addEventListener('error', (e) => window.__errors.push(String(e.message || e.error || e)));
window.addEventListener('unhandledrejection', (e) => window.__errors.push('unhandled: ' + String((e.reason && e.reason.message) || e.reason)));

// Inline SVG icons for the Material icon buttons (no icon font bundled).
const SVG_PLAY = '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const SVG_PAUSE = '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';

const freqData = new Uint8Array(2048); // v0.2.6: 4096-pt FFT -> 2048 bins
const freqDb = new Float32Array(2048);
const slowDb = new Float32Array(4096); // slow analyser (8192 FFT) — chroma only
const waveData = new Uint8Array(2048);
const timeFloat = new Float32Array(2048);
let analysis = null; // Toaster-engine port (src/analysis.js), one per AudioContext
const MOUSIKI_EDGES = [30.0, 36.2, 43.6, 52.6, 63.4, 76.5, 92.3, 111.3, 134.2, 161.8, 195.1, 235.3, 283.7, 342.1, 412.6, 497.6, 600.0, 723.5, 872.5, 1052.2, 1268.8, 1530.1, 1845.2, 2225.1, 2683.3, 3235.8, 3902.1, 4705.5, 5674.4, 6842.9, 8251.9, 9951.0, 12000.0]; // v0.2.6: 32 half-bands, log-spaced 30 Hz..12 kHz
const mousikiSmooth = new Float32Array(64); // v0.2.6: mirrored 32-band spectrum, bass in the centre
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const AUDIO_EXT = /\.(mp3|wav|flac|ogg|m4a|aiff?)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|mkv)$/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|bmp|webp)$/i;

let activeTab = 'play';

/* ---------- helpers ---------- */
function fmt(t) {
  if (!isFinite(t)) return '0:00';
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function kindOf(name) {
  if (AUDIO_EXT.test(name)) return 'audio';
  if (VIDEO_EXT.test(name)) return 'video';
  if (IMAGE_EXT.test(name)) return 'image';
  if (/\.(mid|midi)$/i.test(name)) return 'midi';
  if (/\.lrc$/i.test(name)) return 'lyrics';
  return null;
}
function bgGradient(w, h) {
  const t = THEMES[state.theme];
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, t.bg[0]); g.addColorStop(0.55, t.bg[1]); g.addColorStop(1, t.bg[2]);
  return g;
}
function barGradient(w, h) {
  const t = THEMES[state.theme];
  const g = ctx.createLinearGradient(0, h, 0, 0);
  g.addColorStop(0, t.bar[0]); g.addColorStop(0.55, t.bar[1]); g.addColorStop(1, t.bar[2]);
  return g;
}
function bandEnergy(loHz, hiHz) {
  const sr = state.audioCtx.sampleRate;
  const binHz = sr / 2 / freqData.length;
  const lo = Math.max(0, Math.floor(loHz / binHz));
  const hi = Math.min(freqData.length - 1, Math.ceil(hiHz / binHz));
  let sum = 0;
  for (let i = lo; i <= hi; i++) sum += freqData[i];
  return sum / Math.max(1, hi - lo + 1) / 255;
}
/* Mousiki's FFT band math (ported from src/fft_visualizer.cpp, Apache 2.0):
   log-spaced edges 30 Hz–12 kHz into 32 half-bands (v0.2.6: was 16),
   mirrored to 64 so the bass sits in the CENTER and treble falls off
   toward both edges; dB = 10*log10(power) + 70, clamped 0..70; fast
   attack (0.97) / fast release (0.93) smoothing. Reads the analyser's
   dB data (0 dBFS = full scale) — now from the 4096-pt FFT's 2048 bins. */
function mousikiBands() {
  // No audio yet (Play tab renders before any track loads): return silence
  // instead of throwing — an exception here kills the shared render loop.
  if (!state.audioCtx) return mousikiSmooth;
  const sr = state.audioCtx.sampleRate;
  const hzPerBin = sr / 2 / freqDb.length;
  const right = new Float32Array(32);
  for (let b = 0; b < 32; b++) {
    const lo = Math.max(1, Math.floor(MOUSIKI_EDGES[b] / hzPerBin));
    const hi = Math.max(lo + 1, Math.min(freqDb.length - 1, Math.floor(MOUSIKI_EDGES[b + 1] / hzPerBin)));
    let e = 0;
    for (let k = lo; k < hi; k++) e += Math.pow(10, freqDb[k] / 10);
    e /= (hi - lo);
    const db = 10 * Math.log10(e + 1e-12) + 70;
    right[b] = Math.min(70, Math.max(0, db)) / 70;
  }
  for (let i = 0; i < 32; i++) {
    const full = [right[31 - i], right[i]];
    for (let j = 0; j < 2; j++) {
      const idx = i * 2 + j, v = full[j];
      const a = v > mousikiSmooth[idx] ? 0.97 : 0.93;
      mousikiSmooth[idx] = mousikiSmooth[idx] * (1 - a) + v * a;
    }
  }
  return mousikiSmooth;
}
/* System audio is first-class: hero state, LIVE pill, empty-state copy. */
function updateSysAudioUI() {
  const listening = !!state.sysAudio;
  const live = $('sysaudio-live');
  const empty = $('sysaudio-empty');
  live.hidden = !listening;
  empty.style.display = (!listening && !state.buffer && !state.videoMode) ? '' : 'none';
  $('sysaudio-status').textContent = listening ? 'sys audio: LIVE' : 'sys audio: off';
  $('sysaudio-status').classList.toggle('on', listening);
  $('sysaudio-status').title = 'Listens to whatever is playing on your PC (like Toaster)';
  $('sysaudio-msg').textContent = listening
    ? 'Listening to system audio — play anything on your PC.'
    : 'System audio: ' + (state.sysAudioErr || 'press LISTEN TO MY PC');
}
function resetAnalysis(hint) {
  if (analysis) {
    analysis.reset(); analysis.setHint(hint || 0);
    // v0.2.6: the full-file offline pass anchors the live lock (exact BPM,
    // beat grid, sections) — system audio has no offline pass (null).
    if (state.lastBeats) analysis.setOffline(state.lastBeats);
    analysis.lockHint();
  }
  cgReset();
  mousikiSmooth.fill(0);
}
function currentTime() {
  if (state.sysAudio) return state.audioCtx ? Math.max(0, state.audioCtx.currentTime - state.sysStartedAt) : 0;
  if (state.videoMode) { const v = $('play-video'); return v ? v.currentTime : 0; }
  if (!state.buffer) return 0;
  if (state.playing) return Math.min(state.duration, state.offset + (state.audioCtx.currentTime - state.startedAt));
  return state.offset;
}
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ---------- canvas sizing ---------- */
function resize() {
  if (!canvas.clientWidth) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(canvas.clientWidth * dpr);
  canvas.height = Math.floor(canvas.clientHeight * dpr);
}
window.addEventListener('resize', resize);
resize();

/* ---------- the one shared audio engine (v0.2.5) ----------
   src/audio-engine.js owns the transport: one AudioContext, one analyser
   chain, one audible source at a time. These wrappers keep the old call
   sites working — every tab calls play()/pause()/seekTo()/currentTime()
   and they all drive the same engine, so a track loaded in Play carries
   to every tab and can never double up. */
const engine = createAudioEngine(state, {
  detectBeats,
  resetAnalysis,
  updateSysAudioUI,
  onContextReady: () => { analysis = createAnalysis(state.audioCtx.sampleRate); },
  onPlayState: (playing) => {
    $('btn-play').innerHTML = playing ? SVG_PAUSE : SVG_PLAY;
    // v0.2.7 item 3: the glitch starts by itself when music starts —
    // no more sitting idle until the user finds the Glitch tab.
    if (playing) maybeAutoGlitch();
  },
  // v0.2.5: the engine never fails silently any more — blocked audio and
  // failed loads both say so in the player status line.
  onAudioBlocked: (message) => { $('play-status-text').textContent = '⚠ ' + message; },
  onAudioUnblocked: () => {
    if (state.trackName) $('play-status-text').textContent = `${state.playing ? '▶' : '❚❚'} ${state.trackName} — ${fmt(state.duration)}${state.bpm ? ` · ~${state.bpm} BPM` : ''}`;
  },
  onLoadError: (name, reason) => { $('play-status-text').textContent = `✕ Couldn't load "${name}" — ${reason}`; },
  onSeek: (t) => {
    if (state.duration) $('seek').value = Math.floor(1000 * t / state.duration);
    $('time-current').textContent = fmt(t);
  },
  onTrackLoaded: async ({ kind, name, path }) => {
    if (kind === 'audio') {
      $('np-title').textContent = name;
      $('np-meta').textContent = `${fmt(state.duration)} · ${state.buffer.numberOfChannels === 2 ? 'stereo' : 'mono'} · ${Math.round(state.buffer.sampleRate / 1000)} kHz${state.bpm ? ` · ~${state.bpm} BPM` : ''}`;
      $('track-name').textContent = name;
      $('bpm').textContent = state.bpm ? `~${state.bpm} BPM` : '';
      $('play-bpm').textContent = state.bpm ? `~${state.bpm} BPM` : '';
    } else {
      const v = $('play-video');
      $('np-title').textContent = name;
      $('np-meta').textContent = `${fmt(state.duration)} · video · ${v.videoWidth}×${v.videoHeight}`;
      $('track-name').textContent = name;
      $('bpm').textContent = '';
      $('play-bpm').textContent = '';
    }
    $('time-total').textContent = fmt(state.duration);
    $('play-time-total').textContent = fmt(state.duration);
    $('btn-play').disabled = false; $('seek').disabled = false;
    $('empty').classList.add('hidden');
    $('play-status-text').textContent = `${state.playing ? '▶' : '❚❚'} ${name} — ${fmt(state.duration)}${state.bpm ? ` · ~${state.bpm} BPM` : ''}`;
    loadLyricsFor(path);
    // v0.2.7 item 3: get the glitch working copy ready at load time so
    // the first kick after pressing play already corrupts bytes.
    maybeAutoGlitchLoad();
    if (kind === 'audio') {
      const midiPath = await window.pulse.findSiblingMidi(path).catch(() => null);
      if (midiPath) await loadMidiFile(midiPath.path, midiPath.name, true);
    }
    renderPlaylist();
  },
  onTrackChanged: () => { stopCutPreviewVisual(); },
  onEnded: () => { $('seek').value = 0; $('time-current').textContent = '0:00'; nextTrack(true); },
  onSysAudioStarted: (src) => {
    $('btn-stop-sysaudio').disabled = false; $('btn-sysaudio').disabled = true;
    $('btn-play').disabled = false; $('seek').disabled = true;
    $('np-title').textContent = 'System audio — ' + (src.name || 'screen');
    $('np-meta').textContent = 'Listening to whatever is playing on your PC. Visuals follow the live mix.';
    $('track-name').textContent = 'System audio';
    $('bpm').textContent = ''; $('play-bpm').textContent = '';
    $('play-status-text').textContent = '● Listening to system audio — whatever plays on your PC.';
  },
  onSysAudioStopped: () => {
    $('btn-stop-sysaudio').disabled = true; $('btn-sysaudio').disabled = false;
  }
});
window.__pulseAudio = engine; // smoke-test handle: engine.debug()
function play() { engine.play(); }
function pause() { engine.pause(); }
function togglePlay() { engine.toggle(); }
/* v0.2.5: wake the AudioContext synchronously inside the user gesture
   that starts a load — before any await. By the end of the load chain
   (read + decode + lyrics lookup) the gesture activation has expired,
   so a resume() issued only at the tail silently fails and the context
   stays suspended (the 0.2.4 bug). Call this first in pickMedia, the
   drop handler, playAt and the Cut track picker. */
function wakeAudio() {
  engine.ensureCtx();
  if (state.audioCtx) {
    try { const p = state.audioCtx.resume(); if (p && p.catch) p.catch(() => {}); } catch (_) {}
  }
}
function seekTo(t) { engine.seekTo(t); }
function currentTime() { return engine.currentTime(); }
function startSystemAudio() { return engine.startSystemAudio(); }
function stopSystemAudio(silent) { engine.stopSystemAudio(silent); }
async function loadAudioFile(filePath, name) { return engine.loadAudio(filePath, name); }
async function loadVideoFile(filePath, name) { return engine.loadVideo(filePath, name); }

/* ---------- beat detection (onset intervals; also feeds the Cut tab) ---------- */
function detectBeats(buf) {
  try {
    const ch = buf.getChannelData(0);
    const hop = 512, win = 1024;
    const energies = [];
    for (let i = 0; i + win < ch.length; i += hop) {
      let e = 0;
      for (let j = 0; j < win; j += 4) { const v = ch[i + j]; e += v * v; }
      energies.push(e / (win / 4));
    }
    const onsets = [];
    // Relative thresholds: absolute ones fail on quiet tracks. Peak-normalize,
    // then keep only the first onset of each burst (150 ms refractory).
    const peak = Math.max(...energies, 0);
    for (let i = 1; i < energies.length; i++) {
      const d = energies[i] - energies[i - 1];
      if (d > 0.08 * peak && energies[i] > 0.1 * peak) {
        const t = i * hop / buf.sampleRate;
        if (!onsets.length || t - onsets[onsets.length - 1] > 0.15) onsets.push(t);
      }
    }
    const gaps = [];
    for (let i = 1; i < onsets.length; i++) {
      const g = onsets[i] - onsets[i - 1];
      if (g > 0.25 && g < 1.2) gaps.push(g);
    }
    let bpm = 0;
    if (gaps.length) {
      gaps.sort((a, b) => a - b);
      const med = gaps[Math.floor(gaps.length / 2)];
      const b = Math.round(60 / med);
      if (b >= 60 && b <= 200) bpm = b;
    }
    const beatTimes = [];
    if (bpm && onsets.length) {
      const spb = 60 / bpm;
      let t = onsets[0];
      while (t < buf.duration) { beatTimes.push(t); t += spb; }
    }
    // --- v0.2.6: full-file offline extras (loaded files only — system
    // audio has no file to scan, so it gets none of this) ---
    // Loudness curve: RMS per 0.5 s, peak-normalised.
    const loudness = [];
    {
      const step = Math.floor(buf.sampleRate * 0.5);
      let peak = 0;
      const vals = [];
      for (let s = 0; s + step <= ch.length; s += step) {
        let e = 0;
        for (let j = 0; j < step; j += 4) { const v = ch[s + j]; e += v * v; }
        const r = Math.sqrt(e / (step / 4));
        vals.push(r); if (r > peak) peak = r;
      }
      for (let i = 0; i < vals.length; i++) loudness.push({ t: +(i * 0.5).toFixed(2), v: peak ? +(vals[i] / peak).toFixed(3) : 0 });
    }
    // Sections: per-beat energy against the file mean — drop / groove /
    // breakdown — merged into runs of at least 4 beats.
    const sections = [];
    if (bpm && beatTimes.length >= 8) {
      const spb = 60 / bpm;
      const meanE = energies.reduce((a, b) => a + b, 0) / Math.max(1, energies.length);
      const hopSec = hop / buf.sampleRate;
      const beatE = beatTimes.map((bt) => {
        const i0 = Math.floor(bt / hopSec), i1 = Math.min(energies.length, Math.floor((bt + spb) / hopSec));
        let s = 0, n = 0;
        for (let i = i0; i < i1; i++) { s += energies[i]; n++; }
        return n ? s / n : 0;
      });
      let cur = null;
      for (let i = 0; i < beatE.length; i++) {
        const r = beatE[i] / Math.max(1e-12, meanE);
        const type = r > 1.25 ? 'drop' : r < 0.6 ? 'breakdown' : 'groove';
        if (!cur || cur.type !== type) { if (cur) sections.push(cur); cur = { start: +beatTimes[i].toFixed(2), end: +beatTimes[i].toFixed(2), type }; }
        cur.end = +(beatTimes[i] + spb).toFixed(2);
      }
      if (cur) sections.push(cur);
      for (let i = sections.length - 1; i >= 0; i--) {
        const beats = (sections[i].end - sections[i].start) / spb;
        if (beats < 4 && sections.length > 1) {
          if (i > 0) { sections[i - 1].end = sections[i].end; sections.splice(i, 1); }
          else { sections[1].start = sections[0].start; sections.splice(0, 1); }
        }
      }
    }
    // Chroma timeline: 2048-pt FFT per 0.5 s window, bins mapped to the
    // 12 pitch classes (MIDI 36..95), normalised per window.
    const chromaTimeline = [];
    {
      const N = 2048, step = Math.floor(buf.sampleRate * 0.5);
      const re = new Float64Array(N), im = new Float64Array(N);
      for (let s = 0; s + N <= ch.length; s += step) {
        for (let k = 0; k < N; k++) {
          const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * k / (N - 1)); // Hann
          re[k] = ch[s + k] * w; im[k] = 0;
        }
        fft2048(re, im);
        const c = new Float64Array(12);
        for (let k = 2; k < N / 2; k++) {
          const f = k * buf.sampleRate / N;
          if (f < 55 || f > 4000) continue;
          const m = 69 + 12 * Math.log2(f / 440);
          const r = Math.round(m);
          const wgt = Math.cos(Math.PI * (m - r)) ** 2;
          if (wgt < 0.05) continue;
          const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
          c[((r % 12) + 12) % 12] += mag * wgt;
        }
        let sum = 0; for (let i = 0; i < 12; i++) sum += c[i];
        chromaTimeline.push({ t: +(s / buf.sampleRate).toFixed(2), c: Array.from(c, (v) => sum > 0 ? +(v / sum).toFixed(3) : 0) });
      }
    }
    return { bpm, onsets, beatTimes, sections, loudness, chromaTimeline };
  } catch (_) { return { bpm: 0, onsets: [], beatTimes: [], sections: [], loudness: [], chromaTimeline: [] }; }
}
/* Small iterative radix-2 FFT (2048 points) for the offline chroma
   timeline — the live engine's chroma comes from the analyser, but a
   loaded file gets a full-file chroma timeline from the PCM. */
function fft2048(re, im) {
  const n = 2048;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const tr = re[i]; re[i] = re[j]; re[j] = tr; const ti = im[i]; im[i] = im[j]; im[j] = ti; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cwr = 1, cwi = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cwr - im[i + k + len / 2] * cwi;
        const vi = re[i + k + len / 2] * cwi + im[i + k + len / 2] * cwr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const nwr = cwr * wr - cwi * wi; cwi = cwr * wi + cwi * wr; cwr = nwr;
      }
    }
  }
}
function estimateBpm(buf) { return detectBeats(buf).bpm; }

/* ---------- playlist (Mousiki-style queue: add, shuffle, repeat, next/prev) ---------- */
function addToPlaylist(files, autoplay) {
  let added = 0;
  for (const f of files) {
    const k = kindOf(f.name);
    if ((k === 'audio' || k === 'video') && !state.playlist.some((p) => p.path === f.path)) {
      state.playlist.push({ path: f.path, name: f.name, kind: k });
      added++;
    }
  }
  renderPlaylist();
  if (added && autoplay) playAt(state.playlist.length - added);
  return added;
}
function renderPlaylist() {
  const ol = $('playlist');
  const q = (library.filter || '').toLowerCase();
  ol.innerHTML = state.playlist.map((p, i) =>
    (q && !p.name.toLowerCase().includes(q)) ? '' :
    `<li data-i="${i}" class="${i === state.playIndex ? 'playing' : ''}">${escapeHtml(p.name)}<span class="dur">${p.kind}</span></li>`).join('');
  $('queue-count').textContent = state.playlist.length ? `(${state.playlist.length})` : '';
}
async function playAt(i) {
  wakeAudio(); // v0.2.5: resume inside the click gesture, before the awaits
  if (i < 0 || i >= state.playlist.length) return;
  state.playIndex = i;
  const item = state.playlist[i];
  if (item.kind === 'video') await loadVideoFile(item.path, item.name);
  else await loadAudioFile(item.path, item.name);
  renderPlaylist();
}
function nextTrack(auto) {
  if (!state.playlist.length) return;
  if (auto && state.repeat === 'one') { playAt(state.playIndex); return; }
  if (auto && !state.shuffle && state.repeat !== 'all' && state.playIndex === state.playlist.length - 1) {
    state.offset = 0; return; // end of queue, repeat off
  }
  let i = state.playIndex;
  if (state.shuffle && state.playlist.length > 1) {
    let j; do { j = Math.floor(Math.random() * state.playlist.length); } while (j === i);
    i = j;
  } else {
    i = (i + 1) % state.playlist.length;
  }
  playAt(i);
}
function prevTrack() {
  const prev = Math.max(0, state.playIndex - 1);
  if (state.playlist.length) playAt(prev);
}

/* ---------- Play tab: LIBRARY — Mousiki's local media browser ----------
   Mousiki's library is the local track list ( / filters, f filters by
   folder, a adds to queue, Enter plays). This port adds the mouse:
   click a row to play it, wheel-scroll the list. The last folder
   persists in pulse-config.json and is restored on launch. */
const library = { dir: '', files: [], filter: '', selected: -1 };
async function libraryBrowse(dir) {
  const d = dir || await window.pulse.openDirectory();
  if (!d) return;
  const files = await window.pulse.listDir(d);
  library.dir = d;
  library.files = files.filter((f) => kindOf(f.name) === 'audio' || kindOf(f.name) === 'video');
  $('library-path').textContent = d;
  $('library-count').textContent = `(${library.files.length})`;
  renderLibrary();
  window.pulse.setConfig({ libraryDir: d }).catch(() => {});
}
function renderLibrary() {
  const q = (library.filter || '').toLowerCase();
  const list = library.files.filter((f) => !q || f.name.toLowerCase().includes(q));
  $('library-list').innerHTML = list.map((f) =>
    `<li data-path="${escapeHtml(f.path)}" data-name="${escapeHtml(f.name)}">${escapeHtml(f.name)}<span class="dur">${kindOf(f.name)}</span></li>`).join('')
    || '<li class="empty">No tracks in this folder — browse a folder to fill the library.</li>';
}
$('library-list').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-path]');
  if (!li) return;
  let idx = state.playlist.findIndex((p) => p.path === li.dataset.path);
  if (idx < 0) {
    state.playlist.push({ path: li.dataset.path, name: li.dataset.name, kind: kindOf(li.dataset.name) });
    renderPlaylist();
    idx = state.playlist.length - 1;
  }
  playAt(idx);
});
$('btn-library-folder').addEventListener('click', () => libraryBrowse());
$('play-filter').addEventListener('input', (e) => {
  library.filter = e.target.value;
  renderLibrary();
  renderPlaylist();
});
$('play-seek').addEventListener('input', (e) => seekTo((e.target.value / 1000) * state.duration));

/* ---------- synced lyrics (LRC sibling file) ---------- */
function parseLrc(text) {
  const lines = [];
  const re = /\[(\d+):(\d+(?:\.\d+)?)\](.*)/;
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(re);
    if (m) lines.push({ t: Number(m[1]) * 60 + Number(m[2]), text: m[3].trim() });
  }
  return lines.sort((a, b) => a.t - b.t);
}
/* Mousiki's lyrics chain (ported from src/lyrics_fetcher.cpp, Apache 2.0):
   local .lrc first, then LRCLIB (line-synced). Mousiki probes metadata with
   ffprobe for artist/title; we have no ffprobe on the user's PC, so the
   fallback parses "Artist - Title" from the filename and sends duration. */
function parseArtistTitle(name) {
  const base = name.replace(/\.[^.]+$/, '').trim();
  const m = base.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (!m) return { artist: '', title: base };
  return { artist: m[1].trim(), title: m[2].trim() };
}
async function fetchLrclibLyrics(artist, title, duration) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 6000);
  try {
    const q = new URLSearchParams({ artist_name: artist, track_name: title });
    if (duration) q.set('duration', String(Math.round(duration)));
    const res = await fetch('https://lrclib.net/api/get?' + q.toString(), { signal: ctl.signal });
    if (!res.ok) return null;
    const j = await res.json();
    if (!j.syncedLyrics) return null;
    return parseLrc(j.syncedLyrics);
  } catch (_) { return null; }
  finally { clearTimeout(timer); }
}
async function loadLyricsFor(filePath) {
  state.lyrics = []; state.lyricsActive = -1;
  const box = $('lyrics');
  const showLines = (lines, srcLabel) => {
    state.lyrics = lines;
    $('lyrics-src').textContent = srcLabel;
    box.innerHTML = lines.map((l, i) => `<div class="lrc-line" data-i="${i}">${escapeHtml(l.text) || '♪'}</div>`).join('') || 'Lyrics file is empty.';
  };
  const lrc = await window.pulse.findSibling(filePath, ['.lrc', '.LRC']).catch(() => null);
  if (lrc) {
    try {
      const bytes = await window.pulse.readFile(lrc.path);
      showLines(parseLrc(new TextDecoder().decode(bytes)), '· ' + lrc.name);
      return;
    } catch (_) { /* fall through to LRCLIB */ }
  }
  // No local .lrc — try LRCLIB (Mousiki's online source).
  const name = filePath.split(/[\\/]/).pop();
  const { artist, title } = parseArtistTitle(name);
  if (artist && title) {
    box.textContent = `Looking up synced lyrics for “${title}” by ${artist}…`;
    const lines = await fetchLrclibLyrics(artist, title, state.duration);
    if (lines && lines.length) { showLines(lines, '· LRCLIB'); return; }
  }
  box.innerHTML = 'No synced lyrics — drop a <b>.lrc</b> file next to the track (same name), or name the file “Artist - Title” and Pulse will look the lyrics up on LRCLIB.';
  $('lyrics-src').textContent = '';
}
function updateLyrics() {
  if (!state.lyrics.length) return;
  const t = currentTime();
  let idx = -1;
  for (let i = 0; i < state.lyrics.length; i++) { if (state.lyrics[i].t <= t) idx = i; else break; }
  if (idx !== state.lyricsActive) {
    state.lyricsActive = idx;
    document.querySelectorAll('#lyrics .lrc-line').forEach((el) => el.classList.toggle('active', Number(el.dataset.i) === idx));
    const active = document.querySelector('#lyrics .lrc-line.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }
}

/* ---------- file loading ---------- */
async function loadMidiFile(filePath, name, silent) {
  try {
    const midi = await window.pulse.parseMidi(filePath);
    if (!midi.notes.length) throw new Error('no notes');
    state.midi = midi; state.midiName = name;
    $('np-meta').textContent = `${$('np-meta').textContent} · MIDI: ${name} (${midi.notes.length} notes)`;
    if (!silent) setLook('roll');
  } catch (e) {
    if (!silent) alert('Could not read that MIDI file.');
  }
}
async function pickMedia() {
  wakeAudio(); // v0.2.5: resume inside the click gesture, before the dialog await
  const files = await window.pulse.openMedia();
  if (!files) return;
  const midis = files.filter((f) => kindOf(f.name) === 'midi');
  const imgs = files.filter((f) => kindOf(f.name) === 'image');
  const added = addToPlaylist(files, true);
  for (const m of midis) await loadMidiFile(m.path, m.name, false);
  if (!added && imgs.length) { setTab('glitch'); openGlitchFile(imgs[0].path); }
}
async function pickMidi() {
  const f = await window.pulse.openMidi();
  if (f) loadMidiFile(f.path, f.name, false);
}

/* ---------- system audio (Toaster-style: hear whatever is playing on the PC) ---------- */
/* (startSystemAudio / stopSystemAudio now live in src/audio-engine.js —
   the same single engine that plays files, so the two can never double up.) */

/* ---------- effect layer stack (Alembic Shader Lab model) ----------
   Visualize/Glitch effects as a STACKABLE LAYER SYSTEM: add layers, reorder
   them, tune each layer's parameters, save the stack as a preset. A layer is
   either a 'backdrop' (drawn behind the look — only Mesh Gradient) or a
   'post' layer (drawn over the look, in stack order). Two kinds of post:
     - draw(g, w, h, p, t, audio): direct canvas ops (scanlines, grain, glow…)
     - image(img, w, h, p, t, audio): ImageData ops on a 480x270 downsampled
       copy, drawn back scaled up (pixel sort, dither, gradient map, chroma)
   Blend modes apply to draw layers only (image layers replace the frame);
   the UI says so. All effects are written from scratch in 2D canvas —
   no shader code was copied from any reference site. */
const MESH_PALETTES = {
  aurora: { label: 'Aurora', colors: ['#22d3ee', '#818cf8', '#e879f9', '#34d399'] },
  sunset: { label: 'Sunset', colors: ['#f59e0b', '#fb7185', '#c084fc', '#fbbf24'] },
  ultraviolet: { label: 'Ultraviolet', colors: ['#7c3aed', '#db2777', '#2563eb', '#a855f7'] },
  candy: { label: 'Candy', colors: ['#ff2e88', '#ffb347', '#7dd3fc', '#f9a8d4'] },
  mono: { label: 'Mono', colors: ['#ffffff', '#a3a3a3', '#525252', '#e5e5e5'] },
};
const GRADMAP_PALETTES = {
  riso: { label: 'Riso', stops: [[0, '#0b1020'], [0.5, '#7c3aed'], [1, '#fde68a']] },
  sunset: { label: 'Sunset duotone', stops: [[0, '#1c0a2e'], [0.5, '#db2777'], [1, '#fbbf24']] },
  thermal: { label: 'Thermal', stops: [[0, '#000000'], [0.4, '#7c2d12'], [0.7, '#dc2626'], [1, '#fde68a']] },
  mono: { label: 'Mono', stops: [[0, '#000000'], [1, '#ffffff']] },
};
const BAYER4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
function hexRgb(hex) { return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]; }
function gradmapLut(stops) {
  const lut = new Uint8Array(256 * 3);
  const pts = stops.map(([t, c]) => [t, hexRgb(c)]);
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    let a = pts[0], b = pts[pts.length - 1];
    for (let k = 0; k < pts.length - 1; k++) if (v >= pts[k][0] && v <= pts[k + 1][0]) { a = pts[k]; b = pts[k + 1]; break; }
    const f = (v - a[0]) / Math.max(1e-6, b[0] - a[0]);
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = Math.round(a[1][c] + (b[1][c] - a[1][c]) * Math.min(1, Math.max(0, f)));
  }
  return lut;
}
const LAYER_TYPES = {
  mesh: {
    label: 'Mesh Gradient', icon: '🌈', stage: 'backdrop',
    desc: 'Animated mesh-gradient backdrop — colour blobs that drift and swell with the bass. Draws behind the look.',
    params: [
      { key: 'palette', type: 'select', label: 'Palette', def: 'aurora', options: Object.entries(MESH_PALETTES).map(([v, p]) => [v, p.label]), desc: 'The colour set the blobs blend from.' },
      { key: 'swirl', label: 'Swirl', min: 0, max: 1, step: 0.05, def: 0.5, desc: 'How far the colour nodes wander — 0 is still, 1 drifts everywhere.' },
      { key: 'scale', label: 'Scale', min: 0.4, max: 2, step: 0.05, def: 1, desc: 'How big each colour blob is — bigger blobs blend softer.' },
      { key: 'react', label: 'Reactivity', min: 0, max: 2, step: 0.1, def: 1, desc: 'How hard the music drives the blobs — 0 is pure drift, 1 is the default swell + shove, 2 is violent.' },
    ],
    draw(g, w, h, p, t, a) { drawMeshGradient(g, w, h, p, t, a); },
  },
  scanlines: {
    label: 'Scanlines', icon: '📺', stage: 'post',
    desc: 'CRT scanlines — dark lines across the frame.',
    params: [
      { key: 'gap', label: 'Gap', min: 2, max: 10, step: 1, def: 3, desc: 'Pixels between lines — smaller gaps read as a tighter CRT.' },
      { key: 'alpha', label: 'Strength', min: 0.05, max: 0.8, step: 0.05, def: 0.35, desc: 'How dark the lines are.' },
    ],
    draw(g, w, h, p, t, a) {
      // Audit follow-up: scanlines were static — the same lines at the
      // same darkness whatever played. The gap now breathes with the
      // bass and the darkness follows the level.
      const gap = Math.max(2, p.gap * (1 - a.bass * 0.3));
      g.fillStyle = `rgba(0,0,0,${Math.min(0.8, p.alpha * (0.7 + a.level * 0.6))})`;
      for (let y = 0; y < h; y += gap) g.fillRect(0, y, w, 1);
    },
  },
  crtvhs: {
    label: 'CRT / VHS', icon: '📼', stage: 'post',
    desc: 'Analog-video damage — scanlines, a rolling tracking band, and a jitter on the kick.',
    params: [
      { key: 'amount', label: 'Amount', min: 0, max: 1, step: 0.05, def: 0.6, desc: 'How wrecked the tape is.' },
    ],
    draw(g, w, h, p, t, a) {
      g.fillStyle = `rgba(0,0,0,${0.12 * p.amount})`;
      for (let n = 0; n < 3; n++) g.fillRect(0, Math.floor(Math.random() * h), w, 1);
      // Audit follow-up: the tracking band rolled at a constant speed
      // and the jitter only fired on 30% of kicks. The band speed now
      // follows the level, its brightness follows the kick, and every
      // kick over 0.5 jitters the frame.
      const by = ((t * (20 + a.level * 60) * p.amount) % (h + 80)) - 40;
      const grad = g.createLinearGradient(0, by - 14, 0, by + 14);
      grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(0.5, `rgba(255,255,255,${0.07 * p.amount * (0.5 + a.kick)})`); grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad; g.fillRect(0, by - 14, w, 28);
      if (a.kick > 0.5) {
        const dy = (Math.random() - 0.5) * 6 * p.amount;
        g.drawImage(canvas, 0, dy);
      }
    },
  },
  grain: {
    label: 'Grain', icon: '✳️', stage: 'post',
    desc: 'Film grain — speckles that shimmer every frame.',
    params: [
      { key: 'amount', label: 'Amount', min: 0, max: 1, step: 0.05, def: 0.4, desc: 'How heavy the grain is.' },
    ],
    draw(g, w, h, p, t, a) {
      // Audit follow-up: the speckle count was fixed — grain is now
      // denser on loud passages and kicks.
      const n = Math.floor(120 * p.amount * (0.3 + a.level * 1.5 + a.kick));
      g.fillStyle = '#fff';
      for (let i = 0; i < n; i++) {
        g.globalAlpha = Math.random() * 0.25 * p.amount;
        g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
      }
      g.globalAlpha = 1;
    },
  },
  glow: {
    label: 'Glow', icon: '💡', stage: 'post',
    desc: 'A soft bloom — the bright parts of the frame bleed outward.',
    params: [
      { key: 'amount', label: 'Amount', min: 0, max: 1, step: 0.05, def: 0.5, desc: 'How much the brights bloom.' },
    ],
    draw(g, w, h, p, t, a) {
      // Audit follow-up: the bloom was a fixed blur + alpha. It now
      // blooms harder and wider on loud passages.
      g.save();
      g.filter = `blur(${Math.round(6 + a.level * 10)}px)`;
      g.globalAlpha = 0.45 * p.amount * (0.4 + a.level);
      g.globalCompositeOperation = 'screen';
      g.drawImage(canvas, -8, -8, w + 16, h + 16);
      g.restore();
    },
  },
  vignette: {
    label: 'Vignette', icon: '◼️', stage: 'post',
    desc: 'Darkened corners — pulls the eye to the middle.',
    params: [
      { key: 'amount', label: 'Amount', min: 0, max: 1, step: 0.05, def: 0.6, desc: 'How dark the corners get.' },
    ],
    draw(g, w, h, p, t, a) {
      const r = Math.hypot(w, h) / 2;
      const grad = g.createRadialGradient(w / 2, h / 2, r * 0.4, w / 2, h / 2, r);
      // Audit follow-up: the corners were a fixed darkness. The frame
      // now closes in on loud passages.
      grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, `rgba(0,0,0,${0.7 * p.amount * (0.6 + a.level * 0.6)})`);
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
    },
  },
  tiles: {
    label: 'Corrupt Tiles', icon: '🧩', stage: 'post',
    desc: 'Nexus-style corrupt tiles — chunks of the frame copied off-register on the kick.',
    params: [
      { key: 'amount', label: 'Amount', min: 0, max: 1, step: 0.05, def: 0.6, desc: 'How far the tiles jump.' },
    ],
    draw(g, w, h, p, t, a) {
      if (a.kick < 0.5) return;
      const tw = 32, th = 32;
      for (let n = 0; n < 4; n++) {
        const sx = Math.floor(Math.random() * (w - tw)), sy = Math.floor(Math.random() * (h - th));
        const dx = sx + (Math.random() < 0.5 ? -1 : 1) * (8 + Math.floor(Math.random() * 40 * p.amount));
        g.drawImage(canvas, sx, sy, tw, th, dx, sy, tw, th);
      }
    },
  },
  geometric: {
    label: 'Geometric', icon: '🔺', stage: 'post',
    desc: 'The frame re-drawn as shapes — triangles, circles or squares sampled from the picture.',
    params: [
      { key: 'shape', type: 'select', label: 'Shape', def: 'triangles', options: [['triangles', 'Triangles'], ['circles', 'Circles'], ['squares', 'Squares'], ['mixed', 'Mixed']], desc: 'Which primitive the frame is built from.' },
      { key: 'size', label: 'Shape size', min: 6, max: 48, step: 1, def: 18, desc: 'Bigger shapes read as a mosaic; smaller ones keep the picture readable.' },
      { key: 'alpha', label: 'Coverage', min: 0.2, max: 1, step: 0.05, def: 0.85, desc: 'How much of the frame the shapes cover.' },
    ],
    draw(g, w, h, p, t, a) { drawGeometricFromCanvas(g, w, h, p, t, a); },
  },
  halftone: {
    label: 'Halftone', icon: '🔘', stage: 'post',
    desc: 'Old print dots — the frame becomes dots sized by how bright each spot is.',
    params: [
      { key: 'size', label: 'Dot spacing', min: 6, max: 30, step: 1, def: 12, desc: 'Wider spacing reads as a coarser print.' },
      { key: 'alpha', label: 'Coverage', min: 0.2, max: 1, step: 0.05, def: 0.85, desc: 'How much of the frame the dots cover.' },
    ],
    draw(g, w, h, p, t, a) { drawHalftoneFromCanvas(g, w, h, p, a); },
  },
  pixelsort: {
    label: 'Pixel Sort', icon: '↕️', stage: 'post',
    desc: 'Nexus pixel sort — rows of pixels re-ordered by brightness, driven by the dynamics.',
    params: [
      { key: 'amount', label: 'Amount', min: 0, max: 1, step: 0.05, def: 0.6, desc: 'How long the sorted runs are.' },
    ],
    image(img, w, h, p, t, a) {
      if (a.level < 0.05) return;
      const d = img.data;
      const y0 = Math.floor(Math.random() * (h - 40));
      // Audit follow-up: the run length was random × amount and the row
      // count fixed — now both scale with the level, so loud passages
      // sort longer runs across more rows.
      const span = Math.floor(8 + a.level * 40);
      for (let y = y0; y < y0 + span; y += 2) {
        let x = 0;
        while (x < w) {
          const segLen = 4 + Math.floor(Math.random() * 24 * p.amount * (0.5 + a.level * 1.5));
          const seg = [];
          for (let k = 0; k < segLen && x + k < w; k++) {
            const i = (y * w + x + k) * 4;
            seg.push([d[i] * 0.3 + d[i + 1] * 0.6 + d[i + 2] * 0.1, d[i], d[i + 1], d[i + 2]]);
          }
          seg.sort((x2, y2) => x2[0] - y2[0]);
          seg.forEach((px, k) => { const i = (y * w + x + k) * 4; d[i] = px[1]; d[i + 1] = px[2]; d[i + 2] = px[3]; });
          x += segLen;
        }
      }
    },
  },
  dither: {
    label: 'Dither', icon: '▦', stage: 'post',
    desc: 'Bayer dither — the frame reduced to two tones through a retro threshold.',
    params: [
      { key: 'threshold', label: 'Threshold', min: -0.3, max: 0.3, step: 0.02, def: 0, desc: 'Shifts the cut between dark and light.' },
    ],
    image(img, w, h, p, t, a) {
      const d = img.data;
      // Audit follow-up: the threshold was a fixed param — it now rides
      // the level and the kick, so the dither breathes with the music.
      const thr = p.threshold + (a.level - 0.5) * 0.4 + a.kick * 0.15;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const lum = (d[i] * 0.3 + d[i + 1] * 0.6 + d[i + 2] * 0.1) / 255;
          const on = lum + thr > (BAYER4[y % 4][x % 4] + 0.5) / 16 ? 235 : 8;
          d[i] = on; d[i + 1] = on === 235 ? 245 : 10; d[i + 2] = on === 235 ? 255 : 16;
        }
      }
    },
  },
  gradientmap: {
    label: 'Gradient Map', icon: '🎨', stage: 'post',
    desc: 'Recolours the frame through a gradient — shadows take one colour, highlights another (duotone).',
    params: [
      { key: 'palette', type: 'select', label: 'Gradient', def: 'riso', options: Object.entries(GRADMAP_PALETTES).map(([v, p]) => [v, p.label]), desc: 'The gradient the brightness maps through.' },
    ],
    image(img, w, h, p, t, a) {
      const lut = gradmapLut(GRADMAP_PALETTES[p.palette]?.stops || GRADMAP_PALETTES.riso.stops);
      const d = img.data;
      // Audit follow-up: the palette was a fixed LUT — the stop position
      // now shifts with the spectral centroid, so the duotone drifts as
      // the track's brightness changes.
      const shift = Math.round(((a.centroid || 0) / 8000) * 20);
      for (let i = 0; i < d.length; i += 4) {
        const lum = Math.min(255, Math.max(0, Math.round(d[i] * 0.3 + d[i + 1] * 0.6 + d[i + 2] * 0.1) + shift));
        d[i] = lut[lum * 3]; d[i + 1] = lut[lum * 3 + 1]; d[i + 2] = lut[lum * 3 + 2];
      }
    },
  },
  chroma: {
    label: 'Chromatic Aberration', icon: '🌈', stage: 'post',
    desc: 'The red channel slips sideways — cheap lens damage.',
    params: [
      { key: 'offset', label: 'Offset', min: 1, max: 8, step: 1, def: 3, desc: 'How far the red channel shifts, in pixels.' },
    ],
    image(img, w, h, p, t, a) {
      const d = img.data, off = Math.round(p.offset + a.bass * 6 + a.kick * 4);
      const rRow = new Uint8Array(w);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) rRow[x] = d[(y * w + x) * 4];
        for (let x = 0; x < w; x++) d[(y * w + x) * 4] = rRow[Math.max(0, x - off)];
      }
    },
  },
};
const layers = { stack: [], selected: -1, uid: 1 };
let fxCanvas = null, fxCtx = null;
function fxOffscreen() {
  if (!fxCanvas) { fxCanvas = document.createElement('canvas'); fxCtx = fxCanvas.getContext('2d', { willReadFrequently: true }); }
  return fxCanvas;
}
/* Mesh gradient, written from scratch in 2D canvas (mmeshy model, not its
   WebGL shader — that repo has no LICENSE file, so nothing was reused).
   v0.2.7 item 7: the blobs used to drift on their own clock with only a
   small bass/kick swell on the radius, so on screen they read as
   unreactive. Now EVERYTHING about them answers the music: the radius
   swells hard on bass + kick, each kick shoves the blobs outward from
   the centre, the drift speed follows the level, the palette cycles
   with the spectral centroid, and the alpha breathes with the level.
   `react` (0..2, the layer's Reactivity slider) scales all of it —
   0 is the old calm drift, 2 is violent. */
function drawMeshGradient(g, w, h, p, t, a) {
  const pal = MESH_PALETTES[p.palette] || MESH_PALETTES.aurora;
  a = a || {};
  const react = p.react == null ? 1 : p.react;
  const bass = a.bass || 0, kick = a.kick || 0, lv = a.level || 0;
  const cent = a.centroid || 0;
  // The palette steps round as the centroid climbs — bright music shifts
  // the whole gradient to the next colour set.
  const hueShift = Math.floor(cent / 1800) % pal.colors.length;
  // Loud music moves the blobs faster; quiet music lets them drift.
  const speed = 1 + lv * 1.4 * react;
  g.fillStyle = '#05070f'; g.fillRect(0, 0, w, h);
  const nodes = p.nodes || [{ x: 0.25, y: 0.3 }, { x: 0.72, y: 0.25 }, { x: 0.5, y: 0.8 }];
  g.save();
  g.globalCompositeOperation = 'lighter';
  nodes.forEach((n, i) => {
    const drift = p.swirl * 0.05;
    const ph = t * speed;
    const nx = (n.x + Math.sin(ph * 0.12 + i * 2.1) * drift) * w;
    const ny = (n.y + Math.cos(ph * 0.09 + i * 1.7) * drift) * h;
    // Kick shove: each blob jumps away from the centre on the beat.
    const dx = nx - w / 2, dy = ny - h / 2, d = Math.hypot(dx, dy) || 1;
    const shove = kick * 0.06 * Math.min(w, h) * react;
    const px = nx + (dx / d) * shove, py = ny + (dy / d) * shove;
    const r = Math.min(w, h) * 0.55 * p.scale * (1 + (bass * 0.9 + kick * 0.6) * react);
    const col = pal.colors[(i + hueShift) % pal.colors.length];
    const grad = g.createRadialGradient(px, py, 0, px, py, r);
    grad.addColorStop(0, col);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 0.5 + lv * 0.4;
    g.fillStyle = grad;
    g.fillRect(px - r, py - r, r * 2, r * 2);
  });
  g.restore();
}
/* Sample the current frame at low res and re-draw it as shapes (used by the
   Geometric layer) or as halftone dots (used by the Halftone layer). */
function sampleFrame(cell) {
  const fx = fxOffscreen();
  const sw = Math.max(2, Math.floor(canvas.width / cell));
  const sh = Math.max(2, Math.floor(canvas.height / cell));
  fx.width = sw; fx.height = sh;
  fxCtx.drawImage(canvas, 0, 0, sw, sh);
  return fxCtx.getImageData(0, 0, sw, sh);
}
function drawGeometricFromCanvas(g, w, h, p, t, a) {
  const cell = Math.max(6, Math.round(p.size * 1.5));
  const img = sampleFrame(cell);
  const sw = img.width, sh = img.height, d = img.data;
  const cw = w / sw, chh = h / sh;
  const shapes = p.shape === 'mixed' ? ['tri', 'circ', 'sq'] : [p.shape === 'triangles' ? 'tri' : p.shape === 'circles' ? 'circ' : 'sq'];
  g.save();
  g.globalAlpha = p.alpha;
  for (let gy = 0; gy < sh; gy++) {
    for (let gx = 0; gx < sw; gx++) {
      const i = (gy * sw + gx) * 4;
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      const lum = (r * 0.3 + gg * 0.6 + b * 0.1) / 255;
      const kind = shapes[(gx * 7 + gy * 13) % shapes.length];
      // Audit follow-up: the size only read the kick ×0.2 and the spin
      // ran on a constant clock. Size now punches on bass + kick, and
      // the spin speed follows the level.
      const s = Math.min(cw, chh) * (0.5 + lum * 0.6) * (1 + a.bass * 0.8 + a.kick * 0.5);
      const cx = gx * cw + cw / 2, cy = gy * chh + chh / 2;
      g.fillStyle = `rgb(${r},${gg},${b})`;
      g.save();
      g.translate(cx, cy);
      g.rotate(Math.sin(t * 0.3 * (0.3 + a.level) + gx + gy) * 0.3);
      if (kind === 'tri') {
        g.beginPath(); g.moveTo(0, -s / 2); g.lineTo(s / 2, s / 2); g.lineTo(-s / 2, s / 2); g.closePath(); g.fill();
      } else if (kind === 'circ') {
        g.beginPath(); g.arc(0, 0, s / 2, 0, Math.PI * 2); g.fill();
      } else {
        g.fillRect(-s / 2, -s / 2, s, s);
      }
      g.restore();
    }
  }
  g.restore();
}
function drawHalftoneFromCanvas(g, w, h, p, a) {
  // Audit follow-up: the dots were sized by luminance only, at a fixed
  // spacing. The dots now swell on kick + bass and the spacing tightens
  // with the level. `a` is the audio bundle; default to silence so the
  // function still works when called without it.
  a = a || { kick: 0, bass: 0, level: 0 };
  const cell = Math.max(4, Math.round(p.size * 1.5 * (1 - a.level * 0.2)));
  const img = sampleFrame(cell);
  const sw = img.width, sh = img.height, d = img.data;
  const cw = w / sw, chh = h / sh;
  g.save();
  g.globalAlpha = p.alpha;
  g.fillStyle = '#0b1020';
  g.fillRect(0, 0, w, h);
  for (let gy = 0; gy < sh; gy++) {
    for (let gx = 0; gx < sw; gx++) {
      const i = (gy * sw + gx) * 4;
      const lum = (d[i] * 0.3 + d[i + 1] * 0.6 + d[i + 2] * 0.1) / 255;
      const r = Math.max(0.5, (1 - lum) * Math.min(cw, chh) * 0.55 * (1 + a.kick * 0.4 + a.bass * 0.3));
      g.fillStyle = `rgb(${d[i]},${d[i + 1]},${d[i + 2]})`;
      g.beginPath(); g.arc(gx * cw + cw / 2, gy * chh + chh / 2, r, 0, Math.PI * 2); g.fill();
    }
  }
  g.restore();
}
function applyPostLayers(audio) {
  if (!layers.stack.length) return;
  const w = canvas.width, h = canvas.height;
  for (const layer of layers.stack) {
    if (!layer.enabled) continue;
    const def = LAYER_TYPES[layer.type];
    if (!def) continue;
    if (def.image) {
      const fx = fxOffscreen();
      fx.width = 480; fx.height = 270;
      fxCtx.drawImage(canvas, 0, 0, 480, 270);
      const img = fxCtx.getImageData(0, 0, 480, 270);
      def.image(img, 480, 270, layer.params, audio.t, audio);
      fxCtx.putImageData(img, 0, 0);
      ctx.drawImage(fx, 0, 0, w, h);
    } else if (def.draw) {
      ctx.save();
      if (layer.blend && layer.blend !== 'source-over') ctx.globalCompositeOperation = layer.blend;
      def.draw(ctx, w, h, layer.params, audio.t, audio);
      ctx.restore();
    }
  }
}
/* Mesh colour nodes, draggable on the canvas (mmeshy direct manipulation). */
let meshDrag = -1;
function meshSelectedLayer() {
  const l = layers.stack[layers.selected];
  return l && l.type === 'mesh' ? l : null;
}
function drawMeshHandles() {
  const meshEdit = $('mesh-edit');
  if (!meshEdit || !meshEdit.checked) return;
  const l = meshSelectedLayer();
  if (!l) return;
  const w = canvas.width, h = canvas.height;
  const nodes = l.params.nodes || [{ x: 0.25, y: 0.3 }, { x: 0.72, y: 0.25 }, { x: 0.5, y: 0.8 }];
  const pal = MESH_PALETTES[l.params.palette] || MESH_PALETTES.aurora;
  nodes.forEach((n, i) => {
    const px = n.x * w, py = n.y * h;
    ctx.save();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.fillStyle = pal.colors[i % pal.colors.length];
    ctx.beginPath(); ctx.arc(px, py, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '700 11px "Paper Mono", monospace'; ctx.textAlign = 'center';
    ctx.fillText(String(i + 1), px, py + 4);
    ctx.restore();
  });
}
canvas.addEventListener('pointerdown', (e) => {
  const meshEdit = $('mesh-edit');
  if (!meshEdit || !meshEdit.checked || activeTab !== 'visualize') return;
  const l = meshSelectedLayer();
  if (!l) return;
  const rect = canvas.getBoundingClientRect();
  const rx = (e.clientX - rect.left) / rect.width, ry = (e.clientY - rect.top) / rect.height;
  const nodes = l.params.nodes || (l.params.nodes = [{ x: 0.25, y: 0.3 }, { x: 0.72, y: 0.25 }, { x: 0.5, y: 0.8 }]);
  let best = -1, bestD = 0.06;
  nodes.forEach((n, i) => {
    const d = Math.hypot(n.x - rx, n.y - ry);
    if (d < bestD) { bestD = d; best = i; }
  });
  meshDrag = best;
});
canvas.addEventListener('pointermove', (e) => {
  if (meshDrag < 0) return;
  const l = meshSelectedLayer();
  if (!l || !l.params.nodes) return;
  const rect = canvas.getBoundingClientRect();
  const n = l.params.nodes[meshDrag];
  n.x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  n.y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
});
['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => canvas.addEventListener(ev, () => { meshDrag = -1; }));

/* ---------- SCENES (v0.2.3, Toaster model) ----------
   The Visualize tab is a live-code stage now: every look is a SCENE, and the
   scene is written out as a `scene:` line in the LIVE CODE panel — the same
   state the renderers read, so the code on screen IS the scene definition.
   Families: PULSE = the 10 looks from v0.1–0.2.2; TOASTER = the three new
   scenes built on the suite's own effect families (ASCII library, mesh
   gradients, corrupt tiles / pixel sort). */
const SCENES = {
  spectrum:   { label: 'Spectrum',   family: 'PULSE',   desc: 'Mirrored bass-centre bars' },
  scope:      { label: 'Scope',      family: 'PULSE',   desc: 'Waveform + spectrum strip' },
  orbit:      { label: 'Orbit',      family: 'PULSE',   desc: "Oto's ORBIT — rings of dots" },
  roll:       { label: 'Piano Roll', family: 'PULSE',   desc: 'MIDI notes on the grid' },
  fountain:   { label: 'Fountain',   family: 'PULSE',   desc: 'Particles spray with the beat' },
  pattern:    { label: 'Pattern',    family: 'PULSE',   desc: 'Generative riso-glyph motion' },
  studio:     { label: 'Studio',     family: 'PULSE',   desc: 'Your chosen visualizers, side by side — right-click a quadrant to swap it' },
  geometric:  { label: 'Geometric',  family: 'PULSE',   desc: 'Spectrum as shapes (geometric-art)' },
  dither:     { label: 'Dither',     family: 'PULSE',   desc: 'Animated dither fields (dithr)' },
  depth:      { label: 'Depth',      family: 'PULSE',   desc: 'Photo depth map, parallaxed (Gather)' },
  ascii:      { label: 'ASCII',      family: 'TOASTER',  desc: 'Spectrum as live ASCII (ascii-magic)' },
  mesh:       { label: 'Mesh',       family: 'TOASTER',  desc: 'Animated mesh gradient (mmeshy)' },
  glitch:     { label: 'Glitch',     family: 'TOASTER',  desc: 'Corrupt tiles + pixel sort, live' },
};
const SCENE_ORDER = ['spectrum', 'scope', 'orbit', 'roll', 'fountain', 'pattern', 'studio', 'geometric', 'dither', 'depth', 'ascii', 'mesh', 'glitch'];
/* v0.2.6: 37 more scenes from src/scenes-026.js (reference sites, Synkit
   Nexus, saved reels) — 50 scenes total. Merged into SCENES + the rail
   here, before the chip listeners attach, so the new chips are clickable
   like the original 13. */
if (window.PULSE_SCENES_026) {
  for (const s of window.PULSE_SCENES_026.list) {
    SCENES[s.id] = { label: s.label, family: s.family, desc: s.desc };
    SCENE_ORDER.push(s.id);
  }
  // Rail chips for the new scenes, grouped by family, before the footer.
  const rail = $('lookbar');
  const foot = rail.querySelector('.rail-foot');
  const groups = [['SITES', '├─ SITES ─┤'], ['SYNKIT', '├─ SYNKit ─┤'], ['PULSE', '├─ PULSE 026 ─┤']];
  for (const [fam, head] of groups) {
    const items = window.PULSE_SCENES_026.list.filter((s) => s.family === fam);
    if (!items.length) continue;
    const gh = document.createElement('div');
    gh.className = 'rail-group'; gh.textContent = head;
    rail.insertBefore(gh, foot);
    for (const s of items) {
      const b = document.createElement('button');
      b.className = 'look-chip'; b.dataset.look = s.id; b.setAttribute('data-active', 'false');
      b.textContent = s.label;
      b.title = s.desc;
      rail.insertBefore(b, foot);
    }
  }
}
/* Build the audio/analysis bundle the 0.2.6 scenes draw from — one object,
   same shape for every scene, defensive when nothing is playing. */
function scene026Audio(audio) {
  const a = analysis;
  return {
    kick: audio.kick, bass: audio.bass, level: audio.level || 0,
    rms: a ? a.rms : 0,
    centroid: a ? a.centroid : 0, flux: a ? a.flux : 0,
    beatPhase: a ? a.beatPhase : -1, barPhase: a ? a.barPhase : -1,
    bpm: a && a.bpmLocked ? a.bpm : 0,
    t: audio.t,
    bands: mousikiBands(),
    bands32: a ? a.bands32 : new Float32Array(32),
    chroma: a ? a.chroma : new Float32Array(12),
    instruments: a ? a.instruments : { vocals: 0, drums: 0, guitar: 0, bass: 0, keys: 0 },
    chord: a && a.chord ? a.chord.name : '',
    key: a && a.key ? `${TA_NOTES[a.key.root]} ${a.key.mode}` : '',
    theme: THEMES[state.theme],
  };
}
function drawScene026(look, x, y, w, h, audio) {
  const fn = window.PULSE_SCENES_026 && window.PULSE_SCENES_026.draw[look];
  if (!fn) return;
  try { fn(ctx, x, y, w, h, scene026Audio(audio)); }
  catch (e) { window.__errors.push('scene ' + look + ': ' + (e.message || e)); }
}
const cgNum = (v) => String(+Number(v).toFixed(2)).replace(/^0\./, '.');
// The live scene definition, Strudel-style: scene call + one chained call
// per enabled layer + the audio-reactive numbers, which breathe with the
// kick/bass/level at every code-panel tick — so the line visibly moves
// while the music plays. Renderers read the same state; the line is the
// transcript of what they're doing, Toaster-style.
function sceneLine(audio) {
  const a = audio || { kick: 0, bass: 0, level: 0 };
  const k = Math.min(1, a.kick), b = Math.min(1, a.bass), lv = Math.min(1, a.level || 0);
  let base;
  switch (state.look) {
    case 'ascii': base = `ascii("${state.asciiSceneStyle}", ${cgNum(0.35 + lv * 0.6)})`; break;
    case 'mesh': base = `mesh("${state.meshScenePalette}", ${cgNum(0.4 + b * 0.5)})`; break;
    case 'glitch': base = `glitch(${cgNum(0.3 + k * 0.7)})`; break;
    case 'dither': base = `dither("${state.ditherField}", ${cgNum(0.3 + k * 0.6)})`; break;
    case 'geometric': base = `geometric("${state.geoShape}", ${cgNum(state.geoDensity)})`; break;
    case 'depth': base = `depth(${cgNum(0.2 + k * 0.6)})`; break;
    default: base = `${state.look}()`;
  }
  const chain = [];
  for (const l of layers.stack) {
    if (!l.enabled) continue;
    const p = l.params;
    switch (l.type) {
      case 'mesh': chain.push(`mesh("${p.palette}", ${cgNum(p.swirl + b * 0.3)})`); break;
      case 'scanlines': chain.push(`scanlines(${p.gap}, ${cgNum(p.alpha)})`); break;
      case 'crtvhs': chain.push(`crt(${cgNum(p.amount + k * 0.2)})`); break;
      case 'grain': chain.push(`grain(${cgNum(p.amount)})`); break;
      case 'glow': chain.push(`glow(${cgNum(p.amount)})`); break;
      case 'vignette': chain.push(`vignette(${cgNum(p.amount)})`); break;
      case 'tiles': chain.push(`tiles(${cgNum(p.amount + k * 0.3)})`); break;
      case 'geometric': chain.push(`geometric("${p.shape}", ${p.size})`); break;
      case 'halftone': chain.push(`halftone(${p.size}, ${cgNum(p.alpha)})`); break;
      case 'pixelsort': chain.push(`pixelsort(${cgNum(p.amount + lv * 0.3)})`); break;
      case 'dither': chain.push(`dither(${cgNum(p.threshold)})`); break;
      case 'gradientmap': chain.push(`gradmap("${p.palette}")`); break;
      case 'chroma': chain.push(`chroma(${p.offset})`); break;
      default: chain.push(l.type);
    }
  }
  return `scene: ${base}` + (chain.length ? '.' + chain.join('.') : '');
}

/* ---------- looks (Pulse v0.1, unchanged) ---------- */
/* Spectrum, Mousiki-style: 32 mirrored bands (bass in the centre, treble
   falling off to both edges) from mousikiBands(). */
function drawSpectrum(x, y, w, h, big) {
  const t = THEMES[state.theme];
  const bands = mousikiBands();
  const n = big ? 32 : 24;
  // v0.2.7 item 5: the Visualize spectrum runs the same Mousiki
  // spring-damper + theme as the Play mini, with its OWN theme bundle
  // (state.sceneVizTheme, persisted as cfg.vizThemes.sceneViz).
  const theme = sceneVizTheme();
  const targets = new Float32Array(n);
  for (let i = 0; i < n; i++) targets[i] = bands[Math.floor(i * 64 / n)];
  const vals = springBars(big ? 'sceneSpectrum' : 'sceneSpectrumStrip', targets, theme);
  drawSpectrumBars(ctx, vals, x, y, w, h, theme);
  ctx.strokeStyle = t.grid; ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}
function drawScope(x, y, w, h) {
  const t = THEMES[state.theme];
  const theme = sceneVizTheme();
  ctx.strokeStyle = theme.color || theme.colorLeft || t.wave; ctx.lineWidth = 2; ctx.beginPath();
  const step = Math.floor(waveData.length / w);
  const smoothN = Math.max(1, Math.round((theme.fluidity || 5) / 2));
  for (let px = 0; px < w; px++) {
    const i = Math.min(waveData.length - 1, px * step);
    let sum = 0, n = 0;
    for (let k = -smoothN; k <= smoothN; k++) {
      const j = Math.min(waveData.length - 1, Math.max(0, i + k));
      sum += waveData[j] / 128 - 1; n++;
    }
    const v = sum / n;
    const py = y + h / 2 + v * (h / 2 - 4);
    px === 0 ? ctx.moveTo(x, py) : ctx.lineTo(x + px, py);
  }
  ctx.stroke();
  ctx.strokeStyle = t.grid; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2); ctx.stroke();
}
/* ORBIT — the Oto look, rebuilt from scratch: eleven orbit paths round the
   middle (after Toaster's orbits() idea), each dot running round its path,
   every ring swelling with its band of the spectrum; a kick ripple runs out
   through the rings. The bar counter stays in the middle. */
const ORBIT_RINGS = 5;
const orbitDots = [];
for (let r = 0; r < ORBIT_RINGS; r++) {
  const n = 10 + r * 8;
  for (let i = 0; i < n; i++) orbitDots.push({ ring: r, a: (i / n) * Math.PI * 2, speed: (0.12 + r * 0.05) * (r % 2 ? -1 : 1) });
}
let orbitRipple = -1; // 0..1 progress of the kick ripple
function drawOrbit(cx, cy, r) {
  const t = THEMES[state.theme];
  const bands = mousikiBands();
  const now = currentTime();
  // Kick ripple: a fresh kick starts a ring running outward.
  if (analysis && analysis.kickPulse > 0.85 && orbitRipple < 0) orbitRipple = 0;
  if (orbitRipple >= 0) { orbitRipple += 0.02 + state.smoothLow * 0.03; if (orbitRipple > 1) orbitRipple = -1; }
  const kick = analysis ? analysis.kickPulse : state.beat;
  ctx.save();
  ctx.translate(cx, cy);
  for (let ring = 0; ring < ORBIT_RINGS; ring++) {
    const bandV = bands[26 + ring * 2] || 0; // v0.2.6: low bands near the centre of the 64-band mirror
    const rr = r * (0.35 + ring * 0.16) * (1 + bandV * 0.35 + kick * 0.12);
    ctx.strokeStyle = t.grid; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.stroke();
    const dotR = 2.5 + bandV * 4 + kick * 2;
    ctx.fillStyle = t.bar[ring % 3];
    for (const d of orbitDots) {
      if (d.ring !== ring) continue;
      d.a += d.speed * 0.016 * (1 + bandV * 2);
      const px = Math.cos(d.a + now * 0.05 * d.speed) * rr;
      const py = Math.sin(d.a + now * 0.05 * d.speed) * rr;
      ctx.globalAlpha = 0.55 + bandV * 0.45;
      ctx.beginPath(); ctx.arc(px, py, dotR, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  if (orbitRipple >= 0) {
    ctx.strokeStyle = t.accent; ctx.lineWidth = 2;
    ctx.globalAlpha = 1 - orbitRipple;
    ctx.beginPath(); ctx.arc(0, 0, r * (0.3 + orbitRipple * 0.9), 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  const bar = (analysis && analysis.bpmLocked) ? analysis.bar + 1 : (state.bpm ? Math.floor(currentTime() / state.barSeconds) + 1 : 1);
  const bpmShow = (analysis && analysis.bpmLocked) ? Math.round(analysis.bpm) : state.bpm;
  ctx.fillStyle = t.text; ctx.textAlign = 'center';
  ctx.font = `700 ${Math.max(20, r * 0.42)}px "Paper Mono", ui-monospace, monospace`;
  ctx.fillText(`BAR ${bar}`, cx, cy + r * 0.16);
  ctx.font = `${Math.max(11, r * 0.14)}px "Paper Mono", ui-monospace, monospace`;
  ctx.fillStyle = t.dim;
  ctx.fillText(bpmShow ? `~${bpmShow} BPM` : 'ORBIT', cx, cy + r * 0.42);
  if (analysis && analysis.chord) {
    ctx.fillStyle = t.accent;
    ctx.font = `700 ${Math.max(12, r * 0.16)}px "Paper Mono", ui-monospace, monospace`;
    ctx.fillText(analysis.chord.name, cx, cy - r * 0.42);
  }
}
/* PATTERN — generative geometric motion (after cnrd.art's riso-glyph work and
   Karel Martens' iconographic grids): a field of rotating glyphs — squares,
   triangles, circles — pulsing with the beat, colours from the theme. */
function drawPattern(x, y, w, h) {
  const t = THEMES[state.theme];
  const now = currentTime();
  const cols = 7, rows = 5;
  const cw = w / cols, chh = h / rows;
  const kick = analysis ? analysis.kickPulse : state.beat;
  const lv = analysis ? analysis.level : 0;
  const bands = mousikiBands();
  // Audit follow-up: the glyphs used to spin on a constant clock with
  // audio only scaling their size. The spin speed now follows the level,
  // the size punches harder on kick + bass, and each glyph's alpha comes
  // from its own frequency band.
  const pulse = 1 + kick * 0.6 + state.smoothLow * 0.8;
  ctx.save();
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const cx = x + gx * cw + cw / 2, cy = y + gy * chh + chh / 2;
      const seed = gx * 7 + gy * 13;
      const kind = seed % 3;
      const rot = now * (0.1 + (seed % 5) * 0.06) * (0.3 + lv) * (seed % 2 ? 1 : -1) + seed;
      const s = Math.min(cw, chh) * 0.32 * pulse * (0.7 + 0.3 * Math.sin(now * 2 + seed));
      const band = bands[Math.floor(((gy * cols + gx) / (rows * cols)) * 64)] || 0;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.fillStyle = t.bar[seed % 3];
      ctx.globalAlpha = 0.3 + band * 0.6;
      if (kind === 0) { ctx.fillRect(-s / 2, -s / 2, s, s); }
      else if (kind === 1) {
        ctx.beginPath();
        ctx.moveTo(0, -s / 2); ctx.lineTo(s / 2, s / 2); ctx.lineTo(-s / 2, s / 2); ctx.closePath(); ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(0, 0, s / 2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}
/* GEOMETRIC — geometric-art.com preset-pack model, rebuilt from scratch:
   the spectrum re-rendered as geometric primitives. Shape + density come
   from the preset dropdown above the canvas; the beat pulses the field. */
function drawGeometricLook(x, y, w, h) {
  const t = THEMES[state.theme];
  const now = currentTime();
  const bands = mousikiBands();
  const kick = analysis ? analysis.kickPulse : state.beat;
  const pulse = 1 + kick * 0.35 + state.smoothLow * 0.25;
  const preset = state.geoShape;
  const dense = state.geoDensity;
  const cols = Math.max(4, Math.round(8 * dense));
  const rows = Math.max(3, Math.round(5 * dense));
  const cw = w / cols, chh = h / rows;
  ctx.save();
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const cx = x + gx * cw + cw / 2, cy = y + gy * chh + chh / 2;
      const seed = gx * 7 + gy * 13;
      const bandV = bands[Math.min(63, Math.floor(gx / cols * 64))] || 0;
      let kind = preset;
      if (preset === 'mixed') kind = ['triangles', 'circles', 'squares'][seed % 3];
      else if (preset === 'sparse' || preset === 'dense') kind = ['triangles', 'circles', 'squares'][seed % 3];
      const rot = now * (0.1 + (seed % 5) * 0.06) * (seed % 2 ? 1 : -1) + seed;
      const s = Math.min(cw, chh) * (0.3 + bandV * 0.5) * pulse * (0.7 + 0.3 * Math.sin(now * 2 + seed));
      ctx.save();
      ctx.translate(cx, cy);
      if (kind === 'lines') {
        ctx.rotate(Math.atan2(state.smoothLow, 0.4) * (seed % 2 ? 1 : -1) + seed * 0.1);
        ctx.strokeStyle = t.bar[seed % 3]; ctx.lineWidth = Math.max(1, s * 0.08);
        ctx.globalAlpha = 0.5 + bandV * 0.5;
        ctx.beginPath(); ctx.moveTo(-s / 2, 0); ctx.lineTo(s / 2, 0); ctx.stroke();
      } else {
        ctx.rotate(rot);
        ctx.fillStyle = t.bar[seed % 3];
        ctx.globalAlpha = 0.45 + 0.45 * ((seed % 5) / 4);
        if (kind === 'triangles') {
          ctx.beginPath(); ctx.moveTo(0, -s / 2); ctx.lineTo(s / 2, s / 2); ctx.lineTo(-s / 2, s / 2); ctx.closePath(); ctx.fill();
        } else if (kind === 'squares') {
          ctx.fillRect(-s / 2, -s / 2, s, s);
        } else {
          ctx.beginPath(); ctx.arc(0, 0, s / 2, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}
/* DITHER — dithr.app model: procedural fields rendered as animated dither
   loops. The field advances with time and the beat; the bass shifts the
   Bayer threshold so the pattern breathes with the music. */
const DITHER_FIELDS = {
  spiral: (x, y, t) => 0.5 + 0.5 * Math.sin(Math.atan2(y - 0.5, x - 0.5) * 3 - t * 2 + Math.hypot(x - 0.5, y - 0.5) * 9),
  tunnel: (x, y, t) => 0.5 + 0.5 * Math.sin(1 / (Math.hypot(x - 0.5, y - 0.5) + 0.06) - t * 3),
  smoke: (x, y, t) => 0.5 + 0.5 * Math.sin((x * 3 + Math.sin(y * 5 + t)) * 2 + (y * 3 + Math.cos(x * 4 - t)) * 2),
  halftone: (x, y, t) => 0.5 + 0.5 * Math.sin(x * 42 + t) * Math.sin(y * 42 - t),
  starfield: (x, y, t) => {
    const h = Math.sin(Math.floor(x * 46) * 127.1 + Math.floor(y * 46) * 311.7) * 43758.5453;
    const s = h - Math.floor(h);
    return s > 0.985 ? 1 : (s > 0.93 ? 0.5 + 0.5 * Math.sin(t * 3 + s * 20) : 0);
  },
  moire: (x, y, t) => 0.5 + 0.5 * Math.sin((x + y) * 30 + Math.sin(t) * 2) * Math.sin((x - y) * 30),
  caustics: (x, y, t) => 0.5 + 0.5 * Math.sin(x * 12 + t * 2) * Math.sin(y * 12 - t * 1.5) * Math.sin((x + y) * 8 + t),
  cellular: (x, y, t) => {
    let d = 9;
    for (let i = 0; i < 3; i++) {
      const cx = 0.5 + 0.3 * Math.cos(t * 0.4 + i * 2.1), cy = 0.5 + 0.3 * Math.sin(t * 0.3 + i * 1.7);
      d = Math.min(d, Math.hypot(x - cx, y - cy));
    }
    return 0.5 + 0.5 * Math.sin(d * 22 - t * 2);
  },
};
function drawDitherLook(x, y, w, h) {
  const t = THEMES[state.theme];
  const now = currentTime();
  const field = DITHER_FIELDS[state.ditherField] || DITHER_FIELDS.smoke;
  const kick = analysis ? analysis.kickPulse : state.beat;
  const lv = analysis ? analysis.level : 0;
  // Audit follow-up: the field clock used to run at now*(1+kick*0.8)
  // with a small bass nudge on the threshold — audio was a passenger.
  // The clock now runs on the level + kick, and the bass moves the
  // threshold more than twice as far.
  const tt = now * (0.5 + lv * 1.5 + kick);
  const cols = 96, rows = Math.max(8, Math.round(cols * (h / w)));
  const cw = w / cols, chh = h / rows;
  const bassShift = (state.smoothLow - 0.2) * 0.6;
  ctx.save();
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const v = field(gx / cols, gy / rows, tt);
      const thr = (BAYER4[gy % 4][gx % 4] + 0.5) / 16 + bassShift;
      if (v <= thr) continue;
      const hot = v > 0.85;
      ctx.fillStyle = hot ? t.bar[2] : (v > 0.6 ? t.bar[0] : t.bar[1]);
      ctx.globalAlpha = 0.55 + v * 0.45;
      ctx.fillRect(x + gx * cw, y + gy * chh, cw + 0.5, chh + 0.5);
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

/* ---------- TOASTER scenes (v0.2.3) ----------
   The three new scenes, built on the suite's own effect families:
   - ASCII: the spectrum re-drawn as live ASCII text (ascii-magic model),
     rendered with the ASCII tab's own char renderer so the ramp, colour and
     audio-reactive density behave identically. Grid breathes with the bass,
     kick punches the density.
   - MESH: the mmeshy animated mesh gradient as the scene itself — blobs
     drift and swell with the bass, kick pulses the scale — with a thin
     spectrum ribbon along the bottom so the music stays readable.
   - GLITCH: spectrum + scope, then live corrupt tiles (chunks copied
     off-register on the kick) and pixel-sort streaks on the dynamics —
     the Nexus corrupt-tiles / pixel-sort idea as a scene, not a layer. */
const asciiSceneTmp = document.createElement('canvas');
const ASCII_SCENE_RAMP = ' .:-=+*#%@';
function drawAsciiScene(x, y, w, h, audio) {
  const t = THEMES[state.theme];
  const bass = audio.bass || 0, kick = audio.kick || 0, level = audio.level || 0;
  // Source: the spectrum drawn small into an offscreen buffer, then read
  // back as luminance — the music itself becomes the picture.
  const cols = Math.max(24, Math.round(72 * (1 - bass * 0.25)));
  const rows = Math.max(10, Math.round(cols * (h / w) * 0.55));
  const sw = cols, sh = rows;
  if (asciiSceneTmp.width !== sw || asciiSceneTmp.height !== sh) { asciiSceneTmp.width = sw; asciiSceneTmp.height = sh; }
  const sc = asciiSceneTmp.getContext('2d');
  sc.fillStyle = '#000'; sc.fillRect(0, 0, sw, sh);
  const bands = mousikiBands();
  const grad = sc.createLinearGradient(0, sh, 0, 0);
  grad.addColorStop(0, t.bar[0]); grad.addColorStop(0.55, t.bar[1]); grad.addColorStop(1, t.bar[2]);
  sc.fillStyle = grad;
  for (let i = 0; i < 64; i++) {
    const bx = Math.floor(i * sw / 64), bw2 = Math.max(1, Math.floor(sw / 64));
    const bh = Math.max(1, Math.round(bands[i] * sh));
    sc.fillRect(bx, sh - bh, bw2, bh);
  }
  // Waveform line across the middle, so the scene reads as sound, not bars.
  sc.strokeStyle = '#fff'; sc.lineWidth = 1; sc.beginPath();
  for (let px = 0; px < sw; px++) {
    const v = waveData[Math.floor(px * waveData.length / sw)] / 128 - 1;
    const py = sh / 2 + v * (sh / 2 - 1);
    px === 0 ? sc.moveTo(px, py) : sc.lineTo(px, py);
  }
  sc.stroke();
  const data = sc.getImageData(0, 0, sw, sh).data;
  const cellW = w / cols, cellH = h / rows;
  ctx.save();
  ctx.fillStyle = '#05070f'; ctx.fillRect(x, y, w, h);
  ctx.font = `${Math.max(9, Math.floor(cellH * 0.95))}px "Paper Mono", ui-monospace, monospace`;
  ctx.textBaseline = 'top';
  const density = 0.55 + kick * 0.45; // kick punches more characters on
  const pal = ASCII_PALETTES[state.asciiSceneStyle === 'halftone' ? 'pico8' : 'gameboy'];
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const i = (gy * cols + gx) * 4;
      const lum = (data[i] * 0.3 + data[i + 1] * 0.6 + data[i + 2] * 0.1) / 255;
      if (lum < 0.04) continue;
      if (Math.random() > density && lum < 0.5) continue;
      let idx = Math.floor(lum * (ASCII_SCENE_RAMP.length - 1));
      if (level > 0.25 && Math.random() < level * 0.3) idx = Math.floor(Math.random() * ASCII_SCENE_RAMP.length);
      const ch = ASCII_SCENE_RAMP[idx];
      if (ch === ' ') continue;
      const c = pal.colors[Math.min(pal.colors.length - 1, Math.floor(lum * pal.colors.length))];
      ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      ctx.fillText(ch, x + gx * cellW, y + gy * cellH);
    }
  }
  ctx.restore();
}
function drawMeshScene(x, y, w, h, audio) {
  // The mesh gradient IS the scene: audio-reactive swirl/scale from the
  // same drawMeshGradient the layer uses, full-bleed, palette selectable.
  // v0.2.7: the scene's own Reactivity slider (state.meshSceneReact).
  const p = { palette: state.meshScenePalette, react: state.meshSceneReact == null ? 1 : state.meshSceneReact, swirl: 0.5 + (audio.bass || 0) * 0.5, scale: 1 + (audio.kick || 0) * 0.35, nodes: [{ x: 0.25, y: 0.3 }, { x: 0.72, y: 0.25 }, { x: 0.5, y: 0.8 }] };
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.translate(x, y);
  drawMeshGradient(ctx, w, h, p, audio.t, audio);
  ctx.restore();
  // Thin spectrum ribbon along the bottom keeps the music readable.
  const t = THEMES[state.theme];
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  const rh = Math.max(26, h * 0.09);
  drawSpectrum(x + 12, y + h - rh - 10, w - 24, rh, false);
  ctx.fillStyle = t.text; ctx.font = '700 11px "Paper Mono", ui-monospace, monospace'; ctx.textAlign = 'left';
  ctx.fillText(`MESH · ${p.palette.toUpperCase()} · swirl ${p.swirl.toFixed(2)}`, x + 14, y + 14);
  ctx.restore();
}
function drawGlitchScene(x, y, w, h, audio) {
  const kick = audio.kick || 0, level = audio.level || 0;
  // Base picture: spectrum over scope, then the corruption happens live.
  drawSpectrum(x, y, w, h * 0.62, true);
  drawScope(x, y + h * 0.66, w, h * 0.28);
  if (kick < 0.35 && level < 0.1) return;
  // Corrupt tiles: copy chunks of the frame off-register, harder on kicks.
  const tiles = 2 + Math.floor(kick * 6);
  for (let n = 0; n < tiles; n++) {
    const tw = 24 + Math.floor(Math.random() * 48), th = 12 + Math.floor(Math.random() * 28);
    const sx = x + Math.floor(Math.random() * Math.max(1, w - tw)), sy = y + Math.floor(Math.random() * Math.max(1, h - th));
    const dx = sx + (Math.random() < 0.5 ? -1 : 1) * Math.floor(6 + Math.random() * 46 * kick);
    ctx.drawImage(canvas, sx, sy, tw, th, dx, sy, tw, th);
  }
  // Pixel-sort streaks: short horizontal runs re-ordered by brightness,
  // driven by the dynamics (same idea as the pixelsort layer, scene-scale).
  if (level > 0.12) {
    const runs = 1 + Math.floor(level * 5);
    for (let n = 0; n < runs; n++) {
      const gy = y + Math.floor(Math.random() * h);
      const gw = 30 + Math.floor(Math.random() * 90);
      const gx = x + Math.floor(Math.random() * Math.max(1, w - gw));
      const img = ctx.getImageData(gx, gy, gw, 1);
      const px = [];
      for (let k = 0; k < gw; k++) px.push([img.data[k * 4] * 0.3 + img.data[k * 4 + 1] * 0.6 + img.data[k * 4 + 2] * 0.1, img.data[k * 4], img.data[k * 4 + 1], img.data[k * 4 + 2]]);
      px.sort((a, b) => a[0] - b[0]);
      px.forEach((p, k) => { img.data[k * 4] = p[1]; img.data[k * 4 + 1] = p[2]; img.data[k * 4 + 2] = p[3]; });
      ctx.putImageData(img, gx, gy);
    }
  }
}

/* Depth look (Gather family): the photo's depth map as a heat backdrop,
   with the photo itself parallaxed live — near and far layers sway apart
   with the kick. Needs a depth map from Cook (step 05). */
const depthLookTmp = document.createElement('canvas');
const depthLookLayer = document.createElement('canvas');
function drawDepthLook(x, y, w, h) {
  const t = THEMES[state.theme];
  const kick = analysis ? analysis.kickPulse : state.beat;
  if (!depth.map) {
    // v0.2.7 item 7: the empty depth look used to be a dead caption.
    // Kick rings expand from the centre and the glow breathes with the
    // level, so the slot stays alive until a depth map is estimated.
    const lv = analysis ? analysis.level : 0;
    const cx = x + w / 2, cy = y + h / 2;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    // Level wash: the whole slot glows with the music, not just the rings.
    ctx.globalAlpha = lv * 0.12; ctx.fillStyle = t.accent; ctx.fillRect(x, y, w, h);
    for (let i = 0; i < 3; i++) {
      const rr = Math.min(w, h) * (0.12 + i * 0.1) * (1 + kick * 0.5);
      ctx.globalAlpha = Math.max(0.03, (0.28 - i * 0.07) * (0.5 + lv));
      ctx.strokeStyle = t.accent; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    ctx.fillStyle = t.dim; ctx.textAlign = 'center';
    ctx.font = '15px "Paper Mono", ui-monospace, monospace';
    ctx.fillText('No depth map yet — load a photo in Cook and press Estimate depth', x + w / 2, y + h / 2 - 10);
    ctx.fillText('Then this look turns the photo into a living depth field', x + w / 2, y + h / 2 + 14);
    return;
  }
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  // Heat depth map as the backdrop — its intensity breathes with the
  // level (audit follow-up: the map used to sit static under the kick
  // parallax). The photo layers also breathe — a slow bass zoom.
  const lv = analysis ? analysis.level : 0;
  const bass = state.smoothLow || 0;
  const breathe = 1 + bass * 0.08;
  if (cook.depthHeatCanvas) {
    ctx.globalAlpha = 0.35 + lv * 0.4;
    ctx.drawImage(cook.depthHeatCanvas, x, y, w, h);
    ctx.globalAlpha = 1;
  }
  if (cook.src && cook.nearMask && cook.farMask) {
    const parAmt = (Number($('cook-depth-parallax').value) / 100) || 0.4;
    const dx = Math.round(kick * 14 * parAmt);
    const tw = Math.round(w), th = Math.round(h);
    if (depthLookTmp.width !== tw || depthLookTmp.height !== th) { depthLookTmp.width = tw; depthLookTmp.height = th; }
    if (depthLookLayer.width !== tw || depthLookLayer.height !== th) { depthLookLayer.width = tw; depthLookLayer.height = th; }
    const tc = depthLookTmp.getContext('2d');
    tc.clearRect(0, 0, tw, th);
    tc.drawImage(cook.src, 0, 0, tw, th);
    const layer = (mask, off) => {
      const lc = depthLookLayer.getContext('2d');
      lc.clearRect(0, 0, tw, th);
      lc.drawImage(depthLookTmp, 0, 0);
      lc.globalCompositeOperation = 'destination-in';
      lc.drawImage(mask, 0, 0, tw, th);
      lc.globalCompositeOperation = 'source-over';
      const dw = tw * breathe, dh = th * breathe;
      ctx.drawImage(depthLookLayer, x + off - (dw - tw) / 2, y - (dh - th) / 2, dw, dh);
    };
    layer(cook.farMask, -dx);
    layer(cook.nearMask, dx);
  } else if (cook.src) {
    const dw = w * breathe, dh = h * breathe;
    ctx.drawImage(cook.src, x - (dw - w) / 2, y - (dh - h) / 2, dw, dh);
  }
  ctx.restore();
  ctx.fillStyle = t.text; ctx.textAlign = 'left';
  ctx.font = '700 13px "Paper Mono", ui-monospace, monospace';
  const label = depth.source === 'heuristic' ? 'DEPTH — HEURISTIC' : `DEPTH — ${depth.source === 'fastdepth' ? 'FASTDEPTH' : 'DEPTH ANYTHING V2'}`;
  ctx.fillText(label, x + 4, y + 18);
  ctx.fillStyle = t.dim;
  ctx.font = '12px "Paper Mono", ui-monospace, monospace';
  ctx.fillText(`near ↔ far sway with the kick · breathe with the bass · ${depth.depthW}×${depth.depthH} map`, x + 4, y + 36);
}
function midiRange() {
  if (!state.midi) return { lo: 36, hi: 96 };
  let lo = 127, hi = 0;
  for (const n of state.midi.notes) { lo = Math.min(lo, n.midi); hi = Math.max(hi, n.midi); }
  return { lo: Math.max(0, lo - 2), hi: Math.min(127, hi + 2) };
}
function drawRoll(x, y, w, h, showKeys) {
  const t = THEMES[state.theme];
  if (!state.midi) {
    // v0.2.7 item 7: the empty roll used to be a dead caption. It still
    // breathes now — the grid rows glow with the band energies, a
    // playhead sweeps with the beat phase, and the whole slot lifts
    // with the level — so it reads as music, not a still picture.
    const bands = mousikiBands();
    const kick = analysis ? analysis.kickPulse : state.beat;
    const lv = analysis ? analysis.level : 0;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    for (let i = 0; i < 12; i++) {
      const ny = y + ((i + 0.5) / 12) * h;
      const bv = bands[Math.floor(i * 64 / 12)] || 0;
      ctx.fillStyle = `rgba(125, 211, 252, ${0.04 + bv * 0.5 + kick * 0.1})`;
      ctx.fillRect(x, ny - 2, w, 4);
    }
    const ph = analysis && analysis.beatPhase >= 0 ? analysis.beatPhase : ((performance.now() / 500) % 1);
    ctx.strokeStyle = t.accent; ctx.globalAlpha = 0.5 + lv * 0.5; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + ph * w, y); ctx.lineTo(x + ph * w, y + h); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
    ctx.fillStyle = t.dim; ctx.textAlign = 'center';
    ctx.font = '15px "Paper Mono", ui-monospace, monospace';
    ctx.fillText('No MIDI loaded — open the .mid file for this track (Ctrl+M)', x + w / 2, y + h / 2);
    return;
  }
  const win = 8;
  const now = currentTime();
  const { lo, hi } = midiRange();
  const keyW = showKeys ? 46 : 0;
  const px = x + keyW, pw = w - keyW;
  const noteH = h / (hi - lo + 1);
  ctx.textAlign = 'left'; ctx.font = '10px "Paper Mono", ui-monospace, monospace';
  for (let m = lo; m <= hi; m++) {
    const ny = y + h - (m - lo + 1) * noteH;
    const isBlack = [1, 3, 6, 8, 10].includes(m % 12);
    if (isBlack) { ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fillRect(px, ny, pw, noteH); }
    if (showKeys && m % 12 === 0) {
      ctx.fillStyle = t.dim;
      ctx.fillText(`${NOTE_NAMES[0]}${Math.floor(m / 12) - 1}`, x + 6, ny + noteH / 2 + 3);
    }
  }
  const trackColors = ['#38bdf8', '#f472b6', '#a3e635', '#fbbf24', '#c084fc'];
  for (const n of state.midi.notes) {
    const sx = px + ((n.time - now + win * 0.25) / win) * pw;
    const sw = Math.max(2, (n.duration / win) * pw);
    if (sx + sw < px || sx > px + pw) continue;
    const ny = y + h - (n.midi - lo + 1) * noteH;
    const active = now >= n.time && now <= n.time + n.duration;
    ctx.globalAlpha = active ? 1 : 0.55;
    ctx.fillStyle = trackColors[n.track % trackColors.length];
    roundRect(sx, ny + 1, sw, noteH - 2, 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  const hx = px + (win * 0.25 / win) * pw;
  ctx.strokeStyle = t.accent; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(hx, y); ctx.lineTo(hx, y + h); ctx.stroke();
}
function drawFountain(x, y, w, h) {
  const t = THEMES[state.theme];
  const emit = Math.floor(2 + state.smoothLow * 26 + state.smoothMid * 10);
  for (let i = 0; i < emit; i++) {
    state.particles.push({
      x: x + w / 2 + (Math.random() - 0.5) * w * 0.12,
      y: y + h,
      vx: (Math.random() - 0.5) * 2.4,
      vy: -(3 + Math.random() * 5 + state.smoothLow * 7),
      r: 1 + Math.random() * 3.2,
      life: 1,
      band: Math.random() < 0.5 ? 'low' : (Math.random() < 0.5 ? 'mid' : 'high')
    });
  }
  const colors = { low: t.bar[0], mid: t.bar[1], high: t.bar[2] };
  state.particles = state.particles.filter((p) => p.life > 0 && p.y > y - 20);
  for (const p of state.particles) {
    p.x += p.vx; p.y += p.vy; p.vy += 0.09; p.life -= 0.008;
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = colors[p.band];
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function panelLabel(x, y, label) {
  const t = THEMES[state.theme];
  ctx.fillStyle = t.dim; ctx.font = '700 11px "Paper Mono", ui-monospace, monospace'; ctx.textAlign = 'left';
  ctx.fillText(label, x + 10, y + 18);
}
function drawPanel(x, y, w, h, label) {
  const t = THEMES[state.theme];
  ctx.fillStyle = t.panel;
  roundRect(x, y, w, h, 12); ctx.fill();
  panelLabel(x, y, label);
}
function setLook(look) {
  state.look = look;
  document.querySelectorAll('#lookbar .look-chip').forEach((b) => b.setAttribute('data-active', String(b.dataset.look === look)));
  // Look options: grouped preset dropdowns (Dithr pattern) for the looks
  // that have them; the description is the preset's plain-English line.
  const opts = $('look-options');
  const geo = $('geo-opt'), dit = $('dither-opt'), asc = $('ascii-scene-opt'), msh = $('mesh-scene-opt'), spc = $('spectrum-scene-opt');
  geo.hidden = dit.hidden = asc.hidden = msh.hidden = spc.hidden = true;
  if (look === 'geometric') {
    opts.hidden = false; geo.hidden = false;
    updateLookDesc($('geo-preset'));
  } else if (look === 'spectrum' || look === 'scope') {
    // v0.2.7 item 5: the Visualize spectrum/scope has its own theme
    // (Mousiki-style), separate from the Play tab's — picked here.
    opts.hidden = false; spc.hidden = false;
    updateLookDesc($('spectrum-scene-theme'));
  } else if (look === 'dither') {
    opts.hidden = false; dit.hidden = false;
    updateLookDesc($('dither-field'));
  } else if (look === 'ascii') {
    opts.hidden = false; asc.hidden = false;
    updateLookDesc($('ascii-scene-style'));
  } else if (look === 'mesh') {
    opts.hidden = false; msh.hidden = false;
    updateLookDesc($('mesh-scene-palette'));
  } else {
    opts.hidden = true;
  }
}
function updateLookDesc(sel) {
  const opt = sel.options[sel.selectedIndex];
  $('look-desc').textContent = opt ? (opt.textContent.split('—')[1] || opt.textContent).trim() : '';
}
$('geo-preset').addEventListener('change', (e) => {
  const v = e.target.value;
  state.geoShape = v;
  state.geoDensity = v === 'sparse' ? 0.6 : v === 'dense' ? 1.6 : 1;
  updateLookDesc(e.target);
});
$('dither-field').addEventListener('change', (e) => {
  state.ditherField = e.target.value;
  updateLookDesc(e.target);
});
$('ascii-scene-style').addEventListener('change', (e) => {
  state.asciiSceneStyle = e.target.value;
  updateLookDesc(e.target);
});
$('mesh-scene-palette').addEventListener('change', (e) => {
  state.meshScenePalette = e.target.value;
  updateLookDesc(e.target);
});
$('mesh-scene-react').addEventListener('input', (e) => {
  state.meshSceneReact = Number(e.target.value) || 0;
});
// v0.2.7 item 5: the Visualize spectrum/scope theme picker — picking a
// theme applies its whole bundle, persisted as cfg.vizThemes.sceneViz.
$('spectrum-scene-theme').addEventListener('change', (e) => {
  const p = SPECTRUM_THEMES[e.target.value];
  if (!p) return;
  state.sceneVizTheme = { ...p, name: e.target.value };
  persistSceneVizTheme();
  updateLookDesc(e.target);
});
$('btn-randomize-look').addEventListener('click', () => {
  if (state.look === 'geometric') {
    const sel = $('geo-preset');
    sel.selectedIndex = Math.floor(Math.random() * sel.options.length);
    sel.dispatchEvent(new Event('change'));
  } else if (state.look === 'dither') {
    const sel = $('dither-field');
    sel.selectedIndex = Math.floor(Math.random() * sel.options.length);
    sel.dispatchEvent(new Event('change'));
  }
});

/* ---------- layer stack UI (Alembic model) ---------- */
const LAYER_PRESETS_BUILTIN = {
  clean: [],
  'crt-night': [
    { type: 'scanlines', params: { gap: 3, alpha: 0.5 } },
    { type: 'crtvhs', params: { amount: 0.6 } },
    { type: 'grain', params: { amount: 0.4 } },
  ],
  'neon-grid': [
    { type: 'mesh', params: { palette: 'aurora', swirl: 0.5, scale: 1 } },
    { type: 'glow', params: { amount: 0.5 } },
    { type: 'halftone', params: { size: 12, alpha: 0.5 } },
  ],
  'riso-print': [
    { type: 'gradientmap', params: { palette: 'riso' } },
    { type: 'dither', params: { threshold: 0 } },
    { type: 'grain', params: { amount: 0.3 } },
  ],
  'mesh-dream': [
    { type: 'mesh', params: { palette: 'sunset', swirl: 0.7, scale: 1.2 } },
    { type: 'vignette', params: { amount: 0.6 } },
  ],
};
function layerDefaults(type) {
  const def = LAYER_TYPES[type];
  const params = {};
  for (const p of def.params) params[p.key] = p.def;
  if (type === 'mesh') params.nodes = [{ x: 0.25, y: 0.3 }, { x: 0.72, y: 0.25 }, { x: 0.5, y: 0.8 }];
  return params;
}
function addLayer(type) {
  const layer = { id: layers.uid++, type, enabled: true, blend: 'source-over', params: layerDefaults(type) };
  layers.stack.push(layer);
  layers.selected = layers.stack.length - 1;
  renderLayers();
  renderLayerParams();
}
function removeLayer(i) {
  layers.stack.splice(i, 1);
  layers.selected = Math.min(layers.selected, layers.stack.length - 1);
  renderLayers();
  renderLayerParams();
}
function moveLayer(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= layers.stack.length) return;
  [layers.stack[i], layers.stack[j]] = [layers.stack[j], layers.stack[i]];
  layers.selected = j;
  renderLayers();
  renderLayerParams();
}
function applyLayerPreset(name) {
  const preset = LAYER_PRESETS_BUILTIN[name] || loadLayerPresets()[name];
  if (!preset) { layers.stack = []; layers.selected = -1; renderLayers(); renderLayerParams(); return; }
  layers.stack = JSON.parse(JSON.stringify(preset)).map((l) => ({ id: layers.uid++, type: l.type, enabled: l.enabled !== false, blend: l.blend || 'source-over', params: { ...layerDefaults(l.type), ...l.params } }));
  layers.selected = layers.stack.length ? 0 : -1;
  renderLayers();
  renderLayerParams();
}
function loadLayerPresets() {
  try { return JSON.parse(localStorage.getItem('pulse.layerPresets.v1') || '{}'); } catch (_) { return {}; }
}
function saveLayerPresets(obj) {
  try { localStorage.setItem('pulse.layerPresets.v1', JSON.stringify(obj)); } catch (_) {}
}
function renderLayerPresetOptions() {
  const mine = $('layer-preset-mine');
  mine.innerHTML = '';
  for (const name of Object.keys(loadLayerPresets())) {
    const o = document.createElement('option');
    o.value = 'mine:' + name; o.textContent = name;
    mine.appendChild(o);
  }
}
function renderLayers() {
  const list = $('layers-list');
  list.innerHTML = '';
  layers.stack.forEach((l, i) => {
    const def = LAYER_TYPES[l.type];
    const li = document.createElement('li');
    li.className = (i === layers.selected ? 'selected' : '') + (l.enabled ? '' : ' off');
    li.innerHTML = `<button class="layer-btn" data-act="toggle" title="Toggle layer">${l.enabled ? '●' : '○'}</button>
      <span class="layer-name">${def.icon} ${def.label}</span>
      <button class="layer-btn" data-act="up" title="Move up">↑</button>
      <button class="layer-btn" data-act="down" title="Move down">↓</button>
      <button class="layer-btn" data-act="del" title="Remove layer">✕</button>`;
    li.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'toggle') { l.enabled = !l.enabled; renderLayers(); return; }
      if (act === 'up') { moveLayer(i, -1); return; }
      if (act === 'down') { moveLayer(i, 1); return; }
      if (act === 'del') { removeLayer(i); return; }
      layers.selected = i;
      renderLayers();
      renderLayerParams();
    });
    list.appendChild(li);
  });
  $('layers-empty').style.display = layers.stack.length ? 'none' : '';
  $('layers-count').textContent = layers.stack.length ? `${layers.stack.length} layer${layers.stack.length > 1 ? 's' : ''}` : '';
}
function renderLayerParams() {
  const panel = $('layer-params');
  const l = layers.stack[layers.selected];
  if (!l) { panel.hidden = true; return; }
  const def = LAYER_TYPES[l.type];
  panel.hidden = false;
  $('layer-params-name').textContent = `${def.icon} ${def.label}`;
  const rows = $('layer-params-rows');
  rows.innerHTML = '';
  for (const p of def.params) {
    const wrap = document.createElement('div');
    if (p.type === 'select') {
      wrap.innerHTML = `<label class="slider-row">${p.label} <select data-key="${p.key}">${p.options.map(([v, lab]) => `<option value="${v}" ${v === l.params[p.key] ? 'selected' : ''}>${lab}</option>`).join('')}</select></label><div class="param-desc">${p.desc}</div>`;
      wrap.querySelector('select').addEventListener('change', (e) => { l.params[p.key] = e.target.value; });
    } else {
      wrap.innerHTML = `<label class="slider-row">${p.label} <input type="range" class="paper-range" data-key="${p.key}" min="${p.min}" max="${p.max}" step="${p.step}" value="${l.params[p.key]}"> <input class="num-input" type="number" min="${p.min}" max="${p.max}" step="${p.step}" value="${l.params[p.key]}"></label><div class="param-desc">${p.desc}</div>`;
      const slider = wrap.querySelector('input[type="range"]');
      const num = wrap.querySelector('input');
      slider.addEventListener('input', () => { l.params[p.key] = Number(slider.value); num.value = slider.value; });
      num.addEventListener('change', () => {
        const v = Math.min(p.max, Math.max(p.min, Number(num.value) || p.def));
        l.params[p.key] = v; slider.value = v; num.value = v;
      });
    }
    rows.appendChild(wrap);
  }
  const blend = $('layer-blend');
  blend.value = l.blend;
  $('layer-blend-desc').textContent = blend.options[blend.selectedIndex]?.textContent.split('—')[1]?.trim() || '';
  $('mesh-edit-row').hidden = l.type !== 'mesh';
}
$('layer-blend').addEventListener('change', (e) => {
  const l = layers.stack[layers.selected];
  if (!l) return;
  l.blend = e.target.value;
  $('layer-blend-desc').textContent = e.target.options[e.target.selectedIndex]?.textContent.split('—')[1]?.trim() || '';
});
$('btn-layer-add').addEventListener('click', () => {
  const tiles = $('layer-tiles');
  tiles.innerHTML = '';
  for (const [type, def] of Object.entries(LAYER_TYPES)) {
    const b = document.createElement('button');
    b.className = 'layer-tile';
    b.innerHTML = `<span class="tile-icon">${def.icon}</span><span class="tile-label">${def.label}</span><span class="tile-desc">${def.desc}</span>`;
    b.addEventListener('click', () => { addLayer(type); $('add-layer-dialog').close(); });
    tiles.appendChild(b);
  }
  $('add-layer-dialog').show();
});
$('btn-close-add-layer').addEventListener('click', () => $('add-layer-dialog').close());
$('layer-preset').addEventListener('change', (e) => {
  const v = e.target.value;
  if (!v) return;
  if (v.startsWith('mine:')) applyLayerPreset(v.slice(5));
  else applyLayerPreset(v);
});
$('btn-layer-save-preset').addEventListener('click', () => {
  const name = $('layer-preset-name').value.trim();
  if (!name || !layers.stack.length) return;
  const saved = loadLayerPresets();
  saved[name] = layers.stack.map((l) => ({ type: l.type, enabled: l.enabled, blend: l.blend, params: l.params }));
  saveLayerPresets(saved);
  renderLayerPresetOptions();
  $('layer-preset').value = 'mine:' + name;
  $('layer-preset-name').value = '';
});
$('btn-layer-randomize').addEventListener('click', () => {
  const types = Object.keys(LAYER_TYPES);
  const n = 2 + Math.floor(Math.random() * 3);
  const picked = [];
  while (picked.length < n) {
    const t = types[Math.floor(Math.random() * types.length)];
    if (!picked.includes(t)) picked.push(t);
  }
  layers.stack = picked.map((t) => {
    const params = layerDefaults(t);
    for (const p of LAYER_TYPES[t].params) {
      if (p.type === 'select') params[p.key] = p.options[Math.floor(Math.random() * p.options.length)][0];
      else params[p.key] = +(p.min + Math.random() * (p.max - p.min)).toFixed(2);
    }
    return { id: layers.uid++, type: t, enabled: true, blend: 'source-over', params };
  });
  layers.selected = 0;
  renderLayers();
  renderLayerParams();
});
renderLayers();
renderLayerPresetOptions();

/* ---------- command palette (Ctrl+K, Alembic model) ---------- */
const PALETTE_COMMANDS = [
  { label: 'Go to Play tab', hint: 'Ctrl+1', run: () => setTab('play') },
  { label: 'Go to Visualize tab', hint: 'Ctrl+2', run: () => setTab('visualize') },
  { label: 'Go to Glitch tab', hint: 'Ctrl+3', run: () => setTab('glitch') },
  { label: 'Go to ASCII tab', hint: 'Ctrl+4', run: () => setTab('ascii') },
  { label: 'Go to Cut tab', hint: 'Ctrl+5', run: () => setTab('cut') },
  { label: 'Go to Cook tab', hint: 'Ctrl+6', run: () => setTab('cook') },
  { label: 'Listen to my PC (system audio)', hint: 'Toaster-style', run: () => startSystemAudio() },
  { label: 'Stop system audio', hint: '', run: () => stopSystemAudio(false) },
  { label: 'Play / pause', hint: 'Space', run: () => togglePlay() },
  { label: 'Next track', hint: 'n', run: () => nextTrack(false) },
  { label: 'Previous track', hint: 'b', run: () => prevTrack() },
  { label: 'Look: Spectrum', hint: '1', run: () => { setTab('visualize'); setLook('spectrum'); } },
  { label: 'Look: Scope', hint: '2', run: () => { setTab('visualize'); setLook('scope'); } },
  { label: 'Look: Orbit', hint: '3', run: () => { setTab('visualize'); setLook('orbit'); } },
  { label: 'Look: Piano Roll', hint: '4', run: () => { setTab('visualize'); setLook('roll'); } },
  { label: 'Look: Fountain', hint: '5', run: () => { setTab('visualize'); setLook('fountain'); } },
  { label: 'Look: Pattern', hint: '6', run: () => { setTab('visualize'); setLook('pattern'); } },
  { label: 'Look: Studio', hint: '7', run: () => { setTab('visualize'); setLook('studio'); } },
  { label: 'Look: Geometric', hint: '8', run: () => { setTab('visualize'); setLook('geometric'); } },
  { label: 'Look: Dither', hint: '9', run: () => { setTab('visualize'); setLook('dither'); } },
  { label: 'Look: Depth', hint: '0', run: () => { setTab('visualize'); setLook('depth'); } },
  { label: 'Scene: ASCII', hint: 'TOASTER', run: () => { setTab('visualize'); setLook('ascii'); } },
  { label: 'Scene: Mesh', hint: 'TOASTER', run: () => { setTab('visualize'); setLook('mesh'); } },
  { label: 'Scene: Glitch', hint: 'TOASTER', run: () => { setTab('visualize'); setLook('glitch'); } },
  { label: 'Export PNG snapshot', hint: 'Ctrl+S', run: () => snapshotCurrent() },
  { label: 'Record video', hint: 'Ctrl+R', run: () => toggleRecord() },
  { label: 'Randomize current look', hint: '🎲', run: () => $('btn-randomize-look').click() },
  { label: 'Randomize layer stack', hint: '🎲', run: () => $('btn-layer-randomize').click() },
  { label: 'Add a layer…', hint: 'Alembic', run: () => $('btn-layer-add').click() },
  { label: 'Toggle presentation mode', hint: 'F', run: () => togglePresent() },
  { label: 'Keyboard shortcuts', hint: '?', run: () => $('shortcuts-dialog').show() },
];
let paletteSel = 0, paletteFiltered = PALETTE_COMMANDS;
function renderPaletteList() {
  const list = $('palette-list');
  list.innerHTML = '';
  paletteFiltered.forEach((c, i) => {
    const div = document.createElement('div');
    div.className = 'palette-item' + (i === paletteSel ? ' sel' : '');
    div.innerHTML = `<span>${escapeHtml(c.label)}</span><small>${escapeHtml(c.hint)}</small>`;
    div.addEventListener('click', () => { $('palette-dialog').close(); c.run(); });
    list.appendChild(div);
  });
  if (!paletteFiltered.length) list.innerHTML = '<div class="palette-item"><span>No matching command</span><small></small></div>';
}
function openPalette() {
  $('palette-input').value = '';
  paletteFiltered = PALETTE_COMMANDS;
  paletteSel = 0;
  renderPaletteList();
  $('palette-dialog').show();
  setTimeout(() => $('palette-input').focus(), 50);
}
$('palette-input').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  paletteFiltered = PALETTE_COMMANDS.filter((c) => c.label.toLowerCase().includes(q) || c.hint.toLowerCase().includes(q));
  paletteSel = 0;
  renderPaletteList();
});
$('palette-input').addEventListener('keydown', (e) => {
  if (e.code === 'ArrowDown') { e.preventDefault(); paletteSel = Math.min(paletteFiltered.length - 1, paletteSel + 1); renderPaletteList(); }
  else if (e.code === 'ArrowUp') { e.preventDefault(); paletteSel = Math.max(0, paletteSel - 1); renderPaletteList(); }
  else if (e.code === 'Enter') {
    e.preventDefault();
    const c = paletteFiltered[paletteSel];
    if (c) { $('palette-dialog').close(); c.run(); }
  }
});
$('btn-palette').addEventListener('click', openPalette);
$('btn-viz-export').addEventListener('click', snapshotCurrent);
$('btn-present').addEventListener('click', togglePresent);

/* ---------- Spectrum analyzer theming, Mousiki-style (v0.2.7 item 5) ----------
   Mousiki (itzender5820/mousiki, src/fft_visualizer.cpp + config.txt) has
   no named theme packs — its "theme" IS the per-element settings: two
   colours for the visualizer strip (ColorVizLeft / ColorVizRight, a
   left→right gradient), plus three animation params that shape how the
   bars move — VisualizerFluidity (1–10), VisualizerDegradationSpeed
   (1–10), VisualizerViscosity (0–10) — and WaveformStyle (raw/smooth),
   all persisted in config.txt and edited in-app. Its FFT visualizer is
   32 mirrored bands (bass in the centre, treble at both edges), bars
   0–8 rows high, driven by a spring-damper per bar: fluidity sets the
   rise (spring_k 55→20, damping 0.35→0.20), degradation sets the fall
   (release_k 15→140 — bars fall FASTER than they rise, like a real VU
   meter), viscosity blends neighbouring bars ("surface tension"), and
   the two edge bars are pinned to the baseline so the strip always
   reads as one mountain.
   Pulse Suite keeps that model and adds named presets on top, because
   Austin asked to switch AWAY from the smooth Material look to other
   themes — ASCII included. A theme is a full bundle (style + colours +
   the three Mousiki params); picking one applies the bundle, tweaking
   a slider after that marks it Custom. The theme is stored PER
   VISUALIZER — the Play spectrum, the Play waveform, and the Visualize
   spectrum/scope each keep their own, persisted in pulse-config.json. */
const SPECTRUM_THEMES = {
  mousiki: { label: 'Mousiki', style: 'blocks', colorMode: 'gradient', colorLeft: '#7dd3fc', colorRight: '#f472b6', fluidity: 10, degradation: 10, viscosity: 1, desc: 'Mousiki’s own — springy bars, bass in the centre, sky-to-pink gradient.' },
  ascii: { label: 'ASCII', style: 'ascii', colorMode: 'solid', colorLeft: '#fbbf24', colorRight: '#fbbf24', fluidity: 5, degradation: 5, viscosity: 0, desc: 'Raw terminal — bars drawn as ASCII characters in amber, no smoothing between bars.' },
  vu: { label: 'VU Meter', style: 'blocks', colorMode: 'gradient', colorLeft: '#f59e0b', colorRight: '#ef4444', fluidity: 3, degradation: 1, viscosity: 2, desc: 'Old-school VU — slow rise, slower fade, amber into red.' },
  neon: { label: 'Neon', style: 'blocks', colorMode: 'gradient', colorLeft: '#e879f9', colorRight: '#22d3ee', fluidity: 8, degradation: 8, viscosity: 1, desc: 'Hot magenta to cyan, fast and punchy.' },
  matrix: { label: 'Matrix', style: 'ascii', colorMode: 'solid', colorLeft: '#22c55e', colorRight: '#22c55e', fluidity: 6, degradation: 6, viscosity: 0, desc: 'Green ASCII rain characters for the bars.' },
  mono: { label: 'Mono Line', style: 'line', colorMode: 'solid', colorLeft: '#cbd5e1', colorRight: '#cbd5e1', fluidity: 5, degradation: 5, viscosity: 1, desc: 'One grey line across the bar tops — no colour, no fuss.' },
};
const ASCII_RAMP = ' .:-=+*#%@'; // 10 levels, Mousiki's 0–8 rows + headroom
// Per-visualizer theme bundles. The Play spectrum/waveform read theirs
// from their module params (persisted under cfg.modules); the Visualize
// spectrum/scope keeps its own bundle in state, persisted as
// cfg.vizThemes.sceneViz.
function vizThemeFor(id) {
  const v = moduleVals(id);
  const preset = SPECTRUM_THEMES[v.theme] || SPECTRUM_THEMES.mousiki;
  return {
    name: SPECTRUM_THEMES[v.theme] ? v.theme : 'custom',
    style: preset.style, colorMode: preset.colorMode,
    colorLeft: v.colorLeft || preset.colorLeft,
    colorRight: v.colorRight || preset.colorRight,
    fluidity: Number(v.fluidity) || preset.fluidity,
    degradation: Number(v.degradation) || preset.degradation,
    viscosity: Number(v.viscosity) || 0,
    color: v.color || '',
  };
}
function sceneVizTheme() {
  return state.sceneVizTheme || SPECTRUM_THEMES.mousiki;
}
function persistSceneVizTheme() {
  if (window.pulse && window.pulse.setConfig) window.pulse.setConfig({ vizThemes: { sceneViz: state.sceneVizTheme } }).catch(() => {});
}
// Mousiki's spring-damper, ported 1:1 from fft_visualizer.cpp
// (compute_bars). One state per visualizer instance (key), so the Play
// spectrum and the Visualize spectrum don't fight over one spring.
const vizSprings = {};
function vizDt() {
  if (window.__vizDt) return window.__vizDt; // smoke test drives the clock
  return state.frameDt || 1 / 60;
}
function springBars(key, targets, theme) {
  const n = targets.length;
  let s = vizSprings[key];
  if (!s || s.n !== n) s = vizSprings[key] = { n, bars: new Float32Array(n), vel: new Float32Array(n) };
  const tf = Math.min(1, Math.max(0, (theme.fluidity - 1) / 9));
  const td = Math.min(1, Math.max(0, (theme.degradation - 1) / 9));
  const springK = 55 - tf * 35, damping = 0.35 - tf * 0.15, releaseK = 15 + td * 125;
  const visc = (theme.viscosity || 0) / 10 * 0.20;
  const d = Math.min(Math.max(vizDt(), 0.001), 0.5);
  for (let i = 0; i < n; i++) {
    const falling = targets[i] < s.bars[i];
    if (falling && s.vel[i] > 0) s.vel[i] *= 0.15; // kill leftover rise on the flip, or drops feel sluggish
    const k = falling ? releaseK : springK;
    s.vel[i] += (targets[i] - s.bars[i]) * k * d;
    s.vel[i] *= (1 - Math.min(Math.max(damping, 0), 0.95));
    s.bars[i] = Math.min(1, Math.max(0, s.bars[i] + s.vel[i] * d));
  }
  if (visc > 0 && n > 2) {
    const b = Float32Array.from(s.bars);
    for (let i = 0; i < n; i++) {
      const l = i > 0 ? b[i - 1] : b[i], r = i < n - 1 ? b[i + 1] : b[i];
      s.bars[i] = b[i] * (1 - visc) + (l + r) * 0.5 * visc;
    }
  }
  s.bars[0] = 0; s.bars[n - 1] = 0; // Mousiki: edges pinned to the baseline
  return s.bars;
}
function themeColorAt(theme, i, n, val) {
  if (theme.color) return theme.color;
  if (theme.colorMode === 'solid') return theme.colorLeft;
  if (theme.colorMode === 'hue') return `hsl(${200 + i * 1.2}, 80%, ${45 + val * 30}%)`;
  // gradient: left→right across the strip (Mousiki's ColorVizLeft/Right)
  const t = n > 1 ? i / (n - 1) : 0;
  const pa = hexRgb(theme.colorLeft), pb = hexRgb(theme.colorRight);
  return `rgb(${Math.round(pa[0] + (pb[0] - pa[0]) * t)},${Math.round(pa[1] + (pb[1] - pa[1]) * t)},${Math.round(pa[2] + (pb[2] - pa[2]) * t)})`;
}
function hexRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return [125, 211, 252];
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
// One bar renderer for every spectrum in the app — Play mini, Visualize
// spectrum, scope strip. `vals` are 0..1 bar heights, `g` any 2d ctx.
function drawSpectrumBars(g, vals, x, y, w, h, theme) {
  const n = vals.length, bw = w / n;
  if (theme.style === 'line') {
    g.strokeStyle = themeColorAt(theme, 0, n, 0.5); g.lineWidth = 2; g.beginPath();
    for (let i = 0; i < n; i++) {
      const px = x + i * bw + bw / 2, py = y + h - Math.max(2, vals[i] * h);
      i === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
    }
    g.stroke();
    g.fillStyle = themeColorAt(theme, 0, n, 0.5); g.globalAlpha = 0.12;
    g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.closePath(); g.fill(); g.globalAlpha = 1;
    return;
  }
  for (let i = 0; i < n; i++) {
    const v = vals[i], bh = Math.max(0, v * h);
    if (bh < 1) continue;
    const col = themeColorAt(theme, i, n, v);
    if (theme.style === 'ascii') {
      // Mousiki bars are 0–8 rows: the character IS the height.
      const ch = ASCII_RAMP[Math.min(ASCII_RAMP.length - 1, Math.round(v * (ASCII_RAMP.length - 1)))];
      const fs = Math.max(6, Math.min(bw * 1.6, h * 0.9));
      g.fillStyle = col; g.font = `bold ${fs}px ui-monospace, "Cascadia Mono", monospace`;
      g.textAlign = 'center'; g.textBaseline = 'bottom';
      g.fillText(ch, x + i * bw + bw / 2, y + h - 1);
    } else if (theme.style === 'dots') {
      const rows = Math.max(1, Math.round(v * 8)), r = Math.max(1.5, Math.min(bw / 2 - 1, h / 18));
      g.fillStyle = col;
      for (let row = 0; row < rows; row++) {
        g.beginPath();
        g.arc(x + i * bw + bw / 2, y + h - r - row * (r * 2 + 2), r, 0, Math.PI * 2);
        g.fill();
      }
    } else {
      g.fillStyle = col;
      g.fillRect(x + i * bw + 1, y + h - bh, bw - 2, bh);
    }
  }
}

/* ---------- Play tab mini visualizers ---------- */
function drawMiniSpectrum() {
  const c = $('play-spectrum');
  const g = c.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(2, Math.floor(c.clientWidth * dpr)), h = Math.max(2, Math.floor(c.clientHeight * dpr));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  g.fillStyle = '#0b1220'; g.fillRect(0, 0, w, h);
  // v0.2.6: the spectrum is a module — bands / sensitivity / colour come
  // from its editor (right-click it), not from hardcoded constants.
  // v0.2.7 item 5: the bars now run through Mousiki's spring-damper and
  // draw in the module's THEME (blocks / ASCII / dots / line + colours +
  // fluidity / fall / viscosity), not the old smooth gradient.
  const v = moduleVals('spectrum');
  const bars = Number(v.bands) || 64;
  const sens = Number(v.sensitivity) || 1;
  const bands = mousikiBands();
  const targets = new Float32Array(bars);
  for (let i = 0; i < bars; i++) {
    const bv = v.mirrored ? bands[Math.floor(i * 64 / bars)] : (analysis ? analysis.bands64[Math.floor(i * 64 / bars)] : bands[Math.floor(i * 64 / bars)]);
    targets[i] = Math.min(1, bv * sens);
  }
  const theme = vizThemeFor('spectrum');
  const vals = springBars('playSpectrum', targets, theme);
  drawSpectrumBars(g, vals, 0, 0, w, h, theme);
}
function drawMiniWave() {
  const c = $('play-waveform');
  const g = c.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(2, Math.floor(c.clientWidth * dpr)), h = Math.max(2, Math.floor(c.clientHeight * dpr));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  g.fillStyle = '#0b1220'; g.fillRect(0, 0, w, h);
  // v0.2.6: waveform module settings (style raw/smooth, sensitivity, colour).
  // v0.2.7 item 5: the line colour + smoothing come from the waveform's
  // own theme (Mousiki's WaveformStyle raw/smooth is the style param;
  // fluidity is the smoothing window).
  const v = moduleVals('waveform');
  const sens = Number(v.sensitivity) || 1;
  const theme = vizThemeFor('waveform');
  g.strokeStyle = theme.color || theme.colorLeft || '#7dd3fc'; g.lineWidth = 2; g.beginPath();
  const step = Math.floor(waveData.length / w);
  const smoothN = Math.max(1, Math.round((theme.fluidity || 5) / 2));
  const at = (px) => {
    const i = Math.min(waveData.length - 1, px * step);
    if (v.style === 'smooth') {
      const a = waveData[Math.max(0, i - 1)] / 128 - 1, b = waveData[i] / 128 - 1, d = waveData[Math.min(waveData.length - 1, i + 1)] / 128 - 1;
      return (a + b * 2 + d) / 4;
    }
    // Raw, with the theme's fluidity as a small moving-average window.
    let sum = 0, n = 0;
    for (let k = -smoothN; k <= smoothN; k++) {
      const j = Math.min(waveData.length - 1, Math.max(0, i + k));
      sum += waveData[j] / 128 - 1; n++;
    }
    return sum / n;
  };
  for (let px = 0; px < w; px++) {
    const val = Math.max(-1, Math.min(1, at(px) * sens));
    const py = h / 2 + val * (h / 2 - 4);
    px === 0 ? g.moveTo(0, py) : g.lineTo(px, py);
  }
  g.stroke();
}

/* ---------- modules: click / right-click to edit (v0.2.6, Mousiki model) ----------
   Mousiki's settings: every element has on/off + colours + animation params,
   persisted in config.txt, settings on 's'. Pulse Suite does the same thing
   with a mouse: click a module's title (or the spectrum/waveform canvas)
   to open its editor; right-click anywhere on a module for its menu.
   Modules with no registry entry still get the generic menu (hide panel,
   show hidden panels, reset layout). */
const moduleSettings = {};
const MODULES = {
  spectrum: {
    name: 'Spectrum analyzer',
    params: [
      // v0.2.7 item 5: Mousiki-style themes — picking one applies its
      // whole bundle (style + colours + fluidity / fall / viscosity);
      // tweaking a slider after that marks it Custom.
      { key: 'theme', label: 'Theme', type: 'select', options: [['mousiki', 'Mousiki — springy gradient bars'], ['ascii', 'ASCII — terminal characters, amber'], ['vu', 'VU Meter — slow amber-to-red'], ['neon', 'Neon — magenta to cyan'], ['matrix', 'Matrix — green ASCII'], ['mono', 'Mono Line — one grey line'], ['custom', 'Custom — your own mix']], def: 'mousiki', desc: 'Mousiki’s theme model: a theme is its colours plus how the bars move. Pick one, or tweak the sliders below and it becomes Custom.' },
      { key: 'fluidity', label: 'Fluidity (rise)', type: 'range', min: 1, max: 10, step: 1, def: 10, desc: 'Mousiki’s VisualizerFluidity — how springy the bars rise. 1 is snappy, 10 floats.' },
      { key: 'degradation', label: 'Fall speed', type: 'range', min: 1, max: 10, step: 1, def: 10, desc: 'Mousiki’s VisualizerDegradationSpeed — how fast bars fall. 1 is a slow VU fade, 10 snaps to zero.' },
      { key: 'viscosity', label: 'Viscosity (blend)', type: 'range', min: 0, max: 10, step: 1, def: 1, desc: 'Mousiki’s VisualizerViscosity — how much neighbouring bars pull on each other.' },
      { key: 'colorLeft', label: 'Colour — left', type: 'color', def: '#7dd3fc', desc: 'Mousiki’s ColorVizLeft — the gradient’s left end.' },
      { key: 'colorRight', label: 'Colour — right', type: 'color', def: '#f472b6', desc: 'Mousiki’s ColorVizRight — the gradient’s right end.' },
      { key: 'bands', label: 'Bands', type: 'select', options: [['16', '16 bands'], ['32', '32 bands'], ['64', '64 bands']], def: '64', desc: 'How many bars the analyzer draws — 64 is the full mirrored Mousiki set.' },
      { key: 'sensitivity', label: 'Sensitivity', type: 'range', min: 0.2, max: 2, step: 0.05, def: 1, desc: 'How hard the bars hit — higher means quiet parts read louder.' },
      { key: 'mirrored', label: 'Mirrored (bass in the centre)', type: 'toggle', def: true, desc: 'Mousiki-style: bass sits in the middle, treble falls off to both edges.' },
      { key: 'color', label: 'Bar colour', type: 'color', def: '', desc: 'Empty means the theme gradient; pick a colour to pin the bars to one hue.' },
      { key: 'visible', label: 'Show this module', type: 'toggle', def: true, desc: 'Hide the spectrum without losing its settings.' },
    ],
  },
  waveform: {
    name: 'Waveform',
    params: [
      { key: 'theme', label: 'Theme', type: 'select', options: [['mousiki', 'Mousiki — sky line'], ['ascii', 'ASCII — amber line'], ['vu', 'VU Meter — amber line'], ['neon', 'Neon — magenta line'], ['matrix', 'Matrix — green line'], ['mono', 'Mono Line — grey line'], ['custom', 'Custom — your own mix']], def: 'mousiki', desc: 'The waveform’s theme — its colour and how much the line is smoothed. Tweaking the sliders below marks it Custom.' },
      { key: 'fluidity', label: 'Fluidity (smoothing)', type: 'range', min: 1, max: 10, step: 1, def: 10, desc: 'How much the line is smoothed — Mousiki’s fluidity, as a moving-average window.' },
      { key: 'colorLeft', label: 'Line colour', type: 'color', def: '#7dd3fc', desc: 'The theme’s line colour (left colour of the pair).' },
      { key: 'colorRight', label: 'Colour — right', type: 'color', def: '#f472b6', desc: 'Second theme colour — used by the Visualize scope strip, not the Play line.' },
      { key: 'style', label: 'Style', type: 'select', options: [['raw', 'Raw — every sample'], ['smooth', 'Smooth — averaged']], def: 'raw', desc: 'Mousiki’s waveform styles.' },
      { key: 'sensitivity', label: 'Sensitivity', type: 'range', min: 0.2, max: 2, step: 0.05, def: 1, desc: 'How hard the line swings.' },
      { key: 'color', label: 'Line colour', type: 'color', def: '', desc: 'Empty means the theme colour; pick a colour to pin the line to one hue.' },
      { key: 'visible', label: 'Show this module', type: 'toggle', def: true },
    ],
  },
  library: {
    name: 'Library',
    params: [
      { key: 'visible', label: 'Show this module', type: 'toggle', def: true },
      { key: 'compact', label: 'Compact rows', type: 'toggle', def: false, desc: 'Tighter rows, more tracks on screen.' },
    ],
  },
  queue: {
    name: 'Queue',
    params: [
      { key: 'visible', label: 'Show this module', type: 'toggle', def: true },
      { key: 'compact', label: 'Compact rows', type: 'toggle', def: false },
    ],
  },
  lyrics: {
    name: 'Lyrics',
    params: [
      { key: 'visible', label: 'Show this module', type: 'toggle', def: true },
      { key: 'fontSize', label: 'Font size', type: 'range', min: 11, max: 20, step: 1, def: 14 },
      { key: 'align', label: 'Alignment', type: 'select', options: [['left', 'Left'], ['center', 'Center']], def: 'left' },
    ],
  },
  'live-map': {
    name: 'Live map',
    params: [
      { key: 'visible', label: 'Show this module', type: 'toggle', def: true },
      { key: 'blipSize', label: 'Blip size', type: 'range', min: 0.5, max: 3, step: 0.25, def: 1, desc: 'How big the kick/snare/hat/chord blips draw.' },
      { key: 'trail', label: 'Trail length (s)', type: 'range', min: 1, max: 5, step: 0.5, def: 2.6, desc: 'How long a blip stays on the map before fading.' },
      // v0.2.7 item 6: the map is a module now — theme, grid, shapes,
      // per-type on/off + colours, and how many blips it keeps.
      { key: 'mapTheme', label: 'Colour theme', type: 'select', options: [['neon', 'Neon'], ['ember', 'Ember'], ['matrix', 'Matrix'], ['mono', 'Mono']], def: 'neon', desc: 'The palette every blip type draws from (per-type colours below override it).' },
      { key: 'grid', label: 'Grid style', type: 'select', options: [['grid', 'Grid lines'], ['dots', 'Dot lattice'], ['rings', 'Concentric rings'], ['none', 'Bare']], def: 'grid' },
      { key: 'gridDensity', label: 'Grid density', type: 'range', min: 2, max: 16, step: 1, def: 8, desc: 'How many columns the grid / dot lattice draws.' },
      { key: 'shape', label: 'Blip shape', type: 'select', options: [['mixed', 'Mixed — each type its own'], ['circle', 'Circles'], ['diamond', 'Diamonds'], ['square', 'Squares']], def: 'mixed' },
      { key: 'trailStyle', label: 'Trail style', type: 'select', options: [['fade', 'Fade — dot + expanding ring'], ['ring', 'Ring only'], ['comet', 'Comet — dot + tail toward centre']], def: 'fade' },
      { key: 'connect', label: 'Connect blips in time order', type: 'toggle', def: true, desc: 'Draws a line through the last blips in the order they landed.' },
      { key: 'maxBlips', label: 'Max blips', type: 'range', min: 20, max: 200, step: 10, def: 90, desc: 'Oldest blips drop off past this many.' },
      { key: 'showKick', label: 'Show KICK blips', type: 'toggle', def: true },
      { key: 'showSnare', label: 'Show SNARE blips', type: 'toggle', def: true },
      { key: 'showHat', label: 'Show HAT blips', type: 'toggle', def: true },
      { key: 'showChord', label: 'Show CHORD blips', type: 'toggle', def: true },
      { key: 'showBass', label: 'Show BASS blips', type: 'toggle', def: true },
      { key: 'showVox', label: 'Show VOCALS blips', type: 'toggle', def: true },
      { key: 'showBeat', label: 'Show BEAT markers', type: 'toggle', def: true },
      { key: 'showBar', label: 'Show BAR markers', type: 'toggle', def: true },
      { key: 'showDrop', label: 'Show DROP flashes', type: 'toggle', def: true },
      { key: 'showNote', label: 'Show NOTE blips', type: 'toggle', def: true },
      { key: 'colorKick', label: 'KICK colour', type: 'color', def: '', desc: 'Empty means the theme colour.' },
      { key: 'colorSnare', label: 'SNARE colour', type: 'color', def: '' },
      { key: 'colorHat', label: 'HAT colour', type: 'color', def: '' },
      { key: 'colorChord', label: 'CHORD colour', type: 'color', def: '' },
      { key: 'colorBass', label: 'BASS colour', type: 'color', def: '' },
      { key: 'colorVox', label: 'VOCALS colour', type: 'color', def: '' },
    ],
  },
  'code-panel': {
    name: 'Live code',
    params: [
      { key: 'visible', label: 'Show this module', type: 'toggle', def: true },
      { key: 'fontSize', label: 'Font size', type: 'range', min: 10, max: 18, step: 1, def: 12.5 },
    ],
  },
  'layers-panel': {
    name: 'Effect layers',
    params: [{ key: 'visible', label: 'Show this module', type: 'toggle', def: true }],
  },
};
function moduleVals(id) {
  const m = MODULES[id];
  const out = {};
  if (m) for (const p of m.params) out[p.key] = p.def;
  return { ...out, ...(moduleSettings[id] || {}) };
}
function persistModules() {
  if (window.pulse && window.pulse.setConfig) window.pulse.setConfig({ modules: moduleSettings }).catch(() => {});
}
function applyModule(id) {
  const m = MODULES[id];
  if (!m) return;
  const v = moduleVals(id);
  const el = document.querySelector(`[data-module="${id}"]`);
  // Visibility is the LAYOUT's job (hide/show via the context menu,
  // persisted under `layout`). Only honour the module editor's "Show
  // this module" toggle when the user explicitly set it — the default
  // (visible: true) must never un-hide a panel the layout hid, or a
  // hidden panel comes back on every restart.
  if (el && moduleSettings[id] && 'visible' in moduleSettings[id]) el.classList.toggle('layout-hidden', !moduleSettings[id].visible);
  if (id === 'lyrics') {
    const ly = $('lyrics');
    if (ly) { ly.style.fontSize = v.fontSize + 'px'; ly.style.textAlign = v.align || 'left'; }
  }
  if (id === 'library' || id === 'queue') {
    if (el) el.classList.toggle('module-compact', !!v.compact);
  }
  if (id === 'code-panel') {
    const cl = $('code-lines');
    if (cl && v.fontSize) cl.style.fontSize = v.fontSize + 'px';
  }
}
function applyModuleSettings(saved) {
  if (!saved || typeof saved !== 'object') return;
  Object.assign(moduleSettings, saved);
  for (const id of Object.keys(MODULES)) applyModule(id);
}
function openModuleEditor(id) {
  const m = MODULES[id];
  const dlg = $('module-dialog');
  const body = $('module-dialog-body');
  if (!m) return;
  $('module-dialog-title').textContent = 'MODULE — ' + m.name.toUpperCase();
  const v = moduleVals(id);
  body.innerHTML = '';
  for (const p of m.params) {
    const row = document.createElement('div');
    row.className = 'param-row';
    const lab = document.createElement('label');
    lab.textContent = p.label;
    row.appendChild(lab);
    const cur = v[p.key];
    if (p.type === 'range') {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;gap:8px;align-items:center;';
      const s = document.createElement('input');
      s.type = 'range'; s.className = 'paper-range'; s.min = p.min; s.max = p.max; s.step = p.step; s.value = cur;
      s.style.flex = '1';
      const n = document.createElement('input');
      n.type = 'number'; n.className = 'num-input'; n.min = p.min; n.max = p.max; n.step = p.step; n.value = cur;
      s.addEventListener('input', () => { n.value = s.value; setModuleParam(id, p.key, Number(s.value)); });
      n.addEventListener('change', () => { const val = Math.min(p.max, Math.max(p.min, Number(n.value) || Number(s.value))); s.value = val; n.value = val; setModuleParam(id, p.key, val); });
      wrap.appendChild(s); wrap.appendChild(n);
      row.appendChild(wrap);
    } else if (p.type === 'select') {
      const sel = document.createElement('select');
      sel.className = 'paper-select';
      for (const [val, label] of p.options) {
        const o = document.createElement('option');
        o.value = val; o.textContent = label; if (String(cur) === String(val)) o.selected = true;
        sel.appendChild(o);
      }
      sel.addEventListener('change', () => setModuleParam(id, p.key, sel.value));
      row.appendChild(sel);
    } else if (p.type === 'color') {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;gap:8px;align-items:center;';
      const c = document.createElement('input');
      c.type = 'color'; c.value = cur || '#7dd3fc';
      c.addEventListener('input', () => setModuleParam(id, p.key, c.value));
      const b = document.createElement('button');
      b.className = 'paper-btn paper-btn-text'; b.textContent = 'Use theme';
      b.addEventListener('click', () => setModuleParam(id, p.key, ''));
      wrap.appendChild(c); wrap.appendChild(b);
      row.appendChild(wrap);
    } else if (p.type === 'toggle') {
      const chk = document.createElement('input');
      chk.type = 'checkbox'; chk.className = 'paper-switch'; chk.checked = !!cur;
      chk.addEventListener('change', () => setModuleParam(id, p.key, chk.checked));
      row.appendChild(chk);
    }
    if (p.desc) {
      const d = document.createElement('div');
      d.className = 'param-desc'; d.textContent = p.desc;
      row.appendChild(d);
    }
    body.appendChild(row);
  }
  $('btn-module-reset').onclick = () => {
    moduleSettings[id] = {};
    applyModule(id); persistModules();
    openModuleEditor(id); // re-render with defaults
  };
  if (!dlg.open) dlg.showModal();
}
function setModuleParam(id, key, value) {
  if (!moduleSettings[id]) moduleSettings[id] = {};
  // v0.2.7 item 5: picking a spectrum/waveform theme applies its whole
  // bundle (Mousiki model — a theme IS its colours + animation params).
  if ((id === 'spectrum' || id === 'waveform') && key === 'theme' && SPECTRUM_THEMES[value]) {
    const p = SPECTRUM_THEMES[value];
    Object.assign(moduleSettings[id], { theme: value, fluidity: p.fluidity, degradation: p.degradation, viscosity: p.viscosity, colorLeft: p.colorLeft, colorRight: p.colorRight });
    applyModule(id); persistModules();
    openModuleEditor(id); // re-render so the sliders show the preset
    return;
  }
  // Tweaking a theme param by hand marks the theme Custom (the dialog's
  // select catches up next time it opens).
  if ((id === 'spectrum' || id === 'waveform') && ['fluidity', 'degradation', 'viscosity', 'colorLeft', 'colorRight'].includes(key)) {
    moduleSettings[id].theme = 'custom';
  }
  moduleSettings[id][key] = value;
  applyModule(id);
  persistModules();
}
$('btn-module-close').addEventListener('click', () => $('module-dialog').close());
// Keep the module editor's "Show this module" toggle truthful when a
// panel is hidden/shown from the context menu (the layout is the source
// of truth for visibility; this just mirrors it into module settings).
function syncModuleVisible(panelEl, visible) {
  const modEl = panelEl.closest ? panelEl.closest('[data-module]') : null;
  const id = modEl && modEl.dataset.module;
  if (id && MODULES[id]) {
    if (!moduleSettings[id]) moduleSettings[id] = {};
    moduleSettings[id].visible = visible;
    persistModules();
  }
}
function showModuleMenu(x, y, target) {
  const menu = $('module-menu');
  const modEl = target.closest ? target.closest('[data-module]') : null;
  const panelEl = target.closest ? target.closest('[data-layout-panel]') : null;
  const items = [];
  if (modEl) {
    const id = modEl.dataset.module;
    const name = (MODULES[id] && MODULES[id].name) || modEl.dataset.moduleName || id;
    if (MODULES[id]) items.push({ label: `Edit ${name}…`, run: () => openModuleEditor(id) });
    else items.push({ label: name, head: true });
  }
  if (panelEl && window.PulseLayout) {
    items.push({
      label: 'Hide this panel', run: () => {
        window.PulseLayout.hidePanel(panelEl);
        syncModuleVisible(panelEl, false);
      },
    });
  }
  const hidden = window.PulseLayout ? window.PulseLayout.hiddenPanels() : [];
  if (hidden.length) {
    items.push({ sep: true });
    items.push({ label: 'SHOW HIDDEN PANEL', head: true });
    for (const h of hidden) items.push({
      label: '▸ ' + h.name, run: () => {
        window.PulseLayout.showPanel(h.key);
        const el = document.querySelector(`[data-layout-panel="${h.key}"]`);
        if (el) syncModuleVisible(el, true);
      },
    });
  }
  items.push({ sep: true });
  items.push({ label: 'Reset layout', run: () => window.PulseLayout && window.PulseLayout.resetLayout() });
  menu.innerHTML = '';
  for (const it of items) {
    if (it.sep) { const hr = document.createElement('div'); hr.style.cssText = 'border-top:1px solid var(--app-border);margin:4px 0;'; menu.appendChild(hr); continue; }
    if (it.head) { const hd = document.createElement('div'); hd.className = 'menu-head'; hd.textContent = it.label; menu.appendChild(hd); continue; }
    const b = document.createElement('button');
    b.className = 'paper-menu-item'; b.textContent = it.label;
    b.addEventListener('click', () => { menu.hidden = true; it.run(); });
    menu.appendChild(b);
  }
  menu.hidden = false;
  const mw = 260, mh = Math.min(400, items.length * 36 + 16);
  menu.style.left = Math.min(x, window.innerWidth - mw - 8) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - mh - 8) + 'px';
}
document.addEventListener('contextmenu', (e) => {
  // v0.2.7 item 2: right-click a Studio quadrant to SWAP it. The canvas
  // is inside .panel, so this has to run before the generic module menu.
  if (e.target === canvas && state.look === 'studio' && state.studioRects.length) {
    const r = canvas.getBoundingClientRect();
    const cx = (e.clientX - r.left) * (canvas.width / r.width);
    const cy = (e.clientY - r.top) * (canvas.height / r.height);
    const idx = state.studioRects.findIndex((s) => cx >= s.x && cx <= s.x + s.w && cy >= s.y && cy <= s.y + s.h);
    if (idx >= 0) {
      e.preventDefault();
      showStudioSwapMenu(e.clientX, e.clientY, idx);
      return;
    }
  }
  // v0.2.6: right-click a module or panel to edit it. Outside the panels
  // (tab bar, transport) the browser menu stays as it was.
  const t = e.target.closest ? e.target.closest('[data-module], [data-layout-panel], .panel') : null;
  if (!t) return;
  e.preventDefault();
  showModuleMenu(e.clientX, e.clientY, e.target);
});
document.addEventListener('click', (e) => {
  const menu = $('module-menu');
  if (menu && !menu.hidden && !menu.contains(e.target)) menu.hidden = true;
  if (!e.target.closest) return;
  // Click a module's title bar (or the spectrum/waveform canvas) to edit it.
  if (e.target.closest('button, input, select, .drag-grip, .resize-grip')) return;
  const canvas = e.target.closest('canvas[data-module]');
  if (canvas) { openModuleEditor(canvas.dataset.module); return; }
  const title = e.target.closest('.pane-title, .code-head, .layers-head');
  const modEl = title && title.closest('[data-module]');
  if (modEl && MODULES[modEl.dataset.module]) openModuleEditor(modEl.dataset.module);
});
document.addEventListener('dblclick', (e) => {
  if (!e.target.closest) return;
  const modEl = e.target.closest('[data-module]');
  if (modEl && MODULES[modEl.dataset.module]) openModuleEditor(modEl.dataset.module);
});
document.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') { const menu = $('module-menu'); if (menu) menu.hidden = true; }
});

/* ---------- shared render loop (one heartbeat, Felhaven's Kairos) ---------- */
let lastCodeUpdate = 0;
// Syntax-highlight one line of live code for the Visualize panel only
// (Mission Control + the pop-out keep plain text). The `scene:` line is
// the star — hot pink, like a TUI cursor line; comments dim; Strudel
// keywords sky. Input is escaped first; nothing from the audio engine
// reaches the DOM unescaped.
function highlightCodeLine(line) {
  const esc = escapeHtml(line);
  if (/^scene:/.test(line)) return `<span class="tok-scene">${esc}</span>`;
  if (/^\/\//.test(line)) return `<span class="tok-com">${esc}</span>`;
  if (/^_/.test(line)) return `<span class="tok-dim">${esc}</span>`;
  const m = esc.match(/^(.*?)( \/\/ .*)$/);
  const body = m ? m[1] : esc, tail = m ? m[2] : '';
  const kw = body.replace(/\b(setcpm|s|note|chord|slider|voicing|struct|orbit|lpf|lpsync|lpdepth|lpq|distort|duck|duckdepth|bank|room|gain|clip|slice|early)\b(?=\()/g, '<span class="tok-kw">$1</span>')
    .replace(/\b(const scale|x)\b/g, '<span class="tok-kw">$1</span>');
  return kw + (tail ? `<span class="tok-com">${tail}</span>` : '');
}
function updateCodePanel() {
  const pre = $('code-lines');
  const status = $('code-status');
  if (!analysis) return;
  const audio = { kick: analysis.kickPulse, bass: state.smoothLow, level: analysis.level, t: performance.now() / 1000 };
  const meta = {
    source: state.sysAudio ? 'system audio' : (state.trackName || '...'),
    song: state.sysAudio ? null : { title: state.trackName.replace(/\.[^.]+$/, ''), artist: '', app: 'Pulse Suite' },
    scene: sceneLine(audio),
  };
  const lines = cgBuildLines(analysis, meta, performance.now() / 1000);
  let text = CG_LINE_IDS.map((id) => (lines[id] || []).map((p) => p.text).join('')).join('\n');
  if (state.customCode.trim()) text += '\n// — custom lines (live code editor) —\n' + state.customCode.trim();
  if (pre.dataset.plain !== text) {
    pre.dataset.plain = text;
    pre.innerHTML = text.split('\n').map(highlightCodeLine).join('\n');
  }
  status.textContent = analysis.silent
    ? '— waiting for sound'
    : `— ${analysis.bpmLocked ? `~${Math.round(analysis.bpm)} BPM` : 'finding the beat'}${analysis.key ? ` · ${TA_NOTES[analysis.key.root]}:${analysis.key.mode}` : ''}${analysis.section ? ` · ${analysis.section}` : ''}`;
  // Mission Control shows the same live code, and the popped-out editor
  // gets it too (throttled by the 500 ms caller).
  const mc = $('mc-code');
  if (mc && mc.textContent !== text) mc.textContent = text;
  const mcStatus = $('mc-code-status');
  if (mcStatus) mcStatus.textContent = status.textContent;
  broadcastCodePopout(text, status.textContent);
}
/* Current FX params as the code editor sees them (look + theme + cook). */
function currentFxParams() {
  return {
    look: state.look,
    theme: state.theme,
    cookIntensity: Number($('cook-intensity') ? $('cook-intensity').value : 50)
  };
}
function broadcastCodePopout(text, statusText) {
  if (!window.pulse.popoutSend) return;
  window.pulse.popoutSend('code', { kind: 'code', text, fx: currentFxParams(), custom: state.customCode, status: statusText || '' });
}
function updateVizLive() {
  // The Toaster bar is always visible on this tab — it IS the tab's chrome
  // (v0.2.4: no more hiding it; the bar lives in Visualize).
  const tag = $('viz-status-tag');
  if (tag) {
    tag.textContent = state.sysAudio ? '● listening' : (state.playing ? '▶ playing' : '○ idle');
    tag.classList.toggle('live', !!(state.sysAudio || state.playing));
  }
  $('viz-status-track').textContent = state.sysAudio ? '▶ SYSTEM AUDIO' : (state.trackName ? `${state.playing ? '▶' : '❚❚'} ${state.trackName}` : '— no track —');
  const nLayers = layers.stack.filter((l) => l.enabled).length;
  $('viz-layers').textContent = nLayers ? `${nLayers} LAYER${nLayers > 1 ? 'S' : ''}` : '';
  // (BPM / key / chord / section / scene / frame live in the code panel's
  // status line and the present strip — the bar stays the Toaster bar.)
  // Now-playing card (Toaster's N key) — refresh while it's open.
  const card = $('viz-card');
  if (card && !card.hidden) {
    $('viz-card-title').textContent = state.sysAudio ? 'System audio' : (state.trackName || 'No track');
    $('viz-card-meta').textContent = state.sysAudio ? 'Whatever is playing on your PC' : (state.trackName ? `${fmt(state.duration)}${state.bpm ? ` · ~${state.bpm} BPM` : ''}` : '—');
    $('viz-card-scene').textContent = `SCENE ${(SCENES[state.look] || {}).label || state.look} · ${(analysis && analysis.chord) ? analysis.chord.name : ''}`;
  }
}
function updatePresentStrip() {
  const strip = $('present-strip');
  if (!state.presenting) { strip.hidden = true; return; }
  strip.hidden = false;
  const bpm = analysis && analysis.bpmLocked ? `~${Math.round(analysis.bpm)} BPM` : (state.bpm ? `~${state.bpm} BPM` : '');
  const chord = analysis && analysis.chord ? analysis.chord.name : '';
  const key = analysis && analysis.key ? `${TA_NOTES[analysis.key.root]} ${analysis.key.mode}` : '';
  $('present-info').textContent = [state.look.toUpperCase(), bpm, chord, key].filter(Boolean).join('  ·  ') || 'PULSE';
}
function setPresenting(on) {
  state.presenting = on;
  document.body.classList.toggle('presenting', on);
  updatePresentStrip();
}
function togglePresent() {
  if (activeTab !== 'visualize') setTab('visualize');
  setPresenting(!state.presenting);
}
/* ---------- Visualize fullscreen (v0.2.6) ----------
   Different from presentation mode: fullscreen fills the SCREEN with the
   stage (browser fullscreen API on the tab), the tab bar + transport hide,
   and the panels (code, layers, options) stay on top — draggable, so you
   can park them where you want. Esc or the button exits. */
function setVizFullscreen(on) {
  const tab = $('tab-visualize');
  if (on) {
    if (activeTab !== 'visualize') setTab('visualize');
    state.vizFullscreen = true;
    document.body.classList.add('viz-fullscreen');
    tab.classList.add('viz-fullscreen');
    if (tab.requestFullscreen) tab.requestFullscreen().catch(() => {});
    setTimeout(resize, 100);
  } else {
    state.vizFullscreen = false;
    document.body.classList.remove('viz-fullscreen');
    tab.classList.remove('viz-fullscreen');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    setTimeout(resize, 100);
  }
}
function toggleVizFullscreen() { setVizFullscreen(!state.vizFullscreen); }
$('btn-viz-fullscreen').addEventListener('click', toggleVizFullscreen);
document.addEventListener('fullscreenchange', () => {
  // The user pressed Esc in browser fullscreen: drop the app-side class too.
  if (!document.fullscreenElement && state.vizFullscreen) {
    state.vizFullscreen = false;
    document.body.classList.remove('viz-fullscreen');
    $('tab-visualize').classList.remove('viz-fullscreen');
    setTimeout(resize, 100);
  }
});
$('btn-mc-collapse').addEventListener('click', () => {
  const mc = $('play-mc');
  mc.classList.toggle('collapsed');
  $('btn-mc-collapse').textContent = mc.classList.contains('collapsed') ? '▸ Expand' : '▾ Collapse';
});
/* ---------- Studio slots (v0.2.7 item 2): draw ANY scene into a rect ----------
   One dispatcher for the whole Visualize tab: the single-look path and the
   Studio grid both go through here, so every scene is swappable. The
   original 13 draws take (x, y, w, h) on the global ctx; scope/orbit keep
   their old proportions inside the rect they're given. */
function drawSceneInto(id, x, y, w, h, audio) {
  if (id === 'spectrum') drawSpectrum(x, y, w, h, true);
  else if (id === 'scope') {
    drawScope(x, y + h * 0.2, w, h * 0.6);
    drawSpectrum(x, y + h * 0.86, w, h * 0.12, false);
  } else if (id === 'orbit') drawOrbit(x + w / 2, y + h / 2, Math.min(w, h) * 0.32);
  else if (id === 'roll') drawRoll(x, y, w, h, true);
  else if (id === 'fountain') drawFountain(x, y, w, h);
  else if (id === 'pattern') drawPattern(x, y, w, h);
  else if (id === 'geometric') drawGeometricLook(x, y, w, h);
  else if (id === 'dither') drawDitherLook(x, y, w, h);
  else if (id === 'depth') drawDepthLook(x, y, w, h);
  else if (id === 'ascii') drawAsciiScene(x, y, w, h, audio);
  else if (id === 'mesh') drawMeshScene(x, y, w, h, audio);
  else if (id === 'glitch') drawGlitchScene(x, y, w, h, audio);
  else if (window.PULSE_SCENES_026 && window.PULSE_SCENES_026.draw[id]) {
    // v0.2.6: the 37 new scenes live in scenes-026.js and draw from the
    // same audio bundle as the original 13.
    drawScene026(id, x, y, w, h, audio);
  } else {
    // Unknown id (e.g. a scene removed since the config was saved): fall
    // back to the spectrum so the slot never goes blank.
    drawSpectrum(x, y, w, h, true);
  }
}
// Studio grid: 1 slot fills the stage; 2 sit side by side; 3–4 make a
// 2×2; 5–6 a 3×2; 7–8 a 4×2. Slot rects are remembered for hit-testing
// (right-click a quadrant to swap it).
function studioSlotRects(x, y, w, h, n) {
  const gap = 14;
  const cols = n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 2 : n <= 6 ? 3 : 4;
  const rows = Math.ceil(n / cols);
  const cw = (w - gap * (cols - 1)) / cols, ch = (h - gap * (rows - 1)) / rows;
  const rects = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols, r = Math.floor(i / cols);
    rects.push({ x: x + c * (cw + gap), y: y + r * (ch + gap), w: cw, h: ch });
  }
  return rects;
}
function drawStudio(x, y, w, h, audio) {
  const slots = state.studioSlots.filter((id) => SCENES[id] && id !== 'studio');
  if (!slots.length) { state.studioSlots = ['scope', 'spectrum', 'roll', 'orbit']; return drawStudio(x, y, w, h, audio); }
  const rects = studioSlotRects(x, y, w, h, slots.length);
  state.studioRects = rects.map((r, i) => ({ ...r, id: slots[i] }));
  slots.forEach((id, i) => {
    const r = rects[i];
    const label = (SCENES[id] && SCENES[id].label ? SCENES[id].label : id).toUpperCase()
      + (id === 'roll' && state.midi ? ` — ${state.midiName}` : '');
    drawPanel(r.x, r.y, r.w, r.h, label);
    drawSceneInto(id, r.x + 12, r.y + 30, r.w - 24, r.h - 44, audio);
  });
}
function persistStudioSlots() {
  if (window.pulse && window.pulse.setConfig) window.pulse.setConfig({ studioSlots: state.studioSlots }).catch(() => {});
}
// Right-click a Studio quadrant: swap it for any of the 50 scenes, add a
// slot, remove this slot, or reset to the classic four. Built on the same
// .paper-menu as the module menu so it looks hand-made, not Material.
function showStudioSwapMenu(mx, my, slotIdx) {
  const menu = $('module-menu');
  const cur = state.studioSlots[slotIdx];
  const items = [];
  items.push({ label: `SLOT ${slotIdx + 1} — ${SCENES[cur] ? SCENES[cur].label : cur}`, head: true });
  const fams = [];
  for (const id of SCENE_ORDER) {
    if (id === 'studio' || !SCENES[id]) continue;
    if (!fams.includes(SCENES[id].family)) fams.push(SCENES[id].family);
  }
  for (const fam of fams) {
    items.push({ label: fam, head: true });
    for (const id of SCENE_ORDER) {
      if (id === 'studio' || !SCENES[id] || SCENES[id].family !== fam) continue;
      items.push({ label: (id === cur ? '● ' : '○ ') + SCENES[id].label, run: () => { state.studioSlots[slotIdx] = id; persistStudioSlots(); } });
    }
  }
  items.push({ sep: true });
  if (state.studioSlots.length < 8) items.push({ label: '＋ Add a slot', run: () => { state.studioSlots.push('spectrum'); persistStudioSlots(); } });
  if (state.studioSlots.length > 1) items.push({ label: '− Remove this slot', run: () => { state.studioSlots.splice(slotIdx, 1); persistStudioSlots(); } });
  items.push({ label: 'Reset to the classic four', run: () => { state.studioSlots = ['scope', 'spectrum', 'roll', 'orbit']; persistStudioSlots(); } });
  menu.innerHTML = '';
  for (const it of items) {
    if (it.sep) { const hr = document.createElement('div'); hr.style.cssText = 'border-top:1px solid var(--app-border);margin:4px 0;'; menu.appendChild(hr); continue; }
    if (it.head) { const hd = document.createElement('div'); hd.className = 'menu-head'; hd.textContent = it.label; menu.appendChild(hd); continue; }
    const b = document.createElement('button');
    b.className = 'paper-menu-item'; b.textContent = it.label;
    b.addEventListener('click', () => { menu.hidden = true; it.run(); });
    menu.appendChild(b);
  }
  menu.hidden = false;
  // 50 scenes is a long menu — scroll it instead of letting it run off
  // the bottom of the screen.
  menu.style.maxHeight = '70vh';
  menu.style.overflowY = 'auto';
  const mw = 260;
  menu.style.left = Math.min(mx, window.innerWidth - mw - 8) + 'px';
  menu.style.top = Math.min(my, window.innerHeight - 200) + 'px';
}

function render() {
  const w = canvas.width, h = canvas.height;
  const t = THEMES[state.theme];
  // Frame dt, once per frame — the spectrum springs (Mousiki model) all
  // read this, so the Play and Visualize visualizers advance together.
  const frameNowMs = performance.now();
  if (state._lastFrameMs) state.frameDt = Math.min(Math.max((frameNowMs - state._lastFrameMs) / 1000, 0.001), 0.1);
  state._lastFrameMs = frameNowMs;

  if (state.analyser) {
    state.analyser.getByteFrequencyData(freqData);
    state.analyser.getByteTimeDomainData(waveData);
    state.analyser.getFloatFrequencyData(freqDb);
    state.analyser.getFloatTimeDomainData(timeFloat);
    if (state.analyserSlow) state.analyserSlow.getFloatFrequencyData(slowDb);
    const low = bandEnergy(20, 250), mid = bandEnergy(250, 2000), high = bandEnergy(2000, 16000);
    state.smoothLow += (low - state.smoothLow) * 0.35;
    state.smoothMid += (mid - state.smoothMid) * 0.35;
    state.smoothHigh += (high - state.smoothHigh) * 0.35;
    // The Toaster engine hears the same analyser as every visual: file,
    // video or system audio — one source, one picture.
    if (analysis && (state.playing || state.sysAudio)) {
      analysis.update(freqDb, timeFloat, state.audioCtx.currentTime, slowDb);
      state.beat = Math.max(state.beat, analysis.kickPulse);
      if (analysis.bpmLocked && analysis.bpm !== state.bpm) {
        state.bpm = Math.round(analysis.bpm);
        state.barSeconds = 240 / state.bpm;
        $('bpm').textContent = `~${state.bpm} BPM · LIVE`;
      }
    } else {
      let rms = 0;
      for (let i = 0; i < waveData.length; i += 8) { const v = waveData[i] / 128 - 1; rms += v * v; }
      rms = Math.sqrt(rms / (waveData.length / 8));
      const jump = rms - state.prevEnergy;
      if (jump > 0.02) state.beat = Math.min(1, jump * 6);
      state.prevEnergy = rms;
    }
  }
  state.beat *= 0.9;

  if (activeTab === 'visualize' && w > 0) {
    const audio = { kick: analysis ? analysis.kickPulse : state.beat, bass: state.smoothLow, level: analysis ? analysis.level : 0, t: performance.now() / 1000, centroid: analysis ? analysis.centroid : 0, bands32: analysis ? analysis.bands32 : null };
    // Mesh backdrop layer draws behind the look; otherwise the theme gradient.
    const meshLayer = layers.stack.find((l) => l.enabled && l.type === 'mesh');
    if (meshLayer) drawMeshGradient(ctx, w, h, meshLayer.params, audio.t, audio);
    else { ctx.fillStyle = bgGradient(w, h); ctx.fillRect(0, 0, w, h); }
    const pad = 26, top = 56, bottom = 64;
    const cw = w - pad * 2, ch = h - top - bottom;
    if (!state.buffer && !state.videoMode && !state.sysAudio) {
      ctx.fillStyle = t.dim; ctx.textAlign = 'center';
      ctx.font = '16px "Paper Mono", ui-monospace, monospace';
      ctx.fillText('Open a track to begin', w / 2, h / 2);
    } else if (state.look === 'studio') {
      drawStudio(pad, top, cw, ch, audio);
    } else {
      drawSceneInto(state.look, pad, top, cw, ch, audio);
    }
    // The layer stack runs over the look, in order; mesh node handles last.
    applyPostLayers(audio);
    drawMeshHandles();
    state.frameCount++;
    updateVizLive();
    updatePresentStrip();
  } else if (activeTab === 'play') {
    drawMiniSpectrum();
    drawMiniWave();
    updateLyrics();
    // v0.2.6: Mission Control lives in the Play tab now — the map, x-ray,
    // tiles, code + hex update with the player, on the same heartbeat.
    updateMissionControl();
  } else if (activeTab === 'glitch') {
    renderGlitchPreview();
  } else if (activeTab === 'ascii') {
    renderAscii();
  } else if (activeTab === 'cut') {
    updateCutPreview();
  }

  // AUDIO CORRUPT (Glitch tab): corrupt a few bytes on every kick while
  // audio plays, so the hex view is genuinely live.
  audioCorruptTick();

  // Cooking runs on the shared heartbeat even off-tab, so the photo keeps
  // cooking while the user looks at another tab.
  if (cook.active) cookFrame();

  // The live code panel (Visualize, Mission Control, pop-out) updates on
  // every tab, not just Visualize — it is the engine's running transcript.
  const nowMs = performance.now();
  if (nowMs - lastCodeUpdate > 500) { lastCodeUpdate = nowMs; updateCodePanel(); }

  if ((state.buffer || state.videoMode || state.sysAudio) && state.playing) {
    const tm = currentTime();
    if (state.duration) {
      $('seek').value = Math.floor(1000 * tm / state.duration);
      const ps = $('play-seek'); if (ps) ps.value = Math.floor(1000 * tm / state.duration);
    }
    $('time-current').textContent = fmt(tm);
    const ptc = $('play-time-cur'); if (ptc) ptc.textContent = fmt(tm);
  }
  requestAnimationFrame(render);
}
requestAnimationFrame(render);

/* ---------- tab switching (native .paper-tab buttons, v0.2.4) ---------- */
const TAB_ORDER = ['play', 'visualize', 'glitch', 'ascii', 'cut', 'cook'];
function setTab(tab) {
  activeTab = tab;
  if (tab !== 'visualize' && state.presenting) setPresenting(false);
  // Leaving Cut stops the cut-preview VIDEO (visual only) — the shared
  // track keeps playing. Leaving any tab never touches the engine.
  if (tab !== 'cut') stopCutPreviewVisual();
  document.querySelectorAll('#tabs .paper-tab').forEach((b) => b.setAttribute('data-active', String(b.dataset.tab === tab)));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + tab));
  if (tab === 'visualize') resize();
  if (tab === 'cook') { updateCookButtons(); drawCookDisplay(); }
}
document.querySelectorAll('#tabs .paper-tab').forEach((b) => {
  b.addEventListener('click', () => setTab(b.dataset.tab));
});

/* ---------- Mission Control tab: live map + pipeline x-ray + live code/hex ----------
   The map IS the music: every detected event (kick, snare, hat, chord
   change) pops onto the grid as a labelled blip and fades. The x-ray shows
   the song travelling SOURCE → DECODE → FFT → DETECTION → LAYERS → OUTPUT
   with live values at each stage. The rail reuses the live code panel and
   a live hex view of the Glitch working copy. */
const mc = { blips: [], rings: [], flash: 0, lastOnsetT: -1, lastChord: null, lastBassT: -10, lastVoxUp: false, lastStepKey: -1, lastBar: -1, lastSection: '', lastNoteIdx: -1, lastNoteAt: 0, lastHexAt: 0, lastXrayAt: 0, fps: 0, lastFrameT: 0, hexBusy: false };
const mcMap = $('mc-map');
const mcMapCtx = mcMap.getContext('2d');
// v0.2.7 item 6: every event type the engine already detects gets a home
// on the map — kick/snare/hat/chord as before, plus bass (the 16-step bass
// grid's hits), vocals (presence crossing up), beat + bar markers (the
// step grid), drops (section flips) and the loudest note (chroma argmax).
// Regions are the type's home turf; 'note' is placed by pitch instead.
const MC_TYPES = {
  bd:    { label: 'KICK',  region: [0.50, 0.68], color: '#ff2e88', shape: 'circle' },
  sd:    { label: 'SNARE', region: [0.22, 0.36], color: '#38bdf8', shape: 'square' },
  hh:    { label: 'HAT',   region: [0.78, 0.28], color: '#a3e635', shape: 'diamond' },
  chord: { label: 'CHORD', region: [0.50, 0.42], color: '#c084fc', shape: 'circle' },
  bass:  { label: 'BASS',  region: [0.50, 0.86], color: '#f59e0b', shape: 'diamond' },
  vox:   { label: 'VOX',   region: [0.78, 0.62], color: '#ec4899', shape: 'circle' },
  beat:  { label: 'BEAT',  region: [0.22, 0.14], color: '#94a3b8', shape: 'circle' },
  bar:   { label: 'BAR',   region: [0.50, 0.50], color: '#e2e8f0', shape: 'ring' },
  drop:  { label: 'DROP',  region: [0.50, 0.50], color: '#ef4444', shape: 'circle' },
  note:  { label: 'NOTE',  region: null,         color: '#facc15', shape: 'diamond' },
};
const MC_TYPE_PARAM = { bd: 'showKick', sd: 'showSnare', hh: 'showHat', chord: 'showChord', bass: 'showBass', vox: 'showVox', beat: 'showBeat', bar: 'showBar', drop: 'showDrop', note: 'showNote' };
const MC_TYPE_COLOR_PARAM = { bd: 'colorKick', sd: 'colorSnare', hh: 'colorHat', chord: 'colorChord', bass: 'colorBass', vox: 'colorVox' };
const MC_THEMES = {
  neon:   { bd: '#ff2e88', sd: '#38bdf8', hh: '#a3e635', chord: '#c084fc', bass: '#f59e0b', vox: '#ec4899', beat: '#94a3b8', bar: '#e2e8f0', drop: '#ef4444', note: '#facc15' },
  ember:  { bd: '#ff6b35', sd: '#ffb703', hh: '#ffd166', chord: '#e85d75', bass: '#f48c06', vox: '#ff8fa3', beat: '#b08968', bar: '#fff3e4', drop: '#d00000', note: '#ffe66d' },
  matrix: { bd: '#00ff41', sd: '#39ff14', hh: '#7fff00', chord: '#00e676', bass: '#aeea00', vox: '#64ffda', beat: '#69f0ae', bar: '#ccff90', drop: '#ff1744', note: '#eeff41' },
  mono:   { bd: '#f8fafc', sd: '#cbd5e1', hh: '#94a3b8', chord: '#e2e8f0', bass: '#f1f5f9', vox: '#cbd5e1', beat: '#64748b', bar: '#f8fafc', drop: '#ffffff', note: '#e2e8f0' },
};
function mcMapVals() { return moduleVals('live-map'); }
function mcTypeOn(type) {
  const v = mcMapVals();
  const key = MC_TYPE_PARAM[type];
  return key ? v[key] !== false : true;
}
function mcColor(type) {
  const v = mcMapVals();
  const cKey = MC_TYPE_COLOR_PARAM[type];
  if (cKey && v[cKey]) return v[cKey];
  const theme = MC_THEMES[v.mapTheme] || MC_THEMES.neon;
  return theme[type] || MC_TYPES[type].color;
}
function mcPushBlip(type, strength, opts) {
  if (!mcTypeOn(type)) return;
  const w = mcMap.width, h = mcMap.height;
  const def = MC_TYPES[type] || {};
  let x, y;
  if (opts && opts.x != null && opts.y != null) { x = opts.x; y = opts.y; }
  else if (def.region) {
    x = def.region[0] * w + (Math.random() - 0.5) * w * 0.16;
    y = def.region[1] * h + (Math.random() - 0.5) * h * 0.14;
  } else return;
  const b = {
    type, s: strength || 0.8, x, y, born: performance.now(),
    label: (opts && opts.label) || def.label || type.toUpperCase(),
  };
  mc.blips.push(b);
  const max = Number(mcMapVals().maxBlips) || 90;
  if (mc.blips.length > max) mc.blips.splice(0, mc.blips.length - max);
  // A kick lands hard: flash the whole map and send out a shockwave.
  if (type === 'bd') {
    mc.flash = 1;
    mc.rings.push({ x: b.x, y: b.y, born: b.born, maxR: Math.min(w, h) * 0.5, dur: 700 });
  }
  return b;
}
function mcPushRing(x, y, maxR, dur) {
  mc.rings.push({ x, y, born: performance.now(), maxR, dur: dur || 900 });
  if (mc.rings.length > 24) mc.rings.shift();
}
function mcConsumeOnsets() {
  if (!analysis) return;
  const now = performance.now();
  for (const o of analysis.onsets) {
    if (o.t <= mc.lastOnsetT) continue;
    mc.lastOnsetT = o.t;
    mcPushBlip(o.id === 'bd' ? 'bd' : o.id === 'sd' ? 'sd' : 'hh', o.s || 0.7);
  }
  if (analysis.chord && analysis.chord.name !== mc.lastChord) {
    mc.lastChord = analysis.chord.name;
    mcPushBlip('chord', 1);
  }
  // Bass: the 16-step bass grid's hits land in the bottom region.
  if (analysis.v && analysis.v.bass && analysis.v.bass.lastHit.t > mc.lastBassT) {
    mc.lastBassT = analysis.v.bass.lastHit.t;
    mcPushBlip('bass', 0.9);
  }
  // Vocals: presence crossing 0.5 upward (a sustained pad has energy but
  // no flux, so it does not read as a voice — see analysis.js).
  const voxUp = !!(analysis.instruments && analysis.instruments.vocals > 0.5);
  if (voxUp && !mc.lastVoxUp) mcPushBlip('vox', analysis.instruments.vocals);
  mc.lastVoxUp = voxUp;
  // Beat + bar: the step grid — every 4th step is a beat, a new bar is a ring.
  const stepKey = analysis.bar * 16 + analysis.step;
  if (stepKey !== mc.lastStepKey) {
    mc.lastStepKey = stepKey;
    if (analysis.step % 4 === 0) {
      mcPushBlip('beat', 0.5);
      mcPushRing(mcMap.width * 0.5, mcMap.height * 0.5, Math.min(mcMap.width, mcMap.height) * 0.42, 600);
    }
    if (analysis.bar !== mc.lastBar) {
      mc.lastBar = analysis.bar;
      mcPushBlip('bar', 1);
      mcPushRing(mcMap.width * 0.5, mcMap.height * 0.5, Math.min(mcMap.width, mcMap.height) * 0.48, 1000);
    }
  }
  // Drop: the section flips to 'drop' — big flash, centre stage.
  if (analysis.section && analysis.section !== mc.lastSection) {
    if (analysis.section === 'drop') { mcPushBlip('drop', 1); mc.flash = 1; }
    mc.lastSection = analysis.section;
  }
  // Note: the loudest pitch class (chroma argmax), gated so a flickering
  // frame can't spam the map — clear pitch, 400 ms apart minimum.
  if (analysis.chromaSum > 0.05) {
    let ni = 0;
    for (let i = 1; i < 12; i++) if (analysis.chroma[i] > analysis.chroma[ni]) ni = i;
    if (ni !== mc.lastNoteIdx && analysis.chroma[ni] > 0.25 && now - mc.lastNoteAt > 400) {
      mc.lastNoteIdx = ni; mc.lastNoteAt = now;
      mcPushBlip('note', 0.7, { x: ((ni + 0.5) / 12) * mcMap.width, y: mcMap.height * 0.10, label: TA_NOTES[ni] });
    }
  }
}
function mcDrawShape(g, shape, x, y, r) {
  g.beginPath();
  if (shape === 'square') g.rect(x - r, y - r, r * 2, r * 2);
  else if (shape === 'diamond') { g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath(); }
  else g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}
function drawMcMap() {
  const w = mcMap.width, h = mcMap.height;
  if (!w || !h) return;
  const g = mcMapCtx;
  g.fillStyle = '#05070f'; g.fillRect(0, 0, w, h);
  const mapVals = mcMapVals();
  // --- grid: lines, dots, concentric rings, or bare ---
  const gridStyle = mapVals.grid || 'grid';
  const dens = Math.max(2, Math.min(16, Number(mapVals.gridDensity) || 8));
  g.strokeStyle = 'rgba(148,163,184,0.12)'; g.lineWidth = 1;
  if (gridStyle === 'grid') {
    for (let i = 1; i < dens; i++) { g.beginPath(); g.moveTo((w / dens) * i, 0); g.lineTo((w / dens) * i, h); g.stroke(); }
    for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(0, (h / 5) * i); g.lineTo(w, (h / 5) * i); g.stroke(); }
  } else if (gridStyle === 'dots') {
    g.fillStyle = 'rgba(148,163,184,0.25)';
    for (let i = 1; i < dens; i++) for (let j = 1; j < 5; j++) { g.beginPath(); g.arc((w / dens) * i, (h / 5) * j, 1.5, 0, Math.PI * 2); g.fill(); }
  } else if (gridStyle === 'rings') {
    const cx = w / 2, cy = h / 2, maxR = Math.min(w, h) / 2;
    for (let i = 1; i <= 4; i++) { g.beginPath(); g.arc(cx, cy, (maxR / 4) * i, 0, Math.PI * 2); g.stroke(); }
    g.beginPath(); g.moveTo(cx, 0); g.lineTo(cx, h); g.moveTo(0, cy); g.lineTo(w, cy); g.stroke();
  }
  const sx = w * 0.5, sy = h * 0.5;
  g.fillStyle = '#38bdf8';
  g.beginPath(); g.arc(sx, sy, 4, 0, Math.PI * 2); g.fill();
  g.font = '700 10px "Paper Mono", monospace'; g.fillStyle = '#64748b';
  g.fillText(state.sysAudio ? 'SOURCE: SYSTEM AUDIO' : (state.trackName ? 'SOURCE: ' + state.trackName : 'SOURCE: —'), 8, 14);
  const now = performance.now();
  // --- kick flash: the whole map flares on a kick, then decays ---
  if (mc.flash > 0.02) {
    g.globalAlpha = mc.flash * 0.16;
    g.fillStyle = mcColor('bd');
    g.fillRect(0, 0, w, h);
    g.globalAlpha = 1;
    mc.flash *= 0.88;
  }
  // --- beat pulse rings: expanding circles from the centre / shockwaves ---
  mc.rings = mc.rings.filter((r) => now - r.born < r.dur);
  for (const r of mc.rings) {
    const p = (now - r.born) / r.dur;
    g.globalAlpha = (1 - p) * 0.5;
    g.strokeStyle = '#e2e8f0'; g.lineWidth = 2;
    g.beginPath(); g.arc(r.x, r.y, Math.max(2, p * r.maxR), 0, Math.PI * 2); g.stroke();
    g.globalAlpha = 1;
  }
  const trailMs = (Number(mapVals.trail) || 2.6) * 1000;
  const blipScale = Number(mapVals.blipSize) || 1;
  mc.blips = mc.blips.filter((b) => now - b.born < trailMs);
  // --- connecting trails: a line through the blips in time order ---
  if (mapVals.connect !== false && mc.blips.length > 1) {
    const ordered = [...mc.blips].sort((a, b) => a.born - b.born).slice(-10);
    g.lineWidth = 1;
    for (let i = 1; i < ordered.length; i++) {
      const a = ordered[i - 1], b = ordered[i];
      const age = (now - b.born) / trailMs;
      g.globalAlpha = (1 - age) * 0.45;
      g.strokeStyle = mcColor(b.type);
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    }
    g.globalAlpha = 1;
  }
  const shapeMode = mapVals.shape || 'mixed';
  const trailStyle = mapVals.trailStyle || 'fade';
  for (const b of mc.blips) {
    const age = (now - b.born) / trailMs;
    const a = 1 - age;
    const color = mcColor(b.type);
    const shape = shapeMode === 'mixed' ? (MC_TYPES[b.type] ? MC_TYPES[b.type].shape : 'circle') : shapeMode;
    g.strokeStyle = color; g.globalAlpha = a * 0.35; g.lineWidth = 1;
    g.beginPath(); g.moveTo(sx, sy); g.lineTo(b.x, b.y); g.stroke();
    if (shape === 'ring' || trailStyle === 'ring') {
      // Ring-only blips: just the expanding circle + label, no dot.
      const r = (4 + age * 26) * blipScale;
      g.globalAlpha = a * 0.8;
      g.beginPath(); g.arc(b.x, b.y, r, 0, Math.PI * 2); g.stroke();
    } else {
      const r = (4 + age * 26) * blipScale;
      g.globalAlpha = a * 0.8;
      g.beginPath(); g.arc(b.x, b.y, r, 0, Math.PI * 2); g.stroke();
      if (trailStyle === 'comet') {
        // Comet: a short fading tail pointing back toward the centre.
        g.globalAlpha = a * 0.5;
        const dx = sx - b.x, dy = sy - b.y, len = Math.hypot(dx, dy) || 1;
        g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(b.x + (dx / len) * 34 * blipScale, b.y + (dy / len) * 34 * blipScale); g.stroke();
      }
      g.globalAlpha = a;
      g.fillStyle = color;
      mcDrawShape(g, shape, b.x, b.y, (3 + b.s * 3) * blipScale);
    }
    g.globalAlpha = a;
    g.fillStyle = color;
    g.font = '700 10px "Paper Mono", monospace';
    g.fillText(b.label || (MC_TYPES[b.type] ? MC_TYPES[b.type].label : b.type.toUpperCase()), b.x + 8, b.y + 3);
    g.globalAlpha = 1;
  }
  $('mc-map-count').textContent = mc.blips.length
    ? `${mc.blips.length} live event${mc.blips.length > 1 ? 's' : ''}`
    : (analysis && !analysis.silent ? 'listening…' : 'play something — kicks, snares, hats, chords land here as they happen');
}
function updateMcXray() {
  const live = analysis && !analysis.silent && (state.playing || state.sysAudio);
  const set = (id, v) => { const el = $(id); if (el && el.textContent !== v) el.textContent = v; };
  set('xray-source', state.sysAudio ? 'SYSTEM AUDIO' : (state.trackName || '—'));
  set('xray-source-sub', state.sysAudio ? 'loopback · whatever plays on the PC' : (state.playing ? 'file · playing' : 'file · paused'));
  set('xray-decode', state.audioCtx ? `${state.audioCtx.sampleRate / 1000} kHz` : '—');
  set('xray-decode-sub', state.buffer ? `${state.trackName} · ${fmt(state.duration)}` : (state.videoMode ? 'video' : '—'));
  let peak = 0;
  for (let i = 0; i < freqData.length; i++) if (freqData[i] > peak) peak = freqData[i];
  set('xray-fft', state.analyser ? '4096 pt' : '—');
  set('xray-fft-sub', state.analyser ? `2048 bins · peak ${peak}/255 · low ${state.smoothLow.toFixed(2)} mid ${state.smoothMid.toFixed(2)} high ${state.smoothHigh.toFixed(2)}${analysis ? ` · centroid ${Math.round(analysis.centroid)} Hz · flux ${analysis.flux.toFixed(2)} · rms ${analysis.rms.toFixed(3)}` : ''}` : '—');
  set('xray-detect', analysis && analysis.bpmLocked ? `~${Math.round(analysis.bpm)} BPM` : (analysis ? 'finding beat…' : '—'));
  set('xray-detect-sub', analysis ? `${analysis.chord ? analysis.chord.name : '—'} · ${analysis.key ? TA_NOTES[analysis.key.root] + ':' + analysis.key.mode : '—'} · ${analysis.onsets.length} onsets · ${analysis.section || '—'}${analysis.sections.length ? ` · ${analysis.sections.length} sections` : ''}${analysis.instruments ? ` · vox ${analysis.instruments.vocals.toFixed(2)} drm ${analysis.instruments.drums.toFixed(2)} gtr ${analysis.instruments.guitar.toFixed(2)}` : ''}` : '—');
  const enabledLayers = layers.stack.filter((l) => l.enabled);
  set('xray-layers', `${state.look.toUpperCase()} · ${layers.stack.length} layer${layers.stack.length === 1 ? '' : 's'}`);
  set('xray-layers-sub', enabledLayers.length ? enabledLayers.map((l) => LAYER_TYPES[l.type].label).join(' → ') : 'no layers — look plays clean');
  set('xray-output', `${mc.fps} FPS`);
  set('xray-output-sub', `frame ${state.frameCount} · ${state.recording ? '● REC ' + fmt((Date.now() - state.recStart) / 1000) : 'not recording'} · ${state.presenting ? 'presenting' : 'windowed'}`);
  document.querySelectorAll('#mc-xray .xray-stage').forEach((el) => el.classList.toggle('live', !!live));
}
function updateMcTiles() {
  const tiles = [
    ['TRANSPORT', state.playing ? `▶ ${fmt(currentTime())} / ${fmt(state.duration)}` : (state.sysAudio ? '● listening' : 'paused')],
    ['SOURCE', state.sysAudio ? 'system audio' : (state.trackName || '—')],
    ['LOOK', state.look.toUpperCase()],
    ['SYS AUDIO', state.sysAudio ? 'LIVE' : 'off'],
    ['LAYERS', `${layers.stack.filter((l) => l.enabled).length}/${layers.stack.length} on`],
    ['BPM', analysis && analysis.bpmLocked ? `~${Math.round(analysis.bpm)}` : '—'],
    ['CHORD / KEY', analysis && analysis.chord ? analysis.chord.name : '—'],
    ['FPS', String(mc.fps)]
  ];
  const html = tiles.map(([k, v]) => `<div class="mc-tile"><div class="tile-k">${k}</div><div class="tile-v${v === 'LIVE' ? ' hot' : ''}">${escapeHtml(v)}</div></div>`).join('');
  const el = $('mc-tiles');
  if (el.innerHTML !== html) el.innerHTML = html;
}
async function updateMcHex() {
  const now = performance.now();
  if (now - mc.lastHexAt < 500 || mc.hexBusy) return;
  mc.lastHexAt = now;
  const box = $('mc-hex');
  if (!glitch.tempPath) {
    box.textContent = 'No file loaded in the Glitch tab yet — open a file to corrupt and watch its bytes change here as the audio corrupts them.';
    $('mc-hex-file').textContent = '';
    return;
  }
  mc.hexBusy = true;
  try {
    $('mc-hex-file').textContent = '— ' + glitch.name;
    // Narrow view for the rail: 8 bytes per row, 128 bytes a page.
    const cur = await window.pulse.glitchRead(glitch.tempPath, glitch.viewOffset, 128);
    const orig = await window.pulse.glitchRead(glitch.originalPath, glitch.viewOffset, 128);
    const rows = [];
    for (let r = 0; r < cur.bytes.length; r += 8) {
      const off = glitch.viewOffset + r;
      let hexHtml = '', ascii = '';
      for (let i = 0; i < 8; i++) {
        const idx = r + i;
        if (idx >= cur.bytes.length) { hexHtml += '   '; ascii += ' '; continue; }
        const b = cur.bytes[idx], ob = orig.bytes[idx];
        hexHtml += `<span class="${b !== ob ? 'diff' : ''}">${b.toString(16).padStart(2, '0')}</span> `;
        ascii += (b >= 32 && b < 127) ? String.fromCharCode(b) : '.';
      }
      rows.push(`<div class="hex-row"><span class="hex-off">0x${off.toString(16).padStart(8, '0')}</span><span class="hex-bytes">${hexHtml}</span><span class="hex-ascii">${escapeHtml(ascii)}</span></div>`);
    }
    box.innerHTML = rows.join('');
  } finally {
    mc.hexBusy = false;
  }
}
function updateMissionControl() {
  const now = performance.now();
  if (mc.lastFrameT) mc.fps = Math.round(1000 / Math.max(1, now - mc.lastFrameT));
  mc.lastFrameT = now;
  const box = $('mc-map');
  const rect = box.getBoundingClientRect();
  const w = Math.max(200, Math.round(rect.width)), h = 300;
  if (mcMap.width !== w || mcMap.height !== h) { mcMap.width = w; mcMap.height = h; }
  mcConsumeOnsets();
  drawMcMap();
  if (now - mc.lastXrayAt > 250) { mc.lastXrayAt = now; updateMcXray(); updateMcTiles(); }
  updateMcHex();
}
$('btn-mc-hex-open').addEventListener('click', () => setTab('glitch'));

/* ---------- Glitch tab: real byte-level corruption ---------- */
const glitch = {
  originalPath: '', tempPath: '', name: '', size: 0, format: null,
  viewOffset: 0, viewLen: 4096, selStart: -1, selEnd: -1,
  history: [], previewKind: null, previewEl: null, previewLoaded: false,
  viewBytes: null, origBytes: null
};
/* v0.2.7 item 3 — Glitch auto-start. The glitch effect arms itself the
   moment music starts: AUDIO CORRUPT is checked, and if the Glitch tab
   has no working copy yet, the playing track becomes it (a temp copy —
   the original is never touched). A file the user loaded by hand is
   never clobbered. Unchecking AUDIO CORRUPT turns auto-start off and
   that choice persists (cfg.glitchAuto); checking it again turns it
   back on. Pausing needs no stop hook — audioCorruptTick already gates
   on state.playing, so it rests on pause and resumes on play. */
let glitchAuto = true;
async function maybeAutoGlitchLoad() {
  if (!glitchAuto || glitch.tempPath || glitch.autoLoading) return;
  if (!state.trackPath || glitch.originalPath === state.trackPath) return;
  glitch.autoLoading = true;
  try { await openGlitchFile(state.trackPath); } catch (_) {}
  glitch.autoLoading = false;
}
function maybeAutoGlitch() {
  if (!glitchAuto) return;
  $('glitch-audio-corrupt').checked = true;
  maybeAutoGlitchLoad();
}
function glitchLog(msg) { $('glitch-log').textContent = msg; }
async function openGlitchFile(filePath) {
  let target = filePath ? { path: filePath, name: filePath.split(/[\\/]/).pop() } : null;
  if (!target) {
    const files = await window.pulse.openMedia();
    if (!files || !files.length) return;
    target = files[0];
  }
  const info = await window.pulse.glitchOpen(target.path);
  Object.assign(glitch, {
    originalPath: info.originalPath, tempPath: info.tempPath, name: info.name,
    size: info.size, format: info.format, viewOffset: 0, selStart: -1, selEnd: -1, history: []
  });
  $('glitch-file').textContent = `${info.name} — ${info.size.toLocaleString()} bytes`;
  $('glitch-format').textContent = info.format.type;
  $('glitch-format-note').textContent = info.format.note;
  $('glitch-protect-bytes').textContent = info.format.headerBytes;
  $('btn-glitch-apply').disabled = false; $('btn-glitch-all').disabled = false;
  $('btn-glitch-reset').disabled = false; $('btn-glitch-export').disabled = false;
  $('btn-glitch-recipe').disabled = false;
  glitchLog(`Loaded a COPY of ${info.name} (${info.format.type}) into the temp folder. The original was not touched.`);
  await renderHex();
  setupGlitchPreview();
  renderGlitchHistory();
}
async function renderHex() {
  if (!glitch.tempPath) return;
  const cur = await window.pulse.glitchRead(glitch.tempPath, glitch.viewOffset, glitch.viewLen);
  const orig = await window.pulse.glitchRead(glitch.originalPath, glitch.viewOffset, glitch.viewLen);
  glitch.viewBytes = cur.bytes; glitch.origBytes = orig.bytes; glitch.size = cur.size;
  const rows = [];
  const selLo = glitch.selStart >= 0 ? Math.min(glitch.selStart, glitch.selEnd) : -1;
  const selHi = glitch.selStart >= 0 ? Math.max(glitch.selStart, glitch.selEnd) : -1;
  for (let r = 0; r < cur.bytes.length; r += 16) {
    const off = glitch.viewOffset + r;
    let hexHtml = '', ascii = '';
    for (let i = 0; i < 16; i++) {
      const idx = r + i;
      if (idx >= cur.bytes.length) { hexHtml += '   '; ascii += ' '; continue; }
      const b = cur.bytes[idx], ob = orig.bytes[idx];
      const abs = off + i;
      const sel = selLo >= 0 && abs >= selLo && abs <= selHi;
      const diff = b !== ob;
      hexHtml += `<span data-off="${abs}" class="${sel ? 'sel' : ''}${diff ? ' diff' : ''}">${b.toString(16).padStart(2, '0')}</span> `;
      ascii += (b >= 32 && b < 127) ? String.fromCharCode(b) : '.';
    }
    rows.push(`<div class="hex-row"><span class="hex-off">0x${off.toString(16).padStart(8, '0')}</span><span class="hex-bytes">${hexHtml}</span><span class="hex-ascii">${escapeHtml(ascii)}</span></div>`);
  }
  $('hex-view').innerHTML = rows.join('');
  $('hex-offset').textContent = `offset 0x${glitch.viewOffset.toString(16).padStart(8, '0')} — ${glitch.viewOffset.toLocaleString()} / ${cur.size.toLocaleString()} bytes`;
  updateSelectionInfo();
  broadcastHexPopout();
}
/* Send the current hex page to the popped-out hex editor (if open). */
function broadcastHexPopout() {
  if (!window.pulse.popoutSend || !glitch.viewBytes) return;
  window.pulse.popoutSend('hex', {
    kind: 'hex',
    bytes: Array.from(glitch.viewBytes),
    orig: Array.from(glitch.origBytes || []),
    offset: glitch.viewOffset,
    size: glitch.size,
    status: glitch.name ? `live — ${glitch.name} (working copy)` : ''
  });
}
function updateSelectionInfo() {
  if (glitch.selStart < 0) {
    $('glitch-selection').textContent = 'Selection: none — click bytes in the hex view to select a range.';
    return;
  }
  const lo = Math.min(glitch.selStart, glitch.selEnd), hi = Math.max(glitch.selStart, glitch.selEnd);
  $('glitch-selection').textContent = `Selection: 0x${lo.toString(16)} – 0x${hi.toString(16)} (${(hi - lo + 1).toLocaleString()} bytes)`;
}
/* AUDIO CORRUPT: while audio plays, corrupt a few bytes on every kick so
   the hex view (Glitch tab, Mission Control, pop-out) is genuinely live.
   Small random ranges, the checked ops, header still protected. */
let audioCorruptLast = 0, audioCorruptLastKick = -10;
async function audioCorruptTick() {
  if (!$('glitch-audio-corrupt').checked || !glitch.tempPath) return;
  if (!(state.playing || state.sysAudio) || !analysis) return;
  const now = performance.now();
  if (now - audioCorruptLast < 250) return;
  if (analysis.lastKick <= audioCorruptLastKick) return;
  audioCorruptLastKick = analysis.lastKick;
  audioCorruptLast = now;
  const ops = [...document.querySelectorAll('.glitch-op')].filter((c) => c.checked).map((c) => c.dataset.op);
  if (!ops.length) return;
  const size = glitch.size || 1;
  const start = Math.max(glitch.format ? glitch.format.headerBytes : 0, Math.floor(Math.random() * Math.max(1, size - 512)));
  try {
    await window.pulse.glitchCorrupt(glitch.tempPath, {
      ranges: [{ start, end: Math.min(size, start + 64 + Math.floor(Math.random() * 448)) }],
      ops, intensity: 0.3, seed: (Date.now() % 100000) >>> 0,
      protectHeader: $('glitch-protect').checked ? glitch.format.headerBytes : 0
    });
    await renderHex();
    reloadGlitchPreview();
  } catch (_) {}
}
/* Hand edits: double-click a byte to edit it in place (applies live to the
   working copy — the original is never touched). */
$('hex-view').addEventListener('dblclick', async (e) => {
  const span = e.target.closest('span[data-off]');
  if (!span || !glitch.tempPath) return;
  const off = Number(span.dataset.off);
  const input = document.createElement('input');
  input.type = 'text'; input.maxLength = 2; input.size = 2;
  input.value = span.textContent;
  input.style.cssText = 'width:22px;background:#0c4a6e;color:#fff;border:1px solid #38bdf8;border-radius:3px;font:inherit;padding:0 1px;';
  span.textContent = '';
  span.appendChild(input);
  input.focus(); input.select();
  const commit = async () => {
    const v = parseInt(input.value, 16);
    if (!isNaN(v) && v >= 0 && v <= 255) {
      await window.pulse.glitchWriteByte(glitch.tempPath, off, v);
      await renderHex();
      reloadGlitchPreview();
    } else {
      await renderHex();
    }
  };
  input.addEventListener('change', commit);
  input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') commit(); if (ev.key === 'Escape') renderHex(); });
  input.addEventListener('blur', () => { if (input.isConnected) renderHex(); });
});
let hexDragging = false;
$('hex-view').addEventListener('mousedown', (e) => {
  const span = e.target.closest('span[data-off]');
  if (!span) return;
  hexDragging = true;
  glitch.selStart = glitch.selEnd = Number(span.dataset.off);
  renderHex();
});
$('hex-view').addEventListener('mouseover', (e) => {
  if (!hexDragging) return;
  const span = e.target.closest('span[data-off]');
  if (!span) return;
  glitch.selEnd = Number(span.dataset.off);
  renderHex();
});
window.addEventListener('mouseup', () => { hexDragging = false; });
$('hex-prev').addEventListener('click', async () => {
  glitch.viewOffset = Math.max(0, glitch.viewOffset - glitch.viewLen);
  await renderHex();
});
$('hex-next').addEventListener('click', async () => {
  if (glitch.viewOffset + glitch.viewLen < glitch.size) glitch.viewOffset += glitch.viewLen;
  await renderHex();
});
$('hex-jump').addEventListener('change', async (e) => {
  const v = Number(e.target.value);
  if (isFinite(v) && v >= 0 && v < glitch.size) { glitch.viewOffset = Math.floor(v / 16) * 16; await renderHex(); }
});
pairSliderNum('glitch-intensity', 'glitch-intensity-val');
$('glitch-dice').addEventListener('click', () => { $('glitch-seed').value = Math.floor(Math.random() * 100000); });

async function applyCorruption(all) {
  if (!glitch.tempPath) return;
  const ranges = all
    ? [{ start: 0, end: glitch.size }]
    : (glitch.selStart >= 0
      ? [{ start: Math.min(glitch.selStart, glitch.selEnd), end: Math.max(glitch.selStart, glitch.selEnd) + 1 }]
      : null);
  if (!ranges) { glitchLog('Select a byte range first — click bytes in the hex view.'); return; }
  const ops = [...document.querySelectorAll('.glitch-op')].filter((c) => c.checked).map((c) => c.dataset.op);
  if (!ops.length) { glitchLog('Tick at least one corruption operation.'); return; }
  const seed = Number($('glitch-seed').value) || 0;
  const protectHeader = $('glitch-protect').checked ? glitch.format.headerBytes : 0;
  const intensity = Number($('glitch-intensity').value) / 100;
  $('glitch-progress').classList.remove('hidden');
  try {
    const res = await window.pulse.glitchCorrupt(glitch.tempPath, { ranges, ops, intensity, seed, protectHeader });
    const snap = {
      label: all ? 'whole file' : `0x${ranges[0].start.toString(16)}–0x${ranges[0].end.toString(16)}`,
      ops: [...ops], intensity, seed, protectHeader, ranges, changed: res.changed, at: new Date().toLocaleTimeString()
    };
    glitch.history.push(snap);
    glitchLog(`Corrupted ${snap.label}: ${res.changed.toLocaleString()} bytes changed (seed ${seed}, ${ops.join(', ')}, intensity ${Math.round(intensity * 100)}%).`);
    renderGlitchHistory();
    await renderHex();
    reloadGlitchPreview();
  } finally {
    $('glitch-progress').classList.add('hidden');
  }
}
function renderGlitchHistory() {
  $('glitch-history').innerHTML = glitch.history.map((s, i) =>
    `<li data-i="${i}"><span>${i + 1}. ${escapeHtml(s.label)} · ${s.changed.toLocaleString()} bytes · seed ${s.seed} · ${s.at}</span><span class="undo">restore</span></li>`).join('')
    || '<li style="cursor:default">No corruptions yet.</li>';
  document.querySelectorAll('#glitch-history li[data-i]').forEach((li) =>
    li.addEventListener('click', () => restoreSnapshot(Number(li.dataset.i))));
}
async function restoreSnapshot(i) {
  // Deterministic seeds make restore exact: reset, then re-apply snapshots 0..i.
  await window.pulse.glitchReset(glitch.tempPath, glitch.originalPath);
  for (let j = 0; j <= i; j++) {
    const s = glitch.history[j];
    await window.pulse.glitchCorrupt(glitch.tempPath, { ranges: s.ranges, ops: s.ops, intensity: s.intensity, seed: s.seed, protectHeader: s.protectHeader });
  }
  glitch.history = glitch.history.slice(0, i + 1);
  glitchLog(`Restored snapshot ${i + 1} — ${glitch.history.length} snapshot(s) in history.`);
  renderGlitchHistory();
  await renderHex();
  reloadGlitchPreview();
}
$('btn-glitch-open').addEventListener('click', () => openGlitchFile());
// v0.2.7 item 3: the AUDIO CORRUPT checkbox IS the auto-start switch —
// unchecking it turns auto-start off (persisted), checking it re-arms it.
$('glitch-audio-corrupt').addEventListener('change', (e) => {
  glitchAuto = e.target.checked;
  if (window.pulse && window.pulse.setConfig) window.pulse.setConfig({ glitchAuto }).catch(() => {});
});
$('btn-glitch-apply').addEventListener('click', () => applyCorruption(false));
$('btn-glitch-all').addEventListener('click', () => applyCorruption(true));
$('btn-glitch-reset').addEventListener('click', async () => {
  if (!glitch.tempPath) return;
  await window.pulse.glitchReset(glitch.tempPath, glitch.originalPath);
  glitch.history = [];
  glitchLog('Copy reset to the original bytes. History cleared.');
  renderGlitchHistory();
  await renderHex();
  reloadGlitchPreview();
});
$('btn-glitch-export').addEventListener('click', async () => {
  if (!glitch.tempPath) return;
  const base = glitch.name.replace(/\.[^.]+$/, '');
  const ext = glitch.name.match(/\.[^.]+$/)?.[0] || '';
  const out = await window.pulse.glitchExport(glitch.tempPath, `${base}.glitched${ext}`);
  if (out) glitchLog(`Exported corrupted copy to ${out}`);
});
$('btn-glitch-recipe').addEventListener('click', async () => {
  const data = {
    app: 'Pulse Suite', version: '0.2.0', file: glitch.name, size: glitch.size,
    format: glitch.format && glitch.format.type,
    snapshots: glitch.history.map((s) => ({ label: s.label, ops: s.ops, intensity: s.intensity, seed: s.seed, protectHeader: s.protectHeader, ranges: s.ranges, changed: s.changed }))
  };
  const out = await window.pulse.saveFile(glitch.name.replace(/\.[^.]+$/, '') + '-glitch-recipe.json', [{ name: 'JSON', extensions: ['json'] }]);
  if (out) {
    await window.pulse.writeFile(out, new TextEncoder().encode(JSON.stringify(data, null, 2)));
    glitchLog(`Recipe exported to ${out} — same file + same recipe = same glitch.`);
  }
});

/* glitch preview + effect lab */
const gpCanvas = $('glitch-preview');
const gpCtx = gpCanvas.getContext('2d', { willReadFrequently: true });
let lastPixelSort = 0;
function setupGlitchPreview() {
  if (glitch.previewEl) { glitch.previewEl.remove(); glitch.previewEl = null; }
  glitch.previewLoaded = false;
  const kind = kindOf(glitch.name);
  $('glitch-preview-empty').style.display = '';
  if (kind === 'image') {
    const img = new Image();
    img.onload = () => { glitch.previewLoaded = true; $('glitch-preview-empty').style.display = 'none'; };
    img.onerror = () => { $('glitch-preview-empty').textContent = 'Preview failed — the corruption broke the image header. Reset and try a gentler corruption (or keep the header protected).'; };
    img.src = window.pulse.fileUrl(glitch.tempPath);
    glitch.previewEl = img; glitch.previewKind = 'image';
  } else if (kind === 'video') {
    const v = document.createElement('video');
    v.muted = true; v.loop = true; v.playsInline = true;
    v.onloadeddata = () => { glitch.previewLoaded = true; $('glitch-preview-empty').style.display = 'none'; v.play().catch(() => {}); };
    v.onerror = () => { $('glitch-preview-empty').textContent = 'Preview failed — the corruption broke the video. Reset and try a gentler corruption.'; };
    v.src = window.pulse.fileUrl(glitch.tempPath);
    glitch.previewEl = v; glitch.previewKind = 'video';
  } else {
    glitch.previewKind = null;
    $('glitch-preview-empty').textContent = 'No visual preview for this file type — corrupt it, then use “Load corrupted copy in Play” to hear it, or Export it.';
  }
}
function reloadGlitchPreview() {
  if (!glitch.previewEl) return;
  glitch.previewEl.src = window.pulse.fileUrl(glitch.tempPath) + '?t=' + Date.now();
  if (glitch.previewKind === 'video') glitch.previewEl.play().catch(() => {});
}
function renderGlitchPreview() {
  if (!glitch.previewEl || !glitch.previewLoaded) return;
  const src = glitch.previewEl;
  const sw = src.naturalWidth || src.videoWidth, sh = src.naturalHeight || src.videoHeight;
  if (!sw || !sh) return;
  const scale = Math.min(1, 640 / sw);
  const w = Math.max(2, Math.round(sw * scale)), h = Math.max(2, Math.round(sh * scale));
  if (gpCanvas.width !== w || gpCanvas.height !== h) { gpCanvas.width = w; gpCanvas.height = h; }
  gpCtx.drawImage(src, 0, 0, w, h);
  const fxChroma = $('fx-chroma').checked, fxSort = $('fx-pixelsort').checked, fxDither = $('fx-dither').checked;
  if (fxChroma || fxSort || fxDither) {
    const img = gpCtx.getImageData(0, 0, w, h);
    const d = img.data;
    if (fxChroma) {
      const copy = new Uint8ClampedArray(d);
      const shift = 3;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const xr = Math.min(w - 1, x + shift), xb = Math.max(0, x - shift);
          d[i] = copy[(y * w + xr) * 4];
          d[i + 2] = copy[(y * w + xb) * 4 + 2];
        }
      }
    }
    if (fxSort && performance.now() - lastPixelSort > 400) {
      lastPixelSort = performance.now();
      for (let y = 0; y < h; y += 2) {
        let x = 0;
        while (x < w) {
          const segLen = 4 + Math.floor(Math.random() * 24);
          const seg = [];
          for (let k = 0; k < segLen && x + k < w; k++) {
            const i = (y * w + x + k) * 4;
            seg.push([d[i] * 0.3 + d[i + 1] * 0.6 + d[i + 2] * 0.1, d[i], d[i + 1], d[i + 2]]);
          }
          seg.sort((a, b) => a[0] - b[0]);
          seg.forEach((px, k) => { const i = (y * w + x + k) * 4; d[i] = px[1]; d[i + 1] = px[2]; d[i + 2] = px[3]; });
          x += segLen;
        }
      }
    }
    if (fxDither) {
      // Ditherboy-style ordered dither (Bayer 4x4) to two tones.
      const B = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const lum = (d[i] * 0.3 + d[i + 1] * 0.6 + d[i + 2] * 0.1) / 255;
          const on = lum > (B[y % 4][x % 4] + 0.5) / 16 ? 235 : 8;
          d[i] = on; d[i + 1] = on === 235 ? 245 : 10; d[i + 2] = on === 235 ? 255 : 16;
        }
      }
    }
    gpCtx.putImageData(img, 0, 0);
  }
  if ($('fx-tiles').checked) {
    const tw = 32, th = 32;
    for (let n = 0; n < 6; n++) {
      const sx = Math.floor(Math.random() * (w - tw)), sy = Math.floor(Math.random() * (h - th));
      const dx = sx + (Math.random() < 0.5 ? -1 : 1) * (8 + Math.floor(Math.random() * 40));
      gpCtx.drawImage(gpCanvas, sx, sy, tw, th, dx, sy, tw, th);
    }
  }
  if ($('fx-scanlines').checked) {
    gpCtx.fillStyle = 'rgba(0,0,0,0.28)';
    for (let y = 0; y < h; y += 4) gpCtx.fillRect(0, y, w, 1);
  }
  if ($('fx-crt').checked) {
    const bandY = (Date.now() / 16 % (h + 80)) - 40;
    const grad = gpCtx.createLinearGradient(0, bandY - 20, 0, bandY + 20);
    grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(0.5, 'rgba(255,255,255,0.08)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    gpCtx.fillStyle = grad; gpCtx.fillRect(0, bandY - 20, w, 40);
    const vg = gpCtx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    gpCtx.fillStyle = vg; gpCtx.fillRect(0, 0, w, h);
  }
}
$('btn-glitch-load-play').addEventListener('click', async () => {
  if (!glitch.tempPath) return;
  setTab('play');
  const k = kindOf(glitch.name);
  if (k === 'audio') {
    addToPlaylist([{ path: glitch.tempPath, name: glitch.name.replace(/(\.[^.]+)$/, '.glitched$1') }], true);
  } else if (k === 'video') {
    addToPlaylist([{ path: glitch.tempPath, name: glitch.name.replace(/(\.[^.]+)$/, '.glitched$1') }], true);
  } else {
    glitchLog('Only audio/video corrupted copies can load into Play — export this one instead.');
  }
});

/* ---------- ASCII tab: live ASCII video + Toaster's camera looks ----------
   Filters (ported ideas from Toaster's dotcam.js / fx.js camera windows):
   - ascii: the character grid (TouchDesigner-style audioreactive ASCII)
   - thermal: heat-camera colormap (black → red → orange → yellow → white)
   - dither: Bayer ordered dither to two tones (Ditherboy / Script Slayer)
   - neon: dot matrix after Toaster's dotcam — violet→magenta→pink dots sized
     by luminance, swelling on the kick, palette sliding on each new chord
   - vision: machine-vision overlay (@criswvr "Synthetic Urban") — REAL motion
     detection by frame differencing; boxes are labelled MOTION with a
     magnitude, never a fake object name. */
const ascii = { source: null, stream: null, running: false, prevLum: null, prevCols: 0, prevRows: 0, hue: 0, lastChord: null };
const asciiVideo = $('ascii-video');
const asciiCanvas = $('ascii-canvas');
const asciiCtx = asciiCanvas.getContext('2d');
const asciiOff = document.createElement('canvas');
async function startAsciiWebcam() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stopAscii();
    ascii.stream = stream; asciiVideo.srcObject = stream; ascii.source = 'webcam';
    await asciiVideo.play();
    ascii.running = true;
    $('ascii-status').textContent = 'Webcam live — characters follow the picture; audio-reactive mode follows the music.';
    $('btn-ascii-stop').disabled = false;
  } catch (e) {
    $('ascii-status').textContent = 'Could not open the webcam (' + (e.message || e) + '). Try a video file instead.';
  }
}
async function startAsciiFile() {
  const files = await window.pulse.openMedia();
  if (!files || !files.length) return;
  const f = files.find((x) => kindOf(x.name) === 'video') || files[0];
  stopAscii();
  asciiVideo.srcObject = null;
  asciiVideo.src = window.pulse.fileUrl(f.path);
  ascii.source = 'file';
  await asciiVideo.play().catch(() => {});
  ascii.running = true;
  $('ascii-status').textContent = 'Playing ' + f.name + ' as ASCII.';
  $('btn-ascii-stop').disabled = false;
}
function stopAscii() {
  ascii.running = false; ascii.source = null; ascii.prevLum = null;
  if (ascii.stream) { ascii.stream.getTracks().forEach((t) => t.stop()); ascii.stream = null; }
  try { asciiVideo.pause(); } catch (_) {}
  $('btn-ascii-stop').disabled = true;
}
function asciiSample(cols, rows) {
  const v = asciiVideo;
  asciiOff.width = cols; asciiOff.height = rows;
  const octx = asciiOff.getContext('2d', { willReadFrequently: true });
  octx.drawImage(v, 0, 0, cols, rows);
  return octx.getImageData(0, 0, cols, rows).data;
}
function renderAsciiChars(cv, cx, data, cols, rows, opts) {
  const cellW = 9, cellH = 16;
  const w = cols * cellW, h = rows * cellH;
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  // The ramp is the source of truth — the charset select just fills it.
  const charset = (opts && opts.ramp) || $('ascii-ramp').value || $('ascii-charset').value || ' .:-=+*#%@';
  const invert = opts ? opts.invert : $('ascii-invert').checked;
  const color = opts ? opts.color : $('ascii-color').checked;
  const ar = (opts && opts.ar) || { kick: 0, bass: 0, level: 0 };
  const energy = ar.level;
  const contrast = (opts && opts.contrast) || 1;
  const density = (opts && opts.density) || 1;
  cx.fillStyle = '#000'; cx.fillRect(0, 0, w, h);
  cx.font = `${cellH}px "Paper Mono", ui-monospace, monospace`;
  cx.textBaseline = 'top';
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      let lum = (r * 0.3 + g * 0.6 + b * 0.1) / 255;
      if (invert) lum = 1 - lum;
      lum = Math.min(1, Math.max(0, (lum - 0.5) * contrast + 0.5));
      // Depth-sliced: far cells go sparse (near = dense).
      if (opts && opts.depthMap) {
        const ink = 0.3 + 0.7 * (opts.depthMap[y * cols + x] || 0);
        if (Math.random() > ink) continue;
      }
      if (density < 1 && Math.random() > density) continue;
      let idx = Math.floor(lum * (charset.length - 1));
      if (energy > 0.25 && Math.random() < energy * 0.35) idx = Math.floor(Math.random() * charset.length);
      if (energy > 0) idx = Math.min(charset.length - 1, idx + Math.floor(energy * 2));
      const ch = charset[idx] || ' ';
      if (ch === ' ') continue;
      cx.fillStyle = color ? `rgb(${r},${g},${b})` : '#7dd3fc';
      cx.fillText(ch, x * cellW, y * cellH);
    }
  }
}
function renderAsciiBlocks(cv, cx, data, cols, rows) {
  const cell = 10;
  const w = cols * cell, h = rows * cell;
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const color = $('ascii-color').checked;
  cx.fillStyle = '#000'; cx.fillRect(0, 0, w, h);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      const lum = (data[i] * 0.3 + data[i + 1] * 0.6 + data[i + 2] * 0.1) / 255;
      if (lum < 0.05) continue;
      const s = cell * (0.25 + lum * 0.75);
      cx.fillStyle = color ? `rgb(${data[i]},${data[i + 1]},${data[i + 2]})` : '#7dd3fc';
      cx.fillRect(x * cell + (cell - s) / 2, y * cell + (cell - s) / 2, s, s);
    }
  }
}
function renderAsciiHalftone(cv, cx, data, cols, rows) {
  const cell = 12;
  const w = cols * cell, h = rows * cell;
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const color = $('ascii-color').checked;
  cx.fillStyle = '#0b1020'; cx.fillRect(0, 0, w, h);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      const lum = (data[i] * 0.3 + data[i + 1] * 0.6 + data[i + 2] * 0.1) / 255;
      const r = Math.max(0.5, (1 - lum) * cell * 0.55);
      cx.fillStyle = color ? `rgb(${data[i]},${data[i + 1]},${data[i + 2]})` : '#e2e8f0';
      cx.beginPath(); cx.arc(x * cell + cell / 2, y * cell + cell / 2, r, 0, Math.PI * 2); cx.fill();
    }
  }
}
function renderAsciiThermal(cv, cx, data, cols, rows) {
  const cell = 9;
  const w = cols * cell, h = rows * cell;
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const heat = (t) => {
    if (t < 0.25) { const k = t / 0.25; return [Math.round(40 * k), 0, Math.round(10 * k)]; }
    if (t < 0.5) { const k = (t - 0.25) / 0.25; return [Math.round(40 + 215 * k), Math.round(60 * k), 10]; }
    if (t < 0.75) { const k = (t - 0.5) / 0.25; return [255, Math.round(60 + 140 * k), Math.round(10 + 40 * k)]; }
    const k = (t - 0.75) / 0.25; return [255, Math.round(200 + 55 * k), Math.round(50 + 205 * k)];
  };
  cx.fillStyle = '#000'; cx.fillRect(0, 0, w, h);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      const lum = (data[i] * 0.3 + data[i + 1] * 0.6 + data[i + 2] * 0.1) / 255;
      const [r, g, b] = heat(lum);
      cx.fillStyle = `rgb(${r},${g},${b})`;
      cx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
}
function renderAsciiNeon(cv, cx, data, cols, rows) {
  // Cap the grid: a dot matrix is drawn dot by dot, so keep it tractable.
  const c = Math.min(cols, 70), r = Math.max(8, Math.round(c * (rows / cols)));
  const cell = 14;
  const w = c * cell, h = r * cell;
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const kick = analysis ? analysis.kickPulse : state.beat;
  // Palette slides a little on each new chord (Toaster's dotcam slide).
  if (analysis && analysis.chord && analysis.chord.name !== ascii.lastChord) {
    ascii.lastChord = analysis.chord.name;
    ascii.hue = (ascii.hue + 0.18) % 1;
  }
  const neon = (x) => {
    const a = [0.22, 0.04, 0.62], b = [0.98, 0.18, 0.78], cc = [1.0, 0.82, 0.98];
    const m = x < 0.6 ? a.map((v, i) => v + (b[i] - v) * (x / 0.6)) : b.map((v, i) => v + (cc[i] - v) * ((x - 0.6) / 0.4));
    // hue slide: rotate the palette a touch
    const s = Math.sin(ascii.hue * Math.PI * 2) * 0.25;
    return [Math.min(1, Math.max(0, m[0] + s)), m[1], Math.min(1, Math.max(0, m[2] - s))];
  };
  cx.fillStyle = '#000'; cx.fillRect(0, 0, w, h);
  // faint grid, like the dotcam's cut-out
  cx.strokeStyle = 'rgba(255,255,255,0.04)';
  for (let gx = 0; gx <= c; gx++) { cx.beginPath(); cx.moveTo(gx * cell, 0); cx.lineTo(gx * cell, h); cx.stroke(); }
  for (let y = 0; y < r; y++) {
    for (let x = 0; x < c; x++) {
      const sx = Math.floor(x * cols / c), sy = Math.floor(y * rows / r);
      const i = (sy * cols + sx) * 4;
      const L = Math.min(1, Math.max(0, ((data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255 - 0.12) * 1.7));
      if (L < 0.04) continue;
      const rad = (0.14 + (0.5 - 0.14) * L) * cell * 0.5 * (1 + 0.24 * kick);
      const [cr, cg, cb] = neon(L);
      const cx = x * cell + cell / 2, cy = y * cell + cell / 2;
      // lens fringe: red a touch one way, teal the other
      cx.fillStyle = `rgba(255,60,80,${0.35 * L})`;
      cx.beginPath(); cx.arc(cx + 1.5, cy, rad, 0, Math.PI * 2); cx.fill();
      cx.fillStyle = `rgba(60,255,220,${0.3 * L})`;
      cx.beginPath(); cx.arc(cx - 1.5, cy, rad, 0, Math.PI * 2); cx.fill();
      cx.fillStyle = `rgb(${Math.round(cr * 255)},${Math.round(cg * 255)},${Math.round(cb * 255)})`;
      cx.beginPath(); cx.arc(cx, cy, rad, 0, Math.PI * 2); cx.fill();
    }
  }
}
function renderAsciiVision(cv, cx, data, cols, rows) {
  const cell = 9;
  const w = cols * cell, h = rows * cell;
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  // Frame differencing: this frame's luminance minus the last one's.
  if (!ascii.prevLum || ascii.prevCols !== cols || ascii.prevRows !== rows) {
    ascii.prevLum = new Float32Array(cols * rows);
    ascii.prevCols = cols; ascii.prevRows = rows;
  }
  const lum = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      lum[y * cols + x] = (data[i] * 0.3 + data[i + 1] * 0.6 + data[i + 2] * 0.1) / 255;
    }
  }
  const diff = new Float32Array(cols * rows);
  for (let i = 0; i < lum.length; i++) diff[i] = Math.abs(lum[i] - ascii.prevLum[i]);
  ascii.prevLum.set(lum);
  // Draw the picture dimmed, then boxes around moving blocks.
  cx.fillStyle = '#000'; cx.fillRect(0, 0, w, h);
  cx.globalAlpha = 0.35;
  cx.drawImage(asciiVideo, 0, 0, w, h);
  cx.globalAlpha = 1;
  const bw = 4, bh = 4; // block = 4x4 cells
  const bc = Math.ceil(cols / bw), br = Math.ceil(rows / bh);
  const marked = new Uint8Array(bc * br);
  const mag = new Float32Array(bc * br);
  for (let by = 0; by < br; by++) {
    for (let bx = 0; bx < bc; bx++) {
      let s = 0, n = 0;
      for (let y = by * bh; y < Math.min(rows, (by + 1) * bh); y++) {
        for (let x = bx * bw; x < Math.min(cols, (bx + 1) * bw); x++) { s += diff[y * cols + x]; n++; }
      }
      mag[by * bc + bx] = s / Math.max(1, n);
      if (mag[by * bc + bx] > 0.06) marked[by * bc + bx] = 1;
    }
  }
  // Flood-fill the marked blocks into boxes (honest labels: MOTION + magnitude).
  const seen = new Uint8Array(bc * br);
  cx.font = `700 13px "Paper Mono", ui-monospace, monospace`;
  for (let i = 0; i < marked.length; i++) {
    if (!marked[i] || seen[i]) continue;
    const stack = [i]; seen[i] = 1;
    let minX = bc, minY = br, maxX = -1, maxY = -1, mSum = 0, mN = 0;
    while (stack.length) {
      const cur = stack.pop();
      const cx = cur % bc, cy = Math.floor(cur / bc);
      minX = Math.min(minX, cx); maxX = Math.max(maxX, cx);
      minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
      mSum += mag[cur]; mN++;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= bc || ny >= br) continue;
        const ni = ny * bc + nx;
        if (marked[ni] && !seen[ni]) { seen[ni] = 1; stack.push(ni); }
      }
    }
    const pct = Math.round(Math.min(1, (mSum / Math.max(1, mN)) * 4) * 100);
    if (pct < 8) continue;
    const x0 = minX * bw * cell, y0 = minY * bh * cell;
    const x1 = Math.min(w, (maxX + 1) * bw * cell), y1 = Math.min(h, (maxY + 1) * bh * cell);
    cx.strokeStyle = '#ff2e88'; cx.lineWidth = 2;
    cx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    cx.fillStyle = '#ff2e88';
    cx.fillRect(x0, y0 - 16, cx.measureText(`MOTION ${pct}%`).width + 10, 16);
    cx.fillStyle = '#fff';
    cx.fillText(`MOTION ${pct}%`, x0 + 5, y0 - 4);
  }
}
/* ---------- ASCII style library wiring (ascii-styles.js) ---------- */
/* The audio-reactive packet every style receives: zeros when the reactive
   switch is off, live kick/bass/level when it is on. This is the suite's
   twist — the styles are driven by the music. */
function asciiAudio() {
  if (!$('ascii-reactive').checked) return { kick: 0, bass: 0, level: 0 };
  return {
    kick: analysis ? analysis.kickPulse : state.beat,
    bass: state.smoothLow,
    level: analysis ? analysis.level : (state.smoothLow + state.smoothMid) / 2
  };
}
function asciiStyleOpts(cols, rows) {
  const depthSlice = $('ascii-depth-slice').checked && depth.map;
  return {
    palette: $('ascii-palette').value,
    ditherAlgo: $('ascii-dither-algo').value,
    tileShape: $('ascii-tile').value,
    ramp: $('ascii-ramp').value,
    color: $('ascii-color').checked,
    invert: $('ascii-invert').checked,
    contrast: Number($('ascii-contrast').value) / 100,
    density: Number($('ascii-density').value) / 100,
    ar: asciiAudio(),
    depthMap: depthSlice ? depthMapForGrid(cols, rows) : null,
    overlayHue: (ascii.hue || 0) * 360
  };
}
function asciiEnabledPostFx() {
  return [...document.querySelectorAll('.ascii-fx')].filter((c) => c.checked).map((c) => ({ id: c.dataset.fx, amount: 1 }));
}
/* Render one style into any canvas (live canvas or an export offscreen). */
function renderAsciiStyleInto(cv, cx, data, cols, rows, opts) {
  const filter = $('ascii-filter').value;
  if (ASCII_LIBRARY_RENDERERS[filter]) {
    ASCII_LIBRARY_RENDERERS[filter](cv, cx, data, cols, rows, opts);
  } else if (filter === 'thermal') renderAsciiThermal(cv, cx, data, cols, rows);
  else if (filter === 'neon') renderAsciiNeon(cv, cx, data, cols, rows);
  else if (filter === 'vision') renderAsciiVision(cv, cx, data, cols, rows);
  else if (filter === 'blocks') renderAsciiBlocks(cv, cx, data, cols, rows);
  else if (filter === 'halftone') renderAsciiHalftone(cv, cx, data, cols, rows);
  else renderAsciiChars(cv, cx, data, cols, rows, opts);
  const fx = asciiEnabledPostFx();
  if (fx.length) applyAsciiPostFx(cv, cx, fx, opts);
}
function renderAscii() {
  if (!ascii.running) return;
  const v = asciiVideo;
  if (!v.videoWidth || v.readyState < 2) return;
  const ar = asciiAudio();
  // The grid breathes with the bass when audio-reactive is on.
  const baseCols = Number($('ascii-cols').value);
  const cols = Math.max(40, Math.round(baseCols * (1 + ar.bass * 0.18)));
  const rows = Math.max(8, Math.round(cols * (v.videoHeight / v.videoWidth) * 0.5));
  const data = asciiSample(cols, rows);
  renderAsciiStyleInto(asciiCanvas, asciiCtx, data, cols, rows, asciiStyleOpts(cols, rows));
}

/* ---------- ASCII recipes (saveable / shareable look presets) ---------- */
const ASCII_RECIPES_KEY = 'pulse-ascii-recipes';
function asciiAllRecipes() {
  let mine = [];
  try { mine = JSON.parse(localStorage.getItem(ASCII_RECIPES_KEY) || '[]'); } catch (_) {}
  return [...ASCII_RECIPES, ...mine];
}
function refreshAsciiRecipeSelect() {
  const sel = $('ascii-recipe');
  const cur = sel.value;
  sel.innerHTML = '<option value="">— No recipe —</option>' +
    asciiAllRecipes().map((r, i) => `<option value="${i}">${escapeHtml(r.name)}</option>`).join('');
  if (cur !== '' && cur != null) sel.value = cur;
}
function applyAsciiRecipe(r) {
  if (!r) return;
  $('ascii-filter').value = r.style;
  $('ascii-palette').value = r.palette || 'bw';
  $('ascii-dither-algo').value = r.ditherAlgo || 'floyd-steinberg';
  $('ascii-cols').value = r.cols || 110; $('ascii-cols-val').value = r.cols || 110;
  $('ascii-ramp').value = r.ramp || ' .:-=+*#%@';
  $('ascii-color').checked = !!r.color;
  $('ascii-invert').checked = !!r.invert;
  $('ascii-reactive').checked = r.reactive !== false;
  document.querySelectorAll('.ascii-fx').forEach((c) => { c.checked = (r.postFx || []).includes(c.dataset.fx); });
  $('ascii-status').textContent = `Recipe "${r.name}" loaded — ${r.style} + ${(r.postFx || []).join(', ') || 'no post-FX'}.`;
}
function currentAsciiRecipe() {
  return {
    name: 'Untitled', style: $('ascii-filter').value, palette: $('ascii-palette').value,
    ditherAlgo: $('ascii-dither-algo').value, cols: Number($('ascii-cols').value),
    ramp: $('ascii-ramp').value, color: $('ascii-color').checked, invert: $('ascii-invert').checked,
    reactive: $('ascii-reactive').checked,
    postFx: asciiEnabledPostFx().map((f) => f.id)
  };
}

/* ---------- ASCII export: stills up to 4x, animated GIF loops ---------- */
async function exportAsciiStill(scale, savePath) {
  if (!ascii.running) { alert('Start the webcam or a video file first.'); return null; }
  const v = asciiVideo;
  const cols = Math.min(720, Math.round(Number($('ascii-cols').value) * scale));
  const rows = Math.max(8, Math.round(cols * (v.videoHeight / v.videoWidth) * 0.5));
  const data = asciiSample(cols, rows);
  const off = document.createElement('canvas');
  renderAsciiStyleInto(off, off.getContext('2d'), data, cols, rows, asciiStyleOpts(cols, rows));
  const blob = await new Promise((res) => off.toBlob(res, 'image/png'));
  if (!blob) return null;
  const buf = new Uint8Array(await blob.arrayBuffer());
  const out = savePath || await window.pulse.saveImage(`ascii-${$('ascii-filter').value}-${scale}x.png`);
  if (!out) return null;
  await window.pulse.writeFile(out, buf);
  return out;
}
let gifWorkerUrl = null;
async function getGifWorkerUrl() {
  if (gifWorkerUrl) return gifWorkerUrl;
  const bytes = await window.pulse.readAsset('gif/gif.worker.js');
  const text = new TextDecoder().decode(bytes);
  gifWorkerUrl = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
  return gifWorkerUrl;
}
async function exportAsciiGif(frames, delayMs, savePath) {
  if (!ascii.running) { alert('Start the webcam or a video file first.'); return null; }
  if (typeof GIF !== 'function') { alert('GIF encoder not loaded.'); return null; }
  const n = frames || 24, delay = delayMs || 125;
  const workerScript = await getGifWorkerUrl();
  const w = asciiCanvas.width, h = asciiCanvas.height;
  $('ascii-status').textContent = `Capturing ${n} frames for the GIF loop…`;
  const gif = new GIF({ workers: 2, quality: 10, workerScript, width: w, height: h });
  const caps = [];
  for (let i = 0; i < n; i++) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(asciiCanvas, 0, 0);
    caps.push(c);
    await new Promise((r) => setTimeout(r, delay));
  }
  for (const f of caps) gif.addFrame(f, { copy: true, delay });
  $('ascii-status').textContent = 'Encoding GIF…';
  const blob = await new Promise((resolve) => { gif.on('finished', resolve); gif.render(); });
  const buf = new Uint8Array(await blob.arrayBuffer());
  const out = savePath || await window.pulse.saveFile('ascii-loop.gif', [{ name: 'GIF image', extensions: ['gif'] }]);
  if (!out) { $('ascii-status').textContent = 'GIF export cancelled.'; return null; }
  await window.pulse.writeFile(out, buf);
  $('ascii-status').textContent = `GIF loop saved to ${out}`;
  return out;
}

$('ascii-charset').addEventListener('change', (e) => { $('ascii-ramp').value = e.target.value; });
$('btn-ascii-webcam').addEventListener('click', startAsciiWebcam);
$('btn-ascii-file').addEventListener('click', startAsciiFile);
$('btn-ascii-stop').addEventListener('click', stopAscii);
pairSliderNum('ascii-cols', 'ascii-cols-val');
pairSliderNum('ascii-density', 'ascii-density-val');
pairSliderNum('ascii-contrast', 'ascii-contrast-val');
refreshAsciiRecipeSelect();
$('ascii-recipe').addEventListener('change', (e) => {
  const r = asciiAllRecipes()[Number(e.target.value)];
  if (r) applyAsciiRecipe(r);
});
$('btn-ascii-recipe-save').addEventListener('click', async () => {
  const name = prompt('Recipe name:', currentAsciiRecipe().style + ' look');
  if (!name) return;
  let mine = [];
  try { mine = JSON.parse(localStorage.getItem(ASCII_RECIPES_KEY) || '[]'); } catch (_) {}
  mine.push({ ...currentAsciiRecipe(), name });
  localStorage.setItem(ASCII_RECIPES_KEY, JSON.stringify(mine));
  refreshAsciiRecipeSelect();
  $('ascii-status').textContent = `Recipe "${name}" saved — it lives in this app until you export it.`;
});
$('btn-ascii-recipe-export').addEventListener('click', async () => {
  const out = await window.pulse.saveFile('pulse-ascii-recipes.json', [{ name: 'JSON', extensions: ['json'] }]);
  if (!out) return;
  await window.pulse.writeFile(out, new TextEncoder().encode(JSON.stringify(asciiAllRecipes(), null, 2)));
  $('ascii-status').textContent = `Recipes exported to ${out} — share the JSON and anyone can import the looks.`;
});
$('btn-ascii-recipe-import').addEventListener('click', async () => {
  const files = await window.pulse.openMedia();
  if (!files || !files.length) return;
  try {
    const buf = await window.pulse.readFile(files[0].path);
    const imported = JSON.parse(new TextDecoder().decode(buf));
    if (!Array.isArray(imported)) throw new Error('not a recipe list');
    let mine = [];
    try { mine = JSON.parse(localStorage.getItem(ASCII_RECIPES_KEY) || '[]'); } catch (_) {}
    mine.push(...imported.filter((r) => r && r.style));
    localStorage.setItem(ASCII_RECIPES_KEY, JSON.stringify(mine));
    refreshAsciiRecipeSelect();
    $('ascii-status').textContent = `Imported ${imported.length} recipe(s).`;
  } catch (e) {
    $('ascii-status').textContent = 'Import failed: ' + (e.message || e);
  }
});
$('btn-ascii-snapshot').addEventListener('click', async () => {
  if (!ascii.running) { alert('Start the webcam or a video file first.'); return; }
  asciiCanvas.toBlob(async (blob) => {
    const buf = new Uint8Array(await blob.arrayBuffer());
    const out = await window.pulse.saveImage('ascii-snapshot.png');
    if (out) await window.pulse.writeFile(out, buf);
  }, 'image/png');
});
$('btn-ascii-export-still').addEventListener('click', async () => {
  const out = await exportAsciiStill(Number($('ascii-export-scale').value) || 2);
  if (out) $('ascii-status').textContent = `Still saved to ${out}`;
});
$('btn-ascii-export-gif').addEventListener('click', async () => { await exportAsciiGif(24, 125); });

/* ---------- Cut tab: beat-cut auto-edit (moviepy + librosa recipe, live) ---------- */
const cut = { clips: [], trackPath: '', trackName: '', bpm: 0, beatTimes: [], duration: 0, sequence: [], previewOn: false, curClip: -1 };
function updateCutButtons() {
  $('btn-cut-generate').disabled = !(cut.clips.length && cut.beatTimes.length);
}
async function cutLoadFolder() {
  const dir = await window.pulse.openDirectory();
  if (!dir) return;
  const files = await window.pulse.listDir(dir);
  cut.clips = files.filter((f) => VIDEO_EXT.test(f.name));
  $('cut-info').textContent = `${cut.clips.length} clip(s) in ${dir}. ${cut.trackName ? 'Track loaded: ' + cut.trackName : 'Now load a track.'}`;
  updateCutButtons();
}
async function cutLoadTrack() {
  wakeAudio(); // v0.2.5: resume inside the click gesture, before the dialog await
  // The shared track is already loaded? Use it — no file dialog needed.
  if (state.trackName && state.lastBeats) {
    cut.trackPath = state.trackPath; cut.trackName = state.trackName;
    const det = state.lastBeats;
    cut.bpm = det.bpm; cut.beatTimes = det.beatTimes; cut.duration = state.duration;
    $('cut-info').textContent = `Track: ${cut.trackName} — shared with every tab · ~${cut.bpm} BPM, ${cut.beatTimes.length} beats · ${cut.clips.length} clip(s) ready.`;
    updateCutButtons();
    return;
  }
  const files = await window.pulse.openMedia();
  if (!files || !files.length) return;
  const f = files[0];
  await loadAudioFile(f.path, f.name);
  cut.trackPath = f.path; cut.trackName = f.name;
  const det = state.lastBeats || { bpm: 0, beatTimes: [] };
  cut.bpm = det.bpm; cut.beatTimes = det.beatTimes; cut.duration = state.duration;
  $('cut-info').textContent = `Track: ${f.name} — ${cut.bpm ? '~' + cut.bpm + ' BPM, ' + cut.beatTimes.length + ' beats' : 'no beat grid found (try a track with a clear beat)'}. ${cut.clips.length} clip(s) ready.`;
  updateCutButtons();
}
function generateCut() {
  if (!cut.beatTimes.length || !cut.clips.length) return;
  const bpc = Number($('cut-bpc').value);
  const seq = [];
  let ci = 0;
  for (let b = 0; b + bpc <= cut.beatTimes.length; b += bpc) {
    seq.push({
      clip: cut.clips[ci % cut.clips.length],
      start: cut.beatTimes[b],
      end: (b + bpc < cut.beatTimes.length) ? cut.beatTimes[b + bpc] : cut.duration
    });
    ci++;
  }
  cut.sequence = seq;
  renderCutTimeline();
  $('cut-stats').textContent = `${seq.length} segments · ${bpc} beats each · ${cut.beatTimes.length} beats total · ~${cut.bpm} BPM`;
  $('btn-cut-export').disabled = false;
  $('btn-cut-preview').disabled = false;
}
function renderCutTimeline() {
  const tl = $('cut-timeline');
  const step = Math.max(1, Math.ceil(cut.beatTimes.length / 400));
  let html = '<div class="beat-row">' + cut.beatTimes.filter((_, i) => i % step === 0).map(() => '<span class="beat-tick on"></span>').join('') + '</div>';
  html += '<div class="clip-row">' + cut.sequence.map((s) =>
    `<span class="clip-seg" style="flex:${Math.max(0.1, s.end - s.start).toFixed(2)} 1 0">${escapeHtml(s.clip.name)}</span>`).join('') + '</div>';
  tl.innerHTML = html;
}
function stopCutPreviewVisual() {
  // Stop the preview VIDEO only — the shared track keeps playing.
  // Called when leaving the Cut tab or loading a new track.
  if (!cut.previewOn) return;
  cut.previewOn = false;
  const v = $('cut-video');
  try { v.pause(); } catch (_) {}
  $('btn-cut-preview').textContent = '▶ Play preview cut';
  $('cut-now').textContent = '';
}
async function toggleCutPreview() {
  const v = $('cut-video');
  if (cut.previewOn) {
    stopCutPreviewVisual();
    pause();
    return;
  }
  if (!cut.sequence.length) return;
  cut.previewOn = true; cut.curClip = -1;
  $('btn-cut-preview').textContent = 'Stop preview';
  $('cut-progress').classList.remove('hidden');
  v.muted = true; // video silent — the track's audio comes through the Web Audio graph
  seekTo(0); play();
}
$('cut-video').addEventListener('canplay', () => $('cut-progress').classList.add('hidden'));
// The preview video is ALWAYS silent — its audio comes through the shared
// engine, never from the video element itself.
$('cut-video').addEventListener('volumechange', () => { const v = $('cut-video'); if (!v.muted) v.muted = true; });
function updateCutPreview() {
  if (!cut.previewOn || !cut.sequence.length) return;
  const t = currentTime();
  const v = $('cut-video');
  let idx = cut.sequence.findIndex((s) => t >= s.start && t < s.end);
  if (idx === -1) idx = t >= (cut.duration || 0) - 0.1 ? cut.sequence.length - 1 : 0;
  if (idx !== cut.curClip) {
    cut.curClip = idx;
    const seg = cut.sequence[idx];
    v.src = window.pulse.fileUrl(seg.clip.path);
    v.play().catch(() => {});
    $('cut-now').textContent = `▶ ${seg.clip.name} (${fmt(seg.start)}–${fmt(seg.end)})`;
  }
  if (!state.playing && !state.sysAudio) {
    cut.previewOn = false; v.pause();
    $('btn-cut-preview').textContent = '▶ Play preview cut';
    $('cut-now').textContent = 'Preview finished.';
  }
}
$('btn-cut-folder').addEventListener('click', cutLoadFolder);
$('btn-cut-track').addEventListener('click', cutLoadTrack);
$('btn-cut-generate').addEventListener('click', generateCut);
pairSliderNum('cut-bpc', 'cut-bpc-val');
$('btn-cut-preview').addEventListener('click', toggleCutPreview);
$('btn-cut-export').addEventListener('click', async () => {
  const data = {
    app: 'Pulse Suite', version: '0.2.5', track: cut.trackName, bpm: cut.bpm,
    beatsPerClip: Number($('cut-bpc').value),
    segments: cut.sequence.map((s) => ({ clip: s.clip.name, path: s.clip.path, start: +s.start.toFixed(3), end: +s.end.toFixed(3) }))
  };
  const out = await window.pulse.saveFile((cut.trackName || 'cut').replace(/\.[^.]+$/, '') + '-timeline.json', [{ name: 'JSON', extensions: ['json'] }]);
  if (out) await window.pulse.writeFile(out, new TextEncoder().encode(JSON.stringify(data, null, 2)));
});

/* ---------- Cook tab: photo + song — the image cooks cumulatively on the audio ----------
   Load a photo and play a song (or system audio). While the audio plays, the
   beat nudges pixels, the bass warps colours, and the dynamics drive
   pixel-sort / corrupt-tile / CRT / dither — all baked into the working
   canvas frame by frame, so the final image depends on THAT song: a
   different song gives a different result from the same photo. Export the
   final frame (or any mid-cook frame) as a JPEG. */
const cook = {
  image: null, imageName: '', imgEl: null,
  work: null, workCtx: null, src: null, srcCtx: null, W: 0, H: 0,
  active: false, done: false, startedAt: 0, cookLevel: 0,
  songPath: '', songName: '', useSysAudio: false,
  comparing: false, split: false, wasPlaying: false,
  lastSort: 0, lastDither: 0, lastTiles: 0, trackY: 0,
  lastGradmap: 0, lastGeo: 0, lastMesh: 0, gradLut: null,
  lastStyle: 0, lastParallax: 0, lastDepthBlur: 0,
  // v0.2.6: base = the cumulative cook state; work = base + live effects.
  base: null, baseCtx: null, dispEnv: 0,
  lastPosterize: 0, lastSolarize: 0, mirrorFlip: false, mirrorArmed: false,
  depthView: 'photo', // 'photo' | 'map' | 'heat'
  depthCanvas: null, depthHeatCanvas: null, nearMask: null, farMask: null,
};
/* ---------- Cook + depth (Gather technique) ----------
   Depth masks are built once per estimate, at the photo's resolution:
   nearMask = white where depth >= 0.5 (foreground), farMask = the rest.
   The cook frame then moves/blurs the two layers in opposite directions
   with the beat and the bass. */
function buildDepthMasks() {
  if (!depth.map || !cook.work) { cook.nearMask = cook.farMask = null; cook.depthCanvas = null; return; }
  const W = cook.W, H = cook.H;
  const near = document.createElement('canvas'); near.width = W; near.height = H;
  const far = document.createElement('canvas'); far.width = W; far.height = H;
  const nctx = near.getContext('2d'), fctx = far.getContext('2d');
  const nimg = nctx.createImageData(W, H), fimg = fctx.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = Math.min(depth.depthW - 1, Math.floor(x * depth.depthW / W));
    const sy = Math.min(depth.depthH - 1, Math.floor(y * depth.depthH / H));
    const d = depth.map[sy * depth.depthW + sx];
    const i = (y * W + x) * 4;
    const nv = d >= 0.5 ? 255 : 0;
    nimg.data[i] = nimg.data[i + 1] = nimg.data[i + 2] = nv; nimg.data[i + 3] = 255;
    fimg.data[i] = fimg.data[i + 1] = fimg.data[i + 2] = 255 - nv; fimg.data[i + 3] = 255;
  }
  nctx.putImageData(nimg, 0, 0); fctx.putImageData(fimg, 0, 0);
  cook.nearMask = near; cook.farMask = far;
  // Cached depth-map view at photo resolution (grayscale + heat share it).
  const dc = document.createElement('canvas'); dc.width = W; dc.height = H;
  const dctx = dc.getContext('2d');
  const tmp = document.createElement('canvas');
  drawDepthMap(tmp, tmp.getContext('2d'), false);
  dctx.imageSmoothingEnabled = true;
  dctx.drawImage(tmp, 0, 0, W, H);
  cook.depthCanvas = dc;
  const hc = document.createElement('canvas'); hc.width = W; hc.height = H;
  const hctx = hc.getContext('2d');
  const tmpH = document.createElement('canvas');
  drawDepthMap(tmpH, tmpH.getContext('2d'), true);
  hctx.imageSmoothingEnabled = true;
  hctx.drawImage(tmpH, 0, 0, W, H);
  cook.depthHeatCanvas = hc;
}
function updateCookDepthUI() {
  const st = $('cook-step-depth');
  if (depth.map) {
    const label = depth.source === 'heuristic' ? 'HEURISTIC' : depth.source.toUpperCase();
    st.textContent = `${label} · ${depth.depthW}×${depth.depthH} · ${depth.lastMs} ms`;
    st.classList.add('done');
    $('cook-depth-status').textContent = depth.source === 'heuristic'
      ? 'Heuristic pseudo-depth (no model available — luminance + height in frame). It reads like depth, but it is a guess, not a model.'
      : `Depth map ready — ${depth.source === 'fastdepth' ? 'FastDepth' : 'Depth Anything V2 Small'} (${depth.lastMs} ms). Near is bright. Parallax, depth blur and depth-sliced styles are live.`;
  } else {
    st.textContent = 'NONE';
    st.classList.remove('done');
  }
}
async function cookDepthEstimate(model) {
  if (!cook.src) { $('cook-depth-status').textContent = 'Pick a photo first.'; return; }
  const m = model || $('cook-depth-model').value || 'fastdepth';
  $('cook-depth-status').textContent = `Estimating depth with ${m === 'dav2' ? 'Depth Anything V2 Small' : 'FastDepth'}… (first use downloads the model)`;
  const map = await depthEstimateFromCanvas(cook.src, m);
  if (!map) {
    $('cook-depth-status').textContent = 'Depth failed: ' + (depth.error || 'unknown error') + ' — try the heuristic instead.';
    updateCookDepthUI();
    return;
  }
  buildDepthMasks();
  updateCookDepthUI();
  drawCookDisplay();
}
function cookDepthHeuristic() {
  if (!cook.src) { $('cook-depth-status').textContent = 'Pick a photo first.'; return; }
  const data = cook.srcCtx.getImageData(0, 0, cook.W, cook.H).data;
  depthHeuristicFromData(data, cook.W, cook.H);
  buildDepthMasks();
  updateCookDepthUI();
  drawCookDisplay();
}
/* Pre-rendered pattern tiles for Cook (grain + halftone are overlays, not
   per-frame ImageData work — cheap and they bake cumulatively). */
const grainTile = document.createElement('canvas');
grainTile.width = grainTile.height = 128;
{
  const g = grainTile.getContext('2d');
  const img = g.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + Math.floor((Math.random() - 0.5) * 90);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}
const halftoneTile = document.createElement('canvas');
halftoneTile.width = halftoneTile.height = 16;
{
  const g = halftoneTile.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 16, 16);
  g.fillStyle = '#000'; g.beginPath(); g.arc(8, 8, 5, 0, Math.PI * 2); g.fill();
}
/* Numbered workflow accordions (Geometric pattern): each header shows its
   live state — photo name, song name, how many recipe effects are on,
   cook level. Clicking a header opens/closes its step. */
document.querySelectorAll('.cook-step-head').forEach((h) => h.addEventListener('click', () => {
  h.closest('.cook-step').classList.toggle('open');
}));
function openCookStep(name) {
  const step = document.querySelector(`.cook-step[data-step="${name}"]`);
  if (step) step.classList.add('open');
}
// The shared track IS the cook song unless the Cook tab picked its own
// (or system audio is on). Cook never keeps a private copy of the track.
function cookSongName() { return (cook.useSysAudio || state.sysAudio) ? 'System audio' : (cook.songName || state.trackName || ''); }
function cookHasSong() { return !!(cook.songPath || cook.useSysAudio || state.trackName || state.sysAudio); }
function updateCookSteps() {
  $('cook-step-photo').textContent = cook.imageName ? `${cook.imageName} (${cook.W}×${cook.H})` : 'NONE';
  $('cook-step-photo').classList.toggle('done', !!cook.imageName);
  $('cook-step-song').textContent = cookSongName() || 'NONE';
  $('cook-step-song').classList.toggle('done', !!cookSongName());
  const on = [...document.querySelectorAll('.cook-fx')].filter((s) => s.checked).length;
  $('cook-step-recipe').textContent = `${on} ON`;
  $('cook-step-export').textContent = `${Math.round(cook.cookLevel)}%`;
  $('cook-step-export').classList.toggle('done', cook.cookLevel > 1 || cook.done);
  $('cook-export-size').textContent = cook.W ? `${cook.W}×${cook.H} JPEG` : '—';
}
document.querySelector('#tab-cook fieldset').addEventListener('click', () => setTimeout(updateCookSteps, 0));
function updateCookButtons() {
  const hasPhoto = !!cook.work;
  const hasSong = cookHasSong();
  $('btn-cook-start').disabled = !(hasPhoto && hasSong && !cook.active);
  $('btn-cook-stop').disabled = !cook.active;
  $('btn-cook-download').disabled = !(cook.cookLevel > 1 || cook.done);
  $('btn-cook-snapshot').disabled = !(cook.active || cook.done || cook.cookLevel > 1);
  updateCookSteps();
}
async function loadCookImage(filePath) {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = window.pulse.fileUrl(filePath); });
  const MAXW = 1280;
  const scale = Math.min(1, MAXW / img.naturalWidth);
  cook.W = Math.max(2, Math.round(img.naturalWidth * scale));
  cook.H = Math.max(2, Math.round(img.naturalHeight * scale));
  cook.src = document.createElement('canvas'); cook.src.width = cook.W; cook.src.height = cook.H;
  cook.srcCtx = cook.src.getContext('2d');
  cook.srcCtx.drawImage(img, 0, 0, cook.W, cook.H);
  cook.work = document.createElement('canvas'); cook.work.width = cook.W; cook.work.height = cook.H;
  cook.workCtx = cook.work.getContext('2d', { willReadFrequently: true });
  cook.workCtx.drawImage(cook.src, 0, 0);
  cook.base = document.createElement('canvas'); cook.base.width = cook.W; cook.base.height = cook.H;
  cook.baseCtx = cook.base.getContext('2d', { willReadFrequently: true });
  cook.baseCtx.drawImage(cook.src, 0, 0);
  cook.dispEnv = 0; cook.mirrorFlip = false; cook.mirrorArmed = false;
  cook.imgEl = img; cook.image = filePath; cook.imageName = filePath.split(/[\\/]/).pop();
  cook.active = false; cook.done = false; cook.cookLevel = 0;
  // A new photo invalidates the old depth map and masks.
  depth.map = null; depth.source = null; depth.depthW = 0; depth.depthH = 0;
  cook.nearMask = cook.farMask = null; cook.depthCanvas = null; cook.depthView = 'photo';
  $('btn-cook-depth-view').textContent = 'View: photo';
  $('btn-cook-depth-view').setAttribute('aria-pressed', 'false');
  $('btn-cook-depth-heat').setAttribute('aria-pressed', 'false');
  $('cook-depth-status').textContent = 'No depth map yet — estimate one and the photo gains a third dimension.';
  updateCookDepthUI();
  $('cook-image-name').textContent = `${cook.imageName} (${cook.W}×${cook.H})`;
  $('cook-empty').style.display = 'none';
  $('cook-progress').value = 0;
  $('cook-progress-text').textContent = 'Photo loaded. Pick a song (or system audio), then start cooking.';
  updateCookButtons();
  openCookStep('song');
  drawCookDisplay();
}
function startCook() {
  if (!cook.work || !cookHasSong()) return;
  // Fresh cook each start: the working copy AND the cumulative base
  // reset to the original photo.
  cook.workCtx.drawImage(cook.src, 0, 0);
  if (cook.baseCtx) cook.baseCtx.drawImage(cook.src, 0, 0);
  cook.dispEnv = 0;
  cook.active = true; cook.done = false; cook.startedAt = performance.now();
  cook.cookLevel = 0; cook.wasPlaying = false; cook.trackY = 0;
  $('cook-progress-text').textContent = `Cooking on ${cookSongName()}…`;
  updateCookButtons();
}
function stopCook() {
  if (!cook.active) return;
  cook.active = false; cook.done = true;
  // The live effects relax: the finished frame is the cumulative base.
  if (cook.base) cook.workCtx.drawImage(cook.base, 0, 0);
  drawCookDisplay();
  $('cook-progress-text').textContent = `Cooked — ${cookSongName()} is done (or stopped). Download the JPEG, or start again for a fresh cook.`;
  $('cook-meter').textContent = `cook level: ${Math.round(cook.cookLevel)}%`;
  updateCookButtons();
}
function cookFrame() {
  if (!cook.active || !cook.work) return;
  const playing = state.playing || state.sysAudio;
  // The song ended while cooking: playback flips off and the offset resets.
  if (cook.wasPlaying && !playing && !state.sysAudio && state.buffer && state.offset < 0.1) { stopCook(); return; }
  cook.wasPlaying = playing;
  if (!playing) return;
  // v0.2.6: TWO canvases now. cook.base is the CUMULATIVE state — the
  // effects that bake in (sort, tiles, gradmap, geo, dither, style pass,
  // grain, halftone, mesh, CRT) write there. cook.work is re-rendered
  // from base every frame, and the LIVE effects (warp, displacement and
  // the new ones) apply on top of it with their amount tied to the live
  // music level — so they breathe with the song and relax when it quiets,
  // instead of compounding to 100% and stopping (the old bug: warp
  // re-drew the already-warped canvas, displacement shredded already-
  // shredded bands).
  if (!cook.base) {
    cook.base = document.createElement('canvas'); cook.base.width = cook.W; cook.base.height = cook.H;
    cook.baseCtx = cook.base.getContext('2d', { willReadFrequently: true });
    cook.baseCtx.drawImage(cook.src, 0, 0);
  }
  const intensity = Number($('cook-intensity').value) / 100;
  const kick = analysis ? analysis.kickPulse : state.beat;
  const bass = state.smoothLow;
  const level = analysis ? analysis.level : (state.smoothLow + state.smoothMid) / 2;
  const W = cook.W, H = cook.H, c = cook.workCtx, b = cook.baseCtx;
  const now = performance.now();
  // --- CUMULATIVE pass: everything below writes to cook.base ---
  // Pixel sort: a strip of rows, throttled, driven by the dynamics.
  if ($('cook-fx-sort').checked && level > 0.08 && now - cook.lastSort > 150) {
    cook.lastSort = now;
    const y0 = Math.floor(Math.random() * (H - 40));
    const stripH = 40;
    const img = b.getImageData(0, y0, W, stripH);
    const d = img.data;
    for (let y = 0; y < stripH; y += 2) {
      let x = 0;
      while (x < W) {
        const segLen = 4 + Math.floor(Math.random() * 24);
        const seg = [];
        for (let k = 0; k < segLen && x + k < W; k++) {
          const i = (y * W + x + k) * 4;
          seg.push([d[i] * 0.3 + d[i + 1] * 0.6 + d[i + 2] * 0.1, d[i], d[i + 1], d[i + 2]]);
        }
        seg.sort((a, b2) => a[0] - b2[0]);
        seg.forEach((px, k) => { const i = (y * W + x + k) * 4; d[i] = px[1]; d[i + 1] = px[2]; d[i + 2] = px[3]; });
        x += segLen;
      }
    }
    b.putImageData(img, 0, y0);
  }
  // Corrupt tiles: copy a few tiles with an offset on the kick.
  if ($('cook-fx-tiles').checked && kick > 0.5 && now - cook.lastTiles > 200) {
    cook.lastTiles = now;
    const tw = 32, th = 32;
    for (let n = 0; n < 4; n++) {
      const sx = Math.floor(Math.random() * (W - tw)), sy = Math.floor(Math.random() * (H - th));
      const dx = sx + (Math.random() < 0.5 ? -1 : 1) * (8 + Math.floor(Math.random() * 40 * intensity));
      b.drawImage(cook.base, sx, sy, tw, th, dx, sy, tw, th);
    }
  }
  // CRT / VHS: bake scanlines + a slow rolling tracking band.
  if ($('cook-fx-crt').checked) {
    b.fillStyle = 'rgba(0,0,0,0.16)';
    for (let n = 0; n < 3; n++) b.fillRect(0, Math.floor(Math.random() * H), W, 1);
    cook.trackY = (cook.trackY + 2) % (H + 80);
    const by = cook.trackY - 40;
    const grad = b.createLinearGradient(0, by - 14, 0, by + 14);
    grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(0.5, 'rgba(255,255,255,0.05)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    b.fillStyle = grad; b.fillRect(0, by - 14, W, 28);
  }
  // Dither: Bayer-threshold a random strip, gradually.
  if ($('cook-fx-dither').checked && now - cook.lastDither > 500) {
    cook.lastDither = now;
    const B = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
    const y0 = Math.floor(Math.random() * (H - 60));
    const img = b.getImageData(0, y0, W, 60);
    const d = img.data;
    for (let y = 0; y < 60; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const lum = (d[i] * 0.3 + d[i + 1] * 0.6 + d[i + 2] * 0.1) / 255;
        const on = lum > (B[(y0 + y) % 4][x % 4] + 0.5) / 16 ? 235 : 8;
        d[i] = on; d[i + 1] = on === 235 ? 245 : 10; d[i + 2] = on === 235 ? 255 : 16;
      }
    }
    b.putImageData(img, 0, y0);
  }
  // Gradient map (Gradient Lab): recolor the whole frame through a gradient
  // — shadows take one colour, highlights another. Full-frame, throttled.
  if ($('cook-fx-gradmap').checked && now - cook.lastGradmap > 500) {
    cook.lastGradmap = now;
    if (!cook.gradLut) cook.gradLut = gradmapLut(GRADMAP_PALETTES.riso.stops);
    const img = b.getImageData(0, 0, W, H);
    const d = img.data, lut = cook.gradLut;
    for (let i = 0; i < d.length; i += 4) {
      const lum = Math.round(d[i] * 0.3 + d[i + 1] * 0.6 + d[i + 2] * 0.1);
      d[i] = lut[lum * 3]; d[i + 1] = lut[lum * 3 + 1]; d[i + 2] = lut[lum * 3 + 2];
    }
    b.putImageData(img, 0, 0);
  }
  // Grain: film grain baked in from the pre-rendered noise tile.
  if ($('cook-fx-grain').checked) {
    b.save();
    b.globalCompositeOperation = 'overlay';
    b.globalAlpha = 0.10 + 0.12 * intensity;
    const ox = Math.floor(Math.random() * 128), oy = Math.floor(Math.random() * 128);
    b.translate(-ox, -oy);
    b.fillStyle = b.createPattern(grainTile, 'repeat');
    b.fillRect(0, 0, W + 128, H + 128);
    b.restore();
  }
  // Halftone: print dots over the image.
  if ($('cook-fx-halftone').checked) {
    b.save();
    b.globalCompositeOperation = 'multiply';
    b.globalAlpha = 0.16;
    b.fillStyle = b.createPattern(halftoneTile, 'repeat');
    b.fillRect(0, 0, W, H);
    b.restore();
  }
  // Geometric shapes: the photo re-drawn as triangles, throttled.
  if ($('cook-fx-geo').checked && now - cook.lastGeo > 300) {
    cook.lastGeo = now;
    const cell = 22;
    const img = b.getImageData(0, 0, W, H);
    const d = img.data;
    for (let gy = 0; gy + cell <= H; gy += cell) {
      for (let gx = 0; gx + cell <= W; gx += cell) {
        const i = (gy * W + gx) * 4;
        const r = d[i], g2 = d[i + 1], b2 = d[i + 2];
        const s = cell * (0.7 + state.smoothLow * 0.5);
        b.fillStyle = `rgb(${r},${g2},${b2})`;
        b.save();
        b.translate(gx + cell / 2, gy + cell / 2);
        b.rotate(Math.sin(now / 700 + gx + gy) * 0.25);
        b.beginPath(); b.moveTo(0, -s / 2); b.lineTo(s / 2, s / 2); b.lineTo(-s / 2, s / 2); b.closePath(); b.fill();
        b.restore();
      }
    }
  }
  // Mesh tint (mmeshy model): a gradient wash that follows the bass.
  if ($('cook-fx-mesh').checked && now - cook.lastMesh > 400) {
    cook.lastMesh = now;
    const pal = MESH_PALETTES.aurora.colors;
    b.save();
    b.globalCompositeOperation = 'soft-light';
    for (let i = 0; i < 3; i++) {
      const nx = (0.25 + 0.25 * i + Math.sin(now / 900 + i * 2) * 0.08) * W;
      const ny = (0.3 + (i % 2) * 0.35 + Math.cos(now / 1100 + i) * 0.06) * H;
      const r = Math.min(W, H) * 0.5 * (1 + bass * 0.4 + kick * 0.2);
      const grad = b.createRadialGradient(nx, ny, 0, nx, ny, r);
      grad.addColorStop(0, pal[i % pal.length]);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      b.globalAlpha = 0.5;
      b.fillStyle = grad;
      b.fillRect(nx - r, ny - r, r * 2, r * 2);
    }
    b.restore();
  }
  // Posterize (v0.2.6): flat colour bands in a random strip — the step
  // count follows the level, so loud moments posterize harder.
  if ($('cook-fx-posterize') && $('cook-fx-posterize').checked && now - cook.lastPosterize > 400) {
    cook.lastPosterize = now;
    const steps = 2 + Math.floor(level * 6);
    const y0 = Math.floor(Math.random() * (H - 60));
    const img = b.getImageData(0, y0, W, 60);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.round(d[i] / 255 * (steps - 1)) / (steps - 1) * 255;
      d[i + 1] = Math.round(d[i + 1] / 255 * (steps - 1)) / (steps - 1) * 255;
      d[i + 2] = Math.round(d[i + 2] / 255 * (steps - 1)) / (steps - 1) * 255;
    }
    b.putImageData(img, 0, y0);
  }
  // Solarize (v0.2.6): brights invert past a threshold that rides the level.
  if ($('cook-fx-solarize') && $('cook-fx-solarize').checked && now - cook.lastSolarize > 500) {
    cook.lastSolarize = now;
    const thr = 255 * (0.35 + level * 0.4);
    const y0 = Math.floor(Math.random() * (H - 60));
    const img = b.getImageData(0, y0, W, 60);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > thr) d[i] = 255 - d[i];
      if (d[i + 1] > thr) d[i + 1] = 255 - d[i + 1];
      if (d[i + 2] > thr) d[i + 2] = 255 - d[i + 2];
    }
    b.putImageData(img, 0, y0);
  }
  // Style pass (ASCII library): re-render the working photo in the chosen
  // style, baked in cumulatively like every other cook effect. The style
  // runs at a modest grid so it stays fast, then scales back up.
  const cookStyle = $('cook-style').value;
  if (cookStyle && cookStyle !== 'none' && now - cook.lastStyle > 700) {
    cook.lastStyle = now;
    const cols = 140;
    const rows = Math.max(8, Math.round(cols * (H / W) * 0.5));
    const off = document.createElement('canvas');
    off.width = cols; off.height = rows;
    const octx = off.getContext('2d', { willReadFrequently: true });
    octx.drawImage(cook.base, 0, 0, cols, rows);
    const data = octx.getImageData(0, 0, cols, rows).data;
    const opts = {
      palette: $('ascii-palette').value, ditherAlgo: $('ascii-dither-algo').value,
      tileShape: $('ascii-tile').value, ramp: $('ascii-ramp').value,
      color: true, invert: false, contrast: 1, density: 1,
      ar: { kick, bass, level },
      depthMap: ($('cook-depth-slice').checked && depth.map) ? depthMapForGrid(cols, rows) : null,
      overlayHue: 320
    };
    const styled = document.createElement('canvas');
    renderAsciiStyleInto(styled, styled.getContext('2d'), data, cols, rows, opts);
    // Blend the styled render back in (not a hard replace — it cooks in).
    b.save();
    b.globalAlpha = 0.35 + 0.45 * intensity;
    b.imageSmoothingEnabled = true;
    b.drawImage(styled, 0, 0, W, H);
    b.restore();
  }
  // --- LIVE pass: re-render work from base, then the live effects ---
  c.drawImage(cook.base, 0, 0);
  // Bass color warp: ABSOLUTE hue/saturation from the CURRENT bass —
  // applied to the base each frame, so it relaxes when the bass drops.
  if ($('cook-fx-warp').checked) {
    const deg = (bass * 120 * intensity).toFixed(1);
    c.filter = `hue-rotate(${deg}deg) saturate(${(1 + bass * 0.8 * intensity).toFixed(2)})`;
    c.drawImage(cook.base, 0, 0);
    c.filter = 'none';
  }
  // Beat displacement: bands nudged by a DECAYING kick envelope — the
  // nudge rises on the kick and falls back, so the image never shreds
  // itself into a permanent mess.
  cook.dispEnv = Math.max(kick, (cook.dispEnv || 0) * 0.92);
  if ($('cook-fx-displace').checked && cook.dispEnv > 0.05) {
    const bands = 3 + Math.floor(Math.random() * 5);
    for (let i = 0; i < bands; i++) {
      const sy = Math.floor(Math.random() * (H - 8));
      const bh = 4 + Math.floor(Math.random() * 18);
      const dx = Math.round((Math.random() - 0.5) * 44 * intensity * cook.dispEnv);
      if (dx) c.drawImage(cook.work, 0, sy, W, bh, dx, sy, W, bh);
    }
  }
  // Wave warp (v0.2.6): sine ripple, amplitude follows the bass.
  if ($('cook-fx-wave') && $('cook-fx-wave').checked && bass > 0.05) {
    const amp = bass * 14 * intensity;
    const stripH = 8;
    for (let y = 0; y < H; y += stripH) {
      const dx = Math.round(Math.sin(y * 0.05 + now / 300) * amp);
      if (dx) c.drawImage(cook.work, 0, y, W, stripH, dx, y, W, stripH);
    }
  }
  // Mirror (v0.2.6): the photo mirrors itself; the axis flips on the kick.
  if ($('cook-fx-mirror') && $('cook-fx-mirror').checked) {
    if (kick > 0.7 && !cook.mirrorArmed) { cook.mirrorFlip = !cook.mirrorFlip; cook.mirrorArmed = true; }
    if (kick < 0.3) cook.mirrorArmed = false;
    c.save();
    if (cook.mirrorFlip) { c.translate(W, 0); c.scale(-1, 1); }
    else { c.translate(0, H); c.scale(1, -1); }
    c.globalAlpha = 0.5;
    c.drawImage(cook.work, 0, 0);
    c.restore();
  }
  // Chromatic split (v0.2.6): ghosted copies pull apart with the bass.
  if ($('cook-fx-chroma') && $('cook-fx-chroma').checked && bass > 0.05) {
    const dx = Math.round(bass * 12 * intensity);
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = 0.4;
    c.drawImage(cook.work, dx, 0);
    c.drawImage(cook.work, -dx, 0);
    c.restore();
  }
  // Swirl (v0.2.6): the centre twists with the kick.
  if ($('cook-fx-swirl') && $('cook-fx-swirl').checked && kick > 0.1) {
    const r = Math.min(W, H) * 0.45;
    c.save();
    c.beginPath(); c.arc(W / 2, H / 2, r, 0, Math.PI * 2); c.clip();
    c.translate(W / 2, H / 2);
    c.rotate(kick * 0.35 * intensity);
    c.drawImage(cook.work, -W / 2, -H / 2);
    c.restore();
  }
  // Slit-scan (v0.2.6): a vertical slice scrolls across with the beat phase.
  if ($('cook-fx-slitscan') && $('cook-fx-slitscan').checked) {
    const phase = analysis && analysis.beatPhase >= 0 ? analysis.beatPhase : (now % 2000) / 2000;
    const sx = Math.floor(phase * (W - 12));
    c.drawImage(cook.work, sx, 0, 12, H, sx + 8, 0, 12, H);
  }
  // Vignette burn (v0.2.6): the edges darken as the level rises.
  if ($('cook-fx-vignette') && $('cook-fx-vignette').checked && level > 0.05) {
    const grad = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.72);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${(level * 0.7 * intensity).toFixed(2)})`);
    c.fillStyle = grad; c.fillRect(0, 0, W, H);
  }
  // Depth parallax: foreground and background sway apart with the beat.
  const parAmt = Number($('cook-depth-parallax').value) / 100;
  if (cook.nearMask && parAmt > 0 && kick > 0.45 && now - cook.lastParallax > 400) {
    cook.lastParallax = now;
    const dx = Math.round((6 + kick * 22) * parAmt * intensity * (Math.random() < 0.5 ? -1 : 1));
    const snap = document.createElement('canvas'); snap.width = W; snap.height = H;
    const sctx = snap.getContext('2d');
    sctx.drawImage(cook.base, 0, 0);
    const layer = (mask, off) => {
      const lc = document.createElement('canvas'); lc.width = W; lc.height = H;
      const lctx = lc.getContext('2d');
      lctx.drawImage(snap, 0, 0);
      lctx.globalCompositeOperation = 'destination-in';
      lctx.drawImage(mask, 0, 0);
      c.drawImage(lc, off, 0);
    };
    c.save();
    c.globalAlpha = 1;
    layer(cook.farMask, -dx);
    layer(cook.nearMask, dx);
    c.restore();
  }
  // Depth blur: far layers blur more as the bass rises.
  if (cook.farMask && $('cook-depth-blur').checked && bass > 0.1 && now - cook.lastDepthBlur > 500) {
    cook.lastDepthBlur = now;
    const snap = document.createElement('canvas'); snap.width = W; snap.height = H;
    const sctx = snap.getContext('2d');
    sctx.drawImage(cook.base, 0, 0);
    const lc = document.createElement('canvas'); lc.width = W; lc.height = H;
    const lctx = lc.getContext('2d');
    lctx.filter = `blur(${(1 + bass * 9).toFixed(1)}px)`;
    lctx.drawImage(snap, 0, 0);
    lctx.filter = 'none';
    lctx.globalCompositeOperation = 'destination-in';
    lctx.drawImage(cook.farMask, 0, 0);
    c.drawImage(lc, 0, 0);
  }
  // Cook level: cumulative effect energy, 0..100.
  cook.cookLevel = Math.min(100, cook.cookLevel + (kick * 1.6 + bass * 0.9 + level * 0.7) * intensity);
  let prog = 0, label = '';
  if (state.sysAudio) {
    prog = cook.cookLevel / 100;
    label = `Cooking on system audio — ${fmt((performance.now() - cook.startedAt) / 1000)} in · cook level ${Math.round(cook.cookLevel)}%`;
  } else if (state.duration) {
    prog = Math.min(1, currentTime() / state.duration);
    label = `Cooking on ${cookSongName()} — ${fmt(currentTime())} / ${fmt(state.duration)} · cook level ${Math.round(cook.cookLevel)}%`;
  }
  $('cook-progress').value = prog;
  $('cook-progress-text').textContent = label;
  $('cook-meter').textContent = `cook level: ${Math.round(cook.cookLevel)}%`;
  updateCookButtons();
  drawCookDisplay();
}

function drawCookDisplay() {
  const c = $('cook-canvas');
  if (!c || !cook.work) return;
  if (c.width !== cook.W || c.height !== cook.H) { c.width = cook.W; c.height = cook.H; }
  const g = c.getContext('2d');
  if (cook.depthView !== 'photo' && cook.depthCanvas) {
    if (cook.depthView === 'heat') {
      const tmp = document.createElement('canvas');
      drawDepthMap(tmp, tmp.getContext('2d'), true);
      g.imageSmoothingEnabled = true;
      g.drawImage(tmp, 0, 0, cook.W, cook.H);
    } else {
      g.drawImage(cook.depthCanvas, 0, 0);
    }
    return;
  }
  if (cook.comparing) { g.drawImage(cook.src, 0, 0); return; }
  if (cook.split) {
    g.drawImage(cook.src, 0, 0, cook.W / 2, cook.H, 0, 0, cook.W / 2, cook.H);
    g.drawImage(cook.work, cook.W / 2, 0, cook.W / 2, cook.H, cook.W / 2, 0, cook.W / 2, cook.H);
    g.fillStyle = '#ff2e88'; g.fillRect(cook.W / 2 - 1, 0, 2, cook.H);
    return;
  }
  g.drawImage(cook.work, 0, 0);
}
/* Export the cooked frame as a JPEG. savePath: bypass the dialog (smoke
   test); tag: '-cooked' for the final frame, '-snapshot' mid-cook. */
function exportCookJpeg(savePath, tag) {
  return new Promise((resolve) => {
    if (!cook.work) { resolve(null); return; }
    cook.work.toBlob(async (blob) => {
      if (!blob) { resolve(null); return; }
      const buf = new Uint8Array(await blob.arrayBuffer());
      const out = savePath || await window.pulse.saveImage((cook.imageName || 'cooked').replace(/\.[^.]+$/, '') + (tag || '-cooked') + '.jpg');
      if (!out) { resolve(null); return; }
      await window.pulse.writeFile(out, buf);
      resolve(out);
    }, 'image/jpeg', 0.92);
  });
}
$('btn-cook-image').addEventListener('click', async () => {
  const files = await window.pulse.openMedia();
  if (!files || !files.length) return;
  const img = files.find((f) => kindOf(f.name) === 'image') || files[0];
  await loadCookImage(img.path);
});
$('btn-cook-song').addEventListener('click', async () => {
  const files = await window.pulse.openMedia();
  if (!files || !files.length) return;
  const media = files.filter((f) => kindOf(f.name) === 'audio' || kindOf(f.name) === 'video');
  if (!media.length) { $('cook-song-name').textContent = 'pick an audio or video file'; return; }
  addToPlaylist(files, true);
  cook.songPath = media[0].path; cook.songName = media[0].name; cook.useSysAudio = false;
  $('cook-song-name').textContent = cook.songName;
  updateCookButtons();
  openCookStep('recipe');
});
$('btn-cook-sysaudio').addEventListener('click', async () => {
  const ok = await startSystemAudio();
  if (ok) {
    cook.useSysAudio = true; cook.songPath = ''; cook.songName = 'System audio';
    $('cook-song-name').textContent = 'System audio — play anything on your PC';
    updateCookButtons();
    openCookStep('recipe');
  }
});
$('btn-cook-start').addEventListener('click', startCook);
$('btn-cook-stop').addEventListener('click', stopCook);
$('btn-cook-download').addEventListener('click', async () => { await exportCookJpeg(null, '-cooked'); });
$('btn-cook-snapshot').addEventListener('click', async () => { await exportCookJpeg(null, '-snapshot'); });
pairSliderNum('cook-intensity', 'cook-intensity-val');
const compareBtn = $('btn-cook-compare');
compareBtn.addEventListener('pointerdown', () => { cook.comparing = true; drawCookDisplay(); });
['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => compareBtn.addEventListener(ev, () => { cook.comparing = false; drawCookDisplay(); }));
$('btn-cook-split').addEventListener('click', () => {
  cook.split = !cook.split;
  $('btn-cook-split').setAttribute('aria-pressed', String(cook.split));
  drawCookDisplay();
});
/* Depth step (Gather technique). */
pairSliderNum('cook-depth-parallax', 'cook-depth-parallax-val');
$('btn-cook-depth').addEventListener('click', async () => { await cookDepthEstimate(); });
$('btn-cook-depth-heuristic').addEventListener('click', () => cookDepthHeuristic());
$('btn-cook-depth-view').addEventListener('click', () => {
  cook.depthView = cook.depthView === 'map' ? 'photo' : 'map';
  $('btn-cook-depth-view').textContent = cook.depthView === 'map' ? 'View: depth map' : 'View: photo';
  $('btn-cook-depth-view').setAttribute('aria-pressed', String(cook.depthView === 'map'));
  $('btn-cook-depth-heat').setAttribute('aria-pressed', 'false');
  drawCookDisplay();
});
$('btn-cook-depth-heat').addEventListener('click', () => {
  cook.depthView = cook.depthView === 'heat' ? 'photo' : 'heat';
  $('btn-cook-depth-heat').setAttribute('aria-pressed', String(cook.depthView === 'heat'));
  $('btn-cook-depth-view').setAttribute('aria-pressed', 'false');
  if (cook.depthView === 'heat') $('btn-cook-depth-view').textContent = 'View: photo';
  drawCookDisplay();
});
window.pulse.onDepthProgress((d) => {
  $('cook-depth-status').textContent = `Downloading ${d.model === 'dav2' ? 'Depth Anything V2 Small' : 'FastDepth'}… ${(d.received / 1048576).toFixed(1)} MB of ${(d.total / 1048576).toFixed(1)} MB`;
});

/* ---------- Chrome wiring (v0.2.4: native controls, no Material) ---------- */
/* Theme: GLOBAL, not Visualize-scoped. 0.2.3 only ever changed
   state.theme, and only the Visualize canvas read it — every other tab
   stayed on the hardcoded blue chrome. Now the theme is CSS variables
   on <body data-theme>, so picking one recolors the whole app from any
   tab, and the choice persists in pulse-config.json. */
const THEME_LABELS = { sky: 'Sky', midnight: 'Midnight', sunset: 'Sunset', mono: 'Mono' };
function applyTheme(name) {
  if (!THEMES[name]) name = 'sky';
  state.theme = name;
  document.body.dataset.theme = name;
  $('theme-label').textContent = 'Theme: ' + (THEME_LABELS[name] || name);
  window.pulse.setConfig({ theme: name }).catch(() => {});
}
function setThemeMenuOpen(open) { $('theme-menu').classList.toggle('open', !!open); }
$('theme-button').addEventListener('click', (e) => { e.stopPropagation(); setThemeMenuOpen(!$('theme-menu').classList.contains('open')); });
document.querySelectorAll('#theme-menu .paper-menu-item').forEach((item) => {
  item.addEventListener('click', () => { applyTheme(item.dataset.theme); setThemeMenuOpen(false); });
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.menu-anchor')) setThemeMenuOpen(false);
  if (!e.target.closest('#btn-viz-source') && !e.target.closest('#viz-source-menu')) $('viz-source-menu').hidden = true;
  if (!e.target.closest('#btn-viz-scenes') && !e.target.closest('#lookbar')) $('lookbar').hidden = true;
});

/* ---------- Visualize tab: Toaster bar wiring ---------- */
$('btn-viz-source').addEventListener('click', (e) => { e.stopPropagation(); $('lookbar').hidden = true; $('viz-source-menu').hidden = !$('viz-source-menu').hidden; });
$('btn-viz-scenes').addEventListener('click', (e) => { e.stopPropagation(); $('viz-source-menu').hidden = true; $('lookbar').hidden = !$('lookbar').hidden; });
$('viz-source-menu').addEventListener('click', () => { $('viz-source-menu').hidden = true; });
$('btn-viz-src-sys').addEventListener('click', () => startSystemAudio());
$('btn-viz-src-stop').addEventListener('click', () => stopSystemAudio(false));
$('btn-viz-layers').addEventListener('click', () => { $('layers-panel').hidden = !$('layers-panel').hidden; });
$('btn-viz-card').addEventListener('click', () => { const c = $('viz-card'); c.hidden = !c.hidden; updateVizLive(); });
$('btn-viz-cam').addEventListener('click', () => setTab('ascii'));
$('btn-viz-rec').addEventListener('click', () => toggleRecord());
$('btn-viz-strudel').addEventListener('click', () => $('btn-code-strudel').click());
$('btn-viz-help').addEventListener('click', () => $('shortcuts-dialog').show());
// Shortcuts dialog
$('btn-help').addEventListener('click', () => $('shortcuts-dialog').show());
$('btn-close-shortcuts').addEventListener('click', () => $('shortcuts-dialog').close());

/* ---------- UI wiring ---------- */
document.querySelectorAll('#lookbar .look-chip').forEach((b) => b.addEventListener('click', () => { setLook(b.dataset.look); $('lookbar').hidden = true; }));
$('btn-open-audio').addEventListener('click', pickMedia);
$('btn-open-midi').addEventListener('click', pickMidi);
$('btn-open-empty').addEventListener('click', pickMedia);
$('btn-add-media').addEventListener('click', pickMedia);
$('btn-add-folder').addEventListener('click', async () => {
  const dir = await window.pulse.openDirectory();
  if (!dir) return;
  const files = await window.pulse.listDir(dir);
  addToPlaylist(files, true);
});
$('btn-play').addEventListener('click', togglePlay);
$('btn-prev').addEventListener('click', prevTrack);
$('btn-next').addEventListener('click', () => nextTrack(false));
$('seek').addEventListener('input', (e) => seekTo((e.target.value / 1000) * state.duration));
$('btn-shuffle').addEventListener('click', () => {
  state.shuffle = !state.shuffle;
  $('btn-shuffle').setAttribute('aria-pressed', String(state.shuffle));
});
$('btn-repeat').addEventListener('click', () => {
  state.repeat = state.repeat === 'off' ? 'all' : (state.repeat === 'all' ? 'one' : 'off');
  $('btn-repeat').setAttribute('aria-pressed', String(state.repeat !== 'off'));
  $('btn-repeat').textContent = `Repeat: ${state.repeat}`;
});
$('playlist').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-i]');
  if (li) playAt(Number(li.dataset.i));
});
$('btn-sysaudio').addEventListener('click', startSystemAudio);
$('btn-stop-sysaudio').addEventListener('click', () => stopSystemAudio(false));
$('play-video').addEventListener('ended', () => nextTrack(true));
// Live Strudel code panel (Toaster codegen port).
$('btn-code-copy').addEventListener('click', async () => {
  const lines = cgBuildLines(analysis || { bpmLocked: false, bpm: 0, silent: true, key: null, slots: [null, null, null, null], bassBeats: [null, null, null, null], v: {}, present: {}, playing: () => false, knobs: { bassLpf: 600, chordLpf: 2400, hhGain: 0.5 }, ducking: false, bassSound: {}, lastKick: -10, lastDrop: -99, bar: 0 }, { source: state.sysAudio ? 'system audio' : (state.trackName || '...'), song: null }, performance.now() / 1000);
  const texts = {};
  for (const id of CG_LINE_IDS) texts[id] = (lines[id] || []).map((p) => p.text).join('');
  const code = cgStrudelProgram(texts, state.sysAudio ? null : { title: state.trackName.replace(/\.[^.]+$/, '') });
  try { await navigator.clipboard.writeText(code); $('code-status').textContent = '— copied to clipboard'; }
  catch (_) { $('code-status').textContent = '— copy failed (clipboard blocked)'; }
});
$('btn-code-strudel').addEventListener('click', () => {
  const texts = {};
  for (const id of CG_LINE_IDS) texts[id] = $('code-lines').textContent.split('\n')[CG_LINE_IDS.indexOf(id)] || '';
  const code = cgStrudelProgram(texts, state.sysAudio ? null : { title: state.trackName.replace(/\.[^.]+$/, '') });
  window.open(cgStrudelLink(code), '_blank');
});
$('btn-code-toggle').addEventListener('click', () => {
  const panel = $('code-panel');
  panel.classList.toggle('hidden-panel');
  $('btn-code-toggle').textContent = panel.classList.contains('hidden-panel') ? 'Show' : 'Hide';
});
updateSysAudioUI();

/* ---------- restore saved state (theme, library folder, layout) ---------- */
window.pulse.getConfig().then((cfg) => {
  if (!cfg) return;
  if (cfg.theme && THEMES[cfg.theme]) applyTheme(cfg.theme);
  if (cfg.libraryDir) libraryBrowse(cfg.libraryDir);
  // v0.2.6: panel layout (drag order, sizes, hidden panels) restores here.
  if (window.PulseLayout) window.PulseLayout.init(cfg);
  if (cfg.modules) applyModuleSettings(cfg.modules);
  // v0.2.7 item 3: auto-start off only when the user explicitly turned
  // it off (unchecking AUDIO CORRUPT); default is on.
  if (cfg.glitchAuto === false) { glitchAuto = false; $('glitch-audio-corrupt').checked = false; }
  // v0.2.7 item 5: the Visualize spectrum/scope theme persists per
  // visualizer — a saved bundle wins; a bare name re-applies the preset.
  if (cfg.vizThemes && cfg.vizThemes.sceneViz) {
    const sv = cfg.vizThemes.sceneViz;
    if (typeof sv === 'string' && SPECTRUM_THEMES[sv]) {
      state.sceneVizTheme = { ...SPECTRUM_THEMES[sv], name: sv };
    } else if (sv && typeof sv === 'object' && SPECTRUM_THEMES[sv.name]) {
      state.sceneVizTheme = { ...SPECTRUM_THEMES[sv.name], ...sv };
    }
    const sel = $('spectrum-scene-theme');
    if (sel && state.sceneVizTheme.name) sel.value = state.sceneVizTheme.name;
  }
}).catch(() => {});

/* ---------- pop-out panels: live code editor + hex editor ----------
   Each opens in its own OS window (main.js), stays live-synced via IPC,
   and docks back when closed. The main-window panel never disappears —
   the pop-out is a second live view of the same state. */
$('btn-code-popout').addEventListener('click', () => window.pulse.popoutOpen('code'));
$('btn-hex-popout').addEventListener('click', () => window.pulse.popoutOpen('hex'));
/* FX params from the (popped-out) code editor apply live to the running
   effects: look, theme, cook intensity. */
function applyFxParams(p) {
  if (!p || typeof p !== 'object') return;
  if (p.look && p.look !== state.look) setLook(p.look);
  if (p.theme && p.theme !== state.theme) applyTheme(p.theme);
  if (p.cookIntensity != null && $('cook-intensity')) {
    $('cook-intensity').value = Math.max(1, Math.min(100, Number(p.cookIntensity) || 50));
    $('cook-intensity-val').value = $('cook-intensity').value;
  }
}
window.pulse.onPopoutEdit(async (panel, data) => {
  if (!data) return;
  if (panel === 'code' && data.type === 'fx') {
    applyFxParams(data.params);
    updateCodePanel();
  } else if (panel === 'code' && data.type === 'custom') {
    state.customCode = data.text || '';
    updateCodePanel();
  } else if (panel === 'hex' && data.type === 'write') {
    if (!glitch.tempPath) return;
    await window.pulse.glitchWriteByte(glitch.tempPath, data.offset, data.value);
    await renderHex();
    reloadGlitchPreview();
  } else if (panel === 'hex' && data.type === 'nav') {
    if (!glitch.tempPath) return;
    glitch.viewOffset = Math.max(0, glitch.viewOffset + data.dir * glitch.viewLen);
    await renderHex();
  }
});
window.pulse.onMenu('popout-docked', (panel) => {
  // The panel is back in the main window (it never left visually); refresh
  // it so anything edited in the pop-out is showing here too.
  if (panel === 'code') updateCodePanel();
  if (panel === 'hex') renderHex();
});

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  // A focused button owns Space/Enter (it clicks on keyup) — don't also
  // toggle play from the same keypress.
  const ae = document.activeElement;
  if (ae && ae.tagName === 'BUTTON' && (e.code === 'Space' || e.code === 'Enter')) return;
  if (e.code === 'Escape' && state.presenting) { e.preventDefault(); setPresenting(false); return; }
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyK') { e.preventDefault(); openPalette(); return; }
  if (e.code === 'KeyF' && e.shiftKey && !e.ctrlKey && !e.metaKey && activeTab === 'visualize') { e.preventDefault(); toggleVizFullscreen(); return; }
  if (e.code === 'KeyF' && !e.ctrlKey && !e.metaKey && activeTab === 'visualize') { e.preventDefault(); togglePresent(); return; }
  if (e.code === 'Slash' && activeTab === 'play') { e.preventDefault(); $('play-filter').focus(); return; }
  if (e.code === 'Space' || e.code === 'KeyP') { e.preventDefault(); togglePlay(); }
  if (e.code === 'KeyN') nextTrack(false);
  if (e.code === 'KeyB') prevTrack();
  if (e.code === 'KeyM') $('btn-shuffle').click();
  if (e.code === 'KeyR' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); toggleRecord(); return; }
  if (e.code === 'KeyR' && !e.ctrlKey && !e.metaKey) $('btn-repeat').click();
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') { e.preventDefault(); snapshotCurrent(); return; }
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyO') { e.preventDefault(); pickMedia(); return; }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyC') { e.preventDefault(); window.pulse.popoutOpen('code'); return; }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyH') { e.preventDefault(); window.pulse.popoutOpen('hex'); return; }
  if ((e.ctrlKey || e.metaKey) && /^Digit[1-6]$/.test(e.code)) {
    e.preventDefault();
    setTab(TAB_ORDER[Number(e.code.slice(5)) - 1]);
    return;
  }
  if (activeTab === 'visualize') {
    const looks = ['spectrum', 'scope', 'orbit', 'roll', 'fountain', 'pattern', 'studio', 'geometric', 'dither', 'depth'];
    if (/^Digit[1-9]$/.test(e.code)) setLook(looks[Number(e.code.slice(5)) - 1]);
    if (e.code === 'Digit0') setLook('depth');
  }
  if (activeTab === 'play' && (e.code === 'ArrowDown' || e.code === 'ArrowUp')) {
    e.preventDefault();
    const dir = e.code === 'ArrowDown' ? 1 : -1;
    const next = Math.max(0, Math.min(state.playlist.length - 1, (state.playIndex < 0 ? 0 : state.playIndex + dir)));
    if (state.playlist.length) playAt(next);
  }
});

/* drag & drop */
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  wakeAudio(); // v0.2.5: resume inside the drop gesture, before the awaits
  const files = [...e.dataTransfer.files];
  const media = files.filter((f) => kindOf(f.name) === 'audio' || kindOf(f.name) === 'video');
  const imgs = files.filter((f) => kindOf(f.name) === 'image');
  const midis = files.filter((f) => kindOf(f.name) === 'midi');
  if (media.length) addToPlaylist(media.map((f) => ({ path: f.path, name: f.name })), true);
  for (const m of midis) await loadMidiFile(m.path, m.name, false);
  if (!media.length && imgs.length) { setTab('glitch'); openGlitchFile(imgs[0].path); }
});

/* ---------- recording & snapshots ---------- */
function recName(ext) {
  const base = (state.trackName || 'pulse').replace(/\.[^.]+$/, '').replace(/[^\w\-]+/g, '-');
  return `${base}-${state.look}.${ext}`;
}
async function toggleRecord() {
  if (state.recording) { stopRecord(); return; }
  if (!state.buffer && !state.videoMode && !state.sysAudio) { alert('Open a track first.'); return; }
  setTab('visualize');
  const stream = new MediaStream([
    ...canvas.captureStream(60).getVideoTracks(),
    ...state.mediaDest.stream.getAudioTracks()
  ]);
  const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 12_000_000 } : undefined);
  state.recChunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) state.recChunks.push(e.data); };
  rec.onstop = async () => {
    const blob = new Blob(state.recChunks, { type: 'video/webm' });
    const buf = new Uint8Array(await blob.arrayBuffer());
    const out = await window.pulse.saveVideo(recName('webm'));
    if (out) await window.pulse.writeFile(out, buf);
    $('btn-record').classList.remove('recording');
    $('btn-record').textContent = 'Record';
    $('rec-dot').classList.add('hidden');
  };
  rec.start(250);
  state.recording = rec; state.recStart = Date.now();
  $('btn-record').classList.add('recording');
  $('btn-record').textContent = 'Stop';
  $('rec-dot').classList.remove('hidden');
  const tick = setInterval(() => {
    if (!state.recording) { clearInterval(tick); return; }
    $('rec-time').textContent = fmt((Date.now() - state.recStart) / 1000);
  }, 500);
}
function stopRecord() { if (state.recording) { state.recording.stop(); state.recording = null; } }
$('btn-record').addEventListener('click', toggleRecord);
async function snapshotCurrent() {
  let c = canvas, name = recName('png');
  if (activeTab === 'ascii') {
    if (!ascii.running) { alert('Start the webcam or a video file first.'); return; }
    c = asciiCanvas; name = 'ascii-snapshot.png';
  } else if (activeTab === 'glitch') {
    if (!glitch.previewLoaded) { alert('Corrupt an image or video file first so there is something to snapshot.'); return; }
    c = gpCanvas; name = 'glitch-preview.png';
  } else if (!state.buffer && !state.videoMode && !state.sysAudio) {
    alert('Open a track first.'); return;
  }
  c.toBlob(async (blob) => {
    const buf = new Uint8Array(await blob.arrayBuffer());
    const out = await window.pulse.saveImage(name);
    if (out) await window.pulse.writeFile(out, buf);
  }, 'image/png');
}
$('btn-snapshot').addEventListener('click', snapshotCurrent);

/* ---------- menu events from main process ---------- */
window.pulse.onMenu('menu-open-media', pickMedia);
window.pulse.onMenu('menu-open-midi', pickMidi);
window.pulse.onMenu('menu-record', toggleRecord);
window.pulse.onMenu('menu-snapshot', snapshotCurrent);
window.pulse.onMenu('menu-look', setLook);
window.pulse.onMenu('menu-tab', setTab);

/* ---------- headless smoke test (?smoke=1) ---------- */
/* Dev hook: ?demo=<name> — stage a tab for screenshots (like --smoke-test,
   but visual). demo=ascii-dither | mission | play-mc | viz-fullscreen | module-menu | cook-live | cook-depth | depth-look. */
async function runDemo(name) {
  try {
    if (name === 'ascii-dither') {
      asciiVideo.srcObject = null;
      asciiVideo.src = window.pulse.fileUrl('/tmp/pulse-test/clip1.mp4');
      await asciiVideo.play().catch(() => {});
      ascii.running = true;
      $('ascii-filter').value = 'dither';
      $('ascii-dither-algo').value = 'floyd-steinberg';
      $('ascii-palette').value = 'gameboy';
      document.querySelector('.ascii-fx[data-fx="scanlines"]').checked = true;
      setTab('ascii');
    } else if (name === 'mission' || name === 'play-mc') {
      // v0.2.6: Mission Control lives in the Play tab now — same staging
      // (tone playing + a glitched file), viewed in Play.
      addToPlaylist([{ path: '/tmp/pulse-test/tone.wav', name: 'tone.wav' }], false);
      await playAt(0);
      await openGlitchFile('/tmp/pulse-test/gradient.png');
      setTab('play');
      $('play-mc').scrollIntoView();
    } else if (name === 'viz-fullscreen') {
      // v0.2.6: fullscreen visualization on a new scene, panels on top.
      addToPlaylist([{ path: '/tmp/pulse-test/tone.wav', name: 'tone.wav' }], false);
      await playAt(0);
      await new Promise((r) => setTimeout(r, 2000));
      setTab('visualize'); setLook('lab-flow');
      await new Promise((r) => setTimeout(r, 800));
      toggleVizFullscreen();
    } else if (name === 'module-menu') {
      // v0.2.6: Play tab with the spectrum module's context menu open.
      addToPlaylist([{ path: '/tmp/pulse-test/tone.wav', name: 'tone.wav' }], false);
      await playAt(0);
      await new Promise((r) => setTimeout(r, 1500));
      setTab('play');
      await new Promise((r) => setTimeout(r, 500));
      const c = $('play-spectrum').getBoundingClientRect();
      showModuleMenu(c.left + c.width / 2, c.top + 40, $('play-spectrum'));
    } else if (name === 'cook-live') {
      // v0.2.6: Cook mid-cook on the tone — warp + displacement breathing.
      await loadCookImage('/tmp/pulse-test/gradient.png');
      addToPlaylist([{ path: '/tmp/pulse-test/tone.wav', name: 'tone.wav' }], false);
      await playAt(0);
      $('cook-fx-warp').checked = true;
      $('cook-fx-displace').checked = true;
      $('cook-fx-wave').checked = true;
      $('cook-fx-mesh').checked = true;
      updateCookButtons();
      setTab('cook');
      startCook();
    } else if (name === 'cook-depth') {
      await loadCookImage('/tmp/pulse-test/gradient.png');
      await cookDepthEstimate('fastdepth');
      cook.depthView = 'map';
      $('btn-cook-depth-view').textContent = 'View: depth map';
      setTab('cook');
    } else if (name === 'depth-look') {
      await loadCookImage('/tmp/pulse-test/gradient.png');
      await cookDepthEstimate('fastdepth');
      addToPlaylist([{ path: '/tmp/pulse-test/tone.wav', name: 'tone.wav' }], false);
      await playAt(0);
      setTab('visualize'); setLook('depth');
    } else if (name === 'theme-play-sunset') {
      // v0.2.4: Play tab in Sunset — proof the theme follows off Visualize.
      applyTheme('sunset');
      addToPlaylist([{ path: '/tmp/pulse-test/tone.wav', name: 'tone.wav' }], false);
      await playAt(0);
      await new Promise((r) => setTimeout(r, 1500));
      setTab('play');
    } else if (name === 'theme-cook-mono') {
      // v0.2.4: Cook tab in Mono — START COOKING at the top, theme applied.
      applyTheme('mono');
      await loadCookImage('/tmp/pulse-test/gradient.png');
      addToPlaylist([{ path: '/tmp/pulse-test/tone.wav', name: 'tone.wav' }], false);
      await playAt(0);
      await new Promise((r) => setTimeout(r, 1500));
      setTab('cook');
    } else if (name === 'toaster') {
      // v0.2.3 hero shot: tone playing, ASCII scene on the stage, live code
      // panel writing the scene line, status bar lit.
      addToPlaylist([{ path: '/tmp/pulse-test/tone.wav', name: 'tone.wav' }], false);
      await playAt(0);
      await new Promise((r) => setTimeout(r, 2500));
      setTab('visualize'); setLook('ascii');
      await new Promise((r) => setTimeout(r, 1200));
    } else if (name === 'toaster-mesh') {
      addToPlaylist([{ path: '/tmp/pulse-test/tone.wav', name: 'tone.wav' }], false);
      await playAt(0);
      await new Promise((r) => setTimeout(r, 2500));
      setTab('visualize'); setLook('mesh');
      addLayer('scanlines');
      await new Promise((r) => setTimeout(r, 1200));
    } else if (name === 'toaster-glitch') {
      addToPlaylist([{ path: '/tmp/pulse-test/tone.wav', name: 'tone.wav' }], false);
      await playAt(0);
      await new Promise((r) => setTimeout(r, 2500));
      setTab('visualize'); setLook('glitch');
      addLayer('glow');
      await new Promise((r) => setTimeout(r, 1200));
    }
  } catch (e) {
    window.__errors.push('demo ' + name + ': ' + (e.message || e));
  }
}
const demoName = new URLSearchParams(location.search).get('demo');
if (demoName) window.addEventListener('load', () => setTimeout(() => runDemo(demoName), 500));
async function smokeTest() {
  const R = { ok: true, steps: {} };
  const progress = async () => {
    try { await window.pulse.writeFile('/tmp/pulse-smoke-progress.json', new TextEncoder().encode(JSON.stringify(R, null, 2))); } catch (_) {}
  };
  const step = async (name, fn) => {
    try { R.steps[name] = await fn(); }
    catch (e) { R.steps[name] = { error: String(e && e.message || e) }; R.ok = false; }
    await progress();
  };
  await step('tabs', async () => {
    for (const t of ['play', 'visualize', 'glitch', 'ascii', 'cut', 'cook']) { setTab(t); await new Promise((r) => setTimeout(r, 150)); }
    setTab('play');
    return { switched: true };
  });
  await step('audio', async () => {
    addToPlaylist([{ path: '/tmp/pulse-test/tone.wav', name: 'tone.wav' }], false);
    await playAt(0);
    return { duration: +state.duration.toFixed(2), bpm: state.bpm, beats: (state.lastBeats || {}).beatTimes ? state.lastBeats.beatTimes.length : 0, playlist: state.playlist.length };
  });
  await step('single-engine', async () => {
    // v0.2.4: ONE track, ONE player. The tone is already playing from 'audio'.
    const dbg = () => window.__pulseAudio.debug();
    const res = { start: dbg() };
    if (res.start.audioContexts !== 1 || res.start.liveSources !== 1 || !res.start.playing) R.ok = false;
    // Play pressed again must NOT start a second source.
    play(); play(); play();
    await new Promise((r) => setTimeout(r, 300));
    res.afterTriplePlay = dbg();
    // Switch through every tab: still one source, position keeps advancing.
    const t0 = currentTime();
    for (const t of ['visualize', 'glitch', 'ascii', 'cut', 'cook', 'play']) { setTab(t); await new Promise((r) => setTimeout(r, 200)); }
    const t1 = currentTime();
    res.afterTabSwitch = dbg();
    res.positionAdvanced = +(t1 - t0).toFixed(2);
    // Pause from Play pauses everywhere; play resumes the same track.
    setTab('play');
    pause();
    await new Promise((r) => setTimeout(r, 200));
    res.afterPause = dbg();
    const pausedAt = currentTime();
    await new Promise((r) => setTimeout(r, 400));
    res.pausedStill = Math.abs(currentTime() - pausedAt) < 0.05;
    play();
    await new Promise((r) => setTimeout(r, 200));
    res.afterResume = dbg();
    // Seek from another tab: the position matches across tabs.
    setTab('cut');
    seekTo(3);
    await new Promise((r) => setTimeout(r, 200));
    res.seekPos = +currentTime().toFixed(2);
    setTab('visualize');
    await new Promise((r) => setTimeout(r, 300));
    res.seekPosOtherTab = +currentTime().toFixed(2);
    // Two overlapping loads: only the second track plays, one source.
    const p1 = loadAudioFile('/tmp/pulse-test/tone.wav', 'tone.wav');
    const p2 = loadAudioFile('/tmp/pulse-test/tone2.wav', 'tone2.wav');
    await Promise.all([p1, p2]);
    await new Promise((r) => setTimeout(r, 300));
    res.afterRace = dbg();
    res.raceTrack = state.trackName;
    if (res.afterTriplePlay.liveSources !== 1 || res.afterTabSwitch.liveSources !== 1
      || res.afterPause.liveSources !== 0 || res.afterResume.liveSources !== 1
      || !res.pausedStill || Math.abs(res.seekPos - 3) > 0.4
      || Math.abs(res.seekPosOtherTab - res.seekPos) > 0.6
      || res.afterRace.liveSources !== 1 || res.raceTrack !== 'tone2.wav') R.ok = false;
    // Back to tone.wav for the later steps.
    await loadAudioFile('/tmp/pulse-test/tone.wav', 'tone.wav');
    return res;
  });
  await step('audio-resume', async () => {
    // v0.2.5: the 0.2.4 bug — a suspended AudioContext made play() claim
    // to play (pause icon, playing=true) while the clock sat frozen at
    // 0:00 and nothing sounded. play() must recover a suspended context
    // instead of lying about it, and the clock must actually advance.
    const dbg = () => window.__pulseAudio.debug();
    const res = {};
    // (1) Normal play: the context is really running and time advances.
    await loadAudioFile('/tmp/pulse-test/tone.wav', 'tone.wav');
    await new Promise((r) => setTimeout(r, 400));
    res.contextState = dbg().contextState;
    res.playing = dbg().playing;
    const t0 = currentTime();
    await new Promise((r) => setTimeout(r, 500));
    res.positionAdvanced = +(currentTime() - t0).toFixed(2);
    // (2) Suspend the context mid-playback (Austin's Windows symptom:
    // pause icon, frozen clock, silence), then press play: it must
    // recover to running, flip back to playing, and advance the clock —
    // never sit on a frozen 0:00 claiming to play.
    await state.audioCtx.suspend();
    await new Promise((r) => setTimeout(r, 200));
    res.suspendedState = dbg().contextState;
    res.blockedWhileSuspended = dbg().playing === false && dbg().audioBlocked === true;
    await play();
    await new Promise((r) => setTimeout(r, 400));
    res.afterResume = dbg();
    const t1 = currentTime();
    await new Promise((r) => setTimeout(r, 500));
    res.resumedAdvance = +(currentTime() - t1).toFixed(2);
    if (res.contextState !== 'running' || !res.playing || res.positionAdvanced <= 0
      || res.suspendedState !== 'suspended' || !res.blockedWhileSuspended
      || res.afterResume.contextState !== 'running' || !res.afterResume.playing
      || res.resumedAdvance <= 0) R.ok = false;
    return res;
  });
  await step('fontfeatures', async () => {
    // Prove the Paper Mono features actually render — don't trust the CSS.
    // ss03 widens the space, ss01 (Duospace) re-widths narrow glyphs: both
    // change measured text width at 40px. Fractional widths via getBoundingClientRect.
    const mk = (features) => {
      const s = document.createElement('span');
      s.style.cssText = `position:absolute;left:-9999px;top:0;font-family:'Paper Mono',monospace;font-size:40px;font-weight:500;white-space:pre;font-feature-settings:${features};`;
      document.body.appendChild(s);
      return s;
    };
    const off = mk('normal');
    const on = mk('"ss01" 1, "cv01" 1, "zero" 1, "ss02" 1, "ss03" 1, "ss04" 1');
    const probe = (el, txt) => { el.textContent = txt; return el.getBoundingClientRect().width; };
    const res = {
      bodyFeatures: getComputedStyle(document.body).fontFeatureSettings,
      spaceOff: probe(off, 'a a a a a'), spaceOn: probe(on, 'a a a a a'),
      narrowOff: probe(off, 'iiiiiiiiii'), narrowOn: probe(on, 'iiiiiiiiii'),
      wideOff: probe(off, 'MMMMMMMMMM'), wideOn: probe(on, 'MMMMMMMMMM'),
    };
    off.remove(); on.remove();
    res.spaceDiff = +(res.spaceOn - res.spaceOff).toFixed(2);
    res.narrowDiff = +(res.narrowOn - res.narrowOff).toFixed(2);
    res.wideDiff = +(res.wideOn - res.wideOff).toFixed(2);
    res.featuresLive = Math.abs(res.spaceDiff) > 0.5 || Math.abs(res.narrowDiff) > 0.5 || Math.abs(res.wideDiff) > 0.5;
    if (!res.featuresLive) R.ok = false;
    return res;
  });
  await step('analysis', async () => {
    // Wait long enough for a bar or two to finalize (chord/key are per-bar).
    await new Promise((r) => setTimeout(r, 5500));
    const a = analysis;
    let codeLines = 0, programHasTempo = false, programLines = 0;
    if (a) {
      const lines = cgBuildLines(a, { source: 'tone.wav', song: { title: 'tone', artist: '', app: 'Pulse Suite' } }, performance.now() / 1000);
      const texts = {};
      for (const id of CG_LINE_IDS) texts[id] = (lines[id] || []).map((p) => p.text).join('');
      const program = cgStrudelProgram(texts, { title: 'tone' });
      codeLines = Object.keys(lines).length;
      programHasTempo = program.includes('setcpm('); // not the '// setcpm(?)' comment
      programLines = program.split('\n').length;
    }
    return {
      onsets: a ? a.onsets.length : -1,
      bpmLocked: a ? a.bpmLocked : false, bpm: a ? a.bpm : 0,
      chord: a && a.chord ? a.chord.name : null,
      key: a && a.key ? TA_NOTES[a.key.root] + ':' + a.key.mode : null,
      bassNote: a ? a.bassNote : null,
      codeLines, programHasTempo, programLines,
    };
  });
  await step('port-ui', async () => {
    return {
      heroButton: !!$('btn-sysaudio'),
      livePillHidden: $('sysaudio-live').hidden,
      sysEmptyVisible: $('sysaudio-empty').style.display !== 'none',
      codePanel: !!$('code-panel'),
      patternLook: !!document.querySelector('#lookbar .look-chip[data-look="pattern"]'),
      geometricLook: !!document.querySelector('#lookbar .look-chip[data-look="geometric"]'),
      ditherLook: !!document.querySelector('#lookbar .look-chip[data-look="dither"]'),
      layersPanel: !!$('layers-panel'),
      paletteDialog: !!$('palette-dialog'),
      exportPill: !!$('btn-viz-export'),
      cookSteps: document.querySelectorAll('.cook-step').length,
      asciiFilters: [...$('ascii-filter').querySelectorAll('option')].map((o) => o.value),
      analysisLoaded: typeof createAnalysis === 'function',
      codegenLoaded: typeof cgBuildLines === 'function',
      mousikiBandsLoaded: typeof mousikiBands === 'function',
      asciiLibLoaded: typeof ditherFrame === 'function' && typeof ASCII_RECIPES !== 'undefined',
      depthLoaded: typeof depthEstimateFromCanvas === 'function',
      missionInPlay: !!$('play-mc'),
      depthLook: !!document.querySelector('#lookbar .look-chip[data-look="depth"]'),
      popoutButtons: !!($('btn-code-popout') && $('btn-hex-popout')),
      // v0.2.3: Toaster scenes + TUI status bar + scene line.
      toasterScenes: ['ascii', 'mesh', 'glitch'].map((s) => !!document.querySelector(`#lookbar .look-chip[data-look="${s}"]`)),
      sceneChips: document.querySelectorAll('#lookbar .look-chip').length,
      statusBar: !!$('viz-status'),
      sceneLineFn: typeof sceneLine === 'function',
      asciiSceneOpts: !!$('ascii-scene-style'),
      meshSceneOpts: !!$('mesh-scene-palette'),
    };
  });
  await step('layout', async () => {
    // v0.2.4: layout-overflow guard at the default 1360 px window — the
    // tab bar / transport / Toaster bar rows must end inside the viewport,
    // and the SCENES menu holds all 50 chips (hidden until opened).
    setTab('visualize');
    await new Promise((r) => setTimeout(r, 300));
    // Measure after fonts load: Paper Mono is wider than the fallback
    // monospace, and the early (pre-font) widths under-report the real
    // row widths by ~30–50 px. Also measure with a look-options row open
    // (ASCII scene), the same state the screenshots capture.
    try { await document.fonts.ready; } catch (_) {}
    setLook('ascii');
    await new Promise((r) => setTimeout(r, 200));
    const probe = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { w: Math.round(el.offsetWidth), sw: Math.round(el.scrollWidth), right: Math.round(r.right), left: Math.round(r.left) };
    };
    const res = {
      innerWidth: window.innerWidth, innerHeight: window.innerHeight,
      docScrollW: document.documentElement.scrollWidth,
      tabbar: probe('#tabbar'), tabs: probe('#tabs'), tabActions: probe('.tab-actions'),
      transport: probe('#transport'), vizBar: probe('#viz-status'),
      scenesMenuHidden: $('lookbar').hidden,
      sceneChips: document.querySelectorAll('#lookbar .look-chip').length,
      codePanel: probe('#code-panel'),
    };
    res.tabbarFits = res.tabbar.right <= res.innerWidth;
    res.transportFits = res.transport.right <= res.innerWidth;
    res.vizBarFits = res.vizBar.right <= res.innerWidth;
    // Every bar button must be fully inside the bar (no clipping by the
    // bar's overflow: hidden) — a wrapped or cut-off button fails.
    const barRect = $('viz-status').getBoundingClientRect();
    res.vizBarButtons = [...document.querySelectorAll('#viz-status .paper-btn')].map((b) => {
      const r = b.getBoundingClientRect();
      return { id: b.id, inside: r.bottom <= barRect.bottom + 1 && r.right <= barRect.right + 1 && r.top >= barRect.top - 1 };
    });
    res.vizBarAllInside = res.vizBarButtons.every((b) => b.inside);
    res.vizBarH = Math.round(barRect.height);
    if (!res.tabbarFits || !res.transportFits || !res.vizBarFits || !res.scenesMenuHidden || res.sceneChips !== 50 || !res.vizBarAllInside) R.ok = false;
    return res;
  });
  await step('theme', async () => {
    // v0.2.4: the theme picker is global — it must recolor every tab,
    // from any tab, and persist in pulse-config.json.
    const bg = () => getComputedStyle(document.body).backgroundColor;
    const res = {};
    // Establish the baseline explicitly — the launch theme is whatever was
    // persisted by the last run, so never assume it starts in Sky.
    applyTheme('sky');
    await new Promise((r) => setTimeout(r, 200));
    res.skyBg = bg();
    applyTheme('sunset');
    await new Promise((r) => setTimeout(r, 200));
    res.sunsetBg = bg();
    res.sunsetBar = getComputedStyle($('tabbar')).backgroundColor;
    const perTab = {};
    for (const t of ['play', 'glitch', 'ascii', 'cut', 'cook']) {
      setTab(t);
      await new Promise((r) => setTimeout(r, 120));
      perTab[t] = bg();
    }
    res.sunsetPerTab = perTab;
    // Change the theme FROM a non-Visualize tab — it must apply everywhere,
    // including back in Visualize.
    setTab('cut');
    applyTheme('mono');
    await new Promise((r) => setTimeout(r, 200));
    res.monoBg = bg();
    setTab('visualize');
    await new Promise((r) => setTimeout(r, 120));
    res.monoInViz = bg();
    const cfg = await window.pulse.getConfig();
    res.persistedTheme = cfg && cfg.theme;
    applyTheme('sky');
    await new Promise((r) => setTimeout(r, 150));
    res.restoredSky = bg();
    const allSunset = Object.values(perTab).every((b) => b === res.sunsetBg);
    if (res.sunsetBg === res.skyBg || !allSunset || res.monoBg === res.sunsetBg
      || res.monoInViz !== res.monoBg || res.persistedTheme !== 'mono' || res.restoredSky !== res.skyBg) R.ok = false;
    setTab('play');
    return res;
  });
  await step('panes-scroll', async () => {
    // v0.2.4: every left-side panel must scroll — visible scrollbar, wheel
    // and drag both work (wheel = native scroll, drag = native scrollbar).
    const panes = [
      ['play', 'library-pane'], ['play', 'playlist-pane'],
      ['glitch', 'glitch-left'], ['ascii', 'ascii-controls'],
      ['cut', 'cut-controls'], ['cook', 'cook-controls'], ['play', 'mc-rail'], ['play', 'mc-main']
    ];
    const res = {};
    for (const [tab, id] of panes) {
      setTab(tab);
      await new Promise((r) => setTimeout(r, 150));
      const el = $(id);
      const probe = document.createElement('div');
      // flex:0 0 auto + min-height: an empty div in a flex column would
      // otherwise shrink to nothing (min-height: auto = 0 with no content).
      probe.style.cssText = 'height:3000px;width:10px;flex:0 0 auto;min-height:3000px;';
      el.appendChild(probe);
      const overflowY = getComputedStyle(el).overflowY;
      const canScroll = el.scrollHeight > el.clientHeight;
      el.scrollTop = el.scrollHeight;
      const scrolled = el.scrollTop > 0;
      const sbWidth = getComputedStyle(el).scrollbarWidth;
      probe.remove();
      el.scrollTop = 0;
      res[id] = { overflowY, canScroll, scrolled, scrollbarWidth: sbWidth };
      // v0.2.6: a pane fails only if it cannot scroll (wrong overflow) or
      // if it can scroll but scrolling does not work. A content-height
      // pane (the MC strip in Play — the tab scrolls instead) legitimately
      // reports canScroll false even with the probe, because its grid row
      // grows with the probe; overflow-y: auto is the property that
      // matters there.
      if ((overflowY !== 'auto' && overflowY !== 'scroll') || (canScroll && !scrolled)) R.ok = false;
    }
    setTab('play');
    return res;
  });
  await step('text-overflow', async () => {
    // v0.2.4: no clipped or overlapping text at the 1360 px default window.
    // Scan every tab's panel for elements whose text spills past their box.
    // Intentional ellipsis (text-overflow: ellipsis) is clean truncation,
    // not an overflow — skip it.
    const res = { offenders: [] };
    const SKIP = new Set(['CANVAS', 'VIDEO', 'SVG', 'IMG', 'INPUT', 'SELECT', 'PROGRESS']);
    for (const t of ['play', 'visualize', 'glitch', 'ascii', 'cut', 'cook']) {
      setTab(t);
      await new Promise((r) => setTimeout(r, 150));
      const panel = $('tab-' + t);
      for (const el of panel.querySelectorAll('*')) {
        if (SKIP.has(el.tagName)) continue;
        const cs = getComputedStyle(el);
        if (cs.textOverflow === 'ellipsis') continue;
        if (cs.overflowX !== 'hidden' && cs.overflowX !== 'clip') continue;
        if (el.scrollWidth > el.clientWidth + 2) {
          let widest = null, widestW = 0;
          for (const ch of el.children) {
            const w = ch.scrollWidth || ch.offsetWidth;
            if (w > widestW) { widestW = w; widest = ch; }
          }
          res.offenders.push(`${t} :: ${el.tagName.toLowerCase()}#${el.id || ''} "${(el.textContent || '').trim().slice(0, 40)}" ${el.clientWidth}→${el.scrollWidth}${widest ? ` — widest child ${widest.tagName.toLowerCase()}.${String(widest.className).split(' ')[0]}#${widest.id || ''} ${widestW}px` : ''}`);
        }
      }
    }
    res.docScrollW = document.documentElement.scrollWidth;
    res.innerW = window.innerWidth;
    if (res.offenders.length || res.docScrollW > res.innerW + 1) R.ok = false;
    setTab('play');
    return res;
  });
  await step('play-fits', async () => {
    // v0.2.6: Play tab scrolls INSIDE itself (Mission Control lives below
    // the player) — the document never scrolls, the player panels keep
    // their 320 px height, and the status bar sticks to the bottom.
    setTab('play');
    await new Promise((r) => setTimeout(r, 300));
    const tab = $('tab-play');
    const res = {
      innerW: window.innerWidth, innerH: window.innerHeight,
      docScrollH: document.documentElement.scrollHeight,
      docScrollW: document.documentElement.scrollWidth,
      tabScrolls: tab.scrollHeight > tab.clientHeight,
      panelsH: Math.round($('play-panels').getBoundingClientRect().height),
      statusVisible: !!$('play-status') && $('play-status').getBoundingClientRect().bottom <= window.innerHeight + 1,
      mcInPlay: !!$('play-mc') && $('play-mc').closest('#tab-play') != null,
      mcHead: !!$('btn-mc-collapse'),
      libraryPresent: !!$('library-list'),
      playSeek: !!$('play-seek'),
      playFilter: !!$('play-filter'),
    };
    res.pageFits = res.docScrollH <= res.innerH + 1 && res.docScrollW <= res.innerW + 1;
    if (!res.pageFits || !res.statusVisible || res.panelsH < 300 || !res.mcInPlay || !res.mcHead) R.ok = false;
    return res;
  });
  await step('cook-top', async () => {
    // v0.2.4: START COOKING is at the top of the Cook tab, big and obvious.
    setTab('cook');
    await new Promise((r) => setTimeout(r, 200));
    const hero = $('cook-hero');
    const btn = $('btn-cook-start');
    const r = hero.getBoundingClientRect();
    const res = {
      heroTop: Math.round(r.top),
      heroVisible: r.top >= 0 && r.top < 220,
      startBtnText: btn.textContent.trim(),
      startBtnH: Math.round(btn.getBoundingClientRect().height),
      flowText: ($('cook-hero').textContent || '').includes('START COOKING'),
      inExportStep: !!document.querySelector('[data-step="export"] #btn-cook-start'),
    };
    if (!res.heroVisible || res.startBtnH < 40 || !res.flowText || res.inExportStep) R.ok = false;
    setTab('play');
    return res;
  });
  await step('pipeline', async () => {
    // v0.2.4: the tabs are a left-to-right pipeline off one shared track.
    const order = [...document.querySelectorAll('#tabs .paper-tab')].map((b) => b.dataset.tab);
    const res = { tabOrder: order, pipelineOk: JSON.stringify(order.slice(0, 6)) === JSON.stringify(['play', 'visualize', 'glitch', 'ascii', 'cut', 'cook']) };
    await playAt(0);
    const track = state.trackName;
    const positions = {};
    for (const t of ['play', 'visualize', 'glitch', 'ascii', 'cut', 'cook']) {
      setTab(t);
      await new Promise((r) => setTimeout(r, 250));
      positions[t] = { track: state.trackName, pos: +currentTime().toFixed(1), playing: state.playing, live: window.__pulseAudio.debug().liveSources };
    }
    res.track = track;
    res.positions = positions;
    const sameTrack = Object.values(positions).every((p) => p.track === track);
    const oneSource = Object.values(positions).every((p) => p.live === 1);
    const advancing = positions.cook.pos > positions.play.pos;
    if (!res.pipelineOk || !sameTrack || !oneSource || !advancing) R.ok = false;
    setTab('play');
    return res;
  });
  await step('layers', async () => {
    // Layer stack: add a mesh backdrop + scanlines, switch to the new looks,
    // let the render loop draw a few frames, verify nothing throws.
    addLayer('mesh');
    addLayer('scanlines');
    applyLayerPreset('neon-grid');
    const presetCount = layers.stack.length;
    setTab('visualize');
    setLook('geometric');
    $('geo-preset').value = 'circles';
    $('geo-preset').dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 700));
    setLook('dither');
    $('dither-field').value = 'spiral';
    $('dither-field').dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 700));
    // Command palette opens, filters, closes. (Native <dialog> opens
    // synchronously — a tick is still cheap insurance.)
    openPalette();
    await new Promise((r) => setTimeout(r, 300));
    const paletteOpen = $('palette-dialog').open;
    $('palette-input').value = 'orbit';
    $('palette-input').dispatchEvent(new Event('input'));
    const filtered = paletteFiltered.length;
    $('palette-dialog').close();
    // Presentation mode toggles on and off.
    togglePresent();
    const presentingOn = state.presenting;
    togglePresent();
    return { presetCount, look: state.look, geoShape: state.geoShape, ditherField: state.ditherField, paletteOpen, filtered, presentingOn, presentingOff: !state.presenting, errors: window.__errors.length };
  });
  await step('toaster-scenes', async () => {
    // v0.2.3: the three Toaster scenes render without errors, the live code
    // panel carries a `scene:` line, and its audio-reactive numbers move
    // while the tone plays (two samples 1.2 s apart must differ).
    setTab('visualize');
    await playAt(0);
    await new Promise((r) => setTimeout(r, 1500));
    const sceneLineText = () => {
      const pre = $('code-lines');
      return (pre.dataset.plain || pre.textContent || '');
    };
    const res = { scenes: {}, sceneLines: {} };
    for (const s of ['ascii', 'mesh', 'glitch']) {
      setLook(s);
      await new Promise((r) => setTimeout(r, 700));
      res.scenes[s] = state.look === s;
      res.sceneLines[s] = sceneLineText().includes('scene:');
    }
    // Numbers breathe: sample the scene line twice while audio plays.
    setLook('ascii');
    const first = sceneLineText().split('\n').find((l) => l.startsWith('scene:')) || '';
    await new Promise((r) => setTimeout(r, 1200));
    const second = sceneLineText().split('\n').find((l) => l.startsWith('scene:')) || '';
    res.sceneMoves = first !== '' && second !== '' && first !== second;
    res.first = first; res.second = second;
    res.statusBar = !$('viz-status').hidden;
    res.statusScene = 'SCENE ' + ((SCENES[state.look] || {}).label || state.look).toUpperCase();
    res.highlighted = document.querySelectorAll('#code-lines .tok-scene').length > 0;
    res.errors = window.__errors.length;
    // Back to a PULSE scene so later steps see the default state.
    setLook('studio');
    return res;
  });
  await step('glitch', async () => {
    await openGlitchFile('/tmp/pulse-test/gradient.png');
    const before = await window.pulse.glitchRead(glitch.tempPath, 100, 64);
    glitch.selStart = 100; glitch.selEnd = 500;
    await applyCorruption(false);
    const after = await window.pulse.glitchRead(glitch.tempPath, 100, 64);
    let diff = 0;
    for (let i = 0; i < 64; i++) if (before.bytes[i] !== after.bytes[i]) diff++;
    return { changedBytesInRange: diff, format: glitch.format.type, history: glitch.history.length, previewKind: glitch.previewKind };
  });
  await step('ascii', async () => {
    asciiVideo.srcObject = null;
    asciiVideo.src = window.pulse.fileUrl('/tmp/pulse-test/clip1.mp4');
    await asciiVideo.play().catch(() => {});
    ascii.running = true; setTab('ascii');
    await new Promise((r) => setTimeout(r, 1500));
    const d = asciiCtx.getImageData(0, 0, asciiCanvas.width, asciiCanvas.height).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 400) if (d[i] + d[i + 1] + d[i + 2] > 30) lit++;
    ascii.running = false;
    return { canvasW: asciiCanvas.width, canvasH: asciiCanvas.height, litSamples: lit };
  });
  await step('ascii-library', async () => {
    asciiVideo.srcObject = null;
    asciiVideo.src = window.pulse.fileUrl('/tmp/pulse-test/clip1.mp4');
    await asciiVideo.play().catch(() => {});
    ascii.running = true; setTab('ascii');
    const sample = async () => {
      await new Promise((r) => setTimeout(r, 900));
      const d = asciiCtx.getImageData(0, 0, asciiCanvas.width, asciiCanvas.height).data;
      let lit = 0;
      for (let i = 0; i < d.length; i += 400) if (d[i] + d[i + 1] + d[i + 2] > 30) lit++;
      return { w: asciiCanvas.width, h: asciiCanvas.height, lit };
    };
    // Dither style: Floyd–Steinberg + Game Boy palette + scanlines post-FX.
    $('ascii-filter').value = 'dither';
    $('ascii-dither-algo').value = 'floyd-steinberg';
    $('ascii-palette').value = 'gameboy';
    document.querySelector('.ascii-fx[data-fx="scanlines"]').checked = true;
    const dither = await sample();
    // A recipe: Neon Voxel (style + palette + post-FX in one click).
    applyAsciiRecipe(ASCII_RECIPES.find((r) => r.name === 'Neon Voxel'));
    const voxel = await sample();
    document.querySelector('.ascii-fx[data-fx="scanlines"]').checked = false;
    // True re-render still at 2x.
    const still = await exportAsciiStill(2, '/tmp/pulse-test/ascii-2x.png');
    const stillBytes = still ? await window.pulse.readFile(still) : null;
    const stillPng = !!stillBytes && stillBytes[0] === 0x89 && stillBytes[1] === 0x50;
    // Animated GIF loop, 6 frames (fast in smoke; the UI captures 24).
    const gif = await exportAsciiGif(6, 100, '/tmp/pulse-test/ascii-loop.gif');
    const gifBytes = gif ? await window.pulse.readFile(gif) : null;
    const gifOk = !!gifBytes && gifBytes[0] === 0x47 && gifBytes[1] === 0x49 && gifBytes[2] === 0x46;
    ascii.running = false;
    return { dither, voxel, stillBytes: stillBytes ? stillBytes.length : 0, stillPng, gifBytes: gifBytes ? gifBytes.length : 0, gifOk, recipes: ASCII_RECIPES.length, libraryStyles: Object.keys(ASCII_LIBRARY_RENDERERS).length };
  });
  await step('cut', async () => {
    const files = await window.pulse.listDir('/tmp/pulse-test/clips');
    cut.clips = files.filter((f) => VIDEO_EXT.test(f.name));
    cut.trackPath = '/tmp/pulse-test/tone.wav'; cut.trackName = 'tone.wav';
    const det = state.lastBeats || { bpm: 0, beatTimes: [] };
    cut.bpm = det.bpm; cut.beatTimes = det.beatTimes; cut.duration = state.duration;
    generateCut();
    return { clips: cut.clips.length, beats: cut.beatTimes.length, segments: cut.sequence.length };
  });
  await step('cook', async () => {
    await loadCookImage('/tmp/pulse-test/gradient.png');
    await playAt(0); // tone.wav again — 8 s of tremolo to cook on
    // v0.2.4: NO manual cook.songPath — the shared track from Play must
    // BE the cook song. If this step's song state isn't tone.wav, the
    // wiring is broken.
    // New recipe effects from the five-sites pass: gradient map, geometric
    // shapes, mesh tint — on top of the default displacement/warp/sort.
    // Plus the ASCII style pass (dither) from the style library.
    $('cook-fx-gradmap').checked = true;
    $('cook-fx-geo').checked = true;
    $('cook-fx-mesh').checked = true;
    $('cook-fx-wave').checked = true;
    $('cook-fx-chroma').checked = true;
    $('cook-fx-posterize').checked = true;
    $('cook-style').value = 'dither';
    updateCookButtons();
    setTab('cook');
    startCook();
    await new Promise((r) => setTimeout(r, 2500));
    // How cooked is it? Sample pixels: work vs source must differ.
    const wimg = cook.workCtx.getImageData(0, 0, cook.W, cook.H).data;
    const simg = cook.srcCtx.getImageData(0, 0, cook.W, cook.H).data;
    let diff = 0, sampled = 0;
    for (let i = 0; i < wimg.length; i += 160) {
      sampled++;
      if (Math.abs(wimg[i] - simg[i]) > 4 || Math.abs(wimg[i + 1] - simg[i + 1]) > 4 || Math.abs(wimg[i + 2] - simg[i + 2]) > 4) diff++;
    }
    const progress = $('cook-progress').value;
    const stepStates = {
      photo: $('cook-step-photo').textContent,
      song: $('cook-step-song').textContent,
      recipe: $('cook-step-recipe').textContent,
      export: $('cook-step-export').textContent,
    };
    const out = await exportCookJpeg('/tmp/pulse-test/cooked-test.jpg', '-cooked');
    const bytes = out ? await window.pulse.readFile(out) : null;
    const isJpeg = !!bytes && bytes[0] === 0xFF && bytes[1] === 0xD8;
    const wasActive = cook.active;
    stopCook();
    // v0.2.6: after stopping, the live effects relax — work must equal the
    // cumulative base exactly (warp/displacement no longer pegged in).
    const bimg = cook.baseCtx.getImageData(0, 0, cook.W, cook.H).data;
    const wimg2 = cook.workCtx.getImageData(0, 0, cook.W, cook.H).data;
    let relaxedDiff = 0;
    for (let i = 0; i < wimg2.length; i += 160) {
      if (Math.abs(wimg2[i] - bimg[i]) > 0 || Math.abs(wimg2[i + 1] - bimg[i + 1]) > 0 || Math.abs(wimg2[i + 2] - bimg[i + 2]) > 0) relaxedDiff++;
    }
    if (stepStates.song !== 'tone.wav' || !wasActive || relaxedDiff > 0) R.ok = false;
    return { image: cook.imageName, size: `${cook.W}x${cook.H}`, wasActive, diffSamples: diff, sampled, progress: +progress.toFixed(2), cookLevel: Math.round(cook.cookLevel), jpegPath: out, jpegBytes: bytes ? bytes.length : 0, isJpeg, stepStates, relaxedDiff };
  });
  await step('depth', async () => {
    // Models are pre-seeded in userData by the build harness; estimate from
    // the cook photo (gradient.png, loaded by the cook step).
    const status = await depthRefreshStatus();
    const map = await depthEstimateFromCanvas(cook.src, 'fastdepth');
    let mean = 0, mn = 1, mx = 0;
    if (map) { for (let i = 0; i < map.length; i++) { mean += map[i]; if (map[i] < mn) mn = map[i]; if (map[i] > mx) mx = map[i]; } mean /= map.length; }
    buildDepthMasks();
    const grid = depthMapForGrid(110, 40);
    const modelOk = !!map && depth.source === 'fastdepth';
    // Heuristic fallback path (offline) still produces a usable map.
    const heur = depthHeuristicFromData(cook.srcCtx.getImageData(0, 0, cook.W, cook.H).data, cook.W, cook.H);
    const heurOk = !!heur && heur.length === cook.W * cook.H && depth.source === 'heuristic';
    // Restore the model map for the Depth look + Mission Control.
    await depthEstimateFromCanvas(cook.src, 'fastdepth');
    buildDepthMasks();
    if (!modelOk && !heurOk) R.ok = false;
    return {
      status, model: depth.source, w: depth.depthW, h: depth.depthH, ms: depth.lastMs,
      mean: +mean.toFixed(3), min: +mn.toFixed(3), max: +mx.toFixed(3),
      grid: grid ? grid.length : 0, masks: !!(cook.nearMask && cook.farMask), modelOk, heurOk, error: depth.error
    };
  });
  await step('play-mc', async () => {
    // v0.2.6: Mission Control lives in the Play tab now — same assertions,
    // viewed in Play (scrolled to the MC strip).
    setTab('play');
    await playAt(0); // restart the tone so onsets flow onto the map
    $('play-mc').scrollIntoView();
    await new Promise((r) => setTimeout(r, 2500));
    const blips = mc.blips.length;
    const xray = $('xray-detect').textContent;
    const tiles = document.querySelectorAll('#mc-tiles .mc-tile').length;
    const hexRows = document.querySelectorAll('#mc-hex .hex-row').length;
    const mcCode = $('mc-code').textContent;
    setTab('play');
    return { blips, xray, tiles, hexRows, mapW: mcMap.width, mcCodeLen: mcCode.length, mcCodeLive: mcCode.includes('setcpm') || mcCode.includes('s(') };
  });
  await step('analysis-hires', async () => {
    // v0.2.6: hi-res analysis — 32/64 bands, centroid/flux/RMS, chroma,
    // beat phase, instrument heuristics, offline sections/loudness/chroma.
    const res = {
      bands32: analysis ? analysis.bands32.length : 0,
      bands64: analysis ? analysis.bands64.length : 0,
      centroid: analysis ? +analysis.centroid.toFixed(0) : 0,
      flux: analysis ? +analysis.flux.toFixed(3) : 0,
      rms: analysis ? +analysis.rms.toFixed(3) : 0,
      beatPhase: analysis ? analysis.beatPhase : -1,
      instruments: analysis ? Object.keys(analysis.instruments) : [],
      offlineSections: (state.lastBeats && state.lastBeats.sections) ? state.lastBeats.sections.length : -1,
      offlineLoudness: (state.lastBeats && state.lastBeats.loudness) ? state.lastBeats.loudness.length : -1,
      offlineChroma: (state.lastBeats && state.lastBeats.chromaTimeline) ? state.lastBeats.chromaTimeline.length : -1,
      bpm: analysis ? analysis.bpm : 0,
    };
    if (res.bands32 !== 32 || res.bands64 !== 64 || res.instruments.length !== 5
      || res.offlineSections < 0 || res.offlineLoudness < 0 || res.offlineChroma < 0) R.ok = false;
    return res;
  });
  await step('scenes-026', async () => {
    // v0.2.6: 50 scenes total — the 37 new ones render without errors.
    setTab('visualize');
    await playAt(0);
    await new Promise((r) => setTimeout(r, 1200));
    const res = { sceneCount: Object.keys(SCENES).length, chips: document.querySelectorAll('#lookbar .look-chip').length, tried: {} };
    const f0 = state.frameCount;
    for (const id of ['lab-flow', 'gather-particles', 'synkit-chroma', 'geo-hex', 'grad-bands', 'starfield']) {
      setLook(id);
      await new Promise((r) => setTimeout(r, 400));
      res.tried[id] = state.look === id;
    }
    res.framesAdvanced = state.frameCount - f0;
    res.errors = window.__errors.length;
    setLook('studio');
    if (res.sceneCount !== 50 || res.chips !== 50 || res.framesAdvanced <= 0 || Object.values(res.tried).some((v) => !v)) R.ok = false;
    return res;
  });
  await step('layout-persist', async () => {
    // v0.2.6: drag order / hide / resize persist in pulse-config.json and
    // survive a re-read; reset restores the built-in layout.
    setTab('play');
    const lib = $('library-pane');
    lib.style.order = '2';
    window.PulseLayout.hidePanel($('lyrics-pane'));
    window.PulseLayout.persist();
    await new Promise((r) => setTimeout(r, 300));
    const cfg = await window.pulse.getConfig();
    const saved = cfg && cfg.layout;
    const res = {
      savedOrder: saved && saved.panels && saved.panels['library-pane'] && saved.panels['library-pane'].order,
      savedHidden: saved && saved.panels && saved.panels['lyrics-pane'] && saved.panels['lyrics-pane'].hidden,
      hiddenNow: $('lyrics-pane').classList.contains('layout-hidden'),
    };
    window.PulseLayout.resetLayout();
    res.afterResetHidden = $('lyrics-pane').classList.contains('layout-hidden');
    res.afterResetOrder = $('library-pane').style.order;
    if (res.savedOrder !== 2 || res.savedHidden !== true || !res.hiddenNow || res.afterResetHidden || res.afterResetOrder) R.ok = false;
    return res;
  });
  await step('drag-pointer', async () => {
    // v0.2.7 items 1+4: a pointer drag through the same window-level
    // listeners the real mouse uses must move the panel AND its resize
    // grip together (the 0.2.6 bug), and must be able to cross containers.
    // Synthetic PointerEvents work here because setPointerCapture is
    // best-effort (try/catch) — a real mouse was verified separately
    // with the CDP repro (/tmp/pulse-drag-repro.js).
    setTab('play');
    window.PulseLayout.resetLayout();
    await new Promise((r) => setTimeout(r, 200));
    const rect = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
    const pe = (type, x, y, target) => target.dispatchEvent(new PointerEvent(type, { pointerId: 7, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: true }));
    const drag = async (grip, from, to) => {
      pe('pointerdown', from.x, from.y, grip);
      const steps = 12;
      for (let i = 1; i <= steps; i++) {
        pe('pointermove', from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps, window);
        await new Promise((r) => setTimeout(r, 16));
      }
      pe('pointerup', to.x, to.y, window);
      await new Promise((r) => setTimeout(r, 120));
    };
    // (a) Docked reorder: library-pane one slot to the right.
    const lib = $('library-pane');
    const lg = rect(lib.querySelector('.drag-grip'));
    const before = { panel: rect(lib), grip: rect(lib.querySelector('.resize-grip')) };
    await drag(lib.querySelector('.drag-grip'), { x: lg.x + lg.w / 2, y: lg.y + lg.h / 2 }, { x: lg.x + lg.w / 2 + 422, y: lg.y + lg.h / 2 });
    const after = { panel: rect(lib), grip: rect(lib.querySelector('.resize-grip')) };
    const res = {
      libPanelDx: after.panel.x - before.panel.x, libGripDx: after.grip.x - before.grip.x,
      libPanelDy: after.panel.y - before.panel.y, libGripDy: after.grip.y - before.grip.y,
    };
    res.gripFollows = Math.abs(res.libPanelDx - res.libGripDx) <= 2 && Math.abs(res.libPanelDy - res.libGripDy) <= 2;
    // (b) Cross-container: the live map out of Mission Control to the
    // top of the Play tab. Scroll the GRIP into view (block:'center'):
    // scrollIntoView on the panel with block:'end' hides the grip above
    // the viewport when the panel is taller than the viewport — the
    // smoke run's grip sat at y=-38, so the drag ran DOWN through the
    // parent's box and never detached. Centring the grip puts it
    // mid-screen whatever the window height is.
    const mcEl = $('mc-main');
    mcEl.querySelector('.drag-grip').scrollIntoView({ block: 'center' });
    await new Promise((r) => setTimeout(r, 200));
    const pmcR = document.querySelector('#play-mc').getBoundingClientRect();
    const mg = rect(mcEl.querySelector('.drag-grip'));
    const mcBefore = { parent: mcEl.parentElement.id, free: mcEl.dataset.free || null, pmcTop: Math.round(pmcR.top), pmcBottom: Math.round(pmcR.bottom), scrollTop: document.querySelector('#tab-play').scrollTop, gripY: mg.y };
    // Trace the drag move-by-move (a smoke-only diagnostic: the
    // standalone CDP repro passes, so if this fails the trace shows
    // whether the drag never started, never detached, or re-docked).
    const trace = [];
    const gripEl = mcEl.querySelector('.drag-grip');
    const fromB = { x: mg.x + mg.w / 2, y: mg.y + mg.h / 2 }, toB = { x: mg.x + 10, y: 70 };
    pe('pointerdown', fromB.x, fromB.y, gripEl);
    trace.push('down dragging=' + mcEl.classList.contains('layout-dragging'));
    for (let i = 1; i <= 12; i++) {
      pe('pointermove', fromB.x + (toB.x - fromB.x) * i / 12, fromB.y + (toB.y - fromB.y) * i / 12, window);
      await new Promise((r) => setTimeout(r, 16));
      trace.push('move' + i + ' y=' + Math.round(fromB.y + (toB.y - fromB.y) * i / 12) + ' free=' + (mcEl.dataset.free || null) + ' parent=' + mcEl.parentElement.id);
    }
    pe('pointerup', toB.x, toB.y, window);
    await new Promise((r) => setTimeout(r, 120));
    const gripAfter = rect(mcEl.querySelector('.resize-grip')), panelAfter = rect(mcEl);
    const mcAfter = {
      parent: mcEl.parentElement.id, free: mcEl.dataset.free || null,
      gripInPanel: gripAfter.x >= panelAfter.x - 2 && gripAfter.y >= panelAfter.y - 2
        && gripAfter.x + gripAfter.w <= panelAfter.x + panelAfter.w + 2
        && gripAfter.y + gripAfter.h <= panelAfter.y + panelAfter.h + 2,
      heightSane: panelAfter.h > 100,
    };
    res.mcBefore = mcBefore; res.mcAfter = mcAfter; res.trace = trace;
    res.crossContainer = mcAfter.parent !== 'play-mc' || mcAfter.free === '1';
    window.PulseLayout.resetLayout();
    if (!res.gripFollows || !res.crossContainer || !mcAfter.gripInPanel || !mcAfter.heightSane) R.ok = false;
    return res;
  });
  await step('studio-swap', async () => {
    // v0.2.7 item 2: swap a Studio quadrant for another visualizer —
    // the choice persists in pulse-config.json, and right-clicking a
    // quadrant opens the swap menu.
    setTab('visualize');
    setLook('studio');
    await new Promise((r) => setTimeout(r, 400));
    const before = [...state.studioSlots];
    const res = { slotsBefore: before, rectsDrawn: state.studioRects.length };
    state.studioSlots[0] = 'plasma';
    persistStudioSlots();
    await new Promise((r) => setTimeout(r, 300));
    const cfg = await window.pulse.getConfig();
    res.persisted = cfg && cfg.studioSlots;
    // Right-click the first quadrant: the swap menu must open with the
    // scene list; picking one swaps the slot.
    const r0 = state.studioRects[0];
    if (r0) {
      const cr = canvas.getBoundingClientRect();
      const cx = cr.left + ((r0.x + r0.w / 2) * cr.width) / canvas.width;
      const cy = cr.top + ((r0.y + r0.h / 2) * cr.height) / canvas.height;
      canvas.dispatchEvent(new MouseEvent('contextmenu', { clientX: cx, clientY: cy, bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 150));
      res.menuVisible = !$('module-menu').hidden;
      res.menuListsScenes = $('module-menu').textContent.includes('Kaleidoscope');
      const btn = [...document.querySelectorAll('#module-menu .paper-menu-item')].find((b) => b.textContent.includes('Kaleidoscope'));
      if (btn) btn.click();
      await new Promise((r) => setTimeout(r, 150));
      res.slotAfterMenuPick = state.studioSlots[0];
    }
    state.studioSlots = before;
    persistStudioSlots();
    if (!res.persisted || res.persisted[0] !== 'plasma' || !res.menuVisible || !res.menuListsScenes || res.slotAfterMenuPick !== 'kaleido') R.ok = false;
    return res;
  });
  await step('spectrum-theme', async () => {
    // v0.2.7 item 5: Mousiki-style themes for the spectrum analyzer.
    // Picking a theme applies its whole bundle (style + colours +
    // fluidity / fall / viscosity) and persists per visualizer; the
    // ASCII theme must actually DRAW in its solid colour, and tweaking
    // a slider after picking a preset marks the theme Custom.
    setTab('play');
    await loadAudioFile('/tmp/pulse-test/tone.wav', 'tone.wav'); // auto-plays
    await new Promise((r) => setTimeout(r, 1200));
    const res = {};
    // Play spectrum → ASCII: the bundle applies, and it persists.
    setModuleParam('spectrum', 'theme', 'ascii');
    const v = moduleVals('spectrum');
    res.theme = v.theme; res.fluidity = v.fluidity; res.degradation = v.degradation;
    res.colorLeft = v.colorLeft;
    await new Promise((r) => setTimeout(r, 400));
    const cfg = await window.pulse.getConfig();
    res.persistedTheme = cfg && cfg.modules && cfg.modules.spectrum && cfg.modules.spectrum.theme;
    res.persistedFluidity = cfg && cfg.modules && cfg.modules.spectrum && cfg.modules.spectrum.fluidity;
    // Render the Play spectrum 10 frames (the spring needs frames to
    // rise) and count pixels in the ASCII theme's amber — the bars
    // must actually draw as amber characters, not the old gradient.
    const countColor = (hex) => {
      const c = $('play-spectrum');
      const g = c.getContext('2d');
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const [r0, g0, b0] = hexRgb(hex);
      let n = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (Math.abs(d[i] - r0) < 40 && Math.abs(d[i + 1] - g0) < 40 && Math.abs(d[i + 2] - b0) < 40) n++;
      }
      return n;
    };
    window.__vizDt = 1 / 60;
    for (let k = 0; k < 10; k++) drawMiniSpectrum();
    const totalPx = $('play-spectrum').width * $('play-spectrum').height;
    res.amberPxAscii = countColor('#fbbf24');
    res.amberFracAscii = Math.round((res.amberPxAscii / totalPx) * 1000) / 10;
    // Back to Mousiki: the amber must (mostly) go away — the gradient
    // returns — and the bundle changes with it.
    setModuleParam('spectrum', 'theme', 'mousiki');
    for (let k = 0; k < 10; k++) drawMiniSpectrum();
    res.amberPxMousiki = countColor('#fbbf24');
    res.themeAfter = moduleVals('spectrum').theme;
    res.fluidityAfter = moduleVals('spectrum').fluidity;
    // Tweaking a slider marks it Custom.
    setModuleParam('spectrum', 'fluidity', 7);
    res.themeAfterTweak = moduleVals('spectrum').theme;
    // The Visualize spectrum/scope theme is its own slot, persisted
    // separately from the Play one.
    const sel = $('spectrum-scene-theme');
    sel.value = 'vu';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
    const cfg2 = await window.pulse.getConfig();
    res.sceneTheme = state.sceneVizTheme.name;
    res.scenePersisted = cfg2 && cfg2.vizThemes && cfg2.vizThemes.sceneViz && cfg2.vizThemes.sceneViz.name;
    window.__vizDt = null;
    // Restore the default so the next run (and Austin) start on Mousiki,
    // and close the module dialog the theme picks opened.
    setModuleParam('spectrum', 'theme', 'mousiki');
    sel.value = 'mousiki';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
    if ($('module-dialog').open) $('module-dialog').close();
    if (res.theme !== 'ascii' || res.fluidity !== 5 || res.degradation !== 5 || res.colorLeft !== '#fbbf24'
      || res.persistedTheme !== 'ascii' || res.persistedFluidity !== 5
      || res.amberFracAscii < 0.2 || res.amberPxMousiki >= res.amberPxAscii
      || res.themeAfter !== 'mousiki' || res.fluidityAfter !== 10
      || res.themeAfterTweak !== 'custom'
      || res.sceneTheme !== 'vu' || res.scenePersisted !== 'vu') R.ok = false;
    return res;
  });
  await step('glitch-autostart', async () => {
    // v0.2.7 item 3: pressing play auto-loads the track as the glitch
    // working copy and arms AUDIO CORRUPT; a kick then corrupts bytes.
    // Clear any working copy an earlier step loaded, so the auto-load
    // is what fills it (a hand-loaded file is never clobbered — that
    // path is covered by the guard in maybeAutoGlitchLoad).
    setTab('play');
    glitchAuto = true;
    glitch.tempPath = ''; glitch.originalPath = ''; glitch.name = '';
    $('glitch-audio-corrupt').checked = true;
    await loadAudioFile('/tmp/pulse-test/tone.wav', 'tone.wav');
    await new Promise((r) => setTimeout(r, 300));
    if (!state.playing) await play();
    await new Promise((r) => setTimeout(r, 1500));
    const res = {
      armed: $('glitch-audio-corrupt').checked,
      tempPath: glitch.tempPath,
      originalIsTrack: glitch.originalPath === state.trackPath,
    };
    // Force one kick through the corrupt path and prove bytes change
    // across the whole working copy (the range is random, so a 4 KB
    // window could miss it — read the full file).
    const op = document.querySelector('.glitch-op');
    if (op) op.checked = true;
    const readAll = async (p) => {
      const size = (await window.pulse.glitchRead(p, 0, 1)).size;
      const out = new Uint8Array(size);
      for (let off = 0; off < size; off += 65536) {
        const chunk = await window.pulse.glitchRead(p, off, Math.min(65536, size - off));
        out.set(chunk.bytes, off);
      }
      return out;
    };
    const before = await readAll(glitch.tempPath);
    analysis.lastKick = 999; audioCorruptLastKick = -10; audioCorruptLast = 0;
    await audioCorruptTick();
    await new Promise((r) => setTimeout(r, 300));
    const after = await readAll(glitch.tempPath);
    let diffs = 0;
    for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) diffs++;
    res.bytesChangedOnKick = diffs;
    pause();
    if (!res.armed || !res.tempPath || !res.originalIsTrack || diffs === 0) R.ok = false;
    return res;
  });
  await step('live-map-events', async () => {
    // v0.2.7 item 6: the new event types land on the map from the
    // engine's own readouts — bass grid hits, vocals crossing up,
    // section flips, chroma notes — plus beat/bar markers while the
    // 120 BPM tone plays live.
    setTab('play');
    if (!analysis) return { noAnalysis: true };
    const seen = () => new Set(mc.blips.map((b) => b.type));
    // Synthetic events first (deterministic): drive the consumers by hand.
    if (analysis.v && analysis.v.bass) { analysis.v.bass.lastHit.t = 999; mc.lastBassT = -10; }
    analysis.instruments.vocals = 0.9; mc.lastVoxUp = false;
    analysis.section = 'drop'; mc.lastSection = '';
    analysis.chromaSum = 1; if (analysis.chroma) { analysis.chroma.fill(0); analysis.chroma[3] = 0.9; }
    mc.lastNoteIdx = -1; mc.lastNoteAt = 0;
    mcConsumeOnsets();
    const res = { syntheticTypes: [...seen()] };
    // Live: the tone locks the BPM, so beat + bar markers must appear.
    await loadAudioFile('/tmp/pulse-test/tone.wav', 'tone.wav');
    await new Promise((r) => setTimeout(r, 300));
    if (!state.playing) await play();
    await new Promise((r) => setTimeout(r, 4000));
    updateMissionControl();
    res.liveTypes = [...seen()];
    res.liveCount = mc.blips.length;
    res.bpmLocked = analysis && analysis.bpmLocked;
    pause();
    const need = ['bass', 'vox', 'drop', 'note'];
    if (!need.every((t) => res.syntheticTypes.includes(t))
      || (!res.liveTypes.includes('beat') && !res.liveTypes.includes('bar'))) R.ok = false;
    return res;
  });
  await step('scenes-reactive', async () => {
    // v0.2.7 item 7: EVERY scene must visibly change with the audio
    // level. Each scene is drawn three times at the SAME clock time (t
    // fixed, so time drift can't fake a pass): twice quiet, once loud.
    // The quiet-vs-quiet difference is the scene's own noise (random
    // particles advancing one call); the audio difference is measured
    // over the adjacent step (q2→loud). A purely time-driven scene
    // scores audio ≈ 0 and fails; a speed-driven scene (tunnel) still
    // scores, because its ring positions are f(t × speed) — the speed
    // itself is the audio term, so the same t lands the rings in
    // different places when the BPM/level change. Full-frame
    // changed-pixel count (any channel moved > 12): the earlier sparse
    // sample used a 1024 px stride whose x-columns (0, 256, 512, 768,
    // 1024 on a 1280 canvas) systematically missed whole columns of
    // shapes — pattern measured zero while visibly growing 60%. The
    // render loop is kept off the canvas by staying on the Play tab
    // while drawing by hand.
    // Each sample is 10 draws, not 1: the spectrum scenes run Mousiki's
    // spring-damper (v0.2.7 item 5), which needs several frames to close
    // the gap toward the audio — one loud frame barely moves a bar.
    // The clock is driven (window.__vizDt = 1/60) so the springs advance
    // the same amount in the test as in real playback. Noise and audio
    // get the SAME number of draws, so a time-only scene still scores
    // audio ≈ noise and fails.
    setTab('play');
    await new Promise((r) => setTimeout(r, 200));
    const w = canvas.width, h = canvas.height;
    const pad = 26, top = 56, cw = w - pad * 2, ch = h - top - 56;
    // Full-frame changed-pixel count: the earlier sparse sample used a
    // 1024 px stride whose x-columns (0, 256, 512, 768, 1024 on a 1280
    // canvas) systematically missed whole columns of shapes — pattern
    // measured zero while visibly growing 60%. Counting every pixel
    // with any channel moved > 12 has no lattice gaps.
    const sample = () => ctx.getImageData(0, 0, w, h).data;
    const countChanged = (a, b) => {
      let n = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (Math.abs(a[i] - b[i]) > 12 || Math.abs(a[i + 1] - b[i + 1]) > 12 || Math.abs(a[i + 2] - b[i + 2]) > 12) n++;
      }
      return n;
    };
    const setAudioState = (loud, bpOverride) => {
      if (analysis) {
        analysis.level = loud ? 1 : 0;
        analysis.kickPulse = loud ? 1 : 0;
        analysis.beat = loud ? 1 : 0;
        analysis.beatPhase = bpOverride != null ? bpOverride : (loud ? 0.5 : -1);
        analysis.barPhase = loud ? 0.5 : -1;
        analysis.bpmLocked = !!loud;
        analysis.bpm = loud ? 120 : 0;
        analysis.centroid = loud ? 3000 : 0;
        analysis.flux = loud ? 0.8 : 0;
        analysis.rms = loud ? 0.5 : 0;
        analysis.chromaSum = loud ? 1 : 0;
        analysis.chord = loud ? { name: 'C' } : null;
        if (analysis.bands32) analysis.bands32.fill(loud ? 0.8 : 0);
        if (analysis.bands64) analysis.bands64.fill(loud ? 0.8 : 0);
        if (analysis.chroma) { analysis.chroma.fill(0); if (loud) analysis.chroma[0] = 0.9; }
        if (analysis.instruments) for (const k of Object.keys(analysis.instruments)) analysis.instruments[k] = loud ? 0.8 : 0;
      }
      state.beat = loud ? 1 : 0;
      state.smoothLow = loud ? 1 : 0; state.smoothMid = loud ? 0.7 : 0; state.smoothHigh = loud ? 0.5 : 0;
      // mousikiBands() reads the FLOAT dB spectrum (freqDb), not the
      // byte array — filling only freqData left every Mousiki-driven
      // scene deaf in the first version of this test.
      freqData.fill(loud ? 200 : 0);
      freqDb.fill(loud ? -25 : -100);
      for (let i = 0; i < waveData.length; i++) waveData[i] = loud ? Math.round(128 + 100 * Math.sin(i / 10)) : 128;
    };
    const drawAt = (id, loud, t, bpOverride) => {
      // 10 draws per sample — the spectrum springs need several frames
      // to rise toward the audio (see the comment above).
      for (let k = 0; k < 10; k++) {
        setAudioState(loud, bpOverride);
        ctx.fillStyle = bgGradient(w, h); ctx.fillRect(0, 0, w, h);
        drawSceneInto(id, pad, top, cw, ch, { kick: loud ? 1 : 0, bass: loud ? 1 : 0, level: loud ? 1 : 0, t, centroid: loud ? 3000 : 0, bands32: analysis ? analysis.bands32 : new Float32Array(32) });
      }
    };
    const res = { scenes: {}, failures: [] };
    window.__vizDt = 1 / 60; // drive the spectrum springs at 60 fps
    for (const id of SCENE_ORDER) {
      if (id === 'studio') continue;
      try {
        drawAt(id, false, 100.0); const q1 = sample();
        drawAt(id, false, 100.0); const q2 = sample();
        // Slitscan only pushes a new column on a beat-phase WRAP (0.9 →
        // 0.1): prime it unsampled so the sampled loud draw lands one.
        if (id === 'slitscan') drawAt(id, true, 100.0, 0.9);
        drawAt(id, true, 100.0, id === 'slitscan' ? 0.1 : undefined);
        const l = sample();
        const noiseChanged = countChanged(q1, q2);
        const audioChanged = countChanged(q2, l);
        // Pass: the loud frame changes a real number of pixels, and
        // clearly more than the scene's own frame-to-frame noise.
        const pass = audioChanged > 200 && audioChanged > noiseChanged * 2;
        res.scenes[id] = { noiseChanged, audioChanged, pass };
        if (!pass) res.failures.push(id);
      } catch (e) { res.scenes[id] = { error: String((e && e.message) || e), pass: false }; res.failures.push(id); }
    }
    window.__vizDt = null;
    setAudioState(false);
    if (res.failures.length) R.ok = false;
    return res;
  });
  await step('modules', async () => {
    // v0.2.6: modules are clickable / right-clickable to edit.
    setTab('play');
    const res = { hasContextMenu: typeof showModuleMenu === 'function', hasEditor: typeof openModuleEditor === 'function' };
    showModuleMenu(200, 200, $('play-spectrum'));
    res.menuVisible = !$('module-menu').hidden;
    res.menuHasEdit = $('module-menu').textContent.includes('Edit Spectrum');
    $('module-menu').hidden = true;
    openModuleEditor('spectrum');
    res.dialogOpen = $('module-dialog').open;
    res.paramRows = document.querySelectorAll('#module-dialog-body .param-row').length;
    setModuleParam('spectrum', 'bands', '16');
    res.bandsNow = moduleVals('spectrum').bands;
    await new Promise((r) => setTimeout(r, 300));
    const cfg = await window.pulse.getConfig();
    res.persistedBands = cfg && cfg.modules && cfg.modules.spectrum && cfg.modules.spectrum.bands;
    $('module-dialog').close();
    setModuleParam('spectrum', 'bands', '64'); // restore default
    if (!res.menuVisible || !res.menuHasEdit || !res.dialogOpen || res.paramRows < 4 || res.bandsNow !== '16' || res.persistedBands !== '16') R.ok = false;
    return res;
  });
  await step('viz-fullscreen', async () => {
    // v0.2.6: fullscreen visualization — stage fills the screen, panels
    // stay on top; toggles off cleanly.
    setTab('visualize');
    toggleVizFullscreen();
    await new Promise((r) => setTimeout(r, 300));
    const res = {
      on: document.body.classList.contains('viz-fullscreen') && $('tab-visualize').classList.contains('viz-fullscreen'),
      tabbarHidden: getComputedStyle($('tabbar')).display === 'none',
    };
    toggleVizFullscreen();
    await new Promise((r) => setTimeout(r, 300));
    res.off = !document.body.classList.contains('viz-fullscreen') && !$('tab-visualize').classList.contains('viz-fullscreen');
    if (!res.on || !res.tabbarHidden || !res.off) R.ok = false;
    return res;
  });
  await step('code-hide', async () => {
    // v0.2.6: the live-code Hide button collapses the WHOLE box now.
    setTab('visualize');
    const panel = $('code-panel');
    panel.classList.remove('hidden-panel');
    $('btn-code-toggle').click();
    await new Promise((r) => setTimeout(r, 150));
    const res = {
      hiddenClass: panel.classList.contains('hidden-panel'),
      display: getComputedStyle(panel).display,
      btnText: $('btn-code-toggle').textContent,
    };
    $('btn-code-toggle').click();
    await new Promise((r) => setTimeout(r, 150));
    res.shownAgain = !panel.classList.contains('hidden-panel') && getComputedStyle(panel).display !== 'none';
    if (!res.hiddenClass || res.display !== 'none' || !res.shownAgain) R.ok = false;
    return res;
  });
  await step('popouts', async () => {
    await window.pulse.popoutClose('code');
    await window.pulse.popoutClose('hex');
    await new Promise((r) => setTimeout(r, 400));
    const closed = await window.pulse.popoutCount();
    await window.pulse.popoutOpen('code');
    await new Promise((r) => setTimeout(r, 900));
    const one = await window.pulse.popoutCount();
    await window.pulse.popoutOpen('hex');
    await new Promise((r) => setTimeout(r, 900));
    const two = await window.pulse.popoutCount();
    await window.pulse.popoutClose('code');
    await window.pulse.popoutClose('hex');
    await new Promise((r) => setTimeout(r, 400));
    const back = await window.pulse.popoutCount();
    if (closed !== 0 || one !== 1 || two !== 2 || back !== 0) R.ok = false;
    return { closed, one, two, back };
  });
  await step('controls', async () => {
    // v0.2.4: Material Web is gone — hand-rolled native controls only.
    const tags = ['md-tabs', 'md-primary-tab', 'md-filled-button', 'md-outlined-button', 'md-text-button', 'md-icon-button', 'md-filled-icon-button', 'md-slider', 'md-switch', 'md-checkbox', 'md-dialog', 'md-menu', 'md-menu-item', 'md-outlined-select', 'md-select-option', 'md-linear-progress'];
    const present = tags.filter((t) => document.querySelector(t));
    const res = {
      noMaterialTags: present.length === 0,
      materialTagsPresent: present,
      tabs: document.querySelectorAll('#tabs .paper-tab').length,
      buttons: document.querySelectorAll('.paper-btn').length,
      ranges: document.querySelectorAll('input[type="range"].paper-range').length,
      switches: document.querySelectorAll('input[type="checkbox"].paper-switch').length,
      checks: document.querySelectorAll('input[type="checkbox"].paper-check').length,
      selects: document.querySelectorAll('select.paper-select').length,
      dialogs: document.querySelectorAll('dialog.paper-dialog').length,
      themeMenu: !!$('theme-menu'),
      accent: getComputedStyle(document.body).getPropertyValue('--app-accent').trim(),
      fontOk: null,
    };
    try { await document.fonts.load('12px "Paper Mono"'); res.fontOk = document.fonts.check('12px "Paper Mono"'); } catch (_) { res.fontOk = false; }
    res.errors = window.__errors;
    if (present.length || res.tabs !== 6 || !res.accent) R.ok = false;
    return res;
  });
  await step('sysaudio', async () => {
    const sources = await window.pulse.systemAudioSources();
    // On Linux the loopback capture must fail gracefully, not throw.
    const started = await Promise.race([
      startSystemAudio(),
      new Promise((res) => setTimeout(() => res('timeout'), 8000))
    ]);
    return { sources: Array.isArray(sources) ? sources.length : 0, error: sources && sources.error ? String(sources.error) : null, started, heroLive: !$('sysaudio-live').hidden };
  });
  await window.pulse.writeFile('/tmp/pulse-smoke-results.json', new TextEncoder().encode(JSON.stringify(R, null, 2)));
  document.title = 'SMOKE-DONE';
  setTimeout(() => window.close(), 400);
}
if (new URLSearchParams(location.search).get('smoke') === '1') {
  window.addEventListener('load', () => setTimeout(smokeTest, 800));
}
