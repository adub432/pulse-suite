'use strict';
/* ============================================================================
   Pulse Suite — live audio analysis engine ("Toaster engine", ported)
   ----------------------------------------------------------------------------
   Adapted from Toaster's renderer/engine.js (MIT, (c) 2026 Colin —
   github.com/StopBanning/toaster; see THIRD-PARTY-NOTICES.md). This is a
   re-implementation in Pulse Suite's own architecture, not a copy of the file:
   Toaster runs three AnalyserNodes (fast/mid/slow) plus a ring history and a
   fitted logistic kick detector; Pulse Suite has ONE AnalyserNode (4096 FFT, v0.2.6)
   and one shared render loop, so the engine here is adapted to that:

   KEPT, algorithm-for-algorithm (with Toaster's own comments condensed):
     - chord/key math: overtone-weighted chord templates, bestChord,
       Krumhansl-Schmuckler key profiles, keyFits/bestKey, chordModeEvidence,
       tonicOf, preferCurrentKey
     - onset detection: makeDetector / detectOnset (adaptive threshold,
       robust median/MAD variant, refractory, peak-relative floor)
     - kick-vs-bass discrimination: lowPass / lowSlice / lowStrike / lowPitch
       (autocorrelation pitch) and bassYin (YIN pitch tracker)
     - timing hypotheses: timingHypotheses (BPM + phase + downbeat scoring
       over recent kick/snare onsets and tonal frames)
   ADAPTED / SIMPLIFIED (documented honestly in docs/port-notes.md):
     - one analyser instead of three; band fluxes read from its dB data
     - the fitted KD logistic kick detector is NOT ported (it was fit on
       48 kHz mid-analyser bins we don't have); kicks come from the
       band-onset detector + lowStrike jump/f0 test instead
     - bar/voice learning is a 4-bar rolling count, not Toaster's full
       learned-pattern machinery (relabelling, calm bars, etc.)
     - closed/open hats split by ring time, not by a second detector
   The engine is source-agnostic: it eats whatever the shared analyser hears
   — a loaded file, a video, or the system-audio loopback — so every visual
   reacts to system audio with no track loaded. It never fakes anything:
   with no audio it reports silence.
   ========================================================================== */

const TA_NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const clampN = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/* ------------------------------------------------------------------ chords and keys */
// Real notes ring with overtones (octaves and fifths), so the templates include
// them. Weights fall off as 1/n, like a sawtooth. The 5th overtone (a major
// third up) is left out: it put a minor chord's third right on the chord's
// fifth, so a strong fifth tipped faint-third major chords to minor.
const TA_OVERTONES = [[0, 1], [0, 1 / 2], [7, 1 / 3], [0, 1 / 4], [7, 1 / 6]];
const taUnit = (v) => { const len = Math.hypot(...v) || 1; return v.map((x) => x / len); };
const TA_NOTE_TPL = Array.from({ length: 12 }, (_, pc) => {
  const tpl = new Array(12).fill(0);
  for (const [iv, a] of TA_OVERTONES) tpl[(pc + iv) % 12] += a;
  return taUnit(tpl);
});
const TA_CHORDS = [];
for (let r = 0; r < 12; r++) {
  for (const [q, third] of [['', 4], ['m', 3]]) {
    const tpl = new Array(12).fill(0), tones = new Array(12).fill(0);
    for (const [note, w] of [[r, 1], [r + third, 0.9], [r + 7, 0.9]]) {
      for (let i = 0; i < 12; i++) tpl[i] += w * TA_NOTE_TPL[note % 12][i];
      tones[note % 12] += w;
    }
    TA_CHORDS.push({ root: r, q, name: TA_NOTES[r] + q, third, tpl: taUnit(tpl), tones: taUnit(tones) });
  }
}
function taBestChord(raw, bassPc) {
  const c0 = Array.from(raw);
  // A loud bass note's 5th overtone sounds a major third above it and would
  // turn minor chords major. Take out roughly what it adds.
  if (bassPc >= 0) c0[(bassPc + 4) % 12] = Math.max(0, c0[(bassPc + 4) % 12] - 0.12 * c0[bassPc]);
  // Drums and noise lift all 12 notes evenly; take that floor out too.
  const floor = Math.min(...c0);
  const c = taUnit(c0.map((x) => x - floor));
  if (c.some(Number.isNaN)) return null;
  let best = null;
  for (const ch of TA_CHORDS) {
    let score = 0;
    for (let i = 0; i < 12; i++) score += c[i] * ch.tpl[i];
    if (ch.root === bassPc) score += 0.02;
    if (!best || score > best.score) best = { ...ch, score };
  }
  return best.score > 0.7 ? best : null;
}
const TA_KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const TA_KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
function taKeyFits(c) {
  const corr = (x, y) => {
    const mx = x.reduce((a, b) => a + b) / 12, my = y.reduce((a, b) => a + b) / 12;
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < 12; i++) { num += (x[i] - mx) * (y[i] - my); dx += (x[i] - mx) ** 2; dy += (y[i] - my) ** 2; }
    return dx && dy ? num / Math.sqrt(dx * dy) : 0;
  };
  const fits = [];
  for (let r = 0; r < 12; r++) {
    const rotated = Array.from({ length: 12 }, (_, i) => c[(r + i) % 12]);
    for (const [mode, profile] of [['major', TA_KK_MAJOR], ['minor', TA_KK_MINOR]]) fits.push({ root: r, mode, score: corr(rotated, profile) });
  }
  return fits;
}
function taBestKey(fits) {
  let best = null;
  for (const f of fits) if (!best || f.score > best.score) best = f;
  return best && best.score > 0.3 ? best : null;
}
// Which mode the chords heard say a key on `root` is in. hist: each chord's
// fading count (index root * 2, + 1 for a minor chord).
function taChordModeEvidence(hist, root) {
  const at = (offset, minor) => hist[((root + offset) % 12) * 2 + (minor ? 1 : 0)];
  const minor = [0.5 * at(0, true), at(5, true), at(8, false), at(3, false)];
  const major = [0.5 * at(0, false), at(5, false), at(9, true), at(2, true)];
  const sum = (xs) => xs.reduce((a, b) => a + b, 0);
  const strong = (a, b) => sum(a) >= 3 && sum(a) > 1.25 * sum(b) + 1 && a.filter((x) => x >= 0.75).length >= 2;
  return strong(minor, major) ? 'minor' : strong(major, minor) ? 'major' : null;
}
// Of a key and its relative, the one whose tonic the music keeps coming back to.
function taTonicOf(home, k) {
  if (!k) return null;
  const m = k.mode === 'minor' ? k.root : (k.root + 9) % 12, M = (m + 3) % 12;
  const minor = home[m * 2 + 1], major = home[M * 2];
  const clear = (a, b) => a >= 3 && a > 1.25 * b + 2;
  return clear(minor, major) ? { root: m, mode: 'minor' } : clear(major, minor) ? { root: M, mode: 'major' } : null;
}
// After the first eight bars, a key on another root takes over only with a
// clear lead — small wins back and forth are a close call, not a key change.
function taPreferCurrentKey(fits, candidate, current, bars, margin = 0.1) {
  if (!candidate || !current || bars <= 8 || candidate.root === current.root) return candidate;
  const previous = fits.find((f) => f.root === current.root && f.mode === current.mode);
  return previous && candidate.score - previous.score < margin ? previous : candidate;
}

