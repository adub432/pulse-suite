const { app, BrowserWindow, dialog, ipcMain, Menu, desktopCapturer } = require('electron');
const fs = require('fs');
const path = require('path');
const https = require('https');

let win;

/* ---------- app config (pop-out layout memory) ---------- */
const CONFIG_PATH = path.join(app.getPath('userData'), 'pulse-config.json');
let appConfig = { popouts: {} };
try { appConfig = { ...appConfig, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) }; } catch (_) {}
function saveConfig() {
  try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(appConfig, null, 2)); } catch (_) {}
}

/* ---------- renderer config (v0.2.4: theme + library folder persist) ----------
   The renderer reads/writes pulse-config.json through these two calls —
   the theme picker and the Mousiki library folder both live here. */
ipcMain.handle('config-get', async () => ({ ...appConfig }));
ipcMain.handle('config-set', async (_e, patch) => {
  appConfig = { ...appConfig, ...(patch || {}) };
  saveConfig();
  return { ...appConfig };
});

/* Window background per saved theme, so the app never flashes the wrong
   colour while the renderer loads. */
const THEME_BG = { sky: '#0b1020', midnight: '#04060f', sunset: '#1c0626', mono: '#000000' };
function themeBackground() { return THEME_BG[appConfig.theme] || '#0b1020'; }

/* ---------- depth estimation (ONNX Runtime Web, main process) ----------
   Technique + models from Gather · 聚 Lite by DAO (gather.be-of-dao.com).
   Inference runs here, in Node, so the wasm loads from disk — no file://
   fetch problems. Models download ON DEMAND to userData/models on first
   use and are never bundled into the exe:
     - fastdepth: FastDepth (MIT, Diana Wofk et al.), 1.6 MB, served as
       base64 by Gather (depth/fastdepth.b64.txt), fixed 224x224 input.
     - dav2: Depth Anything V2 Small (Apache 2.0, onnx-community),
       27 MB quantized, 448 px long side, from HuggingFace.
   Gather's preprocessing is used verbatim: ImageNet normalisation, and the
   FastDepth output is inverted (1/max(0.05, x)) — it predicts disparity. */
