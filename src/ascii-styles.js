'use strict';
/* Pulse Suite — ASCII style library.
   Rebuilt from scratch in this engine (inspiration only from ASCII Magic's
   public style list — no code, assets, or branding copied). Every style
   renders locally in real time from a sampled frame (Uint8ClampedArray RGBA
   at cols x rows) onto a canvas, and every style takes an audio-reactive
   packet `ar` {kick, bass, level} so the beat/bass/dynamics can modulate the
   parameters live — the thing ASCII Magic does NOT do.

   Style renderer signature:
     fn(canvas, ctx, data, cols, rows, opts)
   opts: { palette (name), ditherAlgo, ramp, color (bool), invert (bool),
           contrast (0..2), density (0..1), cellW, cellH, tileShape,
           ar, depthMap (Float32Array cols*rows 0..1, near=1), depthSlice (bool) }
   Renderers size their own canvas from cols/rows/cellW/cellH. */

/* ---------- palettes (1-bit, Game Boy, PICO-8, C64, risograph, custom) ---------- */
const ASCII_PALETTES = {
  bw: { label: '1-bit B&W', colors: [[0, 0, 0], [255, 255, 255]] },
  gameboy: { label: 'Game Boy green', colors: [[15, 56, 15], [48, 98, 48], [139, 172, 15], [155, 188, 15]] },
  pico8: {
    label: 'PICO-8', colors: [
      [0, 0, 0], [29, 43, 83], [126, 37, 83], [0, 135, 81], [171, 82, 54], [95, 87, 79],
      [194, 195, 199], [255, 241, 232], [255, 0, 77], [255, 163, 0], [255, 236, 39], [0, 228, 54],
      [41, 173, 255], [131, 118, 156], [255, 119, 168], [255, 204, 170]
    ]
  },
  c64: {
    label: 'Commodore 64', colors: [
      [0, 0, 0], [255, 255, 255], [136, 0, 0], [170, 255, 238], [204, 68, 204], [0, 204, 85],
      [0, 0, 170], [238, 238, 119], [221, 136, 85], [102, 68, 0], [255, 119, 119], [51, 51, 51],
      [119, 119, 119], [170, 255, 102], [0, 136, 255], [187, 187, 187]
    ]
  },
  riso: {
    label: 'Risograph inks', colors: [
      [0, 0, 0], [255, 255, 255], [255, 72, 88], [0, 120, 215],
      [255, 180, 0], [0, 169, 144], [118, 91, 167]
    ]
  },
  custom: { label: 'Custom', colors: [[0, 0, 0], [40, 40, 60], [125, 211, 252], [255, 255, 255]] }
};
/* Nearest palette colour, luminance-weighted distance. */
function nearestPaletteColor(r, g, b, colors) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < colors.length; i++) {
    const c = colors[i];
    const dr = r - c[0], dg = g - c[1], db = b - c[2];
    const d = dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}
function paletteColor(paletteName, idx) {
  const p = ASCII_PALETTES[paletteName] || ASCII_PALETTES.bw;
  return p.colors[idx % p.colors.length];
}

/* ---------- dither algorithms ----------
   Error-diffusion kernels as [dx, dy, weight] with a divisor (classic
   published kernels: Floyd–Steinberg, Atkinson, Burkes, Stucki, Sierra,
   Sierra two-row, Sierra lite), plus ordered Bayer matrices 2/4/8 and a
   halftone threshold. */
