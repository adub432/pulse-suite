const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Midi } = require('@tonejs/midi');

/* ---------- glitch lab: real byte-level corruption on a temp copy ----------
   The original file is never touched. All corruption ops run against a copy
   in the OS temp dir. Seeded RNG (mulberry32) makes every corruption
   reproducible: same file + same ops + same seed = same bytes. */
const GLITCH_DIR = path.join(os.tmpdir(), 'pulse-suite-glitch');
try { fs.mkdirSync(GLITCH_DIR, { recursive: true }); } catch (_) {}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Magic-byte sniffing for the structure pane (format-aware glitching). */
const MAGIC = [
  { sig: [0x89, 0x50, 0x4E, 0x47], type: 'PNG image', header: 8, note: 'Signature 8 bytes; IHDR chunk follows. Corrupt IDAT payload, protect signature + IHDR.' },
  { sig: [0xFF, 0xD8, 0xFF], type: 'JPEG image', header: 2, note: 'SOI marker + segments. Corrupt scan data, protect markers.' },
  { sig: [0x47, 0x49, 0x46, 0x38], type: 'GIF image', header: 13, note: 'Header + logical screen descriptor (13 bytes). Corrupt image data after it.' },
  { sig: [0x52, 0x49, 0x46, 0x46], type: 'RIFF (WAV/AVI/WebP)', header: 44, note: 'RIFF header. For WAV, 44-byte header; corrupt PCM data after it.' },
  { sig: [0x49, 0x44, 0x33], type: 'MP3 with ID3 tag', header: 0, note: 'ID3v2 tag up front; audio frames follow. Protect the tag if you want metadata intact.' },
  { sig: [0xFF, 0xFB], type: 'MP3 frame', header: 0, note: 'Raw MP3 frame sync. Corrupt frame payload bytes.' },
  { sig: [0x66, 0x74, 0x79, 0x70], type: 'MP4/MOV (ftyp)', header: 0, offset: 4, note: 'ftyp box at offset 4. Protect the moov box; corrupt mdat payload.' },
  { sig: [0x1A, 0x45, 0xDF, 0xA3], type: 'WebM/MKV (EBML)', header: 0, note: 'EBML header. Corrupt cluster payload, protect the header.' },
  { sig: [0x25, 0x50, 0x44, 0x46], type: 'PDF', header: 0, note: 'PDF header. Corrupt stream objects, protect the xref table.' },
  { sig: [0x50, 0x4B, 0x03, 0x04], type: 'ZIP archive', header: 0, note: 'ZIP local file header. Corrupt compressed data, protect central directory.' }
];

function detectFormat(buf) {
  for (const m of MAGIC) {
    const off = m.offset || 0;
    if (buf.length < off + m.sig.length) continue;
    if (m.sig.every((b, i) => buf[off + i] === b)) {
      return { type: m.type, headerBytes: m.header, note: m.note };
    }
  }
  return { type: 'Unknown / raw binary', headerBytes: 0, note: 'No known magic bytes. Corrupt anywhere — nothing to protect.' };
}

