// Regenerate /tmp/pulse-test/tone.wav (+ tone2.wav, v0.2.4) — 8 s drum+bass.
// tone.wav: 120 BPM, A1/F1/C2/G1. tone2.wav: 100 BPM, E1/G1/A1/B1 — a
// different track for the single-engine smoke test (second load must
// stop the first). (The original fixtures were lost when /tmp was
// cleared by a VM restart.)
const fs = require('fs');
const SR = 44100, DUR = 8, N = SR * DUR;
let out = new Float32Array(N);
let BPM = 120, BEAT = 60 / BPM; // 0.5 s

function addKick(t0) {
  const len = Math.floor(0.22 * SR);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const env = Math.exp(-t * 28);
    out[Math.floor(t0 * SR) + i] += Math.sin(2 * Math.PI * 55 * t) * env * 0.9;
    if (i < 400) out[Math.floor(t0 * SR) + i] += (Math.random() * 2 - 1) * 0.5 * (1 - i / 400); // click
  }
}
function addSnare(t0) {
  const len = Math.floor(0.16 * SR);
  for (let i = 0; i < len; i++) {
    const t = i / SR, idx = Math.floor(t0 * SR) + i;
    const env = Math.exp(-t * 30);
    out[idx] += (Math.random() * 2 - 1) * env * 0.45 + Math.sin(2 * Math.PI * 180 * t) * env * 0.3;
  }
}
function addHat(t0, loud) {
  const len = Math.floor(0.05 * SR);
  for (let i = 0; i < len; i++) {
    const t = i / SR, idx = Math.floor(t0 * SR) + i;
    out[idx] += (Math.random() * 2 - 1) * Math.exp(-t * 90) * (loud ? 0.25 : 0.14);
  }
}
function addBass(t0, freq, dur) {
  const len = Math.floor(dur * SR);
  for (let i = 0; i < len; i++) {
    const t = i / SR, idx = Math.floor(t0 * SR) + i;
    out[idx] += Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 1.2) * 0.4;
  }
}
function renderTrack(bpm, bassNotes, file) {
  out = new Float32Array(N);
  BPM = bpm; BEAT = 60 / BPM;
  for (let bar = 0; bar < 4; bar++) {
    const t0 = bar * 2;
    addBass(t0, bassNotes[bar], 2);
    for (let b = 0; b < 4; b++) addKick(t0 + b * BEAT);
    addSnare(t0 + BEAT); addSnare(t0 + 3 * BEAT);
    for (let h = 0; h < 8; h++) addHat(t0 + h * BEAT / 2, h % 2 === 0);
  }
  // Normalise to 0.8 peak, write 16-bit mono WAV.
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  const g = 0.8 / peak;
  const data = Buffer.alloc(N * 2);
  for (let i = 0; i < N; i++) data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(out[i] * g * 32767))), i * 2);
  const hdr = Buffer.alloc(44);
  hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + data.length, 4); hdr.write('WAVE', 8);
  hdr.write('fmt ', 12); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(1, 22);
  hdr.writeUInt32LE(SR, 24); hdr.writeUInt32LE(SR * 2, 28); hdr.writeUInt16LE(2, 32); hdr.writeUInt16LE(16, 34);
  hdr.write('data', 36); hdr.writeUInt32LE(data.length, 40);
  fs.mkdirSync('/tmp/pulse-test', { recursive: true });
  fs.writeFileSync('/tmp/pulse-test/' + file, Buffer.concat([hdr, data]));
  console.log(file + ' written, ' + bpm + ' BPM, peak', peak.toFixed(3), 'bytes', 44 + data.length);
}
renderTrack(120, [55, 43.65, 65.41, 49], 'tone.wav'); // A1 F1 C2 G1
renderTrack(100, [41.2, 49, 55, 61.74], 'tone2.wav'); // E1 G1 A1 B1