const DITHER_KERNELS = {
  'floyd-steinberg': { label: 'Floyd–Steinberg', div: 16, m: [[1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1]] },
  'atkinson': { label: 'Atkinson', div: 8, m: [[1, 0, 1], [2, 0, 1], [-1, 1, 1], [0, 1, 1], [1, 1, 1], [0, 2, 1]] },
  'burkes': { label: 'Burkes', div: 32, m: [[1, 0, 8], [2, 0, 4], [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2]] },
  'stucki': { label: 'Stucki', div: 42, m: [[1, 0, 8], [2, 0, 4], [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2], [-2, 2, 1], [-1, 2, 2], [0, 2, 4], [1, 2, 2], [2, 2, 1]] },
  'sierra': { label: 'Sierra', div: 32, m: [[1, 0, 5], [2, 0, 3], [-2, 1, 2], [-1, 1, 4], [0, 1, 5], [1, 1, 4], [2, 1, 2], [-1, 2, 2], [0, 2, 3], [1, 2, 2]] },
  'sierra2': { label: 'Sierra two-row', div: 16, m: [[1, 0, 4], [2, 0, 3], [-2, 1, 1], [-1, 1, 2], [0, 1, 3], [1, 1, 2], [2, 1, 1]] },
  'sierra-lite': { label: 'Sierra lite', div: 4, m: [[1, 0, 2], [-1, 1, 1], [0, 1, 1]] }
};
const BAYER = {
  2: [[0, 2], [3, 1]],
  4: [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]],
  8: [
    [0, 32, 8, 40, 2, 34, 10, 42], [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38], [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41], [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37], [63, 31, 55, 23, 61, 29, 53, 21]
  ]
};
/* Error-diffusion quantisation of an RGBA frame to a palette. Returns a new
   Uint8ClampedArray (RGBA) at the same resolution. `ar` pulses the error
   spread: on the kick the threshold shifts so the dither breathes. */
function ditherFrame(data, w, h, algoId, paletteName, ar) {
  const colors = (ASCII_PALETTES[paletteName] || ASCII_PALETTES.bw).colors;
  const out = new Uint8ClampedArray(data);
  const kernel = DITHER_KERNELS[algoId];
  const kick = ar ? ar.kick : 0;
  if (!kernel) { // ordered Bayer fallback (algoId 'bayer2'|'bayer4'|'bayer8')
    const n = algoId === 'bayer2' ? 2 : (algoId === 'bayer8' ? 8 : 4);
    const M = BAYER[n];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const lum = (out[i] * 0.299 + out[i + 1] * 0.587 + out[i + 2] * 0.114) / 255;
      const thr = (M[y % n][x % n] + 0.5) / (n * n) + kick * 0.06 - 0.03;
      const idx = Math.min(colors.length - 1, Math.max(0, Math.floor(lum * colors.length + (thr - 0.5))));
      const c = colors[idx];
      out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2];
    }
    return out;
  }
  // Error diffusion, serpentine scan for fewer worm artifacts.
  const err = new Float32Array(w * h * 3);
  const get = (x, y, ch) => (x < 0 || x >= w || y < 0 || y >= h) ? 0 : data[(y * w + x) * 4 + ch] + err[(y * w + x) * 3 + ch];
  for (let y = 0; y < h; y++) {
    const ltr = (y % 2 === 0);
    for (let xi = 0; xi < w; xi++) {
      const x = ltr ? xi : w - 1 - xi;
      const i = (y * w + x) * 4;
      const r = get(x, y, 0), g = get(x, y, 1), b = get(x, y, 2);
      const idx = nearestPaletteColor(r, g, b, colors);
      const c = colors[idx];
      out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2];
      const er = r - c[0], eg = g - c[1], eb = b - c[2];
      const spread = 1 + kick * 0.35; // the kick pushes more error into neighbours
      for (const [dx, dy, wt] of kernel.m) {
        const nx = ltr ? x + dx : x - dx, ny = y + dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const f = (wt / kernel.div) * spread;
        const ei = (ny * w + nx) * 3;
        err[ei] += er * f; err[ei + 1] += eg * f; err[ei + 2] += eb * f;
      }
    }
  }
  return out;
}