const DEPTH_MODELS = {
  fastdepth: {
    url: 'https://gather.be-of-dao.com/depth/fastdepth.b64.txt',
    file: 'fastdepth.onnx', b64: true, input: 224, label: 'FastDepth'
  },
  dav2: {
    url: 'https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model_quantized.onnx',
    file: 'depth-anything-v2-small-quantized.onnx', b64: false, input: 448, label: 'Depth Anything V2 Small'
  }
};
const depthDir = () => path.join(app.getPath('userData'), 'models');
const depthPath = (model) => path.join(depthDir(), DEPTH_MODELS[model].file);
let ort = null;
const depthSessions = {};
function depthModelStatus(model) {
  try {
    const st = fs.statSync(depthPath(model));
    return { cached: true, bytes: st.size };
  } catch (_) { return { cached: false, bytes: 0 }; }
}
function httpsGet(url, onData) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Pulse-Suite/0.2.4' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(httpsGet(res.headers.location, onData));
        return;
      }
      if (res.statusCode !== 200) { reject(new Error('HTTP ' + res.statusCode + ' for ' + url)); return; }
      const chunks = [];
      let received = 0;
      res.on('data', (c) => { chunks.push(c); received += c.length; if (onData) onData(received); });
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}
async function loadOrt() {
  if (!ort) {
    ort = require('onnxruntime-web');
    ort.env.wasm.numThreads = 1;
    ort.env.logLevel = 'error';
  }
  return ort;
}
ipcMain.handle('depth-status', async () => ({
  dir: depthDir(),
  fastdepth: depthModelStatus('fastdepth'),
  dav2: depthModelStatus('dav2')
}));
ipcMain.handle('depth-download', async (_e, model) => {
  const spec = DEPTH_MODELS[model];
  if (!spec) return { ok: false, error: 'unknown model ' + model };
  try {
    fs.mkdirSync(depthDir(), { recursive: true });
    const totalHint = model === 'dav2' ? 27258801 : 2247944;
    const buf = await httpsGet(spec.url, (received) => {
      win?.webContents.send('depth-download-progress', { model, received, total: totalHint });
    });
    const bytes = spec.b64 ? Buffer.from(buf.toString('utf8').trim(), 'base64') : buf;
    fs.writeFileSync(depthPath(model), bytes);
    return { ok: true, bytes: bytes.length };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
});
ipcMain.handle('depth-estimate', async (_e, { model, w, h, rgb }) => {
  const spec = DEPTH_MODELS[model] || DEPTH_MODELS.fastdepth;
  const t0 = Date.now();
  try {
    const o = await loadOrt();
    if (!depthSessions[model]) {
      if (!depthModelStatus(model).cached) return { ok: false, error: 'model not downloaded — call depth-download first' };
      depthSessions[model] = await o.InferenceSession.create(depthPath(model), {
        executionProviders: ['wasm'], graphOptimizationLevel: 'all', logSeverityLevel: 3
      });
    }
    const sess = depthSessions[model];
    // ImageNet normalisation (Gather's preprocessing, verbatim).
    const input = new Float32Array(3 * w * h);
    const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
    for (let i = 0, n = w * h; i < n; i++) {
      input[i] = (rgb[i * 3] / 255 - mean[0]) / std[0];
      input[n + i] = (rgb[i * 3 + 1] / 255 - mean[1]) / std[1];
      input[2 * n + i] = (rgb[i * 3 + 2] / 255 - mean[2]) / std[2];
    }
    const feeds = {};
    feeds[sess.inputNames[0]] = new o.Tensor('float32', input, [1, 3, h, w]);
    const out = await sess.run(feeds);
    const t = out[sess.outputNames[0]];
    const dims = t.dims;
    const ow = dims[dims.length - 1], oh = dims[dims.length - 2];
    const raw = Float32Array.from(t.data);
    // FastDepth predicts disparity: invert to depth. Then min-max normalise
    // to 0..1 (near = 1) so every consumer sees the same scale.
    if (model === 'fastdepth') for (let i = 0; i < raw.length; i++) raw[i] = 1 / Math.max(0.05, raw[i]);
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < raw.length; i++) { if (raw[i] < mn) mn = raw[i]; if (raw[i] > mx) mx = raw[i]; }
    const span = Math.max(1e-6, mx - mn);
    for (let i = 0; i < raw.length; i++) raw[i] = (raw[i] - mn) / span;
    return { ok: true, model, w: ow, h: oh, depth: raw, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
});

/* ---------- pop-out panels (live code editor + hex editor) ----------
   Each panel is a real OS window (own BrowserWindow, same preload, same
   Material/Paper Mono styling). State is relayed through the main process:
   main window -> 'popout-update' -> pop-out; pop-out -> 'popout-edit' ->
   main window. One source of truth (the main window's state), two views.
   Closing a pop-out (or Dock back) returns the panel to the main window;
   bounds + open state persist in pulse-config.json. */
const popouts = { code: null, hex: null };
function popoutFile() { return path.join(__dirname, 'src', 'popout.html'); }
function openPopout(panel) {
  if (popouts[panel]) { popouts[panel].focus(); return true; }
  const saved = (appConfig.popouts && appConfig.popouts[panel]) || {};
  const b = saved.bounds || {};
  const w = new BrowserWindow({
    width: b.width || (panel === 'code' ? 780 : 720),
    height: b.height || 620,
    x: b.x, y: b.y,
    minWidth: 480, minHeight: 380,
    backgroundColor: themeBackground(),
    title: panel === 'code' ? 'Pulse Suite — Live Code' : 'Pulse Suite — Hex Editor',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false }
  });
  popouts[panel] = w;
  w.loadFile(popoutFile(), { query: { panel } });
  w.on('closed', () => {
    popouts[panel] = null;
    appConfig.popouts[panel] = { ...(appConfig.popouts[panel] || {}), open: false };
    saveConfig();
    win?.webContents.send('popout-docked', panel); // closing = dock back
  });
  w.on('resize', savePopoutBounds);
  w.on('move', savePopoutBounds);
  appConfig.popouts[panel] = { ...(appConfig.popouts[panel] || {}), open: true };
  saveConfig();
  return true;
}
function savePopoutBounds() {
  for (const [panel, w] of Object.entries(popouts)) {
    if (!w) continue;
    try {
      const b = w.getBounds();
      appConfig.popouts[panel] = { ...(appConfig.popouts[panel] || {}), bounds: b, open: true };
    } catch (_) {}
  }
  saveConfig();
}
function closePopout(panel, silent) {
  const w = popouts[panel];
  if (!w) return false;
  if (silent) { w.removeAllListeners('closed'); }
  w.close();
  popouts[panel] = null;
  return true;
}
ipcMain.handle('popout-open', async (_e, panel) => { openPopout(panel); return true; });
ipcMain.handle('popout-close', async (_e, panel) => { closePopout(panel); return true; });
ipcMain.handle('popout-count', async () => Object.values(popouts).filter(Boolean).length);
ipcMain.on('popout-update', (_e, panel, data) => {
  const w = popouts[panel];
  if (w) w.webContents.send('popout-state', data);
});
ipcMain.on('popout-edit', (_e, panel, data) => {
  win?.webContents.send('popout-edit', panel, data);
});
ipcMain.on('popout-dock', (_e, panel) => { closePopout(panel); });


function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 900,
    minHeight: 560,
    backgroundColor: themeBackground(),
    title: 'Pulse Suite — All-in-one media studio',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  const smoke = process.argv.includes('--smoke-test');
  const demoIdx = process.argv.indexOf('--demo');
  const demo = demoIdx >= 0 ? process.argv[demoIdx + 1] : null;
  const query = smoke ? { query: { smoke: '1' } } : demo ? { query: { demo } } : undefined;
  win.loadFile(path.join(__dirname, 'src', 'index.html'), query);
  // Dev hook: --screenshot <path> [--screenshot-tab <tab>] [--screenshot-delay <ms>]
  // — captures the window and quits. Used to visually verify the UI.
  const shotIdx = process.argv.indexOf('--screenshot');
  if (shotIdx >= 0) {
    const outPath = process.argv[shotIdx + 1] || '/tmp/pulse-screenshot.png';
    const tabIdx = process.argv.indexOf('--screenshot-tab');
    const tab = tabIdx >= 0 ? process.argv[tabIdx + 1] : null;
    const delayIdx = process.argv.indexOf('--screenshot-delay');
    const delay = delayIdx >= 0 ? Number(process.argv[delayIdx + 1]) || 2600 : 2600;
    win.webContents.on('did-finish-load', () => {
      if (tab) setTimeout(() => win.webContents.send('menu-tab', tab), 600);
      setTimeout(async () => {
        try {
          const img = await win.capturePage();
          fs.writeFileSync(outPath, img.toPNG());
          console.log('screenshot saved:', outPath);
        } catch (e) { console.error('screenshot failed:', e); }
        app.quit();
      }, delay);
    });
  }
  win.on('closed', () => { win = null; });
}