/* ------------------------------------------------------------------ onset detection */
function taPitchMap(lo, hi, hzPerBin) {
  const idx = [], pc = [], w = [], midi = [];
  for (let k = Math.ceil(lo / hzPerBin); k <= Math.floor(hi / hzPerBin); k++) {
    const m = 69 + 12 * Math.log2((k * hzPerBin) / 440);
    const r = Math.round(m);
    const weight = Math.cos(Math.PI * (m - r)) ** 2; // 1 on the note, 0 halfway to the next
    if (weight < 0.05) continue;
    idx.push(k); pc.push(((r % 12) + 12) % 12); w.push(weight); midi.push(r);
  }
  return { idx: Int32Array.from(idx), pc: Uint8Array.from(pc), w: Float32Array.from(w), midi: Int16Array.from(midi) };
}
function taMakeDetector(k, refractory, minRel, robust = false) {
  return { hist: [], sorted: new Float32Array(48), prevX: 0, prevThr: Infinity, last: -10, peak: 0, max: 1e-6, hits: 0, k, refractory, minRel, robust };
}
// Adaptive-threshold onset detector on a band's spectral flux. Returns hit
// strength (0 = no hit). A robust detector sets its threshold from the typical
// level between hits (median and spread of the middle half), so a run of loud
// hits can't lift it over quieter ones.
function taDetectOnset(d, x, t, allow) {
  const h = d.hist;
  const n = Math.max(1, h.length);
  let thr;
  if (d.robust && h.length >= 12) {
    const s = d.sorted.subarray(0, h.length);
    s.set(h);
    s.sort();
    const q1 = s[Math.floor(n / 4)], q2 = s[Math.floor(n / 2)], q3 = s[Math.floor((3 * n) / 4)];
    thr = q2 + d.k * ((q3 - q1) / 1.35);
  } else {
    let mean = 0, sq = 0;
    for (const y of h) { mean += y; sq += y * y; }
    mean /= n;
    thr = mean + d.k * Math.sqrt(Math.max(0, sq / n - mean * mean));
  }
  d.max = Math.max(x, d.max * 0.9995);
  d.peak *= 0.9997; // slowly forget, so a quieter section can still register
  thr += 0.06 * d.max;
  let strength = 0;
  const rising = allow && h.length >= 12 && x > thr && d.prevX <= d.prevThr && t - d.last > d.refractory;
  // A hit must reach a share of the voice's typical hit; keeps bass notes
  // from posing as kicks.
  if (rising && !(d.hits >= 4 && x < d.minRel * d.peak)) {
    d.last = t;
    d.hits++;
    d.peak = d.peak ? d.peak * 0.9 + x * 0.1 : x;
    strength = clampN(x / d.peak, 0.2, 1.6);
  }
  d.prevX = x;
  d.prevThr = thr;
  h.push(x);
  if (h.length > 48) h.shift();
  return strength;
}

