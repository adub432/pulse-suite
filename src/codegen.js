'use strict';
/* ============================================================================
   Pulse Suite — live Strudel code generation (ported from Toaster)
   ----------------------------------------------------------------------------
   Adapted from Toaster's renderer/codegen.js (MIT, (c) 2026 Colin —
   github.com/StopBanning/toaster; see THIRD-PARTY-NOTICES.md). Writes what the
   analysis engine hears as Strudel code, the way it's performed live: named
   lines (kick:, clap:, hhc:, hho:, bassline:, chords:, vox:), mini-notation
   with ! for repeats, and knob numbers. Adapted to Pulse Suite's analysis
   state (src/analysis.js): 4-bar slots, 16-step voice grids, presence flags.
   Toaster's calm() bar-by-bar stabiliser is kept — the code on screen changes
   more calmly than the patterns learned, so a ghost note doesn't rewrite the
   line every bar.
   ========================================================================== */

// Pitch class only until register detection exists; all export writers use C4 as zero.
const CG_MELODY_OCTAVE = 4;

// 16 steps of tokens (null = rest) as mini-notation, as compact as the pattern allows.
function cgStepParts(tok) {
  if (!tok.some((x) => x !== null)) return null;
  let p = 16;
  for (const cand of [4, 8]) if (tok.every((x, s) => x === tok[s % cand])) { p = cand; break; }
  let r = 1;
  for (const cand of [4, 2]) if (cand <= p && tok.every((x, s) => x === null || s % cand === 0)) { r = cand; break; }
  const n = p / r, reps = 16 / p;
  const toks = Array.from({ length: n }, (_, i) => tok[i * r] ?? '~');
  const stepsOf = (i) => Array.from({ length: reps }, (_, k) => i * r + k * p);
  const parts = [];
  const sep = () => parts.length && parts.push({ text: ' ' });
  if (toks.every((x) => x === toks[0] && x !== '~')) {
    const all = [];
    for (let s = 0; s < 16; s++) if (tok[s] !== null) all.push(s);
    parts.push({ text: toks[0], steps: all });
    if (all.length > 1) parts.push({ text: '*' + all.length });
  } else if (reps === 2 && n <= 4) {
    for (let k = 0; k < 2; k++) toks.forEach((tk, i) => { sep(); parts.push({ text: tk, steps: tk === '~' ? null : [i * r + k * p] }); });
  } else if (reps > 1) {
    parts.push({ text: '[' });
    toks.forEach((tk, i) => { if (i) parts.push({ text: ' ' }); parts.push({ text: tk, steps: tk === '~' ? null : stepsOf(i) }); });
    parts.push({ text: ']*' + reps });
  } else if (r === 1) {
    for (let b = 0; b < 4; b++) {
      sep();
      parts.push({ text: '[' });
      for (let i = 0; i < 4; i++) {
        const s = b * 4 + i;
        if (i) parts.push({ text: ' ' });
        parts.push({ text: tok[s] ?? '~', steps: tok[s] === null ? null : [s] });
      }
      parts.push({ text: ']' });
    }
  } else {
    toks.forEach((tk, i) => { sep(); parts.push({ text: tk, steps: tk === '~' ? null : [i * r] }); });
  }
  return parts;
}

// Four bars of values as <a b c d>, writing repeats with ! (<e2!2 c2 d2>).
function cgSlotParts(values) {
  if (!values.some(Boolean)) return null;
  if (values.every((x) => x === values[0])) return [{ text: values[0], slots: [0, 1, 2, 3] }];
  const parts = [{ text: '<' }];
  for (let i = 0; i < 4;) {
    let j = i + 1;
    while (j < 4 && values[j] === values[i]) j++;
    if (parts.length > 1) parts.push({ text: ' ' });
    const slots = Array.from({ length: j - i }, (_, k) => i + k);
    parts.push({ text: (values[i] || '~') + (j - i > 1 ? '!' + (j - i) : ''), slots: values[i] ? slots : null });
    i = j;
  }
  parts.push({ text: '>' });
  return parts;
}