app.whenReady().then(() => {
  createWindow();
  // Restore pop-out panels the user left open (layout memory).
  for (const [panel, st] of Object.entries(appConfig.popouts || {})) {
    if (st && st.open) setTimeout(() => openPopout(panel), 900);
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { label: 'Open Audio / Video…', accelerator: 'CmdOrCtrl+O', click: () => win?.webContents.send('menu-open-media') },
        { label: 'Open MIDI…', accelerator: 'CmdOrCtrl+M', click: () => win?.webContents.send('menu-open-midi') },
        { type: 'separator' },
        { label: 'Record Video', accelerator: 'CmdOrCtrl+R', click: () => win?.webContents.send('menu-record') },
        { label: 'Snapshot PNG', accelerator: 'CmdOrCtrl+S', click: () => win?.webContents.send('menu-snapshot') },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { label: 'Play', accelerator: 'CmdOrCtrl+1', click: () => win?.webContents.send('menu-tab', 'play') },
        { label: 'Visualize', accelerator: 'CmdOrCtrl+2', click: () => win?.webContents.send('menu-tab', 'visualize') },
        { label: 'Glitch', accelerator: 'CmdOrCtrl+3', click: () => win?.webContents.send('menu-tab', 'glitch') },
        { label: 'ASCII', accelerator: 'CmdOrCtrl+4', click: () => win?.webContents.send('menu-tab', 'ascii') },
        { label: 'Cut', accelerator: 'CmdOrCtrl+5', click: () => win?.webContents.send('menu-tab', 'cut') },
        { label: 'Cook', accelerator: 'CmdOrCtrl+6', click: () => win?.webContents.send('menu-tab', 'cook') },
        { label: 'Mission Control', accelerator: 'CmdOrCtrl+7', click: () => win?.webContents.send('menu-tab', 'mission') },
        { type: 'separator' },
        { label: 'Spectrum', accelerator: '1', click: () => win?.webContents.send('menu-look', 'spectrum') },
        { label: 'Scope', accelerator: '2', click: () => win?.webContents.send('menu-look', 'scope') },
        { label: 'Orbit', accelerator: '3', click: () => win?.webContents.send('menu-look', 'orbit') },
        { label: 'Piano Roll', accelerator: '4', click: () => win?.webContents.send('menu-look', 'roll') },
        { label: 'Fountain', accelerator: '5', click: () => win?.webContents.send('menu-look', 'fountain') },
        { label: 'Studio', accelerator: '6', click: () => win?.webContents.send('menu-look', 'studio') },
        { label: 'Geometric', accelerator: '7', click: () => win?.webContents.send('menu-look', 'geometric') },
        { label: 'Dither', accelerator: '8', click: () => win?.webContents.send('menu-look', 'dither') },
        { label: 'Pattern', accelerator: '9', click: () => win?.webContents.send('menu-look', 'pattern') },
        { label: 'Depth', accelerator: '0', click: () => win?.webContents.send('menu-look', 'depth') }
      ]
    },
    {
      label: 'Panels',
      submenu: [
        { label: 'Pop out Live Code editor', click: () => openPopout('code') },
        { label: 'Pop out Hex editor', click: () => openPopout('hex') }
      ]
    }
  ]));
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

