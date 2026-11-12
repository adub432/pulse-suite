'use strict';
/* ============================================================================
   Pulse Suite v0.2.6 — modular layout: drag / resize / show-hide, persisted
   ----------------------------------------------------------------------------
   Every [data-layout-panel] is a module you can move:
     - DRAG: grab the ⋮⋮ grip on a panel's title bar (or the slim drag bar
       on panels that have no title). Docked panels REORDER inside their
       parent (CSS order); absolutely-positioned panels (live code,
       layers) MOVE on top of the stage instead.
     - RESIZE: the corner grip at a panel's bottom-right. Left-column
       panels in the 2-column tabs resize the grid column; the code and
       layers panels resize freely (width + height); Play's top/viz strips
       resize by height.
     - HIDE: right-click a panel → "Hide panel". Right-click empty tab
       space → a menu listing the tab's hidden panels to bring back.
     - RESET: PulseLayout.resetLayout() — everything back to the
       built-in layout, and the saved layout is cleared.
   Layout persists in pulse-config.json under `layout` and is restored on
   launch. Pop-out stays limited to the code + hex editors — drag/resize
   happens inside the app, never as new windows.
   ========================================================================== */
window.PulseLayout = (() => {
  const GRID_TABS = ['#tab-cook', '#tab-glitch', '#tab-ascii', '#tab-cut', '#play-mc'];
  const $ = (id) => document.getElementById(id);
  let saved = null;

  const panels = () => [...document.querySelectorAll('[data-layout-panel]')];
  const keyOf = (el) => el.dataset.layoutPanel;
  const isAbsolute = (el) => getComputedStyle(el).position === 'absolute';

  function persist() {
    const layout = { panels: {}, grids: {} };
    for (const el of panels()) {
      layout.panels[keyOf(el)] = {
        order: el.style.order ? Number(el.style.order) : null,
        hidden: el.classList.contains('layout-hidden'),
        w: el.style.width || null,
        h: el.style.height || null,
        basis: el.style.flexBasis || null,
        left: el.style.left || null,
        top: el.style.top || null,
      };
    }
    for (const sel of GRID_TABS) {
      const parent = document.querySelector(sel);
      if (parent && parent.style.gridTemplateColumns) layout.grids[sel] = parent.style.gridTemplateColumns;
    }
    const playPanels = $('play-panels');
    if (playPanels && playPanels.style.gridTemplateColumns) layout.grids['#play-panels'] = playPanels.style.gridTemplateColumns;
    saved = layout;
    if (window.pulse && window.pulse.setConfig) window.pulse.setConfig({ layout }).catch(() => {});
  }

  function applySaved(layout) {
    if (!layout) return;
    saved = layout;
    for (const el of panels()) {
      const s = (layout.panels || {})[keyOf(el)];
      if (!s) continue;
      if (s.order != null) el.style.order = String(s.order);
      if (s.hidden) el.classList.add('layout-hidden');
      if (s.w) el.style.width = s.w;
      if (s.h) el.style.height = s.h;
      if (s.basis) el.style.flexBasis = s.basis;
      if (s.left) el.style.left = s.left;
      if (s.top) el.style.top = s.top;
    }
    for (const [sel, cols] of Object.entries(layout.grids || {})) {
      const parent = document.querySelector(sel);
      if (parent) parent.style.gridTemplateColumns = cols;
    }
  }

  function resetLayout() {
    for (const el of panels()) {
      el.style.order = ''; el.style.width = ''; el.style.height = '';
      el.style.flexBasis = ''; el.style.left = ''; el.style.top = '';
      el.classList.remove('layout-hidden');
    }
    for (const sel of [...GRID_TABS, '#play-panels']) {
      const parent = document.querySelector(sel);
      if (parent) parent.style.gridTemplateColumns = '';
    }
    saved = { panels: {}, grids: {} };
    if (window.pulse && window.pulse.setConfig) window.pulse.setConfig({ layout: null }).catch(() => {});
  }

  function hidePanel(el) { el.classList.add('layout-hidden'); persist(); }
  function showPanel(key) {
    const el = document.querySelector(`[data-layout-panel="${key}"]`);
    if (el) { el.classList.remove('layout-hidden'); persist(); }
  }
  function hiddenPanels() {
    return panels().filter((el) => el.classList.contains('layout-hidden')).map((el) => ({ key: keyOf(el), name: el.dataset.moduleName || el.querySelector('.pane-title')?.textContent?.trim() || keyOf(el) }));
  }

  /* ---------- drag: reorder (docked) or move (absolute) ---------- */
  function attachDrag(el) {
    // Find the title bar to host the grip; panels without one get a slim bar.
    let host = el.querySelector('.pane-title, .code-head, .layers-head, #play-mc-head');
    if (!host) {
      const bar = document.createElement('div');
      bar.className = 'drag-bar';
      el.prepend(bar);
      host = bar;
    }
    const grip = document.createElement('span');
    grip.className = 'drag-grip';
    grip.textContent = '⋮⋮';
    grip.title = 'Drag to move this panel';
    host.prepend(grip);
    grip.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      grip.setPointerCapture(ev.pointerId);
      const startX = ev.clientX, startY = ev.clientY;
      const parent = el.parentElement;
      const siblings = [...parent.children].filter((c) => c.dataset && c.dataset.layoutPanel);
      const absolute = isAbsolute(el);
      let origLeft = 0, origTop = 0, moved = false;
      if (absolute) {
        const r = el.getBoundingClientRect(), pr = parent.getBoundingClientRect();
        origLeft = r.left - pr.left; origTop = r.top - pr.top;
      } else {
        // Give every sibling an explicit order so swaps are well-defined.
        siblings.forEach((s, i) => { if (!s.style.order) s.style.order = String(i); });
      }
      el.classList.add('layout-dragging');
      const onMove = (e2) => {
        const dx = e2.clientX - startX, dy = e2.clientY - startY;
        if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
        if (!moved) return;
        if (absolute) {
          const pr = parent.getBoundingClientRect();
          const w = el.offsetWidth, h = el.offsetHeight;
          el.style.left = Math.max(0, Math.min(pr.width - 80, origLeft + dx)) + 'px';
          el.style.top = Math.max(0, Math.min(pr.height - 40, origTop + dy)) + 'px';
        } else {
          // Drop target: the sibling whose centre the pointer is closest to.
          let best = null, bestD = Infinity;
          for (const s of siblings) {
            if (s === el) continue;
            const r = s.getBoundingClientRect();
            const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
            const d = Math.hypot(e2.clientX - cx, e2.clientY - cy);
            if (d < bestD) { bestD = d; best = s; }
          }
          if (best) {
            const a = Number(el.style.order), b = Number(best.style.order);
            if (a !== b) {
              // Shift the siblings between a and b by one, drop el at b.
              for (const s of siblings) {
                const o = Number(s.style.order);
                if (a < b && o > a && o <= b) s.style.order = String(o - 1);
                if (a > b && o >= b && o < a) s.style.order = String(o + 1);
              }
              el.style.order = String(b);
            }
          }
        }
      };
      const onUp = () => {
        el.classList.remove('layout-dragging');
        grip.removeEventListener('pointermove', onMove);
        grip.removeEventListener('pointerup', onUp);
        grip.removeEventListener('pointercancel', onUp);
        if (moved) persist();
      };
      grip.addEventListener('pointermove', onMove);
      grip.addEventListener('pointerup', onUp);
      grip.addEventListener('pointercancel', onUp);
    });
  }

  /* ---------- resize: corner grip ---------- */
  function attachResize(el) {
    const parent = el.parentElement;
    const inGrid2 = GRID_TABS.some((sel) => parent.matches(sel));
    const inPlayPanels = parent.id === 'play-panels';
    const absolute = isAbsolute(el);
    const isStrip = el.id === 'play-viz' || el.id === 'play-top';
    // Right-column grid panels and the stage don't resize (they fill the
    // remaining space); everything else gets a grip.
    if (!absolute && !inGrid2 && !inPlayPanels && !isStrip) return;
    if (inGrid2 && el === parent.children[1]) return; // right column fills
    const grip = document.createElement('div');
    grip.className = 'resize-grip';
    grip.title = 'Drag to resize this panel';
    el.appendChild(grip);
    grip.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      ev.stopPropagation();
      grip.setPointerCapture(ev.pointerId);
      const startX = ev.clientX, startY = ev.clientY;
      const startW = el.offsetWidth, startH = el.offsetHeight;
      const gridStart = inGrid2 || inPlayPanels ? parent.style.gridTemplateColumns : null;
      const onMove = (e2) => {
        const dx = e2.clientX - startX, dy = e2.clientY - startY;
        if (absolute) {
          el.style.width = Math.max(220, startW + dx) + 'px';
          el.style.height = Math.max(120, startH + dy) + 'px';
        } else if (inGrid2) {
          // Left column of a 2-col grid: rewrite the track.
          parent.style.gridTemplateColumns = `${Math.max(220, startW + dx)}px 1fr`;
        } else if (inPlayPanels) {
          // Three panes: freeze all three to px, then move the dragged one.
          const kids = [...parent.children].filter((c) => c.dataset && c.dataset.layoutPanel);
          if (!gridStart) {
            kids.forEach((k) => { k.style.width = k.offsetWidth + 'px'; });
            parent.style.gridTemplateColumns = kids.map((k) => k.offsetWidth + 'px').join(' ');
          }
          const idx = kids.indexOf(el);
          const widths = kids.map((k) => k.offsetWidth);
          widths[idx] = Math.max(160, startW + dx);
          parent.style.gridTemplateColumns = widths.map((w) => w + 'px').join(' ');
        } else if (isStrip) {
          el.style.flexBasis = Math.max(60, startH + dy) + 'px';
          el.style.height = Math.max(60, startH + dy) + 'px';
        }
      };
      const onUp = () => {
        grip.removeEventListener('pointermove', onMove);
        grip.removeEventListener('pointerup', onUp);
        grip.removeEventListener('pointercancel', onUp);
        persist();
      };
      grip.addEventListener('pointermove', onMove);
      grip.addEventListener('pointerup', onUp);
      grip.addEventListener('pointercancel', onUp);
    });
  }

  function init(cfg) {
    for (const el of panels()) {
      if (!el.dataset.layoutInit) {
        el.dataset.layoutInit = '1';
        attachDrag(el);
        attachResize(el);
      }
    }
    if (cfg && cfg.layout) applySaved(cfg.layout);
  }

  return { init, resetLayout, hidePanel, showPanel, hiddenPanels, persist };
})();