contextBridge.exposeInMainWorld('pulse', {
  /* --- environment --- */
  platform: process.platform,

  /* --- app config (v0.2.4: theme + library folder persist) --- */
  getConfig: () => ipcRenderer.invoke('config-get'),
  setConfig: (patch) => ipcRenderer.invoke('config-set', patch),

  /* --- file dialogs --- */
  openMedia: () => ipcRenderer.invoke('open-media'),
  openAudio: () => ipcRenderer.invoke('open-media'),
  openMidi: () => ipcRenderer.invoke('open-midi'),
  openDirectory: () => ipcRenderer.invoke('open-directory'),
  saveFile: (name, filters) => ipcRenderer.invoke('save-file', name, filters),
  saveVideo: (name) => ipcRenderer.invoke('save-video', name),
  saveImage: (name) => ipcRenderer.invoke('save-image', name),
  systemAudioSources: () => ipcRenderer.invoke('get-system-audio-sources'),

  /* --- raw file IO --- */
  readFile: (filePath) => fs.promises.readFile(filePath),
  readAsset: async (rel) => fs.promises.readFile(path.join(__dirname, 'src', 'assets', rel)),
  writeFile: (filePath, data) => fs.promises.writeFile(filePath, Buffer.from(data)),
  fileExists: async (filePath) => { try { await fs.promises.access(filePath); return true; } catch (_) { return false; } },
  listDir: async (dirPath) => {
    const names = await fs.promises.readdir(dirPath);
    const out = [];
    for (const n of names) {
      const p = path.join(dirPath, n);
      try {
        const st = await fs.promises.stat(p);
        if (st.isFile()) out.push({ path: p, name: n, size: st.size });
      } catch (_) {}
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },
  fileUrl: (filePath) => 'file:///' + filePath.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/'),

  findSibling: async (filePath, exts) => {
    const dir = path.dirname(filePath);
    const base = path.basename(filePath).replace(/\.[^.]+$/, '');
    for (const ext of exts) {
      const cand = path.join(dir, base + ext);
      try { await fs.promises.access(cand); return { path: cand, name: base + ext }; } catch (_) {}
    }
    return null;
  },
  findSiblingMidi: async (audioPath) => {
    const dir = path.dirname(audioPath);
    const base = path.basename(audioPath).replace(/\.[^.]+$/, '');
    for (const ext of ['.mid', '.midi', '.MID', '.MIDI']) {
      const cand = path.join(dir, base + ext);
      try { await fs.promises.access(cand); return { path: cand, name: base + ext }; } catch (_) {}
    }
    return null;
  },

  parseMidi: async (filePath) => {
    const buf = await fs.promises.readFile(filePath);
    const midi = new Midi(buf);
    const notes = [];
    midi.tracks.forEach((track, ti) => {
      track.notes.forEach((n) => {
        notes.push({ track: ti, name: track.name || `Track ${ti + 1}`, midi: n.midi, time: n.time, duration: n.duration, velocity: n.velocity });
      });
    });
    notes.sort((a, b) => a.time - b.time);
    return { name: midi.name || '', duration: midi.duration, notes };
  },

  /* --- glitch lab --- */
  glitchOpen: async (filePath) => {
    const name = path.basename(filePath);
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    const tempPath = path.join(GLITCH_DIR, `${base}.glitch${ext}`);
    await fs.promises.copyFile(filePath, tempPath);
    const buf = await fs.promises.readFile(tempPath);
    const head = buf.subarray(0, Math.min(64, buf.length));
    return {
      originalPath: filePath, tempPath, name, size: buf.length,
      format: detectFormat(head)
    };
  },
  glitchRead: async (tempPath, offset, length) => {
    const fh = await fs.promises.open(tempPath, 'r');
    try {
      const buf = Buffer.alloc(length);
      const { bytesRead } = await fh.read(buf, 0, length, offset);
      return { bytes: new Uint8Array(buf.subarray(0, bytesRead)), offset, size: (await fh.stat()).size };
    } finally { await fh.close(); }
  },
  glitchCorrupt: async (tempPath, opts) => {
    const { ranges, ops, intensity, seed, protectHeader } = opts;
    const buf = await fs.promises.readFile(tempPath);
    const rng = mulberry32(seed >>> 0);
    const safeFrom = Math.max(0, protectHeader || 0);
    let changed = 0;
    const opList = (ops && ops.length) ? ops : ['randomize'];
    for (const r of ranges) {
      const s = Math.max(r.start, safeFrom, 0);
      const e = Math.min(r.end, buf.length);
      for (let i = s; i < e; i++) {
        if (rng() >= intensity) continue;
        const op = opList[Math.floor(rng() * opList.length)];
        if (op === 'randomize') buf[i] = Math.floor(rng() * 256);
        else if (op === 'zero') buf[i] = 0;
        else if (op === 'bitshift') buf[i] = (rng() < 0.5 ? (buf[i] << 1) : (buf[i] >> 1)) & 0xFF;
        else if (op === 'invert') buf[i] = 0xFF - buf[i];
        else if (op === 'swap') { if (i + 1 < e) { const t = buf[i]; buf[i] = buf[i + 1]; buf[i + 1] = t; i++; } }
        else if (op === 'repeat') { const back = 1 + Math.floor(rng() * 64); buf[i] = buf[Math.max(0, i - back)]; }
        changed++;
      }
    }
    await fs.promises.writeFile(tempPath, buf);
    return { changed, size: buf.length, seed: seed >>> 0 };
  },
  glitchReset: async (tempPath, originalPath) => {
    await fs.promises.copyFile(originalPath, tempPath);
    const st = await fs.promises.stat(tempPath);
    return { size: st.size };
  },
  glitchExport: async (tempPath, defaultName) => {
    const out = await ipcRenderer.invoke('save-file', defaultName, [{ name: 'All files', extensions: ['*'] }]);
    if (!out) return null;
    await fs.promises.copyFile(tempPath, out);
    return out;
  },
  /* Write one byte of the working copy (hand edits in the hex editor). */
  glitchWriteByte: async (tempPath, offset, value) => {
    const fh = await fs.promises.open(tempPath, 'r+');
    try {
      await fh.write(Buffer.from([value & 0xFF]), 0, 1, offset);
      return { ok: true };
    } finally { await fh.close(); }
  },

  /* --- depth estimation (Gather technique; ONNX in the main process) --- */
  depthStatus: () => ipcRenderer.invoke('depth-status'),
  depthDownload: (model) => ipcRenderer.invoke('depth-download', model),
  depthEstimate: (req) => ipcRenderer.invoke('depth-estimate', req),
  onDepthProgress: (fn) => ipcRenderer.on('depth-download-progress', (_e, d) => fn(d)),

  /* --- pop-out panels (live code editor + hex editor) --- */
  popoutOpen: (panel) => ipcRenderer.invoke('popout-open', panel),
  popoutClose: (panel) => ipcRenderer.invoke('popout-close', panel),
  popoutCount: () => ipcRenderer.invoke('popout-count'),
  popoutDock: (panel) => ipcRenderer.send('popout-dock', panel),
  popoutSend: (panel, data) => ipcRenderer.send('popout-update', panel, data),
  popoutSendEdit: (panel, data) => ipcRenderer.send('popout-edit', panel, data),
  onPopoutState: (fn) => ipcRenderer.on('popout-state', (_e, data) => fn(data)),
  onPopoutEdit: (fn) => ipcRenderer.on('popout-edit', (_e, panel, data) => fn(panel, data)),

  onMenu: (channel, fn) => ipcRenderer.on(channel, (_e, ...args) => fn(...args))
});