// A bar's bass notes by the beat (4 MIDI notes, null where there's none) as
// runs of one note, [{ m, beats }], each held till the next.
function cgBeatRuns(beats) {
  if (!beats?.some((m) => m !== null)) return null;
  const runs = [];
  let cur = beats.find((m) => m !== null);
  beats.forEach((m, k) => {
    if (m !== null) cur = m;
    const last = runs[runs.length - 1];
    if (last?.m === cur) last.beats.push(k);
    else runs.push({ m: cur, beats: [k] });
  });
  return runs;
}
const cgRunWeight = (runs, r) => (runs.every((x) => x.beats.length === runs[0].beats.length) || r.beats.length === 1 ? '' : '@' + r.beats.length);

// The bass line's notes for the 4 bars: each bar's note, or where the bass
// moves within the bar its notes by the beat.
function cgBassParts(eng) {
  const name = (m) => TA_NOTES[m % 12].toLowerCase() + (Math.floor(m / 12) - 1);
  const bars = eng.slots.map((s, slot) => {
    const runs = cgBeatRuns(eng.bassBeats?.[slot]);
    if (!runs) return s?.bass ? [{ name: s.bass, beats: null }] : null;
    return runs.length === 1 ? [{ name: name(runs[0].m), beats: null }] : runs.map((r) => ({ name: name(r.m), beats: r.beats, w: cgRunWeight(runs, r) }));
  });
  if (!bars.some(Boolean)) return null;
  const text = (b) => (!b ? '~' : b.length === 1 ? b[0].name : '[' + b.map((r) => r.name + r.w).join(' ') + ']');
  const texts = bars.map(text);
  const barParts = (b, slots) => {
    if (!b) return [{ text: '~' }];
    if (b.length === 1) return [{ text: b[0].name, slots }];
    const out = [{ text: '[' }];
    b.forEach((r, i) => {
      if (i) out.push({ text: ' ' });
      out.push({ text: r.name, slots, beats: r.beats });
      if (r.w) out.push({ text: r.w });
    });
    out.push({ text: ']' });
    return out;
  };
  if (texts.every((x) => x === texts[0])) return barParts(bars[0], [0, 1, 2, 3]);
  if (texts[0] === texts[2] && texts[1] === texts[3]) return [{ text: '<' }, ...barParts(bars[0], [0, 2]), { text: ' ' }, ...barParts(bars[1], [1, 3]), { text: '>' }];
  const parts = [{ text: '<' }];
  for (let i = 0; i < 4;) {
    let j = i + 1;
    while (j < 4 && texts[j] === texts[i]) j++;
    if (parts.length > 1) parts.push({ text: ' ' });
    parts.push(...barParts(bars[i], Array.from({ length: j - i }, (_, k) => i + k)));
    if (j - i > 1) parts.push({ text: '!' + (j - i) });
    i = j;
  }
  parts.push({ text: '>' });
  return parts;
}