/* ---------- shared helpers ---------- */
function sizeCanvas(canvas, w, h) {
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}
function lumAt(data, cols, x, y) {
  const i = (y * cols + x) * 4;
  return (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
}
/* Depth-sliced rendering: near (depth~1) renders dense, far (depth~0)
   renders sparse. Returns an ink factor 0..1 for the cell. */
function depthInk(opts, x, y, cols) {
  if (!opts.depthMap) return 1;
  const d = opts.depthMap[y * cols + x] || 0;
  return 0.3 + 0.7 * d;
}

/* ---------- style renderers ---------- */
/* Pixel Art: quantised colour blocks, cell size + palette. */
function renderStylePixel(canvas, ctx, data, cols, rows, opts) {
  const cell = opts.cellW || 12;
  const colors = (ASCII_PALETTES[opts.palette] || ASCII_PALETTES.pico8).colors;
  const ar = opts.ar || { kick: 0, bass: 0, level: 0 };
  const pulse = 1 + ar.kick * 0.15; // blocks swell a touch on the kick
  sizeCanvas(canvas, Math.round(cols * cell * pulse), rows * cell);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = (y * cols + x) * 4;
    const ink = depthInk(opts, x, y, cols);
    if (ink < 0.4 && Math.random() < 0.6) continue; // far layers go sparse
    const idx = nearestPaletteColor(data[i], data[i + 1], data[i + 2], colors);
    const c = colors[idx];
    ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
    ctx.fillRect(x * cell * pulse, y * cell, cell * pulse - 1, cell - 1);
  }
}
/* Mosaic: tiles in square / wide / tall shapes, palette-quantised. */
function renderStyleMosaic(canvas, ctx, data, cols, rows, opts) {
  const cell = opts.cellW || 14;
  const shape = opts.tileShape || 'square';
  const tw = shape === 'wide' ? cell * 1.6 : cell;
  const th = shape === 'tall' ? cell * 1.6 : cell;
  const colors = (ASCII_PALETTES[opts.palette] || ASCII_PALETTES.pico8).colors;
  const ar = opts.ar || { kick: 0, bass: 0, level: 0 };
  sizeCanvas(canvas, Math.round(cols * tw), Math.round(rows * th));
  ctx.fillStyle = '#0b1020'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = (y * cols + x) * 4;
    const ink = depthInk(opts, x, y, cols);
    const idx = nearestPaletteColor(data[i], data[i + 1], data[i + 2], colors);
    const c = colors[idx];
    const jx = (Math.random() - 0.5) * ar.kick * 3; // tiles jitter on the kick
    ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
    ctx.globalAlpha = 0.35 + 0.65 * ink;
    const r = Math.min(tw, th) * 0.18;
    const px = x * tw + jx, py = y * th;
    ctx.beginPath();
    ctx.roundRect(px + 1, py + 1, tw - 2, th - 2, r);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
/* Halftone / CMYK dots: four offset dot grids, one per ink. */
function renderStyleHalftoneCmyk(canvas, ctx, data, cols, rows, opts) {
  const cell = opts.cellW || 12;
  const ar = opts.ar || { kick: 0, bass: 0, level: 0 };
  sizeCanvas(canvas, cols * cell, rows * cell);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const inks = [
    { ch: 0, color: 'rgba(0,174,239,0.85)', dx: -0.25, dy: 0 },   // cyan
    { ch: 1, color: 'rgba(236,0,140,0.85)', dx: 0.25, dy: 0 },    // magenta
    { ch: 2, color: 'rgba(255,242,0,0.85)', dx: 0, dy: 0.25 },    // yellow
    { ch: 3, color: 'rgba(0,0,0,0.85)', dx: 0, dy: -0.25 }        // key
  ];
  const dots = (ink) => {
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      let v;
      if (ink.ch === 3) v = 1 - lumAt(data, cols, x, y);
      else v = 1 - data[i + ink.ch] / 255;
      const inkF = depthInk(opts, x, y, cols);
      const r = Math.max(0, v * inkF * cell * 0.52 * (1 + ar.bass * 0.25));
      if (r < 0.6) continue;
      ctx.fillStyle = ink.color;
      ctx.beginPath();
      ctx.arc((x + 0.5 + ink.dx) * cell, (y + 0.5 + ink.dy) * cell, r, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  for (const ink of inks) dots(ink);
}
/* Voxel / Cube: isometric stacked cubes, height follows luminance. */
function renderStyleVoxel(canvas, ctx, data, cols, rows, opts) {
  const cell = opts.cellW || 16;
  const ar = opts.ar || { kick: 0, bass: 0, level: 0 };
  const cw = cell, ch = cell * 0.5;
  const w = Math.round((cols + rows) * cw * 0.5) + cell;
  const h = Math.round((cols + rows) * ch * 0.5) + cell * 2;
  sizeCanvas(canvas, w, h);
  ctx.fillStyle = '#05070f'; ctx.fillRect(0, 0, w, h);
  const isoX = (x, y) => (x - y) * cw * 0.5 + rows * cw * 0.5;
  const isoY = (x, y) => (x + y) * ch * 0.5 + cell;
  const shade = (r, g, b, f) => `rgb(${Math.round(r * f)},${Math.round(g * f)},${Math.round(b * f)})`;
  for (let s = 0; s < cols + rows - 1; s++) {
    for (let x = 0; x < cols; x++) {
      const y = s - x;
      if (y < 0 || y >= rows) continue;
      const i = (y * cols + x) * 4;
      const lum = lumAt(data, cols, x, y);
      const ink = depthInk(opts, x, y, cols);
      const height = Math.max(1, lum * ink * cell * 1.6 * (1 + ar.kick * 0.5 + ar.bass * 0.3));
      const cx = isoX(x, y), cy = isoY(x, y);
      const r = data[i], g = data[i + 1], b = data[i + 2];
      // left face
      ctx.fillStyle = shade(r, g, b, 0.55);
      ctx.beginPath(); ctx.moveTo(cx - cw / 2, cy); ctx.lineTo(cx, cy + ch / 2); ctx.lineTo(cx, cy + ch / 2 - height); ctx.lineTo(cx - cw / 2, cy - height); ctx.closePath(); ctx.fill();
      // right face
      ctx.fillStyle = shade(r, g, b, 0.75);
      ctx.beginPath(); ctx.moveTo(cx + cw / 2, cy); ctx.lineTo(cx, cy + ch / 2); ctx.lineTo(cx, cy + ch / 2 - height); ctx.lineTo(cx + cw / 2, cy - height); ctx.closePath(); ctx.fill();
      // top face
      ctx.fillStyle = shade(r, g, b, 1.0);
      ctx.beginPath(); ctx.moveTo(cx, cy - ch / 2 - height); ctx.lineTo(cx + cw / 2, cy - height); ctx.lineTo(cx, cy + ch / 2 - height); ctx.lineTo(cx - cw / 2, cy - height); ctx.closePath(); ctx.fill();
    }
  }
}
/* LEGO bricks: rounded brick + stud, colour from the palette. */
function renderStyleLego(canvas, ctx, data, cols, rows, opts) {
  const cell = opts.cellW || 18;
  const colors = (ASCII_PALETTES[opts.palette] || ASCII_PALETTES.pico8).colors;
  const ar = opts.ar || { kick: 0, bass: 0, level: 0 };
  sizeCanvas(canvas, cols * cell, rows * cell);
  ctx.fillStyle = '#0b1020'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = (y * cols + x) * 4;
    const ink = depthInk(opts, x, y, cols);
    if (ink < 0.35) continue;
    const idx = nearestPaletteColor(data[i], data[i + 1], data[i + 2], colors);
    const c = colors[idx];
    const px = x * cell, py = y * cell;
    ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
    ctx.beginPath(); ctx.roundRect(px + 1, py + 2, cell - 2, cell - 3, 3); ctx.fill();
    // stud — lighter on top, swells on the kick
    const sr = cell * 0.2 * (1 + ar.kick * 0.3);
    ctx.fillStyle = `rgba(255,255,255,0.35)`;
    ctx.beginPath(); ctx.arc(px + cell / 2, py + cell / 2, sr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(0,0,0,0.25)`;
    ctx.beginPath(); ctx.arc(px + cell / 2, py + cell / 2 + 1, sr * 0.8, 0, Math.PI * 2); ctx.fill();
  }
}
/* LED matrix: glowing dots on a dark grid, brightness = luminance. */
function renderStyleLed(canvas, ctx, data, cols, rows, opts) {
  const cell = opts.cellW || 12;
  const ar = opts.ar || { kick: 0, bass: 0, level: 0 };
  sizeCanvas(canvas, cols * cell, rows * cell);
  ctx.fillStyle = '#05070f'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = (y * cols + x) * 4;
    const lum = lumAt(data, cols, x, y) * depthInk(opts, x, y, cols);
    if (lum < 0.06) continue;
    const glow = 0.5 + ar.kick * 0.5;
    const r = Math.max(1, lum * cell * 0.42 * glow);
    ctx.fillStyle = `rgba(${data[i]},${data[i + 1]},${data[i + 2]},${0.35 + lum * 0.65})`;
    ctx.beginPath(); ctx.arc((x + 0.5) * cell, (y + 0.5) * cell, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.arc((x + 0.5) * cell - r * 0.25, (y + 0.5) * cell - r * 0.25, Math.max(0.5, r * 0.3), 0, Math.PI * 2); ctx.fill();
  }
}
/* Braille matrix: each 2x4 dot cell becomes a braille pattern, drawn as dots
   (and the matching unicode braille char is available via brailleChar). */
const BRAILLE_DOTS = [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [0, 3], [1, 3]];
function brailleChar(bits) {
  let v = 0x2800;
  for (let k = 0; k < 8; k++) if (bits & (1 << k)) v |= (1 << k);
  return String.fromCodePoint(v);
}
function renderStyleBraille(canvas, ctx, data, cols, rows, opts) {
  const cell = opts.cellW || 14;
  const ar = opts.ar || { kick: 0, bass: 0, level: 0 };
  const bc = Math.floor(cols / 2), br = Math.floor(rows / 4);
  sizeCanvas(canvas, bc * cell, br * cell);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#7dd3fc';
  const thr = 0.42 - ar.level * 0.12; // density breathes with the music
  for (let by = 0; by < br; by++) for (let bx = 0; bx < bc; bx++) {
    let bits = 0;
    for (let k = 0; k < 8; k++) {
      const [dx, dy] = BRAILLE_DOTS[k];
      const sx = bx * 2 + dx, sy = by * 4 + dy;
      if (sx >= cols || sy >= rows) continue;
      const ink = depthInk(opts, sx, sy, cols);
      if (lumAt(data, cols, sx, sy) * ink > thr) bits |= (1 << k);
    }
    if (!bits) continue;
    // Draw as real dots (crisper than font braille at small sizes).
    for (let k = 0; k < 8; k++) {
      if (!(bits & (1 << k))) continue;
      const [dx, dy] = BRAILLE_DOTS[k];
      ctx.beginPath();
      ctx.arc((bx + 0.25 + dx * 0.5) * cell, (by + 0.15 + dy * 0.25) * cell, cell * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
/* Dither style: full error-diffusion / Bayer dither to a palette, drawn as
   flat colour blocks (one block per sampled cell). */
function renderStyleDither(canvas, ctx, data, cols, rows, opts) {
  const cell = opts.cellW || 8;
  const dithered = ditherFrame(data, cols, rows, opts.ditherAlgo || 'floyd-steinberg', opts.palette || 'bw', opts.ar);
  sizeCanvas(canvas, cols * cell, rows * cell);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = (y * cols + x) * 4;
    const ink = depthInk(opts, x, y, cols);
    ctx.globalAlpha = 0.3 + 0.7 * ink;
    ctx.fillStyle = `rgb(${dithered[i]},${dithered[i + 1]},${dithered[i + 2]})`;
    ctx.fillRect(x * cell, y * cell, cell, cell);
  }
  ctx.globalAlpha = 1;
}

/* Style registry — the library UI groups by family (ASCII Magic pattern). */
const ASCII_STYLE_DEFS = [
  { id: 'ascii', label: 'ASCII & TEXT — character grid', family: 'ASCII & TEXT' },
  { id: 'braille', label: 'ASCII & TEXT — braille matrix', family: 'ASCII & TEXT' },
  { id: 'pixel', label: 'PIXEL & BLOCKS — pixel art', family: 'PIXEL & BLOCKS' },
  { id: 'blocks', label: 'PIXEL & BLOCKS — solid blocks', family: 'PIXEL & BLOCKS' },
  { id: 'mosaic', label: 'PIXEL & BLOCKS — mosaic tiles', family: 'PIXEL & BLOCKS' },
  { id: 'lego', label: 'PIXEL & BLOCKS — LEGO bricks', family: 'PIXEL & BLOCKS' },
  { id: 'led', label: 'PIXEL & BLOCKS — LED matrix', family: 'PIXEL & BLOCKS' },
  { id: 'voxel', label: 'PIXEL & BLOCKS — voxel cubes', family: 'PIXEL & BLOCKS' },
  { id: 'dither', label: 'PRINT & PAPER — error-diffusion dither', family: 'PRINT & PAPER' },
  { id: 'halftone', label: 'PRINT & PAPER — halftone print dots', family: 'PRINT & PAPER' },
  { id: 'halftone-cmyk', label: 'PRINT & PAPER — CMYK halftone', family: 'PRINT & PAPER' },
  { id: 'thermal', label: 'LIGHT & COLOR — thermal heat camera', family: 'LIGHT & COLOR' },
  { id: 'neon', label: 'LIGHT & COLOR — neon dots, kick swells', family: 'LIGHT & COLOR' },
  { id: 'vision', label: 'GLITCH & SIGNAL — motion-detection boxes', family: 'GLITCH & SIGNAL' }
];
/* Styles implemented in this library file (the rest live in app.js and are
   dispatched there: ascii, blocks, halftone, thermal, neon, vision). */
const ASCII_LIBRARY_RENDERERS = {
  pixel: renderStylePixel,
  mosaic: renderStyleMosaic,
  'halftone-cmyk': renderStyleHalftoneCmyk,
  voxel: renderStyleVoxel,
  lego: renderStyleLego,
  led: renderStyleLed,
  braille: renderStyleBraille,
  dither: renderStyleDither
};

/* ---------- post-effects stack (stackable, real-time) ----------
   Applied to the finished style canvas, in order. `fx` is an array of
   {id, amount} — amount 0..1 scales the effect. Audio can push amounts. */
const ASCII_POST_FX_DEFS = [
  { id: 'vignette', label: 'Vignette' },
  { id: 'scanlines', label: 'Scan Lines' },
  { id: 'crt', label: 'CRT Curvature' },
  { id: 'chroma', label: 'Chromatic Aberration / RGB Split' },
  { id: 'bloom', label: 'Bloom' },
  { id: 'charbloom', label: 'Character Bloom' },
  { id: 'grain', label: 'Film Grain' },
  { id: 'glitch', label: 'Glitch' },
  { id: 'blur', label: 'Blur' },
  { id: 'halftone-fx', label: 'Halftone' },
  { id: 'pixelate', label: 'Pixelate' },
  { id: 'dust', label: 'Film Dust' },
  { id: 'overlay', label: 'Color Overlay' }
];
const _fxTmp = document.createElement('canvas');
const _fxTmp2 = document.createElement('canvas');
function _tmp(canvas, w, h) {
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  return canvas.getContext('2d');
}
function applyAsciiPostFx(canvas, ctx, fx, opts) {
  if (!fx || !fx.length) return;
  const w = canvas.width, h = canvas.height;
  const ar = opts.ar || { kick: 0, bass: 0, level: 0 };
  for (const f of fx) {
    const amt = f.amount == null ? 1 : f.amount;
    if (f.id === 'vignette') {
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${0.55 * amt})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    } else if (f.id === 'scanlines') {
      ctx.fillStyle = `rgba(0,0,0,${0.28 * amt})`;
      for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
    } else if (f.id === 'crt') {
      // Barrel curvature, approximated with horizontal strips whose width
      // shrinks toward the top/bottom edges (a real geometric distortion).
      const t = _tmp(_fxTmp, w, h);
      t.clearRect(0, 0, w, h); t.drawImage(canvas, 0, 0);
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
      const strips = 28;
      for (let s = 0; s < strips; s++) {
        const y0 = (s / strips) * h, sh = h / strips;
        const ny = (y0 + sh / 2 - h / 2) / (h / 2);
        const k = 1 - 0.14 * amt * ny * ny;
        const sw = w * k, sx = (w - sw) / 2;
        ctx.drawImage(_fxTmp, 0, y0, w, sh, sx, y0, sw, sh);
      }
      // curved-edge darkening
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.72);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${0.5 * amt})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    } else if (f.id === 'chroma') {
      // True RGB split: isolate R and B channels, shift them apart.
      const shift = Math.max(1, Math.round(3 * amt + ar.kick * 4));
      const tR = _tmp(_fxTmp, w, h), tB = _tmp(_fxTmp2, w, h);
      tR.clearRect(0, 0, w, h); tR.drawImage(canvas, 0, 0);
      tR.globalCompositeOperation = 'multiply'; tR.fillStyle = 'rgb(255,0,0)'; tR.fillRect(0, 0, w, h);
      tB.clearRect(0, 0, w, h); tB.drawImage(canvas, 0, 0);
      tB.globalCompositeOperation = 'multiply'; tB.fillStyle = 'rgb(0,0,255)'; tB.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.85;
      ctx.drawImage(_fxTmp, -shift, 0);
      ctx.drawImage(_fxTmp2, shift, 0);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    } else if (f.id === 'bloom' || f.id === 'charbloom') {
      const t = _tmp(_fxTmp, w, h);
      t.clearRect(0, 0, w, h); t.drawImage(canvas, 0, 0);
      ctx.save();
      ctx.filter = `blur(${f.id === 'charbloom' ? 3 : 7}px)`;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (f.id === 'charbloom' ? 0.7 : 0.45) * amt * (1 + ar.kick * 0.4);
      ctx.drawImage(_fxTmp, 0, 0);
      ctx.restore();
    } else if (f.id === 'grain') {
      ctx.save();
      ctx.globalAlpha = 0.5 * amt;
      for (let n = 0; n < Math.round(w * h / 900); n++) {
        const v = Math.floor(Math.random() * 255);
        ctx.fillStyle = `rgba(${v},${v},${v},${0.05 + Math.random() * 0.12})`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
      }
      ctx.restore();
    } else if (f.id === 'glitch') {
      if (ar.kick > 0.3 || Math.random() < 0.2) {
        const strips = 2 + Math.floor(Math.random() * 4);
        for (let n = 0; n < strips; n++) {
          const y0 = Math.floor(Math.random() * h), sh = 4 + Math.floor(Math.random() * 26);
          const dx = Math.round((Math.random() - 0.5) * 60 * amt * (0.4 + ar.kick));
          if (dx) ctx.drawImage(canvas, 0, y0, w, sh, dx, y0, w, sh);
        }
      }
    } else if (f.id === 'blur') {
      const t = _tmp(_fxTmp, w, h);
      t.clearRect(0, 0, w, h); t.drawImage(canvas, 0, 0);
      ctx.save(); ctx.filter = `blur(${2 * amt}px)`; ctx.drawImage(_fxTmp, 0, 0); ctx.restore();
    } else if (f.id === 'halftone-fx') {
      ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.25 * amt;
      ctx.fillStyle = '#000';
      for (let y = 0; y < h; y += 6) for (let x = 0; x < w; x += 6) {
        ctx.beginPath(); ctx.arc(x + 3, y + 3, 1.4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    } else if (f.id === 'pixelate') {
      const s = Math.max(2, Math.round(6 * amt));
      const t = _tmp(_fxTmp, Math.max(2, Math.round(w / s)), Math.max(2, Math.round(h / s)));
      t.imageSmoothingEnabled = false;
      t.drawImage(canvas, 0, 0, _fxTmp.width, _fxTmp.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(_fxTmp, 0, 0, w, h);
      ctx.imageSmoothingEnabled = true;
    } else if (f.id === 'dust') {
      ctx.save();
      for (let n = 0; n < Math.round(14 * amt); n++) {
        ctx.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.5})`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1 + Math.random() * 2);
      }
      ctx.strokeStyle = `rgba(255,255,255,${0.18 * amt})`;
      for (let n = 0; n < 2; n++) {
        const x = Math.random() * w;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (Math.random() - 0.5) * 8, h); ctx.stroke();
      }
      ctx.restore();
    } else if (f.id === 'overlay') {
      const hue = opts.overlayHue != null ? opts.overlayHue : 320;
      ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.35 * amt;
      ctx.fillStyle = `hsl(${hue}, 90%, 55%)`; ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }
}

