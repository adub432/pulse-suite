'use strict';
/* Pulse Suite — depth engine (renderer side).
   Technique + models from Gather · 聚 Lite by DAO (gather.be-of-dao.com):
   monocular depth estimation, entirely local. Inference itself runs in the
   main process (onnxruntime-web under Node — no wasm-fetch problems from a
   file:// page) and the models download ON DEMAND to the app's userData
   folder on first use, never bundled into the exe:
     - FastDepth (MIT, Diana Wofk et al.) — primary, 1.6 MB, fixed 224x224
       input, served as base64 by Gather at
       gather.be-of-dao.com/depth/fastdepth.b64.txt
     - Depth Anything V2 Small (Apache 2.0, onnx-community) — fallback,
       27 MB quantized, 448 px long side, from HuggingFace.
   Gather's preprocessing is used verbatim (see main.js): ImageNet
   normalisation, FastDepth output inverted as 1/max(0.05, x).
   If no model can be fetched (offline), a heuristic pseudo-depth is used and
   labelled as such — never presented as model output. */

const depth = {
  status: null,       // { fastdepth: {cached, bytes}, dav2: {cached, bytes}, dir }
  model: 'fastdepth', // 'fastdepth' | 'dav2'
  map: null,          // Float32Array, 0..1 (near = 1), depthW x depthH
  depthW: 0, depthH: 0,
  source: null,       // 'fastdepth' | 'dav2' | 'heuristic' | null
  estimating: false, lastMs: 0, error: null,
  progress: null      // { model, received, total } while downloading
};
async function depthRefreshStatus() {
  try { depth.status = await window.pulse.depthStatus(); } catch (_) { depth.status = null; }
  return depth.status;
}
/* Ensure the chosen model is on disk; downloads it on first use. */
async function depthEnsureModel(model) {
  await depthRefreshStatus();
  const st = depth.status && depth.status[model];
  if (st && st.cached) return true;
  depth.progress = { model, received: 0, total: 0 };
  const ok = await window.pulse.depthDownload(model);
  depth.progress = null;
  await depthRefreshStatus();
  return !!ok;
}
/* Estimate depth from a source canvas. Downscales to the model input size,
   sends RGB to the main process, stores the normalised depth map. */
async function depthEstimateFromCanvas(srcCanvas, model) {
  const m = model || depth.model;
  depth.estimating = true; depth.error = null;
  try {
    const ok = await depthEnsureModel(m);
    if (!ok) throw new Error('model download failed');
    const size = m === 'dav2' ? 448 : 224;
    const off = document.createElement('canvas');
    off.width = size; off.height = size;
    const octx = off.getContext('2d', { willReadFrequently: true });
    octx.drawImage(srcCanvas, 0, 0, size, size);
    const img = octx.getImageData(0, 0, size, size).data;
    const rgb = new Uint8Array(size * size * 3);
    for (let i = 0, j = 0; i < img.length; i += 4, j += 3) { rgb[j] = img[i]; rgb[j + 1] = img[i + 1]; rgb[j + 2] = img[i + 2]; }
    const res = await window.pulse.depthEstimate({ model: m, w: size, h: size, rgb });
    if (!res || !res.depth) throw new Error('inference returned nothing');
    depth.map = res.depth; depth.depthW = res.w; depth.depthH = res.h;
    depth.source = m; depth.lastMs = res.ms;
    return depth.map;
  } catch (e) {
    depth.error = String(e && e.message || e);
    return null;
  } finally {
    depth.estimating = false;
  }
}
/* Heuristic pseudo-depth (offline fallback): near = bright + low in frame,
   smoothed. Labelled 'heuristic' everywhere it is shown. */
function depthHeuristicFromData(data, w, h) {
  const lum = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    lum[y * w + x] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
  }
  // 3x3 box blur, two passes — smooths the luminance into a depth-ish field.
  for (let pass = 0; pass < 2; pass++) {
    const src = Float32Array.from(lum);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        s += src[ny * w + nx]; n++;
      }
      lum[y * w + x] = s / n;
    }
  }
  const out = new Float32Array(w * h);
  let mn = Infinity, mx = -Infinity;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // lower in the frame reads nearer; brightness reads nearer.
    const v = lum[y * w + x] * 0.7 + (y / h) * 0.3;
    out[y * w + x] = v;
    if (v < mn) mn = v; if (v > mx) mx = v;
  }
  const span = Math.max(1e-6, mx - mn);
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - mn) / span;
  depth.map = out; depth.depthW = w; depth.depthH = h;
  depth.source = 'heuristic'; depth.lastMs = 0;
  return out;
}
/* Resample the depth map onto a cols x rows grid (for ASCII/Cook slicing). */
function depthMapForGrid(cols, rows) {
  if (!depth.map) return null;
  const out = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const sx = Math.min(depth.depthW - 1, Math.floor(x * depth.depthW / cols));
    const sy = Math.min(depth.depthH - 1, Math.floor(y * depth.depthH / rows));
    out[y * cols + x] = depth.map[sy * depth.depthW + sx];
  }
  return out;
}
/* Render the depth map itself onto a canvas (grayscale by default, heat
   when `heat` is true): near = bright/warm. */
function drawDepthMap(canvas, ctx, heat) {
  if (!depth.map) return false;
  const w = depth.depthW, h = depth.depthH;
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const heatFn = (t) => {
    if (t < 0.25) { const k = t / 0.25; return [Math.round(40 * k), 0, Math.round(10 * k)]; }
    if (t < 0.5) { const k = (t - 0.25) / 0.25; return [Math.round(40 + 215 * k), Math.round(60 * k), 10]; }
    if (t < 0.75) { const k = (t - 0.5) / 0.25; return [255, Math.round(60 + 140 * k), Math.round(10 + 40 * k)]; }
    const k = (t - 0.75) / 0.25; return [255, Math.round(200 + 55 * k), Math.round(50 + 205 * k)];
  };
  for (let i = 0; i < w * h; i++) {
    const t = depth.map[i];
    const c = heat ? heatFn(t) : [Math.round(t * 255), Math.round(t * 255), Math.round(t * 255)];
    d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return true;
}