function cgIdent(name) {
  const words = String(name || '').normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).filter(Boolean);
  const id = words.map((w) => w[0].toUpperCase() + w.slice(1)).join('');
  return !id ? 'Unknown' : /^\p{N}/u.test(id) ? '_' + id : id;
}
function cgCleanTitle(title) {
  const t = String(title || '')
    .replace(/\p{Extended_Pictographic}|\uFE0F|\u200D/gu, ' ')
    .replace(/["\\]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > 44 ? t.slice(0, 43).trimEnd() + '…' : t || 'untitled';
}
const cgFmt = (x) => String(+x.toFixed(1)).replace(/^0\./, '.');
const cgSlider = (v, lo, hi) => ({ text: `slider(${v}, ${lo}, ${hi})`, slider: [lo, hi] });
// A bass whose filter sweeps on the 8ths, triplets or 16ths as Strudel's
// filter LFO, locked to the bar. '' for none.
const cgWobble = (rate) => (rate ? `.lpsync(${rate * 4}).lpdepth(3).lpq(6).distort(.8)` : '');

const CG_DRUMS = {
  bd: { label: 'kick', token: 'bd', tail: (k, eng) => '.bank("RolandTR909")' + (eng.ducking ? `.duck("2:3").duckdepth(${cgFmt(eng.duckDepth || 0.5)})` : '') },
  sd: { label: 'clap', token: 'cp', tail: () => '.bank("RolandTR909").room(.2)' },
  hhc: { label: 'hhc', token: 'hh', tail: (k) => `.bank("RolandTR909").gain(${cgFmt(k.hhGain)})` },
  hho: { label: 'hho', token: 'oh', tail: () => '.bank("RolandTR909").gain(.4)' },
};
const cgLastBody = {};
const cgWritten = {};
// The code's drum lines change more calmly than the patterns learned: a
// pattern a step or two off the one written is written once it has held two
// more bars; a bigger change (a new section) at once.
function cgCalm(id, on, bar, turned = 0, four = false, here = true) {
  if (!on || bar === null || bar === undefined) return on;
  const w = cgWritten[id];
  if (!w) { cgWritten[id] = { on: on.slice(), cand: null, since: 0, bar, bars: 0, turned, muted: !here }; return on; }
  if (!here) { w.muted = true; w.cand = null; }
  if (bar !== w.bar) { w.bar = bar; w.bars++; }
  if (turned !== w.turned) {
    const old = w.on.slice(), d = turned - w.turned;
    for (let s = 0; s < 16; s++) w.on[(((s - d) % 16) + 16) % 16] = old[s];
    w.turned = turned; w.cand = null;
  }
  const diff = on.reduce((n, x, s) => n + (x !== w.on[s]), 0);
  if (diff === 0) { w.cand = null; if (here) w.muted = false; }
  else if (diff > 2 || four || (here && w.muted)) { w.on = on.slice(); w.cand = null; w.muted = false; }
  else {
    const key = on.join();
    if (w.cand !== key) { w.cand = key; w.since = w.bars; }
    else if (w.bars - w.since >= 2) { w.on = on.slice(); w.cand = null; }
  }
  return w.on;
}

const CG_LINE_IDS = ['title', 'tempo', 'scale', 'scene', 'bd', 'sd', 'hhc', 'hho', 'bassline', 'chords', 'vox'];

function cgBuildLines(eng, meta, t) {
  const out = {};
  const plain = (text) => [{ text }];
  const T = { locked: eng.bpmLocked, bpm: eng.bpm, shown: Math.round(eng.bpm) || 0 };
  const song = meta.song;
  out.title = plain(song?.title ? `x = x.${cgIdent(song.artist || song.app)}("${cgCleanTitle(song.title)}")` : `// listening: ${meta.source || '...'}`);
  const barLen = T.locked ? 240 / T.bpm : 0;
  const section = !T.locked || eng.silent ? '' : t - eng.lastDrop < 4 * barLen ? 'drop' : t - eng.lastKick > 2 * barLen ? 'breakdown' : '';
  out.tempo = plain(T.locked ? `setcpm(${T.shown}/4)${section ? '  // ' + section : ''}` : eng.silent ? '// waiting for sound...' : '// setcpm(?)  finding the beat...');
  out.scale = plain(eng.key ? `const scale = "${TA_NOTES[eng.key.root]}:${eng.key.mode}"` : '// const scale = "?"');
  // The scene line (v0.2.3, Toaster model): the Visualize scene as live
  // Strudel-style code, composed by the app from the same state the
  // renderers read — scene + layer stack + audio-reactive numbers that
  // breathe with the kick/bass while the track plays. Passed in via meta.
  out.scene = plain(meta.scene || '// scene: —');

  const k = eng.knobs || { bassLpf: 600, chordLpf: 2400, hhGain: 0.5 };
  for (const id of ['bd', 'sd', 'hhc', 'hho']) {
    const d = CG_DRUMS[id], here = eng.present[id];
    const on = cgCalm(id, eng.v[id]?.shown, eng.bar, eng.v[id]?.turned || 0, eng.v[id]?.four || eng.v[id]?.back, here);
    const body = here && on ? cgStepParts(on.map((x) => (x ? d.token : null))) : null;
    if (body) {
      cgLastBody[id] = body.map((p) => p.text).join('');
      out[id] = [{ text: `${d.label}: s("` }, ...body, { text: '")' + d.tail(k, eng) }];
    } else {
      const text = `${d.label}: s("${cgLastBody[id] || d.token}")` + d.tail(k, eng);
      out[id] = plain(cgLastBody[id] ? '_' + text : '// ' + text);
    }
  }

  const vox = eng.v.vox;
  const voxBody = eng.present.vox && vox?.shown ? cgStepParts(vox.shown.map((x, s) => (x ? '0' : null))) : null;
  if (voxBody) {
    cgLastBody.vox = voxBody.map((p) => p.text).join('');
    out.vox = [{ text: 'vox: s("vox").slice(16, "' }, ...voxBody, { text: '").clip(1)' }];
  } else {
    const text = `vox: s("vox").slice(16, "${cgLastBody.vox || '0'}").clip(1)`;
    out.vox = plain(cgLastBody.vox ? '_' + text : '// ' + text);
  }

  const line = (head, parts, tail) => [{ text: head }, ...parts, { text: tail }];
  const bass = cgBassParts(eng);
  const chords = cgSlotParts(eng.slots.map((s) => s?.chord?.name || null));
  const rv = eng.v.bass, onSteps = rv?.shown && eng.present.bass ? rv.shown.map((x) => (x ? 'x' : null)) : null;
  const rhythm = onSteps && onSteps.some((x, s) => x && s) ? cgStepParts(onSteps) : null;
  const struct = rhythm ? [{ text: '").struct("' }, ...rhythm, { text: '")' }] : [{ text: '")' }];
  const orbit = (n) => (eng.ducking ? [{ text: `.orbit(${n})` }] : []);
  out.bassline = bass ? [{ text: 'bassline: note("' }, ...bass, ...struct, { text: '.s("sawtooth").lpf(' }, cgSlider(k.bassLpf, 100, 4000), { text: ')' + cgWobble(eng.bassSound?.wobble) }, ...orbit(2)] : plain('bassline: note("~").s("sawtooth")');
  out.chords = chords ? [...line('chords: chord("', chords, '").voicing().s("supersaw").lpf('), cgSlider(k.chordLpf, 200, 9000), { text: ')' }, ...orbit(3)] : plain('chords: chord("~").voicing()');
  const text = (parts) => parts.map((p) => p.text).join('');
  if (!bass) out.bassline = plain('// ' + text(out.bassline));
  else if (!eng.playing(eng.bassSeen)) out.bassline = plain('_' + text(out.bassline));
  if (!chords) out.chords = plain('// ' + text(out.chords));
  else if (!eng.playing(eng.chordSeen)) out.chords = plain('_' + text(out.chords));
  if (meta.hushed) {
    for (const id of ['bd', 'sd', 'hhc', 'hho', 'bassline', 'chords', 'vox']) {
      const s = text(out[id]);
      if (!s.startsWith('//') && !s.startsWith('_')) out[id] = plain('_' + s);
    }
  }
  return out;
}

function cgReset() {
  for (const key of Object.keys(cgLastBody)) delete cgLastBody[key];
  for (const key of Object.keys(cgWritten)) delete cgWritten[key];
}

// The code on screen as a Strudel program to play and change at strudel.cc.
function cgStrudelProgram(texts, song, phase = 0) {
  const about = song?.title ? `"${cgCleanTitle(song.title)}"${song.artist ? ' by ' + song.artist : ''}` : 'whatever was playing';
  const out = [`// ${about}, written out by pulse suite`, '// ctrl+enter plays it, ctrl+. stops'];
  for (const id of CG_LINE_IDS) {
    let line = (texts[id] || '').trim();
    if (!line) continue;
    if (id === 'bd' || id === 'bassline') out.push('');
    if (id === 'title') { out.push(line.startsWith('//') ? line : '// ' + line); continue; }
    const vox = id === 'vox' && line.match(/^(\/\/ |_)?vox: s\("vox"\)\.slice\(16, "([^"]*)"\)\.clip\(1\)$/);
    if (vox) {
      const notes = vox[2].replace(/(?<![*!/@:.\d])\b(\d{1,2})\b/g, (n) => TA_NOTES[+n % 12].toLowerCase() + CG_MELODY_OCTAVE);
      out.push(`// vox: s("vox").slice(16, "${vox[2]}").clip(1)   <- with a vocal sample loaded`);
      out.push(`${vox[1] || ''}vox: note("${notes}").s("triangle").clip(1)`);
      continue;
    }
    out.push(line);
  }
  out.push('', "// everything that's playing as a punchcard under the code", `all(x => x.${phase ? `early(${phase}).` : ''}_punchcard())`);
  return out.join('\n') + '\n';
}

// A strudel.cc link that opens with the code in its editor (the REPL reads
// the code, UTF-8 in base64, from after the #).
function cgStrudelLink(code) {
  let bin = '';
  for (const b of new TextEncoder().encode(code)) bin += String.fromCharCode(b);
  return 'https://strudel.cc/#' + encodeURIComponent(btoa(bin));
}