/* ------------------------------------------------------------------ kick or bass? */
// A low-pass filter (RBJ biquad) for the bottom end, below fc.
function taLowPass(sr, fc = 200, q = Math.SQRT1_2) {
  const w = (2 * Math.PI * fc) / sr, a = Math.sin(w) / (2 * q), c = Math.cos(w), a0 = 1 + a;
  return { b0: (1 - c) / 2 / a0, b1: (1 - c) / a0, b2: (1 - c) / 2 / a0, a1: (-2 * c) / a0, a2: (1 - a) / a0 };
}
// The low end of buf (newest last) between `from` and `to` seconds ago, through
// the low-pass filter c twice (4 poles), thinned by dec.
function taLowSlice(buf, sr, c, dec, from, to) {
  const N = buf.length, start = Math.max(0, Math.round(N - from * sr)), end = Math.min(N, Math.round(N - to * sr)), out = [];
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, u1 = 0, u2 = 0, z1 = 0, z2 = 0;
  for (let i = Math.max(0, start - Math.round(0.02 * sr)); i < end; i++) {
    const y = c.b0 * buf[i] + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1; x1 = buf[i]; y2 = y1; y1 = y;
    const z = c.b0 * y + c.b1 * u1 + c.b2 * u2 - c.a1 * z1 - c.a2 * z2;
    u2 = u1; u1 = y; z2 = z1; z1 = z;
    if (i >= start && (i - start) % dec === 0) out.push(z);
  }
  return out;
}
// Pitch (28-300 Hz; 0 if there's no clear one) and loudness of x, sampled at fs.
function taLowPitch(x, fs) {
  const n = x.length;
  let e = 0;
  for (const v of x) e += v * v;
  const rms = Math.sqrt(e / n), lo = Math.floor(fs / 300), hi = Math.min(Math.floor(fs / 28), n - 8);
  if (e <= 1e-12 || hi <= lo + 2) return { f: 0, rms, r: 0 };
  const r = new Float32Array(hi + 2);
  let max = 0;
  for (let L = lo; L <= hi; L++) {
    let s = 0, a = 0, b = 0;
    for (let i = 0; i + L < n; i++) { s += x[i] * x[i + L]; a += x[i] * x[i]; b += x[i + L] * x[i + L]; }
    r[L] = s / Math.sqrt(a * b || 1e-30);
    max = Math.max(max, r[L]);
  }
  // the first strong peak, so a multiple of the period isn't mistaken for it
  for (let L = lo + 1; L < hi; L++) {
    if (r[L] < 0.9 * max || r[L] < r[L - 1] || r[L] < r[L + 1]) continue;
    const p = r[L - 1], q = r[L + 1], den = p - 2 * r[L] + q;
    return { f: fs / (L + (den < 0 ? (0.5 * (p - q)) / den : 0)), rms, r: r[L] };
  }
  return { f: 0, rms, r: 0 };
}
// How a sound in the low end struck, `ago` seconds back in buf: its first
// 15 ms's level against the 40 ms before it (jump), and the pitch over its
// first 35 ms (f0, 0 if none). A kick jumps hard; a bass note barely jumps.
function taLowStrike(buf, sr, c, dec, ago) {
  const rms = (x) => { let e = 0; for (const v of x) e += v * v; return Math.sqrt(e / Math.max(1, x.length)); };
  const fs = sr / dec, first = taLowSlice(buf, sr, c, dec, ago, Math.max(0, ago - 0.035));
  const before = rms(taLowSlice(buf, sr, c, dec, ago + 0.045, ago + 0.005));
  return { jump: rms(first.slice(0, Math.round(0.015 * fs))) / Math.max(1e-9, before), f0: taLowPitch(first, fs).f };
}
// The bass's note now: YIN (de Cheveigné and Kawahara) on the low end x,
// thinned to fs, its first w samples against the rest. d: scratch array.
function taBassYin(x, w, fs, d) {
  const tmin = Math.floor(fs / 300), tmax = Math.min(Math.floor(fs / 28), x.length - w - 1);
  let e = 0;
  for (let j = 0; j < w; j++) e += x[j] * x[j];
  const rms = Math.sqrt(e / w);
  if (e <= 1e-12 || tmax <= tmin + 2) return { f: 0, rms };
  let run = 0;
  d[0] = 1;
  for (let tau = 1; tau <= tmax; tau++) {
    let s = 0;
    for (let j = 0; j < w; j++) { const v = x[j] - x[j + tau]; s += v * v; }
    run += s;
    d[tau] = run > 0 ? (s * tau) / run : 1;
    // the first dip under 0.15, at its bottom
    const k = tau - 1;
    if (k > tmin && d[k] < 0.15 && d[k] <= d[tau]) {
      const p = d[k - 1], q = d[tau], den = p - 2 * d[k] + q;
      return { f: fs / (k + (den > 0 ? (0.5 * (p - q)) / den : 0)), rms };
    }
  }
  return { f: 0, rms };
}

