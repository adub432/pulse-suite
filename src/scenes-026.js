'use strict';
/* Pulse Suite v0.2.6 — 37 new Visualize scenes (total 50 with the 13 in
   app.js). Families: SITES (Austin's reference sites), SYNKit (Synkit Nexus
   glitch effects), PULSE (general / saved reels). Each draw(g, x, y, w, h, A)
   is plain Canvas 2D, theme-coloured, defensive on silent/zero input, and
   visibly music-reactive. Per-scene state lives only on the draw function
   object (fn._s). Wired in by the parent agent; no app.js internals here. */
window.PULSE_SCENES_026 = {
  list: [
    { id: 'gather-particles', label: 'Gather Particles', family: 'SITES', desc: 'Drifting particle field that bursts outward on every kick' },
    { id: 'gather-blobs', label: 'Gather Blobs', family: 'SITES', desc: 'Large soft blobs that swell and drift with the bass' },
    { id: 'ascii-rain', label: 'ASCII Rain', family: 'SITES', desc: 'Falling characters, faster with the level, bright wave on kick' },
    { id: 'ascii-blocks', label: 'ASCII Blocks', family: 'SITES', desc: 'Rain of block characters, denser as the bass rises' },
    { id: 'geo-triangles', label: 'Geo Triangles', family: 'SITES', desc: 'Triangle tessellation that tilts with the beat and fills from the bands' },
    { id: 'geo-hex', label: 'Geo Hexagons', family: 'SITES', desc: 'Hexagon grid, each cell lit by its own band energy' },
    { id: 'geo-bauhaus', label: 'Bauhaus', family: 'SITES', desc: 'Bauhaus circles and half-discs, kick swaps the accent colour' },
    { id: 'mesh-aurora', label: 'Mesh Aurora', family: 'SITES', desc: 'Slow drifting aurora blobs, radius follows the bass' },
    { id: 'mesh-waves', label: 'Mesh Waves', family: 'SITES', desc: 'Horizontal mesh-gradient waves, hue follows the spectral centroid' },
    { id: 'lab-flow', label: 'Lab Flow Field', family: 'SITES', desc: 'Particles riding a flow field, faster when the spectrum changes' },
    { id: 'lab-lines', label: 'Lab Lines', family: 'SITES', desc: 'Interference line field that bends with the bass' },
    { id: 'lab-rings', label: 'Lab Rings', family: 'SITES', desc: 'Concentric rings expanding outward on every kick' },
    { id: 'dither-bayer', label: 'Bayer Field', family: 'SITES', desc: 'Ordered-dither dot field, threshold sweeps with the level' },
    { id: 'dither-spiral', label: 'Dither Spiral', family: 'SITES', desc: 'Spiral vortex of dots spinning with the beat' },
    { id: 'dither-moire', label: 'Moiré', family: 'SITES', desc: 'Two grids sliding past each other, offset by the bass' },
    { id: 'grad-aurora', label: 'Gradient Aurora', family: 'SITES', desc: 'Aurora gradient wash, brightness follows the level' },
    { id: 'grad-bands', label: 'Gradient Bands', family: 'SITES', desc: 'Horizontal gradient bands sized by the 32 band energies' },
    { id: 'grad-duotone', label: 'Duotone Wave', family: 'SITES', desc: 'Duotone sine wave, contrast follows the level' },
    { id: 'synkit-pixels', label: 'Pixel Storm', family: 'SYNKIT', desc: 'Pixels scatter on the kick and regroup on the beat' },
    { id: 'synkit-slices', label: 'Slice Shift', family: 'SYNKIT', desc: 'Horizontal spectrum slices offset left and right by the kick' },
    { id: 'synkit-chroma', label: 'Chroma Split', family: 'SYNKIT', desc: 'Three offset waveform copies, separation follows the bass' },
    { id: 'synkit-datamosh', label: 'Datamosh', family: 'SYNKIT', desc: 'Smeared horizontal bars that smear harder on onsets' },
    { id: 'synkit-glitchgrid', label: 'Glitch Grid', family: 'SYNKIT', desc: 'Grid of cells that corrupt and offset on onsets' },
    { id: 'starfield', label: 'Starfield', family: 'PULSE', desc: 'Drifting stars that flare with the bass' },
    { id: 'tunnel', label: 'Tunnel', family: 'PULSE', desc: 'Flying tunnel of rings, speed follows the BPM' },
    { id: 'plasma', label: 'Plasma', family: 'PULSE', desc: 'Animated sine plasma, palette shifts with the centroid' },
    { id: 'kaleido', label: 'Kaleidoscope', family: 'PULSE', desc: 'Spectrum mirrored four-fold, rotating with the beat' },
    { id: 'slitscan', label: 'Slit Scan', family: 'PULSE', desc: 'Scrolling ribbon of spectrum history, paced by the beat' },
    { id: 'wave-ribbon', label: 'Wave Ribbon', family: 'PULSE', desc: 'Three stacked waveform ribbons in different colours' },
    { id: 'vu-wall', label: 'VU Wall', family: 'PULSE', desc: 'Wall of 32 vertical VU meters with peak hold' },
    { id: 'neon-grid', label: 'Neon Grid', family: 'PULSE', desc: 'Perspective grid floor pulsing with the kick' },
    { id: 'helix', label: 'Helix', family: 'PULSE', desc: 'Double helix of dots rotating with the beat, radius follows bass' },
    { id: 'radar', label: 'Radar', family: 'PULSE', desc: 'Radar sweep with blips landing on kick, snare and hat onsets' },
    { id: 'skyline', label: 'Skyline EQ', family: 'PULSE', desc: 'City skyline where building heights are band energies' },
    { id: 'spray', label: 'Spray', family: 'PULSE', desc: 'Particle spray from the bottom, height and spread follow the level' },
    { id: 'orbit2', label: 'Ellipse Orbit', family: 'PULSE', desc: 'Elliptical orbit paths with dots, tilted by the beat' },
    { id: 'snow', label: 'CRT Snow', family: 'PULSE', desc: 'TV static, denser with spectral flux, tears on the kick' }
  ],
  draw: {
    /* 1. gather-particles — Gather (gather.be-of-dao.com): drifting field. */
    'gather-particles': function gatherParticles(g, x, y, w, h, A) {
      if (!g || w <= 0 || h <= 0) return;
      A = A || {};
      var k = Math.min(1, Math.max(0, A.kick || 0));
      var lv = Math.min(1, Math.max(0, A.level || 0));
      var t = A.t || 0;
      var th = A.theme || {};
      var accent = th.accent || '#ffffff';
      var bar = Array.isArray(th.bar) ? th.bar : [accent, accent, accent];
      var s = gatherParticles._s || (gatherParticles._s = { pts: [], cw: 0, ch: 0, prevK: 0 });
      if (s.cw !== w || s.ch !== h || s.pts.length === 0) {
        s.cw = w; s.ch = h; s.pts = [];
        for (var i = 0; i < 180; i++) {
          var a = Math.random() * Math.PI * 2;
          var r = Math.sqrt(Math.random()) * 0.48;
          s.pts.push({ a: a, r: r, base: r, sp: 0.05 + Math.random() * 0.15, sz: 1 + Math.random() * 2.5, c: i % 3 });
        }
      }
      var burst = (k > 0.65 && s.prevK <= 0.65) ? 1 : 0;
      s.prevK = k;
      var cx = x + w / 2, cy = y + h / 2, maxR = Math.min(w, h) / 2;
      for (var j = 0; j < s.pts.length; j++) {
        var p = s.pts[j];
        p.a += p.sp * 0.016 * (1 + lv * 3);
        if (burst) p.r = Math.min(0.95, p.r + 0.12 + k * 0.1);
        p.r += (p.base - p.r) * 0.01; // drift slowly back home
        var px = cx + Math.cos(p.a) * p.r * maxR * 2;
        var py = cy + Math.sin(p.a) * p.r * maxR * 2;
        g.globalAlpha = 0.35 + lv * 0.5;
        g.fillStyle = bar[p.c];
        g.beginPath();
        g.arc(px, py, p.sz * (1 + k * 1.2), 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    },
    /* 2. gather-blobs — Gather: big soft overlapping blobs. */
    'gather-blobs': function gatherBlobs(g, x, y, w, h, A) {
      if (!g || w <= 0 || h <= 0) return;
      A = A || {};
      var bass = Math.min(1, Math.max(0, A.bass || 0));
      var k = Math.min(1, Math.max(0, A.kick || 0));
      var t = A.t || 0;
      var th = A.theme || {};
      var accent = th.accent || '#ffffff';
      var bar = Array.isArray(th.bar) ? th.bar : [accent, accent, accent];
      var cx = x + w / 2, cy = y + h / 2;
      for (var i = 0; i < 6; i++) {
        var ph = i * 1.7;
        var bx = cx + Math.sin(t * 0.11 + ph) * w * 0.22;
        var by = cy + Math.cos(t * 0.09 + ph * 1.3) * h * 0.2;
        var r = Math.min(w, h) * (0.16 + i * 0.02) * (1 + bass * 0.7 + k * 0.25);
        g.globalAlpha = 0.22 + bass * 0.18;
        g.fillStyle = bar[i % 3];
        g.beginPath(); g.arc(bx, by, r, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
    },
    /* 3. ascii-rain — ascii-magic.com ramp, falling characters. */
    'ascii-rain': function asciiRain(g, x, y, w, h, A) {
      if (!g || w <= 0 || h <= 0) return;
      A = A || {};
      var lv = Math.min(1, Math.max(0, A.level || 0));
      var k = Math.min(1, Math.max(0, A.kick || 0));
      var t = A.t || 0;
      var th = A.theme || {};
      var accent = th.accent || '#ffffff';
      var dim = th.dim || accent;
      var ramp = ' .:-=+*#%@';
      var s = asciiRain._s || (asciiRain._s = { drops: [], cols: 0, flash: 0 });
      var cols = Math.max(1, Math.floor(w / 14));
      if (s.cols !== cols) {
        s.cols = cols; s.drops = [];
        for (var i = 0; i < cols; i++) s.drops.push({ y: Math.random() * h, sp: 0.6 + Math.random() * 1.4 });
      }
      if (k > 0.7) s.flash = 1;
      s.flash = Math.max(0, s.flash - 0.03);
      g.font = '13px "Paper Mono", ui-monospace, monospace';
      g.textAlign = 'left'; g.textBaseline = 'top';
      var flashY = y + ((t * 0.35) % 1) * h;
      for (var c = 0; c < cols; c++) {
        var d = s.drops[c];
        d.y += d.sp * (1 + lv * 4) * 1.6;
        if (d.y > h + 20) { d.y = -20 - Math.random() * 60; d.sp = 0.6 + Math.random() * 1.4; }
        var ci = Math.min(ramp.length - 1, Math.floor((0.3 + lv * 0.7 + Math.sin(t * 2 + c) * 0.15) * ramp.length));
        var nearFlash = Math.abs((y + d.y) - flashY) < 26;
        g.globalAlpha = nearFlash ? 1 : 0.45 + lv * 0.4;
        g.fillStyle = (nearFlash && s.flash > 0.3) ? accent : dim;
        g.fillText(ramp.charAt(Math.max(0, ci)), x + c * 14, y + d.y);
      }
      g.globalAlpha = 1;
    },
    /* 4. ascii-blocks — ascii-magic.com block ramp. */
    'ascii-blocks': function asciiBlocks(g, x, y, w, h, A) {
      if (!g || w <= 0 || h <= 0) return;
      A = A || {};
      var bass = Math.min(1, Math.max(0, A.bass || 0));
      var lv = Math.min(1, Math.max(0, A.level || 0));
      var t = A.t || 0;
      var th = A.theme || {};
      var accent = th.accent || '#ffffff';
      var bar = Array.isArray(th.bar) ? th.bar : [accent, accent, accent];
      var b32 = (A.bands32 && A.bands32.length >= 32) ? A.bands32 : null;
      var blocks = ['\u2591', '\u2592', '\u2593', '\u2588'];
      var cw = 12, chh = 14;
      var cols = Math.max(1, Math.floor(w / cw)), rows = Math.max(1, Math.floor(h / chh));
      g.font = '13px "Paper Mono", ui-monospace, monospace';
      g.textAlign = 'left'; g.textBaseline = 'top';
      var density = 0.25 + bass * 0.7;
      var tick = Math.floor(t * 6);
      for (var r = 0; r < rows; r++) {
        var band = b32 ? b32[Math.min(31, Math.floor(r / rows * 32))] : lv;
        for (var c = 0; c < cols; c++) {
          var hv = Math.sin(c * 127.1 + r * 311.7 + tick * 0.7);
          hv = hv - Math.floor(hv);
          if (hv > density) continue;
          var bi = Math.min(3, Math.floor(band * 4 + (hv * 0.9)));
          g.globalAlpha = 0.35 + band * 0.6;
          g.fillStyle = bar[(c + r) % 3];
          g.fillText(blocks[Math.max(0, bi)], x + c * cw, y + r * chh);
        }
      }
      g.globalAlpha = 1;
    },
    /* 5. geo-triangles — geometric-art.com triangle tessellation. */
    'geo-triangles': function geoTriangles(g, x, y, w, h, A) {
      if (!g || w <= 0 || h <= 0) return;
      A = A || {};
      var bp = (A.beatPhase == null || A.beatPhase < 0) ? 0 : A.beatPhase;
      var k = Math.min(1, Math.max(0, A.kick || 0));
      var th = A.theme || {};
      var accent = th.accent || '#ffffff';
      var bar = Array.isArray(th.bar) ? th.bar : [accent, accent, accent];
      var b32 = (A.bands32 && A.bands32.length >= 32) ? A.bands32 : null;
      var s = geoTriangles._s || (geoTriangles._s = { tris: [], cw: 0, ch: 0 });
      if (s.cw !== w || s.ch !== h || s.tris.length === 0) {
        s.cw = w; s.ch = h; s.tris = [];
        var sz = 46, hh = sz * 0.866;
        for (var r = 0, yy = y; yy < y + h + hh; yy += hh, r++) {
          for (var xx = x - sz; xx < x + w + sz; xx += sz) {
            var off = (r % 2) ? sz / 2 : 0;
            s.tris.push({ x: xx + off, y: yy, up: ((r + Math.round(xx / sz)) % 2 === 0) });
          }
        }
        s.sz = sz;
      }
      var tilt = (bp - 0.5) * 0.35 + k * 0.1;
      for (var i = 0; i < s.tris.length; i++) {
        var tr = s.tris[i];
        var e = b32 ? b32[i % 32] : 0.3;
        var cx = tr.x + s.sz / 2, cy = tr.y + s.sz * 0.28;
        g.save();
        g.translate(cx, cy);
        g.rotate(tilt * (tr.up ? 1 : -1));
        g.globalAlpha = 0.15 + e * 0.75;
        g.fillStyle = bar[i % 3];
        g.beginPath();
        if (tr.up) { g.moveTo(0, -s.sz * 0.32); g.lineTo(s.sz / 2, s.sz * 0.3); g.lineTo(-s.sz / 2, s.sz * 0.3); }
        else { g.moveTo(0, s.sz * 0.32); g.lineTo(s.sz / 2, -s.sz * 0.3); g.lineTo(-s.sz / 2, -s.sz * 0.3); }
        g.closePath(); g.fill();
        g.restore();
      }
      g.globalAlpha = 1;
    },
    /* 6. geo-hex — geometric-art.com hexagon grid. */
    'geo-hex': function geoHex(g, x, y, w, h, A) {
      if (!g || w <= 0 || h <= 0) return;
      A = A || {};
      var k = Math.min(1, Math.max(0, A.kick || 0));
      var th = A.theme || {};
      var accent = th.accent || '#ffffff';
      var bar = Array.isArray(th.bar) ? th.bar : [accent, accent, accent];
      var b32 = (A.bands32 && A.bands32.length >= 32) ? A.bands32 : null;
      var r = 26, hw = r * 1.5, hh = r * 0.866;
      var idx = 0;
      for (var row = 0, yy = y + r; yy < y + h + r; yy += hh, row++) {
        for (var col = 0, xx = x + r + (row % 2 ? hw / 2 : 0); xx < x + w + r; xx += hw, col++) {
          var e = b32 ? b32[(idx++) % 32] : 0.3;
          var rad = r * (0.55 + e * 0.45 + k * 0.1);
          g.globalAlpha = 0.12 + e * 0.8;
          g.fillStyle = bar[(row + col) % 3];
          g.beginPath();
          for (var p = 0; p < 6; p++) {
            var a = Math.PI / 3 * p + Math.PI / 6;
            var px = xx + Math.cos(a) * rad, py = yy + Math.sin(a) * rad;
            if (p === 0) g.moveTo(px, py); else g.lineTo(px, py);
          }
          g.closePath(); g.fill();
        }
      }
      g.globalAlpha = 1;
    },
    /* 7. geo-bauhaus — geometric-art.com bauhaus shapes. */
    'geo-bauhaus': function geoBauhaus(g, x, y, w, h, A) {
      if (!g || w <= 0 || h <= 0) return;
      A = A || {};
      var k = Math.min(1, Math.max(0, A.kick || 0));
      var bp = (A.beatPhase == null || A.beatPhase < 0) ? 0 : A.beatPhase;
      var th = A.theme || {};
      var accent = th.accent || '#ffffff';
      var bar = Array.isArray(th.bar) ? th.bar : [accent, accent, accent];
      var b32 = (A.bands32 && A.bands32.length >= 32) ? A.bands32 : null;
      var cell = 72;
      var cols = Math.max(1, Math.ceil(w / cell)), rows = Math.max(1, Math.ceil(h / cell));
      var swap = k > 0.55 ? 1 : 0;
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          var e = b32 ? b32[(r * cols + c) % 32] : 0.3;
          var cx = x + c * cell + cell / 2, cy = y + r * cell + cell / 2;
          var rad = cell * 0.32 * (0.6 + e * 0.7);
          var kind = (r * 7 + c * 3) % 3;
          g.globalAlpha = 0.55 + e * 0.45;
          g.fillStyle = swap ? bar[(c + 1) % 3] : bar[(r + c) % 3];
          g.beginPath();
          if (kind === 0) { g.arc(cx, cy, rad, 0, Math.PI * 2); g.fill(); }
          else if (kind === 1) {
            g.save(); g.translate(cx, cy); g.rotate(bp * Math.PI);
            g.moveTo(0, 0); g.arc(0, 0, rad, 0, Math.PI); g.closePath(); g.fill(); g.restore();
          } else {
            g.fillRect(cx - rad, cy - rad * (0.5 + e * 0.5), rad * 2, rad * (1 + e));
          }
        }
      }
      g.globalAlpha = 1;
    },
    /* 8. mesh-aurora — mmeshy.com slow aurora blobs. */
    'mesh-aurora': function meshAurora(g, x, y, w, h, A) {
      if (!g || w <= 0 || h <= 0) return;
      A = A || {};
      var bass = Math.min(1, Math.max(0, A.bass || 0));
      var lv = Math.min(1, Math.max(0, A.level || 0));
      var t = A.t || 0;
      var th = A.theme || {};
      var accent = th.accent || '#ffffff';
      var bar = Array.isArray(th.bar) ? th.bar : [accent, accent, accent];
      var cx = x + w / 2, cy = y + h / 2;
      for (var i = 0; i < 4; i++) {
        var ph = i * 1.9;
        var bx = cx + Math.sin(t * 0.07 + ph) * w * 0.3;
        var by = cy + Math.cos(t * 0.05 + ph * 1.4) * h * 0.26;
        var r = Math.min(w, h) * (0.3 + i * 0.06) * (1 + bass * 0.6);
        var grad = g.createRadialGradient(bx, by, 0, bx, by, Math.max(1, r));
        grad.addColorStop(0, bar[i % 3]);
        grad.addColorStop(1, bar[i % 3]);
        g.globalAlpha = 0.16 + lv * 0.22;
        g.fillStyle = grad;
        g.beginPath(); g.arc(bx, by, Math.max(1, r), 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
    },
    /* 9. mesh-waves — mmeshy.com mesh-gradient waves. */
    'mesh-waves': function meshWaves(g, x, y, w, h, A) {
      if (!g || w <= 0 || h <= 0) return;
      A = A || {};
      var lv = Math.min(1, Math.max(0, A.level || 0));
      var bass = Math.min(1, Math.max(0, A.bass || 0));
      var t = A.t || 0;
      var cent = A.centroid || 0;
      var th = A.theme || {};
      var accent = th.accent || '#ffffff';
      var bar = Array.isArray(th.bar) ? th.bar : [accent, accent, accent];
      var b32 = (A.bands32 && A.bands32.length >= 32) ? A.bands32 : null;
      var pick = Math.min(2, Math.max(0, Math.floor(cent / 2500)));
      for (var band = 0; band < 4; band++) {
        var e = b32 ? b32[Math.min(31, band * 8 + 3)] : lv;
        var baseY = y + h * (0.2 + band * 0.2);
        var amp = (8 + e * 46 + bass * 20);
        g.globalAlpha = 0.3 + e * 0.45;
        g.fillStyle = bar[(pick + band) % 3];
        g.beginPath();
        g.moveTo(x, y + h);
        for (var px = 0; px <= w; px += 12) {
          var py = baseY + Math.sin(px * 0.012 + t * (0.6 + band * 0.2) + band * 2) * amp;
          g.lineTo(x + px, py);
        }
        g.lineTo(x + w, y + h);
        g.closePath(); g.fill();
      }
      g.globalAlpha = 1;
    },
    /* 10. lab-flow — lab.alembic.space flow field. */
    'lab-flow': function labFlow(g, x, y, w, h, A) {
      if (!g || w <= 0 || h <= 0) return;
      A = A || {};
      var flux = Math.min(1, Math.max(0, A.flux || 0));
      var lv = Math.min(1, Math.max(0, A.level || 0));
      var t = A.t || 0;
      var th = A.theme || {};
      var accent = th.accent || '#ffffff';
      var bar = Array.isArray(th.bar) ? th.bar : [accent, accent, accent];
      var s = labFlow._s || (labFlow._s = { pts: [], cw: 0, ch: 0 });
      if (s.cw !== w || s.ch !== h || s.pts.length === 0) {
        s.cw = w; s.ch = h; s.pts = [];
        for (var i = 0; i < 220; i++) s.pts.push({ px: Math.random() * w, py: Math.random() * h, c: i % 3 });
      }
      var speed = 0.6 + flux * 4 + lv * 1.5;
      g.lineWidth = 1;
      for (var j = 0; j < s.pts.length; j++) {
        var p = s.pts[j];
        var ang = Math.sin(p.px * 0.008 + t * 0.4) * 2.2 + Math.cos(p.py * 0.009 - t * 0.3) * 2.2;
        var nx = p.px + Math.cos(ang) * speed * 2;
        var ny = p.py + Math.sin(ang) * speed * 2;
        g.globalAlpha = 0.5;
        g.strokeStyle = bar[p.c];
        g.beginPath(); g.moveTo(x + p.px, y + p.py); g.lineTo(x + nx, y + ny); g.stroke();
        p.px = nx; p.py = ny;
        if (p.px < 0 || p.px > w || p.py < 0 || p.py > h) { p.px = Math.random() * w; p.py = Math.random() * h; }
      }
      g.globalAlpha = 1;
    },
    /* 11. lab-lines — lab.alembic.space interference lines. */
    'lab-lines': function labLines(g, x, y, w, h, A) {
      if (!g || w <= 0 || h <= 0) return;
      A = A || {};
      var bass = Math.min(1, Math.max(0, A.bass || 0));
      var lv = Math.min(1, Math.max(0, A.level || 0));
      var t = A.t || 0;
      var th = A.theme || {};
      var accent = th.accent || '#ffffff';
      var bar = Array.isArray(th.bar) ? th.bar : [accent, accent, accent];
      var b32 = (A.bands32 && A.bands32.length >= 32) ? A.bands32 : null;
      var lines = 22;
      g.lineWidth = 1;
      for (var i = 0; i < lines; i++) {
        var e = b32 ? b32[Math.min(31, Math.floor(i / lines * 32))] : lv;
        var baseY = y + (i + 0.5) * h / lines;
        var bend = (6 + bass * 34 + e * 18);
        g.globalAlpha = 0.25 + e * 0.6;
        g.strokeStyle = bar[i % 3];
        g.beginPath();
        for (var px = 0; px <= w; px += 14) {
          var py = baseY + Math.sin(px * 0.02 + t * (0.8 + i * 0.05) + i) * bend;
          if (px === 0) g.moveTo(x + px, py); else g.lineTo(x + px, py);
        }
        g.stroke();
      }
      g.globalAlpha = 1;
    },
    /* 12. lab-rings — lab.alembic.space shader-style rings. */
    'lab-rings': function labRings(g, x, y, w, h, A) {
      if (!g || w <= 0 || h <= 0) return;
      A = A || {};
      var k = Math.min(1, Math.max(0, A.kick || 0));
      var bass = Math.min(1, Math.max(0, A.bass || 0));
      var t = A.t || 0;
      var th = A.theme || {};
      var accent = th.accent || '#ffffff';
      var bar = Array.isArray(th.bar) ? th.bar : [accent, accent, accent];
      var s = labRings._s || (labRings._s = { rings: [], prevK: 0, lastT: 0 });
      var dt = Math.min(0.1, Math.max(0, t - (s.lastT || t)));
      s.lastT = t;
      if (k > 0.65 && s.prevK <= 0.65 && s.rings.length < 8) s.rings.push({ age: 0 });
      s.prevK = k;
      var cx = x + w / 2, cy = y + h / 2;
      var maxR = Math.min(w, h) * 0.7;
      g.lineWidth = 2;
      for (var i = s.rings.length - 1; i >= 0; i--) {
        var rg = s.rings[i];
        rg.age += dt * (0.5 + bass * 0.8);
        if (rg.age >= 1) { s.rings.splice(i, 1); continue; }
        g.globalAlpha = (1 - rg.age) * (0.5 + bass * 0.5);
        g.strokeStyle = bar[i % 3];
        g.beginPath();
        g.arc(cx, cy, Math.max(1, rg.age * maxR), 0, Math.PI * 2);
        g.stroke();
      }
      // Resting centre ring, breathing with the bass.
      g.globalAlpha = 0.4 + bass * 0.5;
      g.strokeStyle = accent;
      g.beginPath();
      g.arc(cx, cy, Math.max(2, Math.min(w, h) * 0.08 * (1 + bass * 0.9 + k * 0.4)), 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
    },
    /* 13. dither-bayer — dithr.app ordered Bayer dither. */
    'dither-bayer': function ditherBayer(g, x, y, w, h, A) {
      if (!g || w <= 0 || h <= 0) return;
      A = A || {};
      var lv = Math.min(1, Math.max(0, A.level || 0));
      var k = Math.min(1, Math.max(0, A.kick || 0));
      var t = A.t || 0;
      var th = A.theme || {};
      var accent = th.accent || '#ffffff';
      var bar = Array.isArray(th.bar) ? th.bar : [accent, accent, accent];
      var b32 = (A.bands32 && A.bands32.length >= 32) ? A.bands32 : null;
      var bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
      var step = 11;
      var cols = Math.floor(w / step), rows = Math.floor(h / step);
      var thresh = (lv * 0.8 + k * 0.2 + Math.sin(t * 0.7) * 0.08);
      for (var r = 0; r < rows; r++) {
        var e = b32 ? b32[Math.min(31, Math.floor(r / Math.max(1, rows) * 32))] : lv;
        for (var c = 0; c < cols; c++) {
          var bv = bayer[(r % 4) * 4 + (c % 4)] / 16;
          var on = bv < Math.min(1, Math.max(0, thresh + e * 0.35));
          g.globalAlpha = on ? 0.85 : 0.18;
          g.fillStyle = on ? bar[(c + r) % 3] : accent;
          var rad = on ? 2.6 + k * 1.4 : 1;
          g.beginPath();
          g.arc(x + c * step + step / 2, y + r * step + step / 2, rad, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.globalAlpha = 1;
    },
    /* 14. dither-spiral — dithr.app spiral dot vortex. */
    'dither-spiral': function ditherSpiral(g, x, y, w, h, A) {
      if (!g || w <= 0 || h <= 0) return;
      A = A || {};
      var bp = (A.beatPhase == null || A.beatPhase < 0) ? 0 : A.beatPhase;
      var k = Math.min(1, Math.max(0, A.kick || 0));
      var lv = Math.min(1, Math.max(0, A.level || 0));
      var bpm = A.bpm || 0;
      var t = A.t || 0;
      var th = A.theme || {};
      var accent = th.accent || '#ffffff';
      var bar = Array.isArray(th.bar) ? th.bar : [accent, accent, accent];
      var cx = x + w / 2, cy = y + h / 2;
      var maxR = Math.min(w, h) * 0.48;
      var rot = bp * Math.PI * 2 + t * (bpm > 0 ? bpm / 240 : 0.25);
      var arms = 3, dots = 150;
      for (var i = 0; i < dots; i++) {
        var f = i / dots;
        var ang = f * Math.PI * 7 + rot + (i % arms) * (Math.PI * 2 / arms);
        var rr = f * maxR;
        var px = cx + Math.cos(ang) * rr;
        var py = cy + Math.sin(ang) * rr;
        g.globalAlpha = 0.25 + f * 0.6 + k * 0.2;
        g.fillStyle = bar[i % 3];
        g.beginPath();
        g.arc(px, py, 1.2 + f * 2.4 + k * 1.6 + lv, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    },
    /* 15. dither-moire — dithr.app moiré interference. */
    'dither-moire': function ditherMoire(g, x, y, w, h, A) {
      if (!g || w <= 0 || h <= 0) return;
      A = A || {};
      var bass = Math.min(1, Math.max(0, A.bass || 0));
      var lv = Math.min(1, Math.max(0, A.level || 0));
      var t = A.t || 0;
      var th = A.theme || {};
      var accent = th.accent || '#ffffff';
      var grid = th.grid || accent;
      var off = bass * 26 * Math.sin(t * 0.9) + lv * 8;
      var gap = 18;
      g.lineWidth = 1;
      g.globalAlpha = 0.55;
      g.strokeStyle = grid;
      for (var px = 0; px <= w + gap; px += gap) {
        g.beginPath(); g.moveTo(x + px + off, y); g.lineTo(x + px + off, y + h); g.stroke();
        g.beginPath(); g.moveTo(x + px - off, y); g.lineTo(x + px - off + h * 0.3, y + h); g.stroke();
      }
      for (var py = 0; py <= h + gap; py += gap) {
        g.beginPath(); g.moveTo(x, y + py - off); g.lineTo(x + w, y + py - off); g.stroke();
      }
      // Bright interference dots where the grids cross, sized by the level.
      g.fillStyle = accent;
      for (var dx = 0; dx <= w; dx += gap * 2) {
        for (var dy = 0; dy <= h; dy += gap * 2) {
          g.globalAlpha = 0.15 + lv * 0.5;
          g.beginPath();
          g.arc(x + dx + off * 0.5, y + dy, 1 + bass * 3, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.globalAlpha = 1;
    },
    /* 16. grad-aurora — backgrounds.supply gradient-lab aurora wash. */
    'grad-aurora': function gradAurora(g, x, y, w, h, A) {
      if (!g || w <= 0 || h <= 0) return;
      A = A || {};
      var lv = Math.min(1, Math.max(0, A.level || 0));
      var bass = Math.min(1, Math.max(0, A.bass || 0));
      var t = A.t || 0;
      var th = A.theme || {};
      var accent = th.accent || '#ffffff';
      var bar = Array.isArray(th.bar) ? th.bar : [accent, accent, accent];
      var cyc = Math.floor(t / 6) % 3;
      var grad = g.createLinearGradient(x, y, x + w, y + h);
      grad.addColorStop(0, bar[cyc % 3]);
      grad.addColorStop(0.55, bar[(cyc + 1) % 3]);
      grad.addColorStop(1, bar[(cyc + 2) % 3]);
      g.globalAlpha = 0.22 + lv * 0.45 + bass * 0.12;
      g.fillStyle = grad;
      g.fillRect(x, y, w, h);
      // Slow drifting light band across the wash.
      var bandY = y + ((Math.sin(t * 0.12) * 0.5 + 0.5) * h);
      var glow = g.createRadialGradient(x + w / 2, bandY, 0, x + w / 2, bandY, Math.max(1, h * 0.4));
      glow.addColorStop(0, accent);
      glow.addColorStop(1, accent);
      g.globalAlpha = 0.1 + lv * 0.2;
      g.fillStyle = glow;
      g.fillRect(x, y, w, h);
      g.globalAlpha = 1;
    },
    /* 17. grad-bands — backgrounds.supply gradient-lab band stack. */
    'grad-bands': function gradBands(g, x, y, w, h, A) {
      if (!g || w <= 0 || h <= 0) return;
      A = A || {};
      var k = Math.min(1, Math.max(0, A.kick || 0));
      var th = A.theme || {};
      var accent = th.accent || '#ffffff';
      var bar = Array.isArray(th.bar) ? th.bar : [accent, accent, accent];
      var b32 = (A.bands32 && A.bands32.length >= 32) ? A.bands32 : null;
      var grad = g.createLinearGradient(x, y, x, y + h);
      grad.addColorStop(0, bar[0]);
      grad.addColorStop(0.5, bar[1]);
      grad.addColorStop(1, bar[2]);
      var n = 32, rowH = h / n;
      for (var i = 0; i < n; i++) {
        var e = b32 ? b32[i] : 0.3;
        var bw = Math.max(2, e * w * (0.7 + k * 0.3));
        g.globalAlpha = 0.35 + e * 0.6;
        g.fillStyle = grad;
        g.fillRect(x, y + i * rowH + 1, bw, rowH - 2);
      }
      g.globalAlpha = 1;
    },
    /* 18. grad-duotone — backgrounds.supply gradient-lab duotone wave. */
    'grad-duotone': function gradDuotone(g, x, y, w, h, A) {
      if (!g || w <= 0 || h <= 0) return;
      A = A || {};
      var lv = Math.min(1, Math.max(0, A.level || 0));
      var bass = Math.min(1, Math.max(0, A.bass || 0));
      var t = A.t || 0;
      var th = A.theme || {};
      var accent = th.accent || '#ffffff';
      var bar = Array.isArray(th.bar) ? th.bar : [accent, accent, accent];
      var midY = y + h * (0.62 - lv * 0.24);
      var amp = h * (0.1 + lv * 0.22 + bass * 0.1);
      g.globalAlpha = 0.5 + lv * 0.4;
      g.fillStyle = bar[0];
      g.beginPath();
      g.moveTo(x, y + h);
      for (var px = 0; px <= w; px += 8) {
        var py = midY + Math.sin(px * 0.014 + t * (1 + lv * 2)) * amp * Math.sin(px * 0.003 + t * 0.4);
        g.lineTo(x + px, py);
      }
      g.lineTo(x + w, y + h);
      g.closePath(); g.fill();
      g.globalAlpha = 1;
      g.strokeStyle = accent;
      g.lineWidth = 2;
      g.beginPath();
      for (var qx = 0; qx <= w; qx += 8) {
        var qy = midY + Math.sin(qx * 0.014 + t * (1 + lv * 2)) * amp * Math.sin(qx * 0.003 + t * 0.4);
        if (qx === 0) g.moveTo(x, qy); else g.lineTo(x + qx, qy);
      }
      g.stroke();
    },
    /* 19. synkit-pixels — Synkit Nexus pixel storm. */
    'synkit-pixels': function synkitPixels(g, x, y, w, h, A) {
      if (!g || w <= 0 || h <= 0) return;
      A = A || {};
      var k = Math.min(1, Math.max(0, A.kick || 0));
      var bp = (A.beatPhase == null || A.beatPhase < 0) ? 0 : A.beatPhase;
      var lv = Math.min(1, Math.max(0, A.level || 0));
      var th = A.theme || {};
      var accent = th.accent || '#ffffff';
      var bar = Array.isArray(th.bar) ? th.bar : [accent, accent, accent];
      var b32 = (A.bands32 && A.bands32.length >= 32) ? A.bands32 : null;
      var s = synkitPixels._s || (synkitPixels._s = { pts: [], cw: 0, ch: 0, prevK: 0 });
      if (s.cw !== w || s.ch !== h || s.pts.length === 0) {
        s.cw = w; s.ch = h; s.pts = [];
        var cols = 20, rows = 14;
        for (var r = 0; r < rows; r++) {
          for (var c = 0; c < cols; c++) {
            var hx = (c + 0.5) * w / cols, hy = (r + 0.5) * h / rows;
            s.pts.push({ hx: hx, hy: hy, px: hx, py: hy, ox: 0, oy: 0, ci: (c + r) % 3 });
          }
        }
      }
      if (k > 0.65 && s.prevK <= 0.65) {
        for (var i = 0; i < s.pts.length; i++) {
          var p = s.pts[i];
          var dx = p.hx - w / 2, dy = p.hy - h / 2;
          var d = Math.sqrt(dx * dx + dy * dy) || 1;
          p.ox = dx / d * (30 + Math.random() * 70) * (0.5 + k);
          p.oy = dy / d * (30 + Math.random() * 70) * (0.5 + k);
        }
      }
      s.prevK = k;
      var regroup = 1 - bp; // regroup as the beat progresses
      for (var j = 0; j < s.pts.length; j++) {
        var q = s.pts[j];
        var e = b32 ? b32[Math.min(31, (j * 32 / s.pts.length) | 0)] : lv;
        q.px += ((q.hx + q.ox * (1 - regroup * 0.6)) - q.px) * 0.12;
        q.py += ((q.hy + q.oy * (1 - regroup * 0.6)) - q.py) * 0.12;
        q.ox *= 0.94; q.oy *= 0.94;
        g.globalAlpha = 0.4 + e * 0.6;
        g.fillStyle = bar[q.ci];
        var sz = 3 + e * 5 + k * 2;
        g.fillRect(x + q.px - sz / 2, y + q.py - sz / 2, sz, sz);
      }
      g.globalAlpha = 1;
    },
    /* 20. synkit-slices — Synkit Nexus slice shift. */
    'synkit-slices': function synkitSlices(g, x, y, w, h, A) {
      if (!g || w <= 0 || h <= 0) return;
      A = A || {};
      var k = Math.min(1, Math.max(0, A.kick || 0));
      var t = A.t || 0;
      var th = A.theme || {};
      var accent = th.accent || '#ffffff';
      var bar = Array.isArray(th.bar) ? th.bar : [accent, accent, accent];
      var b32 = (A.bands32 && A.bands32.length >= 32) ? A.bands32 : null;
      var slices = 12, sh = h / slices;
      for (var i = 0; i < slices; i++) {
        var dir = (i % 2 === 0) ? 1 : -1;
        var seed = Math.sin(i * 91.7 + Math.floor(t * 2) * 0.13);
        var off = dir * seed * k * w * 0.16;
        var e = b32 ? b32[Math.min(31, Math.floor(i / slices * 32))] : 0.3;
        var bw = Math.max(3, (0.25 + e * 0.75) * sh);
        g.globalAlpha = 0.5 + e * 0.5;
        g.fillStyle = bar[i % 3];
        g.fillRect(x + off - w * 0.03, y + i * sh + (sh - bw) / 2, w * 1.06, bw);
        g.globalAlpha = 0.8;
        g.fillStyle = accent;
        g.fillRect(x + off + w * (0.15 + e * 0.6), y + i * sh + sh / 2 - 1, 14 + k * 22, 2);
      }
      g.globalAlpha = 1;
    },
    /* 21. synkit-chroma — Synkit Nexus chromatic aberration waveform. */
    'synkit-chroma': function synkitChroma(g, x, y, w, h, A) {
      if (!g || w <= 0 || h <= 0) return;
      A = A || {};
      var bass = Math.min(1, Math.max(0, A.bass || 0));
      var lv = Math.min(1, Math.max(0, A.level || 0));
      var t = A.t || 0;
      var th = A.theme || {};
      var accent = th.accent || '#ffffff';
      var bar = Array.isArray(th.bar) ? th.bar : [accent, accent, accent];
      var b32 = (A.bands32 && A.bands32.length >= 32) ? A.bands32 : null;
      var sep = 2 + bass * 16;
      var cols = [bar[2], bar[0], accent];
      var offs = [-sep, 0, sep];
      for (var c = 0; c < 3; c++) {
        g.globalAlpha = 0.75;
        g.strokeStyle = cols[c];
        g.lineWidth = c === 2 ? 2 : 1.5;
        g.beginPath();
        for (var px = 0; px <= w; px += 6) {
          var bi = Math.min(31, Math.floor(px / Math.max(1, w) * 32));
          var e = b32 ? b32[bi] : lv;
          var py = y + h / 2 + Math.sin(px * 0.02 + t * 2.2 + c) * (h * 0.18) * (0.3 + e) * (0.5 + lv);
          if (px === 0) g.moveTo(x + px + offs[c], py); else g.lineTo(x + px + offs[c], py);
        }
        g.stroke();
      }
      g.globalAlpha = 1;
    },
    /* 22. synkit-datamosh — Synkit Nexus datamosh smear. */
    'synkit-datamosh': function synkitDatamosh(g, x, y, w, h, A) {
      if (!g || w <= 0 || h <= 0) return;
      A = A || {};
      var flux = Math.min(1, Math.max(0, A.flux || 0));
      var lv = Math.min(1, Math.max(0, A.level || 0));
      var th = A.theme || {};
      var accent = th.accent || '#ffffff';
      var bar = Array.isArray(th.bar) ? th.bar : [accent, accent, accent];
      var dim = th.dim || accent;
      var s = synkitDatamosh._s || (synkitDatamosh._s = { bars: [], prevFlux: 0, ch: 0 });
      if (s.ch !== h || s.bars.length === 0) {
        s.ch = h; s.bars = [];
        for (var i = 0; i < 16; i++) s.bars.push({ y: (i + 0.5) * h / 16, len: 0.2 + Math.random() * 0.3, smear: 0 });
      }
      var onset = flux > 0.55 && s.prevFlux <= 0.55;
      s.prevFlux = flux;
      if (onset) {
        for (var j = 0; j < s.bars.length; j++) {
          if (Math.random() < 0.6) s.bars[j].smear = 0.6 + Math.random() * 0.8;
        }
      }
      for (var b = 0; b < s.bars.length; b++) {
        var barS = s.bars[b];
        barS.smear = Math.max(0, barS.smear - 0.04);
        var len = Math.min(1, barS.len + barS.smear);
        var bx = x + (Math.sin(b * 37.3) * 0.5 + 0.5) * w * (1 - len) * 0.6;
        g.globalAlpha = 0.3 + lv * 0.4 + barS.smear * 0.3;
        g.fillStyle = barS.smear > 0.25 ? bar[b % 3] : dim;
        g.fillRect(bx, y + barS.y - 3 - lv * 2, Math.max(4, len * w), 6 + lv * 4);
        if (barS.smear > 0.1) {
          g.globalAlpha = barS.smear * 0.35;
          g.fillStyle = accent;
          g.fillRect(bx + len * w * 0.5, y + barS.y - 2, Math.max(2, barS.smear * 60), 3);
        }
      }
      g.globalAlpha = 1;
    },
    /* 23. synkit-glitchgrid — Synkit Nexus corrupt grid. */
    'synkit-glitchgrid': function synkitGlitchgrid(g, x, y, w, h, A) {
      if (!g || w <= 0 || h <= 0) return;
      A = A || {};
      var k = Math.min(1, Math.max(0, A.kick || 0));
      var flux = Math.min(1, Math.max(0, A.flux || 0));
      var lv = Math.min(1, Math.max(0, A.level || 0));
      var th = A.theme || {};
      var accent = th.accent || '#ffffff';
      var bar = Array.isArray(th.bar) ? th.bar : [accent, accent, accent];
      var dim = th.dim || accent;
      var s = synkitGlitchgrid._s || (synkitGlitchgrid._s = { corrupt: [], prevK: 0, prevFlux: 0 });
      var cols = 10, rows = 6;
      if (s.corrupt.length !== cols * rows) s.corrupt = new Array(cols * rows).fill(0);
      var onset = (k > 0.65 && s.prevK <= 0.65) || (flux > 0.6 && s.prevFlux <= 0.6);
      s.prevK = k; s.prevFlux = flux;
      if (onset) {
        for (var n = 0; n < 7; n++) s.corrupt[Math.floor(Math.random() * s.corrupt.length)] = 1;
      }
      var cw = w / cols, chh = h / rows;
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          var idx = r * cols + c;
          var cor = s.corrupt[idx];
          if (cor > 0.02) s.corrupt[idx] = Math.max(0, cor - 0.03);
          var ox = cor > 0.2 ? (Math.sin(idx * 13.7) * 14 * cor) : 0;
          var oy = cor > 0.2 ? (Math.cos(idx * 7.1) * 8 * cor) : 0;
          g.globalAlpha = 0.25 + lv * 0.35;
          g.fillStyle = cor > 0.2 ? bar[(idx + 1) % 3] : dim;
          g.fillRect(x + c * cw + 2 + ox, y + r * chh + 2 + oy, cw - 4, chh - 4);
          if (cor > 0.4) {
            g.globalAlpha = cor * 0.8;
            g.fillStyle = accent;
            g.fillRect(x + c * cw + cw * 0.2, y + r * chh + chh * (0.3 + cor * 0.3), cw * 0.6, 2);
          }
        }
      }
      g.globalAlpha = 1;
    },
    /* 24. starfield — saved reels: drifting stars. */
    'starfield': function starfield(g, x, y, w, h, A) {
      if (!g || w <= 0 || h <= 0) return;
      A = A || {};
      var bass = Math.min(1, Math.max(0, A.bass || 0));
      var lv = Math.min(1, Math.max(0, A.level || 0));
      var th = A.theme || {};
      var accent = th.accent || '#ffffff';
      var bar = Array.isArray(th.bar) ? th.bar : [accent, accent, accent];
      var s = starfield._s || (starfield._s = { stars: [], cw: 0, ch: 0 });
      if (s.cw !== w || s.ch !== h || s.stars.length === 0) {
        s.cw = w; s.ch = h; s.stars = [];
        for (var i = 0; i < 200; i++) {
          s.stars.push({ sx: Math.random() * 2 - 1, sy: Math.random() * 2 - 1, z: 0.15 + Math.random() * 0.85, c: i % 3 });
        }
      }
      var cx = x + w / 2, cy = y + h / 2;
      var speed = 0.002 + lv * 0.008 + bass * 0.012;
      for (var j = 0; j < s.stars.length; j++) {
        var st = s.stars[j];
        st.z -= speed * (1.2 - st.z);
        if (st.z < 0.08) { st.z = 1; st.sx = Math.random() * 2 - 1; st.sy = Math.random() * 2 - 1; }
        var px = cx + st.sx / st.z * w * 0.45;
        var py = cy + st.sy / st.z * h * 0.45;
        if (px < x || px > x + w || py < y || py > y + h) continue;
        var flare = (1 - st.z) * (1 + bass * 2.2);
        g.globalAlpha = 0.3 + (1 - st.z) * 0.7;
        g.fillStyle = bar[st.c];
        g.beginPath();
        g.arc(px, py, 0.6 + flare * 1.8, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    },
    /* 25. tunnel — saved reels: flying ring tunnel. */
    'tunnel': function tunnel(g, x, y, w, h, A) {
      if (!g || w <= 0 || h <= 0) return;
      A = A || {};
      var bpm = A.bpm || 0;
      var lv = Math.min(1, Math.max(0, A.level || 0));
      var bass = Math.min(1, Math.max(0, A.bass || 0));
      var t = A.t || 0;
      var th = A.theme || {};
      var accent = th.accent || '#ffffff';
      var bar = Array.isArray(th.bar) ? th.bar : [accent, accent, accent];
      var cx = x + w / 2 + Math.sin(t * 0.4) * w * 0.03 * (1 + bass);
      var cy = y + h / 2 + Math.cos(t * 0.33) * h * 0.03 * (1 + bass);
      var maxR = Math.min(w, h) * 0.62;
      var speed = bpm > 0 ? bpm / 120 : 0.5;
      var rings = 14;
      g.lineWidth = 1.5;
      for (var i = 0; i < rings; i++) {
        var depth = (((i / rings) + t * 0.22 * speed * (0.6 + lv)) % 1);
        var rr = Math.max(1, depth * depth * maxR);
        g.globalAlpha = 0.12 + depth * 0.75;
        g.strokeStyle = bar[i % 3];
        g.beginPath();
        g.arc(cx, cy, rr, 0, Math.PI * 2);
        g.stroke();
        // Spokes on the ring, denser near the viewer.
        if (depth > 0.45) {
          var spokes = 8;
          g.globalAlpha = (depth - 0.45) * 0.9;
          g.strokeStyle = accent;
          for (var sp = 0; sp < spokes; sp++) {
            var a = sp / spokes * Math.PI * 2 + t * 0.15;
            g.beginPath();
            g.moveTo(cx + Math.cos(a) * rr * 0.86, cy + Math.sin(a) * rr * 0.86);
            g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
            g.stroke();
          }
        }
      }
      g.globalAlpha = 1;
    },
    /* 26. plasma — saved reels: sine plasma field. */
    'plasma': function plasma(g, x, y, w, h, A) {
      if (!g || w <= 0 || h <= 0) return;
      A = A || {};
      var lv = Math.min(1, Math.max(0, A.level || 0));
      var k = Math.min(1, Math.max(0, A.kick || 0));
      var cent = A.centroid || 0;
      var t = A.t || 0;
      var th = A.theme || {};
      var accent = th.accent || '#ffffff';
      var bar = Array.isArray(th.bar) ? th.bar : [accent, accent, accent];
      var shift = Math.min(2, Math.max(0, Math.floor(cent / 3000)));
      var step = 24;
      for (var py = 0; py < h; py += step) {
        for (var px = 0; px < w; px += step) {
          var v = Math.sin(px * 0.012 + t * (0.8 + lv)) + Math.sin(py * 0.014 - t * 0.6)
            + Math.sin((px + py) * 0.008 + t * 0.4 + k * 2) + Math.sin(Math.sqrt(px * px + py * py) * 0.02 - t);
          var bucket = Math.abs(Math.floor((v + 4) / 2.7)) % 3;
          g.globalAlpha = 0.5 + lv * 0.4;
          g.fillStyle = bar[(bucket + shift) % 3];
          g.fillRect(x + px, y + py, step - 1, step - 1);
        }
      }
      g.globalAlpha = 1;
    },
    /* 27. kaleido — saved reels: four-fold spectrum mirror. */
    'kaleido': function kaleido(g, x, y, w, h, A) {
      if (!g || w <= 0 || h <= 0) return;
      A = A || {};
      var bp = (A.beatPhase == null || A.beatPhase < 0) ? 0 : A.beatPhase;
      var k = Math.min(1, Math.max(0, A.kick || 0));
      var th = A.theme || {};
      var accent = th.accent || '#ffffff';
      var bar = Array.isArray(th.bar) ? th.bar : [accent, accent, accent];
      var b32 = (A.bands32 && A.bands32.length >= 32) ? A.bands32 : null;
      var cx = x + w / 2, cy = y + h / 2;
      var maxR = Math.min(w, h) * 0.48;
      var rot = bp * Math.PI * 0.5;
      var wedges = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
      for (var q = 0; q < 4; q++) {
        g.save();
        g.translate(cx, cy);
        g.scale(wedges[q][0], wedges[q][1]);
        g.rotate(rot * (q % 2 ? -1 : 1));
        for (var i = 0; i < 16; i++) {
          var e = b32 ? b32[Math.min(31, i * 2)] : 0.3;
          var a0 = i / 16 * (Math.PI / 2);
          var len = maxR * (0.15 + e * 0.85 + k * 0.1);
          g.globalAlpha = 0.35 + e * 0.6;
          g.strokeStyle = bar[i % 3];
          g.lineWidth = 3 + e * 4;
          g.beginPath();
          g.moveTo(Math.cos(a0) * maxR * 0.12, Math.sin(a0) * maxR * 0.12);
          g.lineTo(Math.cos(a0) * len, Math.sin(a0) * len);
          g.stroke();
        }
        g.restore();
      }
      g.globalAlpha = 1;
      g.fillStyle = accent;
      g.beginPath(); g.arc(cx, cy, 3 + k * 4, 0, Math.PI * 2); g.fill();
    },
    /* 28. slitscan — saved reels: scrolling spectrum history. */
    'slitscan': function slitscan(g, x, y, w, h, A) {
      if (!g || w <= 0 || h <= 0) return;
      A = A || {};
      var bp = (A.beatPhase == null || A.beatPhase < 0) ? -1 : A.beatPhase;
      var lv = Math.min(1, Math.max(0, A.level || 0));
      var t = A.t || 0;
      var th = A.theme || {};
      var accent = th.accent || '#ffffff';
      var bar = Array.isArray(th.bar) ? th.bar : [accent, accent, accent];
      var b32 = (A.bands32 && A.bands32.length >= 32) ? A.bands32 : null;
      var s = slitscan._s || (slitscan._s = { cols: [], lastT: 0, lastBp: -1 });
      var due = false;
      if (bp >= 0) { if (s.lastBp > 0.8 && bp < 0.2) due = true; s.lastBp = bp; }
      else if (t - s.lastT > 0.09) due = true;
      if (due) {
        s.lastT = t;
        var snap = [];
        for (var i = 0; i < 32; i++) snap.push(b32 ? b32[i] : lv * (0.4 + 0.6 * Math.abs(Math.sin(i))));
        s.cols.push(snap);
        var maxCols = Math.max(20, Math.floor(w / 5));
        while (s.cols.length > maxCols) s.cols.shift();
      }
      var cw = 5, n = s.cols.length;
      for (var c = 0; c < n; c++) {
        var col = s.cols[c];
        var age = n === 1 ? 1 : c / n; // newest on the right
        for (var r = 0; r < 32; r++) {
          var e = col[r];
          if (e < 0.06) continue;
          g.globalAlpha = 0.25 + e * 0.7 * (0.4 + age * 0.6);
          g.fillStyle = bar[r % 3];
          var segH = h / 32;
          g.fillRect(x + w - (n - c) * cw, y + r * segH + 1, cw - 1, segH - 2);
        }
      }
      g.globalAlpha = 1;
      g.fillStyle = accent;
      g.fillRect(x + w - 2, y, 2, h);
    },
    /* 29. wave-ribbon — saved reels: three stacked scopes. */
    'wave-ribbon': function waveRibbon(g, x, y, w, h, A) {
      if (!g || w <= 0 || h <= 0) return;
      A = A || {};
      var lv = Math.min(1, Math.max(0, A.level || 0));
      var k = Math.min(1, Math.max(0, A.kick || 0));
      var t = A.t || 0;
      var th = A.theme || {};
      var accent = th.accent || '#ffffff';
      var bar = Array.isArray(th.bar) ? th.bar : [accent, accent, accent];
      var b32 = (A.bands32 && A.bands32.length >= 32) ? A.bands32 : null;
      for (var row = 0; row < 3; row++) {
        var midY = y + h * (0.22 + row * 0.28);
        var amp = h * 0.09 * (0.6 + lv + k * 0.5);
        g.globalAlpha = 0.35 + lv * 0.5;
        g.fillStyle = bar[row % 3];
        g.beginPath();
        g.moveTo(x, midY);
        for (var px = 0; px <= w; px += 8) {
          var bi = Math.min(31, Math.floor(px / Math.max(1, w) * 32));
          var e = b32 ? b32[bi] : lv;
          var py = midY + Math.sin(px * 0.018 + t * (1.4 + row * 0.7) + row * 2) * amp * (0.4 + e);
          g.lineTo(x + px, py);
        }
        g.lineTo(x + w, midY);
        g.closePath(); g.fill();
        g.globalAlpha = 1;
        g.strokeStyle = accent;
        g.lineWidth = 1.5;
        g.beginPath();
        for (var qx = 0; qx <= w; qx += 8) {
          var qi = Math.min(31, Math.floor(qx / Math.max(1, w) * 32));
          var qe = b32 ? b32[qi] : lv;
          var qy = midY + Math.sin(qx * 0.018 + t * (1.4 + row * 0.7) + row * 2) * amp * (0.4 + qe);
          if (qx === 0) g.moveTo(x, qy); else g.lineTo(x + qx, qy);
        }
        g.stroke();
      }
      g.globalAlpha = 1;
    },
    /* 30. vu-wall — saved reels: 32 VU meters with peak hold. */
    'vu-wall': function vuWall(g, x, y, w, h, A) {
      if (!g || w <= 0 || h <= 0) return;
      A = A || {};
      var th = A.theme || {};
      var accent = th.accent || '#ffffff';
      var bar = Array.isArray(th.bar) ? th.bar : [accent, accent, accent];
      var b32 = (A.bands32 && A.bands32.length >= 32) ? A.bands32 : null;
      var s = vuWall._s || (vuWall._s = { peaks: new Array(32).fill(0) });
      var n = 32, bw = w / n;
      for (var i = 0; i < n; i++) {
        var e = b32 ? Math.min(1, Math.max(0, b32[i])) : 0;
        if (e > s.peaks[i]) s.peaks[i] = e; else s.peaks[i] = Math.max(0, s.peaks[i] - 0.012);
        var bh = Math.max(2, e * (h - 8));
        g.globalAlpha = 0.9;
        g.fillStyle = e > 0.75 ? bar[2] : (e > 0.45 ? bar[1] : bar[0]);
        g.fillRect(x + i * bw + 1, y + h - bh, bw - 2, bh);
        g.globalAlpha = 1;
        g.fillStyle = accent;
        g.fillRect(x + i * bw + 1, y + h - Math.max(2, s.peaks[i] * (h - 8)) - 2, bw - 2, 2);
      }
    },
    /* 31. neon-grid — saved reels: perspective grid floor. */
    'neon-grid': function neonGrid(g, x, y, w, h, A) {
      if (!g || w <= 0 || h <= 0) return;
      A = A || {};
      var k = Math.min(1, Math.max(0, A.kick || 0));
      var bpm = A.bpm || 0;
      var lv = Math.min(1, Math.max(0, A.level || 0));
      var t = A.t || 0;
      var th = A.theme || {};
      var accent = th.accent || '#ffffff';
      var grid = th.grid || accent;
      var horizon = y + h * 0.42;
      var cx = x + w / 2;
      var speed = bpm > 0 ? bpm / 120 : 0.6;
      var phase = (t * 0.5 * speed * (0.5 + lv)) % 1;
      g.lineWidth = 1;
      // Converging verticals.
      for (var i = -8; i <= 8; i++) {
        g.globalAlpha = 0.25 + k * 0.45;
        g.strokeStyle = i === 0 ? accent : grid;
        g.beginPath();
        g.moveTo(cx + i * w * 0.03, horizon);
        g.lineTo(cx + i * w * 0.22, y + h);
        g.stroke();
      }
      // Horizontal lines rushing toward the viewer.
      for (var j = 0; j < 9; j++) {
        var f = (j / 9 + phase * (1 / 9)) % 1;
        var ly = horizon + f * f * (h - horizon);
        g.globalAlpha = 0.15 + f * 0.7 + k * 0.2;
        g.strokeStyle = accent;
        g.lineWidth = 1 + f * 1.5;
        g.beginPath();
        g.moveTo(x, ly);
        g.lineTo(x + w, ly);
        g.stroke();
      }
      g.lineWidth = 1;
      g.globalAlpha = 0.7 + k * 0.3;
      g.strokeStyle = accent;
      g.beginPath();
      g.moveTo(x, horizon);
      g.lineTo(x + w, horizon);
      g.stroke();
      g.globalAlpha = 1;
    },
    /* 32. helix — saved reels: double helix. */
    'helix': function helix(g, x, y, w, h, A) {
      if (!g || w <= 0 || h <= 0) return;
      A = A || {};
      var bp = (A.beatPhase == null || A.beatPhase < 0) ? 0 : A.beatPhase;
      var bass = Math.min(1, Math.max(0, A.bass || 0));
      var lv = Math.min(1, Math.max(0, A.level || 0));
      var t = A.t || 0;
      var th = A.theme || {};
      var accent = th.accent || '#ffffff';
      var bar = Array.isArray(th.bar) ? th.bar : [accent, accent, accent];
      var midY = y + h / 2;
      var rad = h * 0.22 * (1 + bass * 0.7);
      var rot = bp * Math.PI * 2 + t * 0.35 * (0.5 + lv);
      var dots = 56;
      for (var i = 0; i < dots; i++) {
        var px = x + (i / dots) * w;
        var ph = (i / dots) * Math.PI * 3 + rot;
        var y1 = midY + Math.sin(ph) * rad;
        var y2 = midY + Math.sin(ph + Math.PI) * rad;
        g.globalAlpha = 0.5 + lv * 0.5;
        g.fillStyle = bar[0];
        g.beginPath(); g.arc(px, y1, 2.5 + bass * 2, 0, Math.PI * 2); g.fill();
        g.fillStyle = bar[2];
        g.beginPath(); g.arc(px, y2, 2.5 + bass * 2, 0, Math.PI * 2); g.fill();
        if (i % 6 === 0) {
          g.globalAlpha = 0.3;
          g.strokeStyle = accent;
          g.lineWidth = 1;
          g.beginPath(); g.moveTo(px, y1); g.lineTo(px, y2); g.stroke();
        }
      }
      g.globalAlpha = 1;
    },
    /* 33. radar — saved reels: radar sweep with onset blips. */
    'radar': function radar(g, x, y, w, h, A) {
      if (!g || w <= 0 || h <= 0) return;
      A = A || {};
      var k = Math.min(1, Math.max(0, A.kick || 0));
      var flux = Math.min(1, Math.max(0, A.flux || 0));
      var bpm = A.bpm || 0;
      var t = A.t || 0;
      var th = A.theme || {};
      var accent = th.accent || '#ffffff';
      var bar = Array.isArray(th.bar) ? th.bar : [accent, accent, accent];
      var grid = th.grid || accent;
      var s = radar._s || (radar._s = { blips: [], prevK: 0, prevFlux: 0, lastT: 0 });
      var dt = Math.min(0.1, Math.max(0, t - (s.lastT || t)));
      s.lastT = t;
      if (k > 0.65 && s.prevK <= 0.65) s.blips.push({ a: Math.random() * Math.PI * 2, r: 0.2 + Math.random() * 0.75, age: 0, c: 1 });
      if (flux > 0.6 && s.prevFlux <= 0.6) s.blips.push({ a: Math.random() * Math.PI * 2, r: 0.2 + Math.random() * 0.75, age: 0, c: 2 });
      if (s.blips.length > 24) s.blips.splice(0, s.blips.length - 24);
      s.prevK = k; s.prevFlux = flux;
      var cx = x + w / 2, cy = y + h / 2;
      var R = Math.min(w, h) * 0.46;
      var sweep = t * (bpm > 0 ? bpm / 60 * Math.PI : 0.9);
      g.lineWidth = 1;
      for (var ring = 1; ring <= 3; ring++) {
        g.globalAlpha = 0.35;
        g.strokeStyle = grid;
        g.beginPath(); g.arc(cx, cy, R * ring / 3, 0, Math.PI * 2); g.stroke();
      }
      // Sweep trail wedge (one translucent wedge, not a gradient per frame).
      g.globalAlpha = 0.14 + k * 0.12;
      g.fillStyle = accent;
      g.beginPath();
      g.moveTo(cx, cy);
      g.arc(cx, cy, R, sweep - 0.6, sweep);
      g.closePath(); g.fill();
      g.globalAlpha = 1;
      g.strokeStyle = accent;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(sweep) * R, cy + Math.sin(sweep) * R);
      g.stroke();
      g.lineWidth = 1;
      for (var b = s.blips.length - 1; b >= 0; b--) {
        var bl = s.blips[b];
        bl.age += dt;
        if (bl.age > 2.5) { s.blips.splice(b, 1); continue; }
        g.globalAlpha = Math.max(0, 1 - bl.age / 2.5);
        g.fillStyle = bl.c === 1 ? accent : bar[2];
        g.beginPath();
        g.arc(cx + Math.cos(bl.a) * bl.r * R, cy + Math.sin(bl.a) * bl.r * R, 3.5 + k * 2, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    },
    /* 34. skyline — saved reels: skyline EQ. */
    'skyline': function skyline(g, x, y, w, h, A) {
      if (!g || w <= 0 || h <= 0) return;
      A = A || {};
      var k = Math.min(1, Math.max(0, A.kick || 0));
      var lv = Math.min(1, Math.max(0, A.level || 0));
      var t = A.t || 0;
      var th = A.theme || {};
      var accent = th.accent || '#ffffff';
      var dim = th.dim || accent;
      var b32 = (A.bands32 && A.bands32.length >= 32) ? A.bands32 : null;
      var n = 24, bw = w / n;
      var tick = Math.floor(t * 4);
      for (var i = 0; i < n; i++) {
        var e = b32 ? b32[Math.min(31, Math.floor(i / n * 32))] : lv;
        var bh = Math.max(h * 0.08, e * h * 0.92);
        var bx = x + i * bw;
        g.globalAlpha = 0.75;
        g.fillStyle = dim;
        g.fillRect(bx + 1, y + h - bh, bw - 2, bh);
        // Antenna on the tallest few.
        if (e > 0.7) {
          g.globalAlpha = 0.9;
          g.fillStyle = accent;
          g.fillRect(bx + bw / 2 - 1, y + h - bh - 8 - k * 6, 2, 8 + k * 6);
        }
        // Windows light up on the kick.
        var winRows = Math.max(1, Math.floor(bh / 12)), winCols = Math.max(1, Math.floor((bw - 2) / 8));
        for (var r = 0; r < winRows; r++) {
          for (var c = 0; c < winCols; c++) {
            var hv = Math.sin((i * 31 + r * 17 + c * 7) * 12.9898 + tick * 0.9);
            hv = hv - Math.floor(hv);
            if (hv < 0.35 + k * 0.5 + e * 0.2) {
              g.globalAlpha = 0.85;
              g.fillStyle = accent;
              g.fillRect(bx + 3 + c * 8, y + h - bh + 4 + r * 12, 4, 5);
            }
          }
        }
      }
      g.globalAlpha = 1;
    },
    /* 35. spray — saved reels: bottom particle spray. */
    'spray': function spray(g, x, y, w, h, A) {
      if (!g || w <= 0 || h <= 0) return;
      A = A || {};
      var lv = Math.min(1, Math.max(0, A.level || 0));
      var k = Math.min(1, Math.max(0, A.kick || 0));
      var th = A.theme || {};
      var accent = th.accent || '#ffffff';
      var bar = Array.isArray(th.bar) ? th.bar : [accent, accent, accent];
      var s = spray._s || (spray._s = { pts: [] });
      var spawn = Math.floor(1 + lv * 9 + k * 6);
      for (var i = 0; i < spawn && s.pts.length < 280; i++) {
        s.pts.push({
          px: x + w / 2 + (Math.random() - 0.5) * w * 0.08,
          py: y + h,
          vx: (Math.random() - 0.5) * (2 + k * 7),
          vy: -(3 + Math.random() * (4 + lv * 7 + k * 5)),
          life: 1, c: Math.floor(Math.random() * 3)
        });
      }
      for (var j = s.pts.length - 1; j >= 0; j--) {
        var p = s.pts[j];
        p.vy += 0.12;
        p.px += p.vx; p.py += p.vy;
        p.life -= 0.012;
        if (p.life <= 0 || p.py > y + h + 10) { s.pts.splice(j, 1); continue; }
        g.globalAlpha = Math.max(0, p.life) * (0.5 + lv * 0.5);
        g.fillStyle = bar[p.c];
        g.beginPath();
        g.arc(p.px, p.py, 1.5 + (1 - p.life) * 1.5 + k, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    },
    /* 36. orbit2 — saved reels: elliptical orbits, tilted by the beat. */
    'orbit2': function orbit2(g, x, y, w, h, A) {
      if (!g || w <= 0 || h <= 0) return;
      A = A || {};
      var bp = (A.beatPhase == null || A.beatPhase < 0) ? 0 : A.beatPhase;
      var bass = Math.min(1, Math.max(0, A.bass || 0));
      var k = Math.min(1, Math.max(0, A.kick || 0));
      var t = A.t || 0;
      var th = A.theme || {};
      var accent = th.accent || '#ffffff';
      var bar = Array.isArray(th.bar) ? th.bar : [accent, accent, accent];
      var grid = th.grid || accent;
      var b32 = (A.bands32 && A.bands32.length >= 32) ? A.bands32 : null;
      var cx = x + w / 2, cy = y + h / 2;
      var tilt = (bp - 0.5) * 0.6;
      var orbits = 4;
      for (var o = 0; o < orbits; o++) {
        var e = b32 ? b32[Math.min(31, o * 8 + 2)] : 0.3;
        var rx = w * (0.14 + o * 0.08) * (1 + bass * 0.25 + e * 0.2);
        var ry = h * (0.1 + o * 0.06) * (1 + bass * 0.25 + e * 0.2);
        g.save();
        g.translate(cx, cy);
        g.rotate(tilt * (o % 2 ? -1 : 1));
        g.globalAlpha = 0.4;
        g.strokeStyle = grid;
        g.lineWidth = 1;
        g.beginPath();
        g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        g.stroke();
        var dots = 5 + o * 2;
        for (var d = 0; d < dots; d++) {
          var a = (d / dots) * Math.PI * 2 + t * (0.3 + o * 0.12) * (o % 2 ? -1 : 1) * (1 + e * 2);
          var px = Math.cos(a) * rx, py = Math.sin(a) * ry;
          g.globalAlpha = 0.55 + e * 0.45;
          g.fillStyle = bar[o % 3];
          g.beginPath();
          g.arc(px, py, 2.5 + e * 3 + k * 1.5, 0, Math.PI * 2);
          g.fill();
        }
        g.restore();
      }
      g.globalAlpha = 1;
      g.fillStyle = accent;
      g.beginPath(); g.arc(cx, cy, 3 + k * 3, 0, Math.PI * 2); g.fill();
    },
    /* 37. snow — saved reels: CRT static / snow. */
    'snow': function snow(g, x, y, w, h, A) {
      if (!g || w <= 0 || h <= 0) return;
      A = A || {};
      var flux = Math.min(1, Math.max(0, A.flux || 0));
      var k = Math.min(1, Math.max(0, A.kick || 0));
      var lv = Math.min(1, Math.max(0, A.level || 0));
      var th = A.theme || {};
      var accent = th.accent || '#ffffff';
      var dim = th.dim || accent;
      var count = Math.floor(60 + flux * 320 + lv * 60);
      for (var i = 0; i < count; i++) {
        g.globalAlpha = 0.15 + Math.random() * 0.6;
        g.fillStyle = Math.random() < 0.75 ? accent : dim;
        var sz = Math.random() < 0.9 ? 1 : 2;
        g.fillRect(x + Math.random() * w, y + Math.random() * h, sz, sz);
      }
      // Horizontal tear on a hard kick.
      if (k > 0.72) {
        var tearY = y + Math.random() * h;
        g.globalAlpha = 0.5 + k * 0.4;
        g.fillStyle = accent;
        g.fillRect(x, tearY, w, 2 + k * 3);
        g.globalAlpha = 0.3;
        g.fillRect(x, tearY + 8, w, 1);
        g.fillRect(x, tearY - 8, w, 1);
      }
      g.globalAlpha = 1;
    }
  }
};