/* ---------- recipes: one-click full looks (style + params + post-FX) ---------- */
const ASCII_RECIPES = [
  { name: 'Game Boy Dither', style: 'dither', palette: 'gameboy', ditherAlgo: 'floyd-steinberg', cols: 120, ramp: ' .:-=+*#%@', color: true, invert: false, reactive: true, postFx: ['scanlines', 'vignette'] },
  { name: 'Riso Halftone', style: 'halftone-cmyk', palette: 'riso', ditherAlgo: 'floyd-steinberg', cols: 90, ramp: ' .:-=+*#%@', color: true, invert: false, reactive: true, postFx: ['grain'] },
  { name: 'Neon Voxel', style: 'voxel', palette: 'pico8', ditherAlgo: 'floyd-steinberg', cols: 64, ramp: ' .:-=+*#%@', color: true, invert: false, reactive: true, postFx: ['bloom', 'vignette'] },
  { name: 'CRT ASCII', style: 'ascii', palette: 'bw', ditherAlgo: 'floyd-steinberg', cols: 130, ramp: ' .:-=+*#%@', color: false, invert: false, reactive: true, postFx: ['scanlines', 'crt', 'chroma'] },
  { name: 'LEGO Pop', style: 'lego', palette: 'pico8', ditherAlgo: 'floyd-steinberg', cols: 72, ramp: ' .:-=+*#%@', color: true, invert: false, reactive: true, postFx: ['bloom'] },
  { name: 'Braille Rain', style: 'braille', palette: 'bw', ditherAlgo: 'floyd-steinberg', cols: 140, ramp: ' .:-=+*#%@', color: false, invert: false, reactive: true, postFx: ['blur', 'vignette'] },
  { name: 'C64 Pixel', style: 'pixel', palette: 'c64', ditherAlgo: 'floyd-steinberg', cols: 96, ramp: ' .:-=+*#%@', color: true, invert: false, reactive: true, postFx: ['scanlines'] },
  { name: 'Atkinson Mono', style: 'dither', palette: 'bw', ditherAlgo: 'atkinson', cols: 130, ramp: ' .:-=+*#%@', color: false, invert: false, reactive: true, postFx: ['grain', 'dust'] },
  { name: 'LED Wall', style: 'led', palette: 'pico8', ditherAlgo: 'floyd-steinberg', cols: 90, ramp: ' .:-=+*#%@', color: true, invert: false, reactive: true, postFx: ['bloom', 'vignette'] },
  { name: 'Mosaic Tiles', style: 'mosaic', palette: 'riso', ditherAlgo: 'floyd-steinberg', cols: 80, ramp: ' .:-=+*#%@', color: true, invert: false, reactive: true, postFx: ['vignette'] }
];
