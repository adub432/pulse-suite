'use strict';
/* Pulse Suite — pop-out panel window (live code editor / hex editor).
   One source of truth lives in the main window; this window is a second
   view of it. State arrives via 'popout-state' (relayed by the main
   process); edits go back via 'popout-edit' and apply immediately in the
   main window. Closing this window (or Dock back) returns the panel to the
   main window — nothing is destroyed. */
const $ = (id) => document.getElementById(id);
const panel = new URLSearchParams(location.search).get('panel') || 'code';
const isCode = panel === 'code';

$('pop-title').textContent = isCode ? 'LIVE CODE — STRUDEL' : 'HEX EDITOR — LIVE';
$('pop-code-wrap').hidden = !isCode;
$('pop-hex-wrap').hidden = isCode;
$('btn-pop-dock').addEventListener('click', () => window.pulse.popoutDock(panel));

/* ---------- code panel ---------- */
let fxTimer = null, customTimer = null;
if (isCode) {
  $('pop-fx').addEventListener('input', () => {
    clearTimeout(fxTimer);
    fxTimer = setTimeout(() => {
      let parsed = null, err = null;
      try { parsed = JSON.parse($('pop-fx').value); } catch (e) { err = String(e.message || e); }
      $('pop-fx').classList.toggle('bad', !!err);
      $('pop-status').textContent = err ? 'FX params: ' + err : 'FX params applied live';
      if (parsed) window.pulse.popoutSendEdit('code', { type: 'fx', params: parsed });
    }, 350);
  });
  $('pop-custom').addEventListener('input', () => {
    clearTimeout(customTimer);
    customTimer = setTimeout(() => {
      window.pulse.popoutSendEdit('code', { type: 'custom', text: $('pop-custom').value });
      $('pop-status').textContent = 'custom lines live — appended to the generated program';
    }, 350);
  });
}

/* ---------- hex panel ---------- */
let hexOffset = 0, hexSize = 0, hexSel = -1;
if (!isCode) {
  const editBox = $('pop-hex-edit');
  const renderHexRows = (bytes, orig, offset) => {
    const rows = [];
    for (let r = 0; r < bytes.length; r += 16) {
      const off = offset + r;
      let hexHtml = '', ascii = '';
      for (let i = 0; i < 16; i++) {
        const idx = r + i;
        if (idx >= bytes.length) { hexHtml += '   '; ascii += ' '; continue; }
        const b = bytes[idx], ob = orig[idx];
        const abs = off + i;
        const cls = (abs === hexSel ? 'sel' : '') + (b !== ob ? ' diff' : '');
        hexHtml += `<span data-off="${abs}" class="${cls}">${b.toString(16).padStart(2, '0')}</span> `;
        ascii += (b >= 32 && b < 127) ? String.fromCharCode(b) : '.';
      }
      rows.push(`<div class="hex-row"><span class="hex-off">0x${off.toString(16).padStart(8, '0')}</span><span class="hex-bytes">${hexHtml}</span><span class="hex-ascii">${ascii.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span></div>`);
    }
    $('pop-hex').innerHTML = rows.join('');
    $('pop-hex-offset').textContent = `offset 0x${offset.toString(16).padStart(8, '0')} — ${offset.toLocaleString()} / ${hexSize.toLocaleString()} bytes`;
  };
  window.__popHexRender = renderHexRows;
  $('pop-hex').addEventListener('click', (e) => {
    const span = e.target.closest('span[data-off]');
    if (!span) return;
    hexSel = Number(span.dataset.off);
    $('pop-hex-sel').textContent = `selected 0x${hexSel.toString(16)} — type a hex byte and press Enter`;
    editBox.focus();
  });
  $('pop-hex').addEventListener('dblclick', (e) => {
    const span = e.target.closest('span[data-off]');
    if (!span) return;
    hexSel = Number(span.dataset.off);
    editBox.value = span.textContent;
    editBox.focus(); editBox.select();
  });
  editBox.addEventListener('change', () => {
    const v = parseInt(editBox.value, 16);
    if (hexSel < 0 || isNaN(v) || v < 0 || v > 255) { $('pop-hex-sel').textContent = 'type a hex byte 00–ff'; return; }
    window.pulse.popoutSendEdit('hex', { type: 'write', offset: hexSel, value: v });
    $('pop-hex-sel').textContent = `wrote 0x${v.toString(16).padStart(2, '0')} at 0x${hexSel.toString(16)}`;
  });
  $('pop-hex-prev').addEventListener('click', () => {
    window.pulse.popoutSendEdit('hex', { type: 'nav', dir: -1 });
  });
  $('pop-hex-next').addEventListener('click', () => {
    window.pulse.popoutSendEdit('hex', { type: 'nav', dir: 1 });
  });
}

/* ---------- incoming live state ---------- */
window.pulse.onPopoutState((data) => {
  if (!data) return;
  if (isCode && data.kind === 'code') {
    if (data.text != null && $('pop-code').textContent !== data.text) $('pop-code').textContent = data.text;
    if (data.fx && !$('pop-fx').matches(':focus')) {
      const txt = JSON.stringify(data.fx, null, 2);
      if ($('pop-fx').value !== txt) $('pop-fx').value = txt;
    }
    if (data.custom != null && !$('pop-custom').matches(':focus') && $('pop-custom').value !== data.custom) {
      $('pop-custom').value = data.custom;
    }
    if (data.status) $('pop-status').textContent = data.status;
  } else if (!isCode && data.kind === 'hex') {
    hexOffset = data.offset || 0; hexSize = data.size || 0;
    if (data.bytes && data.orig) {
      window.__popHexRender(new Uint8Array(data.bytes), new Uint8Array(data.orig), hexOffset);
    } else if (data.message) {
      $('pop-hex').textContent = data.message;
    }
    if (data.status) $('pop-status').textContent = data.status;
  }
});