/* ------------------------------------------------------------------ timing hypotheses */
// Small causal timing bank. Scores are evidence indices, not calibrated
// probabilities. Two pulse phases and four bar rotations per tempo preserve
// ambiguous alternatives. onsets: [{t, id: 'bd'|'sd', s}], tonal: frames
// [{t, c[12], b[12], e}], t: now, bpms: candidate tempos.
function taTimingHypotheses(onsets, tonal, t, bpms) {
  const mod = (x, n) => ((x % n) + n) % n;
  const hits = onsets.filter((o) => o.t > t - 12 && o.t <= t && (o.id === 'bd' || o.id === 'sd'));
  const weight = (o) => Math.min(o.s, 1.5) * (o.id === 'sd' ? 1.25 : 1);
  const change = (a, b) => {
    const x = Math.hypot(...a), y = Math.hypot(...b);
    return x && y ? Math.max(0, 1 - a.reduce((v, z, i) => v + z * b[i], 0) / (x * y)) : 0;
  };
  const out = [];
  for (const bpm of bpms) {
    if (!(bpm >= 60 && bpm <= 200)) continue;
    const P = 60 / bpm, phases = [];
    for (let k = 0; k < 64; k++) {
      const at = k * P / 64;
      const score = hits.reduce((sum, o) => {
        const x = (o.t - at) / P, d = x - Math.round(x);
        return sum + weight(o) * Math.exp(-0.5 * (d / 0.07) ** 2);
      }, 0);
      phases.push({ at, score });
    }
    phases.sort((a, b) => b.score - a.score);
    const chosen = phases.filter((a, i) => !i || Math.abs(mod((a.at - phases[0].at) / P + 0.5, 1) - 0.5) > 0.3).slice(0, 2);
    for (const { at } of chosen) {
      const K = [0, 0, 0, 0], S = [0, 0, 0, 0], H = [0, 0, 0, 0], C = [0, 0, 0, 0];
      let aligned = 0, total = 0;
      for (const o of hits) {
        const f = (o.t - at) / P, b = Math.round(f), w = weight(o);
        total += w;
        if (Math.abs(f - b) > 0.15) continue;
        aligned += w;
        (o.id === 'bd' ? K : S)[mod(b, 4)] += Math.min(o.s, 1.5);
      }
      const frames = new Map();
      for (const r of tonal) {
        if (r.t < t - 16 || r.t > t) continue;
        const b = Math.floor((r.t - at) / P), f = mod((r.t - at) / P, 1);
        if (f < 0.2 || f > 0.8) continue; // avoid FFT windows straddling the change
        let v = frames.get(b);
        if (!v) frames.set(b, v = { c: Array(12).fill(0), b: Array(12).fill(0), e: 0, n: 0 });
        for (let i = 0; i < 12; i++) { v.c[i] += r.c[i]; v.b[i] += r.b[i]; }
        v.e += r.e; v.n++;
      }
      const stepAt = (b) => {
        const before = [-4, -3, -2, -1].map((k) => frames.get(b + k));
        const after = [0, 1, 2, 3].map((k) => frames.get(b + k));
        if (!before.every(Boolean) || !after.every(Boolean)) return 0;
        const db = (v) => 10 * Math.log10(v.e / v.n + 1e-12);
        const mean = before.reduce((sum, v) => sum + db(v), 0) / 4;
        return Math.max(Math.min(...after.map(db)) - mean, mean - Math.max(...after.map(db)));
      };
      for (const [b, v] of frames) {
        const prev = frames.get(b - 1);
        if (!prev) continue;
        H[mod(b, 4)] += 0.75 * change(v.b, prev.b) + 0.25 * change(v.c, prev.c);
        const step = stepAt(b);
        if (step >= 4 && step >= stepAt(b - 1) && step >= stepAt(b + 1)) C[mod(b, 4)] += Math.min(6, step - 3);
      }
      const pulseSupport = total ? aligned / total : 0;
      for (let d = 0; d < 4; d++) {
        const accent = K[d] + 0.5 * K[(d + 2) % 4] + S[(d + 1) % 4] + S[(d + 3) % 4] - 0.5 * (S[d] + S[(d + 2) % 4]);
        out.push({ bpm, anchor: at, down: d, pulseSupport, score: accent + 3 * H[d] + 2 * C[d],
          evidence: { kick: K[d], backbeat: S[(d + 1) % 4] + S[(d + 3) % 4], change: H[d], section: C[d] }, hits: hits.length });
      }
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

/* ============================================================================
   The engine: one AnalyserNode in, a live musical picture out.
   update(freqDb, timeFloat, t) — call once per animation frame while audio
   is playing. freqDb: Float32Array from getFloatFrequencyData (dB, -100..-30).
   timeFloat: Float32Array from getFloatTimeDomainData. t: seconds (performance
   clock or audio clock, consistent across calls).
   ========================================================================== */
function createAnalysis(sampleRate) {
  const sr = sampleRate || 48000;
  const hzPerBin = sr / 2 / 2048; // v0.2.6: fast analyser fftSize 4096 -> 2048 bins
  // Chroma reads the SLOW analyser (fftSize 8192 -> 4096 bins, 5.86 Hz/bin
  // at 48 kHz): the fast analyser's 23.4 Hz bins smear a 55 Hz bass note
  // across semitones. Toaster's architecture is the same (fast/mid/slow).
  const hzSlow = sr / 2 / 4096;
  const chromaMap = taPitchMap(100, 4000, hzSlow);
  const bassMap = taPitchMap(35, 220, hzSlow);
  const lp = taLowPass(sr);
  const dec = Math.max(1, Math.round(sr / 6000)); // low end thinned to ~6 kHz
  const yinScratch = new Float32Array(256);
  // Rolling time-domain ring (0.6 s) for the low-end strike test.
  const ringLen = Math.floor(sr * 0.6);
  const ring = new Float32Array(ringLen);
  let ringPos = 0, ringFilled = 0;

  const eng = {
    sr,
    // --- live readouts (what the visuals + code panel consume) ---
    level: 0, beat: 0, kickPulse: 0, // 0..1, decayed per frame
    bpm: 0, bpmLocked: false, bar: 0, step: 0, beatInBar: 0,
    chord: null, key: null, bassNote: null, bassMidi: -1,
    section: '', // 'drop' | 'breakdown' | ''
    ducking: false, duckDepth: 0,
    silent: true,
    // v0.2.6 hi-res readouts — the effects' extra detail (see update()).
    rms: 0, loudnessDb: -70, centroid: 0, flux: 0,
    beatPhase: -1, barPhase: -1,           // 0..1 through the beat / bar (-1 = unlocked)
    chroma: new Float32Array(12), chromaSum: 0,
    bands32: new Float32Array(32),         // 32 log-spaced band energies, 30 Hz..12 kHz
    bands64: new Float32Array(64),         // v0.2.6: the 32 bands mirrored (Mousiki-style, bass centre)
    bandFlux32: new Float32Array(32),      // per-band spectral flux this frame
    bandOnsets: [],                        // band indices whose flux spiked this frame
    hotBand: -1,                           // loudest spiking band this frame (-1 = none)
    // v0.2.6: instrument presence, 0..1 each — frequency-band + feature
    // heuristics (light path, live): drums ride the onset detectors,
    // bass rides the low end, vocals ride midrange energy WITH movement
    // (a sustained pad has energy but no flux, so it is not a voice),
    // guitar/keys ride sustained harmonic energy (high energy, low flux).
    // Real stem separation (Demucs-style) is NOT live — it is an offline
    // step for a loaded file only, cached per track (see app.js).
    instruments: { vocals: 0, drums: 0, guitar: 0, bass: 0, keys: 0 },
    offline: null,                         // full-file analysis (exact BPM/grid/sections)
    sections: [],                          // [{start, end, type}] from the offline pass
    lastKick: -10, lastDrop: -99, lastSound: -10,
    lastBdBandT: -10, // last kick-band onset, for transient echo suppression
    // --- codegen shape (4-bar slots, 16-step voice grids) ---
    slots: [null, null, null, null],          // { chord: {name}, bass: 'c2', bassBeats: [midi|null x4] }
    bassBeats: [null, null, null, null],
    v: {},                                     // bd/sd/hhc/hho/vox/bass: { shown: bool[16], turned: 0, four, back, lastHit }
    present: { bd: false, sd: false, hhc: false, hho: false, vox: false, bass: false, chords: false },
    bassSeen: -10, chordSeen: -10,
    knobs: { bassLpf: 600, chordLpf: 2400, hhGain: 0.5 },
    bassSound: { wobble: 0 },
    // --- internals ---
    det: {
      bd: taMakeDetector(1.5, 0.12, 0.3, true),
      sd: taMakeDetector(1.9, 0.09, 0.35, true),
      hh: taMakeDetector(1.6, 0.045, 0, true),
      lead: taMakeDetector(2.5, 0.1, 0.3, true),
    },
    onsets: [],        // {t, id, s} — last 20 s, for timing
    tonalFrames: [],   // {t, c[12], b[12], e} — last 20 s, for timing + key
    prevBand: { bd: 0, sd: 0, hh: 0, all: 0, body: 0 },
    bandLevel: { bd: 0, sd: 0, hh: 0, all: 0, body: 0, low: 0 },
    frameChroma: new Float32Array(12),
    barChroma: new Float32Array(12),
    barBass: new Float32Array(12),
    barFrames: 0,
    barStart: -1, barLen: 0, barKicks: 0, barBeats: 0,
    barsHeard: 0,
    chordHist: new Float32Array(24),   // fading chord counts, for mode evidence
    keyHome: new Float32Array(24),     // tonic counts, for tonicOf
    curKey: null,
    gridCounts: {},                     // voice -> counts[16] over the current 4-bar window
    gridBars: 0,
    pendingHh: [],                      // {t, level} — closed/open hat split by ring
    lastTiming: -10,
    hypotheses: [],
    fluxBpm: 0,
    bpmHint: 0, // offline BPM (from the file's own beat analysis), a candidate — never forced
    hintLocked: false, // the grid is anchored on the offline BPM (files only)
    coarseAt: -10,
    setHint(bpm) { this.bpmHint = (bpm >= 60 && bpm <= 200) ? bpm : 0; },
    // v0.2.6: the full-file offline pass (detectBeats in app.js) anchors the
    // live lock — exact BPM, beat grid and sections for a loaded file, where
    // the live lock alone is only ±5%. System audio has no offline pass.
    setOffline(det) {
      this.offline = det || null;
      this.sections = (det && det.sections) || [];
      if (det && det.bpm) this.setHint(det.bpm);
    },
    // Anchor the grid on the offline BPM: for a loaded file the offline
    // analysis (whole-file onset intervals) is exact, while the live lock
    // is approximate — the snare detector fires on kick clicks too, so the
    // live hypotheses land a few BPM off. The live evidence can still
    // override the hint, but only when it is much stronger (see update()).
    lockHint() {
      if (!this.bpmHint) return;
      this.bpm = this.bpmHint; this.bpmLocked = true; this.hintLocked = true;
      this._P = 60 / this.bpmHint; this.barStart = -1;
    },
    _t0: 0, _P: 0, _down: 0,
    reset() {
      this.det = {
        bd: taMakeDetector(1.5, 0.12, 0.3, true),
        sd: taMakeDetector(1.9, 0.09, 0.35, true),
        hh: taMakeDetector(1.6, 0.045, 0, true),
        lead: taMakeDetector(2.5, 0.1, 0.3, true),
      };
      this.onsets = []; this.tonalFrames = [];
      this.bpm = 0; this.bpmLocked = false; this.bar = 0; this.step = 0;
      this.chord = null; this.key = null; this.curKey = null;
      this.slots = [null, null, null, null]; this.bassBeats = [null, null, null, null];
      this.barsHeard = 0; this.barStart = -1;
      this.chordHist.fill(0); this.keyHome.fill(0);
      this.gridCounts = {}; this.gridBars = 0;
      this.v = {};
      for (const id of ['bd', 'sd', 'hhc', 'hho', 'vox', 'bass']) {
        this.v[id] = { shown: new Array(16).fill(false), turned: 0, four: false, back: false, lastHit: { t: -10, step: -1 } };
        this.gridCounts[id] = new Float32Array(16);
      }
      this.lastKick = -10; this.lastDrop = -99; this.silent = true;
      this.rms = 0; this.loudnessDb = -70; this.centroid = 0; this.flux = 0;
      this.beatPhase = -1; this.barPhase = -1;
      this.chroma.fill(0); this.chromaSum = 0;
      this.bands32.fill(0); this.bandFlux32.fill(0);
      this.bands64.fill(0);
      this.instruments = { vocals: 0, drums: 0, guitar: 0, bass: 0, keys: 0 };
      this.bandOnsets = []; this.hotBand = -1;
      prevMag.fill(0); prevBandE.fill(0);
    },
  };
  const prevDb = new Float32Array(2048);
  // v0.2.6 hi-res features: per-frame spectral magnitudes (for centroid /
  // flux) and 32 log-spaced band energies (for per-band onsets).
  const prevMag = new Float32Array(2048);
  const AN_EDGES = (() => { const e = []; for (let i = 0; i <= 32; i++) e.push(30 * Math.pow(12000 / 30, i / 32)); return e; })();
  const prevBandE = new Float32Array(32);
  // reset() touches prevMag/prevBandE, so it runs only once they exist —
  // calling it before these consts (TDZ) threw on the first play in 0.2.6.
  eng.reset();

  const bandRange = (loHz, hiHz) => [
    Math.max(1, Math.round(loHz / hzPerBin)),
    Math.min(2047, Math.round(hiHz / hzPerBin)),
  ];
  const BANDS = {
    bd: bandRange(40, 130), sd: bandRange(1100, 5200), hh: bandRange(7000, 15000),
    all: bandRange(100, 11000), body: bandRange(800, 3000), low: bandRange(20, 250),
  };
  const bandLevel = (freqDb, [lo, hi]) => {
    let sum = 0;
    for (let k = lo; k <= hi; k++) sum += clamp01((freqDb[k] + 100) / 70);
    return sum / Math.max(1, hi - lo + 1);
  };
  const bandFlux = (freqDb, [lo, hi], prev) => {
    // Spectral flux: positive dB rises only, per band.
    let f = 0;
    for (let k = lo; k <= hi; k++) {
      const v = clamp01((freqDb[k] + 100) / 70);
      f += Math.max(0, v - (prev[k] || 0));
      prev[k] = v;
    }
    return f / Math.max(1, hi - lo + 1);
  };
  // Chroma from the dB spectrum: each bin's magnitude lands on its nearest
  // note, weighted by how close it sits (pitchMap's cos^2 weight).
  function chromaFrom(freqDb, map, out) {
    out.fill(0);
    for (let j = 0; j < map.idx.length; j++) {
      const k = map.idx[j];
      const db = freqDb[k];
      if (db <= -90) continue;
      out[map.pc[j]] += Math.pow(10, db / 20) * map.w[j];
    }
    return out;
  }

  function quantizeStep(t) {
    if (!eng.bpmLocked || eng.barStart < 0) return -1;
    const P = 60 / eng.bpm;
    return Math.floor(((t - eng.barStart) / (P / 4)) % 16);
  }
  function markGrid(id, t, strength) {
    const s = quantizeStep(t);
    if (s < 0) return;
    eng.gridCounts[id][s] += Math.min(1.5, strength);
    const v = eng.v[id];
    v.lastHit = { t, step: s };
  }
  function finalizeGrids() {
    // A step is "on" when it holds at least half the busiest step's weight
    // (Toaster's makeVoice onAt), over the last 4 bars.
    for (const id of ['bd', 'sd', 'hhc', 'hho', 'vox', 'bass']) {
      const counts = eng.gridCounts[id];
      let max = 0;
      for (let s = 0; s < 16; s++) max = Math.max(max, counts[s]);
      const onAt = { bd: 0.5, sd: 0.5, hhc: 0.35, hho: 0.4, vox: 0.4, bass: 0.45 }[id];
      for (let s = 0; s < 16; s++) eng.v[id].shown[s] = max > 0 && counts[s] >= onAt * max;
      // four-on-the-floor: kicks on all four beats
      if (id === 'bd') eng.v.bd.four = [0, 4, 8, 12].every((s) => eng.v.bd.shown[s]);
      if (id === 'sd') eng.v.sd.back = eng.v.sd.shown[4] && eng.v.sd.shown[12];
      counts.fill(0);
    }
    eng.gridBars = 0;
  }

  function finalizeBar(t) {
    // Chord + key for the bar that just ended.
    if (eng.barFrames > 4) {
      const bassPc = eng.bassMidi >= 0 ? eng.bassMidi % 12 : -1;
      const chord = taBestChord(eng.barChroma, bassPc);
      const slot = eng.barsHeard % 4;
      const bassName = eng.bassMidi >= 0 ? TA_NOTES[eng.bassMidi % 12].toLowerCase() + (Math.floor(eng.bassMidi / 12) - 1) : null;
      eng.slots[slot] = chord || bassName ? { chord, bass: bassName } : null;
      eng.bassBeats[slot] = eng._curBassBeats ? eng._curBassBeats.slice() : null;
      if (chord) {
        eng.chord = chord; eng.chordSeen = t;
        eng.chordHist[chord.root * 2 + (chord.q === 'm' ? 1 : 0)] += 1;
        eng.keyHome[chord.root * 2 + (chord.q === 'm' ? 1 : 0)] += 1;
        if (bassPc >= 0) eng.keyHome[bassPc * 2 + (chord.q === 'm' ? 1 : 0)] += 0.5;
      }
      // Key: Krumhansl-Schmuckler over the bar's chroma, steadied by the
      // current key (preferCurrentKey) and the chords' mode evidence.
      const fits = taKeyFits(eng.barChroma);
      let cand = taBestKey(fits);
      cand = taPreferCurrentKey(fits, cand, eng.curKey, eng.barsHeard);
      if (cand) {
        const mode = taChordModeEvidence(eng.chordHist, cand.root) || taTonicOf(eng.keyHome, cand)?.mode || cand.mode;
        eng.key = { root: cand.root, mode };
        eng.curKey = eng.key;
      }
      eng.barsHeard++;
      // Decay the chord history so old sections stop voting.
      for (let i = 0; i < 24; i++) eng.chordHist[i] *= 0.9;
    }
    eng.barChroma.fill(0); eng.barBass.fill(0); eng.barFrames = 0;
    eng._curBassBeats = [null, null, null, null];
    eng.barKicks = 0;
    eng.gridBars++;
    if (eng.gridBars >= 4) finalizeGrids();
  }

  eng.update = function (freqDb, timeFloat, t, slowDb) {
    // slowDb: the slow analyser's dB spectrum (8192 FFT) for the chroma;
    // falls back to the fast spectrum when not provided (unit tests).
    // --- level + silence ---
    let sum = 0;
    for (let i = 0; i < timeFloat.length; i += 4) { const v = timeFloat[i]; sum += v * v; }
    const rms = Math.sqrt(sum / (timeFloat.length / 4));
    eng.level += (rms - eng.level) * 0.4;
    eng.rms = rms;
    eng.loudnessDb = 20 * Math.log10(rms + 1e-12);
    eng.silent = eng.level < 0.004;
    if (!eng.silent) eng.lastSound = t;

    // --- v0.2.6 hi-res spectral features (4096-pt FFT, 2048 bins) ---
    // Spectral centroid (brightness) + spectral flux (how much the
    // spectrum changed since last frame), from linear magnitudes.
    {
      let magSum = 0, wSum = 0, fl = 0;
      for (let k = 1; k < 2048; k++) {
        const m = Math.pow(10, freqDb[k] / 20);
        magSum += m; wSum += k * hzPerBin * m;
        const d = m - prevMag[k];
        if (d > 0) fl += d;
        prevMag[k] = m;
      }
      eng.centroid = magSum > 1e-9 ? wSum / magSum : 0;
      eng.flux = fl;
      // 32 log-spaced band energies + per-band flux + per-band onsets.
      let fluxMean = 0;
      for (let b = 0; b < 32; b++) {
        const lo = Math.max(1, Math.floor(AN_EDGES[b] / hzPerBin));
        const hi = Math.max(lo + 1, Math.min(2047, Math.floor(AN_EDGES[b + 1] / hzPerBin)));
        let e = 0;
        for (let k = lo; k < hi; k++) e += Math.pow(10, freqDb[k] / 10);
        e /= (hi - lo);
        const bf = Math.max(0, e - prevBandE[b]);
        eng.bands32[b] = e;
        eng.bandFlux32[b] = bf;
        fluxMean += bf;
        prevBandE[b] = e;
      }
      fluxMean /= 32;
      eng.bandOnsets = [];
      eng.hotBand = -1;
      let hotFlux = 0;
      for (let b = 0; b < 32; b++) {
        if (eng.bandFlux32[b] > 0.02 && eng.bandFlux32[b] > 1.8 * Math.max(fluxMean, 1e-6)) {
          eng.bandOnsets.push(b);
          if (eng.bandFlux32[b] > hotFlux) { hotFlux = eng.bandFlux32[b]; eng.hotBand = b; }
        }
      }
      // Mirror the 32 bands to 64 (Mousiki-style: bass in the centre,
      // treble falling off to both edges — same layout mousikiBands()
      // uses for the Play spectrum).
      for (let i = 0; i < 32; i++) {
        eng.bands64[i * 2] = clamp01((10 * Math.log10(eng.bands32[31 - i] + 1e-12) + 70) / 70);
        eng.bands64[i * 2 + 1] = clamp01((10 * Math.log10(eng.bands32[i] + 1e-12) + 70) / 70);
      }
    }

    // --- ring buffer for the low-end strike test ---
    for (let i = 0; i < timeFloat.length; i++) {
      ring[ringPos] = timeFloat[i];
      ringPos = (ringPos + 1) % ringLen;
    }
    ringFilled = Math.min(ringLen, ringFilled + timeFloat.length);
    // Re-order the ring (newest last) for lowSlice — copy is cheap at 60 fps.
    const ordered = new Float32Array(ringFilled);
    for (let i = 0; i < ringFilled; i++) ordered[i] = ring[(ringPos - ringFilled + i + ringLen * 2) % ringLen];

    // --- band levels + fluxes ---
    for (const k of Object.keys(BANDS)) eng.bandLevel[k] = bandLevel(freqDb, BANDS[k]);
    const flux = {};
    for (const k of ['bd', 'sd', 'hh', 'all', 'body']) flux[k] = bandFlux(freqDb, BANDS[k], prevDb);

    // --- onset detectors ---
    const sBd = taDetectOnset(eng.det.bd, flux.bd, t, !eng.silent);
    const sSd = taDetectOnset(eng.det.sd, flux.sd, t, !eng.silent);
    const sHh = taDetectOnset(eng.det.hh, flux.hh, t, !eng.silent);
    const sLead = taDetectOnset(eng.det.lead, flux.all, t, !eng.silent);

    // --- kick vs bass (lowStrike jump + pitch) ---
    if (sBd > 0) {
      eng.lastBdBandT = t;
      const strike = taLowStrike(ordered, sr, lp, dec, 0.02);
      // A kick jumps hard (2-12x) or reads at the pitch floor (~30 Hz); a
      // bass note changing barely jumps and starts at 45-60 Hz.
      const isKick = strike.jump > 1.9 || strike.f0 < 35 || (strike.jump > 1.2 && strike.f0 < 75);
      if (isKick) {
        eng.onsets.push({ t, id: 'bd', s: sBd });
        eng.lastKick = t; eng.kickPulse = 1; eng.beat = 1;
        eng.barKicks++;
        // Hint-locked grid: the first kick heard anchors bar one.
        if (eng.bpmLocked && eng.barStart < 0) { eng.barStart = t; eng.barLen = (60 / eng.bpm) * 4; }
        markGrid('bd', t, sBd);
      } else if (strike.f0 > 0) {
        const midi = Math.round(69 + 12 * Math.log2(strike.f0 / 440));
        eng.bassMidi = clampN(midi, 21, 108);
        eng.bassNote = TA_NOTES[eng.bassMidi % 12] + (Math.floor(eng.bassMidi / 12) - 1);
        eng.bassSeen = t;
        markGrid('bass', t, sBd);
      }
    }
    // Transient echo suppression: a kick's broadband click smears through
    // the analyser and re-fires the snare/hat detectors ~100 ms later.
    // A real snare or hat never lands 40-160 ms after a kick on its own
    // (simultaneous hits are kept: dt < 40 ms passes).
    const echoAfterKick = (t - eng.lastBdBandT > 0.04 && t - eng.lastBdBandT < 0.16);
    if (sSd > 0 && !echoAfterKick) { eng.onsets.push({ t, id: 'sd', s: sSd }); markGrid('sd', t, sSd); }
    if (sHh > 0 && !echoAfterKick) {
      eng.onsets.push({ t, id: 'hh', s: sHh });
      eng.pendingHh.push({ t, level: eng.bandLevel.hh });
      markGrid('hhc', t, sHh);
    }
    // Closed vs open hat: if the hat band is still ringing 120 ms after the
    // onset, it was an open hat.
    for (let i = eng.pendingHh.length - 1; i >= 0; i--) {
      const p = eng.pendingHh[i];
      if (t - p.t > 0.12) {
        if (eng.bandLevel.hh > p.level * 0.5) markGrid('hho', p.t, 0.8);
        eng.pendingHh.splice(i, 1);
      }
    }
    if (sLead > 0) markGrid('vox', t, sLead);
    eng.onsets = eng.onsets.filter((o) => o.t > t - 20);

    // --- bass note, every frame (YIN on the low end) ---
    const low = taLowSlice(ordered, sr, lp, dec, 0.12, 0);
    if (low.length > 300) {
      const y = taBassYin(low, Math.min(256, low.length - 220), sr / dec, yinScratch);
      if (y.f > 28 && y.rms > 0.01) {
        const midi = Math.round(69 + 12 * Math.log2(y.f / 440));
        eng.bassMidi = clampN(midi, 21, 108);
        eng.bassNote = TA_NOTES[eng.bassMidi % 12] + (Math.floor(eng.bassMidi / 12) - 1);
        eng.bassSeen = t;
        if (eng.bpmLocked && eng.barStart >= 0) {
          const beatIdx = Math.floor(((t - eng.barStart) / (60 / eng.bpm)) % 4);
          eng._curBassBeats = eng._curBassBeats || [null, null, null, null];
          eng._curBassBeats[beatIdx] = eng.bassMidi;
        }
      }
    }

    // --- chroma (notes now) + bar accumulation (slow analyser) ---
    const chromaSrc = slowDb || freqDb;
    chromaFrom(chromaSrc, chromaMap, eng.frameChroma);
    // v0.2.6: keep a normalised copy of this frame's chroma for the x-ray
    // and the effects (chord/key already use the bar accumulation).
    {
      let cs = 0;
      for (let i = 0; i < 12; i++) cs += eng.frameChroma[i];
      eng.chromaSum = cs;
      if (cs > 1e-9) for (let i = 0; i < 12; i++) eng.chroma[i] = eng.frameChroma[i] / cs;
      else eng.chroma.fill(0);
    }
    const frameBass = new Float32Array(12);
    chromaFrom(chromaSrc, bassMap, frameBass);
    for (let i = 0; i < 12; i++) { eng.barChroma[i] += eng.frameChroma[i]; eng.barBass[i] += frameBass[i]; }
    eng.barFrames++;
    eng.tonalFrames.push({ t, c: Array.from(eng.frameChroma), b: Array.from(frameBass), e: eng.level });
    eng.tonalFrames = eng.tonalFrames.filter((f) => f.t > t - 20);

    // --- tempo: timing hypotheses over recent onsets, every 2 s ---
    if (t - eng.lastTiming > 2 && eng.onsets.length >= 6) {
      eng.lastTiming = t;
      // Candidate tempos: a coarse sweep, then refinement around a lock.
      // The offline BPM (when a file was loaded) joins as a candidate.
      // A lock needs enough hits — an early lock on sparse evidence picks
      // a wrong tempo and the ±3 refinement around it can never escape.
      const hintCands = eng.bpmHint ? [eng.bpmHint, eng.bpmHint / 2, eng.bpmHint * 2, eng.bpmHint * 1.5, eng.bpmHint / 1.5] : [];
      let bpms = [];
      const coarseDue = !eng.bpmLocked || t - eng.coarseAt > 10;
      if (coarseDue) {
        for (let b = 70; b <= 180; b += 2) bpms.push(b);
        bpms.push(...hintCands);
        eng.coarseAt = t;
      } else {
        for (let b = eng.bpm - 3; b <= eng.bpm + 3; b += 0.5) bpms.push(b);
      }
      const hyps = taTimingHypotheses(eng.onsets, eng.tonalFrames, t, bpms);
      eng.hypotheses = hyps;
      const best = hyps[0];
      const enoughHits = eng.onsets.filter((o) => o.t > t - 12).length >= 12;
      if (best && best.score > 1.5 && best.pulseSupport > 0.5 && enoughHits) {
        const isNewLock = !eng.bpmLocked;
        // A hint-locked grid (loaded file) only gives way when the live
        // evidence is much stronger than the hint tempo's own hypothesis.
        let switchTempo = false;
        if (eng.bpmLocked && Math.abs(best.bpm - eng.bpm) > 4 && best.score > 2.0) {
          switchTempo = true;
          if (eng.hintLocked) {
            const hintHyp = hyps.find((h) => Math.abs(h.bpm - eng.bpmHint) < 0.6);
            switchTempo = !!hintHyp && best.score > hintHyp.score * 1.5 && best.pulseSupport > hintHyp.pulseSupport + 0.05;
          }
        }
        if (isNewLock || switchTempo) {
          const prevBpm = eng.bpm;
          eng.bpm = best.bpm;
          eng.bpmLocked = true; eng.hintLocked = false;
          // Anchor the grid on the best hypothesis (phase + downbeat).
          const P = 60 / best.bpm;
          const anchor = best.anchor + best.down * P;
          // Keep the grid continuous: shift the anchor to just before now.
          eng._t0 = anchor + Math.floor((t - anchor) / P) * P;
          eng._P = P; eng._down = best.down;
          if (eng.barStart < 0 || Math.abs(best.bpm - prevBpm) > 2) {
            eng.barStart = eng._t0;
            eng.barLen = P * 4;
          }
        }
      }
    }

    // --- bar/step tracking on the locked grid ---
    if (eng.bpmLocked && eng.barStart >= 0) {
      const P = 60 / eng.bpm;
      const barPos = (t - eng.barStart) / (P * 4);
      const barIdx = Math.floor(barPos);
      if (barIdx > eng.bar) {
        const kicksThisBar = eng.barKicks;
        finalizeBar(t);
        eng.bar = barIdx;
        // Section: a bar with kicks on most beats after a quiet one = drop;
        // music playing with no kick for 2 bars = breakdown.
        eng.section = kicksThisBar >= 3 ? 'drop' : (t - eng.lastKick > 2 * eng.barLen && !eng.silent ? 'breakdown' : '');
        if (eng.section === 'drop') eng.lastDrop = t;
      }
      eng.step = Math.floor(((t - eng.barStart) / (P / 4)) % 16);
      eng.beatInBar = Math.floor(((t - eng.barStart) / P) % 4);
      // v0.2.6: beat/bar phase — where inside the beat (0..1) the playhead
      // sits. Scenes, ASCII and Cook use it to time their motion to the
      // grid instead of only reacting to kicks.
      eng.beatPhase = ((t - eng.barStart) / P) % 1;
      eng.barPhase = ((t - eng.barStart) / (P * 4)) % 1;
    } else {
      eng.beatPhase = -1; eng.barPhase = -1;
    }

    // --- presence (for the code panel's mutes) ---
    const present = (last, windowS = 8) => t - last < windowS;
    eng.present = {
      bd: present(eng.v.bd.lastHit.t), sd: present(eng.v.sd.lastHit.t),
      hhc: present(eng.v.hhc.lastHit.t), hho: present(eng.v.hho.lastHit.t),
      vox: present(eng.v.vox.lastHit.t), bass: present(eng.bassSeen, 6),
      chords: present(eng.chordSeen, 12),
    };
    eng.playing = (seen, windowS = 8) => t - seen < windowS;

    // --- v0.2.6: instrument presence heuristics (light path, live) ---
    // Drums ride the onset detectors; bass rides the low end; vocals ride
    // midrange energy WITH movement (a sustained pad has energy but no
    // flux, so it is not a voice); guitar/keys ride sustained harmonic
    // energy (high energy, low flux — a strum rings, it does not thump).
    {
      const meanE = (lo, hi) => { let s = 0; for (let b = lo; b <= hi; b++) s += eng.bands32[b]; return s / Math.max(1, hi - lo + 1); };
      const meanF = (lo, hi) => { let s = 0; for (let b = lo; b <= hi; b++) s += eng.bandFlux32[b]; return s / Math.max(1, hi - lo + 1); };
      const norm = (e) => clamp01((10 * Math.log10(e + 1e-12) + 70) / 70);
      const sm = (cur, target, a) => cur + (target - cur) * a;
      const I = eng.instruments;
      I.drums = sm(I.drums, clamp01(sBd + sSd + sHh), 0.35);
      I.bass = sm(I.bass, clamp01(eng.bandLevel.low * 2.2), 0.2);
      const vE = norm(meanE(14, 25)), vF = meanF(14, 25); // 300 Hz..3.4 kHz
      I.vocals = sm(I.vocals, clamp01(vE * 1.7) * clamp01(0.35 + vF * 9), 0.12);
      const gE = norm(meanE(5, 15)), gF = meanF(5, 15);   // 80 Hz..1.2 kHz
      I.guitar = sm(I.guitar, clamp01(gE * 1.9) * clamp01(1 - gF * 7), 0.12);
      const kE = norm(meanE(11, 26)), kF = meanF(11, 26); // 200 Hz..4 kHz
      I.keys = sm(I.keys, clamp01(kE * 1.6) * clamp01(1 - kF * 5), 0.12);
    }

    // --- decay ---
    eng.beat *= 0.92;
    eng.kickPulse *= 0.88;
    return eng;
  };

  eng.noteName = (midi) => TA_NOTES[midi % 12] + (Math.floor(midi / 12) - 1);
  return eng;
}