const MEDIA_FILTERS = [
  { name: 'Media', extensions: ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aiff', 'aif', 'mp4', 'webm', 'mov', 'mkv', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'] },
  { name: 'Audio', extensions: ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aiff', 'aif'] },
  { name: 'Video', extensions: ['mp4', 'webm', 'mov', 'mkv'] },
  { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'] },
  { name: 'All files', extensions: ['*'] }
];

ipcMain.handle('open-media', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Open media',
    properties: ['openFile', 'multiSelections'],
    filters: MEDIA_FILTERS
  });
  if (r.canceled || !r.filePaths.length) return null;
  return r.filePaths.map((p) => ({ path: p, name: path.basename(p) }));
});

ipcMain.handle('open-midi', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Open a MIDI file (same name as the track to auto-attach)',
    properties: ['openFile'],
    filters: [
      { name: 'MIDI', extensions: ['mid', 'midi'] },
      { name: 'All files', extensions: ['*'] }
    ]
  });
  if (r.canceled || !r.filePaths.length) return null;
  return { path: r.filePaths[0], name: path.basename(r.filePaths[0]) };
});

ipcMain.handle('open-directory', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Choose a folder',
    properties: ['openDirectory']
  });
  if (r.canceled || !r.filePaths.length) return null;
  return r.filePaths[0];
});

ipcMain.handle('save-file', async (_e, defaultName, filters) => {
  const r = await dialog.showSaveDialog(win, {
    title: 'Save file',
    defaultPath: defaultName || 'pulse-output',
    filters: filters || [{ name: 'All files', extensions: ['*'] }]
  });
  return r.canceled ? null : r.filePath;
});

ipcMain.handle('save-video', async (_e, defaultName) => {
  const r = await dialog.showSaveDialog(win, {
    title: 'Save recording',
    defaultPath: defaultName || 'pulse-recording.webm',
    filters: [{ name: 'WebM video', extensions: ['webm'] }]
  });
  return r.canceled ? null : r.filePath;
});

ipcMain.handle('save-image', async (_e, defaultName) => {
  const r = await dialog.showSaveDialog(win, {
    title: 'Save snapshot',
    defaultPath: defaultName || 'pulse-snapshot.png',
    filters: [{ name: 'PNG image', extensions: ['png'] }]
  });
  return r.canceled ? null : r.filePath;
});

/* Toaster-style system audio: list capturable screens (the first one carries
   the loopback audio stream on Windows/macOS). On Linux there is no loopback
   source, so the renderer reports that honestly instead of faking it. */
ipcMain.handle('get-system-audio-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    return sources.map((s) => ({ id: s.id, name: s.name }));
  } catch (e) {
    return { error: String(e && e.message || e) };
  }
});
