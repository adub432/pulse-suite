'use strict';
/* ============================================================================
   Pulse Suite v0.2.7 — modular layout: drag / resize / show-hide, persisted
   ----------------------------------------------------------------------------
   Every [data-layout-panel] is a module you can move:
     - DRAG: grab the ⋮⋮ grip on a panel's title bar (or the slim drag bar
       on panels that have no title).
       * Docked panels REORDER inside their parent — the drop slot is
         computed from a SNAPSHOT of the siblings' positions taken at
         drag start (v0.2.7 fix: the 0.2.6 code re-read live rects after
         every swap, so the panel oscillated and often ended where it
         started).
       * Absolutely-positioned panels (live code, layers, and any panel
         dragged free) MOVE on top of the stage. v0.2.7 fix: at drag
         start the panel's size is frozen and the opposite edges
         (right/bottom) are unpinned — 0.2.6 set left/top while the
         stylesheet's bottom:12px stayed, so the panel stretched instead
         of translating and the bottom-anchored resize grip stayed locked
         to the container's edge (the bug Austin found with a real mouse).
       * CROSS-CONTAINER (v0.2.7): drag a panel out of its parent and it
         detaches into a free-floating panel that follows the pointer.
         Drop it over another panel container in the same tab to dock it
         there, or anywhere else in the tab to leave it free — so the
         live map can be dragged from Mission Control to the top of the
         Play tab. Drops outside the tab snap the panel back home.
     - RESIZE: the corner grip at a panel's bottom-right. Left-column
       panels in the 2-column tabs resize the grid column; the code and
       layers panels resize freely (width + height); Play's top/viz strips
       resize by height. The grip's mode is computed from the panel's
       CURRENT parent at drag time (v0.2.7: panels can change parents
       now), and the filler column (last panel in a 2-col grid) gets no
       grip — 0.2.6 skipped children[1], which in #play-mc is the LIVE
       MAP (left column), so the map had no grip at all.
     - HIDE: right-click a panel → "Hide panel". Right-click empty tab
       space → a menu listing the tab's hidden panels to bring back.
     - RESET: PulseLayout.resetLayout() — everything back to the
       built-in layout (including home parents), and the saved layout is
       cleared.
   Layout persists in pulse-config.json under `layout` (order, hidden,
   size, left/top, parent selector, free flag) and is restored on launch.
   Pop-out stays limited to the code + hex editors — drag/resize happens
   inside the app, never as new windows.
   ========================================================================== */
window.PulseLayout = (() => {
  const GRID_TABS = ['#tab-cook', '#tab-glitch', '#tab-ascii', '#tab-cut', '#play-mc'];
  const $ = (id) => document.getElementById(id);
  let saved = null;

  const panels = () => [...document.querySelectorAll('[data-layout-panel]')];
  const keyOf = (el) => el.dataset.layoutPanel;
  const isAbsolute = (el) => getComputedStyle(el).position === 'absolute';
  const selOf = (el) => (el && el.id ? '#' + el.id : null);
  // Home (built-in) parent + sibling, recorded at init, for resetLayout.
  const homes = new Map();

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
        parent: selOf(el.parentElement),
        free: el.dataset.free === '1',
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
      // Re-parent first: order/size only make sense inside the right parent.
      if (s.parent) {
        const p = document.querySelector(s.parent);
        if (p && p !== el.parentElement) p.appendChild(el);
      }
      if (s.free) {
        el.dataset.free = '1';
        el.style.position = 'absolute';
      } else {
        delete el.dataset.free;
        el.style.position = '';
      }
      if (s.order != null) el.style.order = String(s.order);
      if (s.hidden) el.classList.add('layout-hidden');
      if (s.w) el.style.width = s.w;
      if (s.h) el.style.height = s.h;
      if (s.basis) el.style.flexBasis = s.basis;
      // left/top only pin free/absolute panels; docked panels flow.
      if (s.free || isAbsolute(el)) {
        if (s.left) el.style.left = s.left;
        if (s.top) el.style.top = s.top;
      } else {
        el.style.left = ''; el.style.top = '';
      }
    }
    for (const [sel, cols] of Object.entries(layout.grids || {})) {
      const parent = document.querySelector(sel);
      if (parent) parent.style.gridTemplateColumns = cols;
    }
    refreshAllGrips();
  }

  function resetLayout() {
    for (const el of panels()) {
      const home = homes.get(el);
      if (home && home.parent) home.parent.insertBefore(el, home.next);
      delete el.dataset.free;
      el.style.order = ''; el.style.width = ''; el.style.height = '';
      el.style.flexBasis = ''; el.style.left = ''; el.style.top = ''; el.style.position = '';
      el.classList.remove('layout-hidden');
    }
    for (const sel of [...GRID_TABS, '#play-panels']) {
      const parent = document.querySelector(sel);
      if (parent) parent.style.gridTemplateColumns = '';
    }
    saved = { panels: {}, grids: {} };
    if (window.pulse && window.pulse.setConfig) window.pulse.setConfig({ layout: null }).catch(() => {});
    refreshAllGrips();
  }

  function hidePanel(el) { el.classList.add('layout-hidden'); persist(); }
  function showPanel(key) {
    const el = document.querySelector(`[data-layout-panel="${key}"]`);
    if (el) { el.classList.remove('layout-hidden'); persist(); }
  }
  function hiddenPanels() {
    return panels().filter((el) => el.classList.contains('layout-hidden')).map((el) => ({ key: keyOf(el), name: el.dataset.moduleName || el.querySelector('.pane-title')?.textContent?.trim() || keyOf(el) }));
  }

  /* ---------- grip visibility: filler columns get no resize grip ----------
     A 2-col grid's LAST layout panel fills the remaining space — it has
     nothing to resize. (v0.2.7: 0.2.6 hardcoded children[1]; in #play-mc
     children[1] is the live map, the LEFT column, so the map lost its
     grip and the rail wrongly kept one.) */
  function isFiller(el) {
    const parent = el.parentElement;
    if (!parent || !GRID_TABS.some((sel) => parent.matches(sel))) return false;
    const kids = [...parent.children].filter((c) => c.dataset && c.dataset.layoutPanel);
    return kids.length > 1 && kids[kids.length - 1] === el;
  }
  function refreshGrip(el) {
    const grip = el.querySelector(':scope > .resize-grip');
    if (!grip) return;
    grip.style.display = isFiller(el) ? 'none' : '';
  }
  function refreshAllGrips() { for (const el of panels()) refreshGrip(el); }

  /* ---------- drag: reorder (docked), move (absolute), detach (free) ----- */
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
      try { grip.setPointerCapture(ev.pointerId); } catch (_) {}
      const startX = ev.clientX, startY = ev.clientY;
      const tab = el.closest('.panel') || el.parentElement;
      const homeParent = el.parentElement;
      const homeNext = el.nextSibling;
      const homeOrder = el.style.order;
      const homePos = { left: el.style.left, top: el.style.top, w: el.style.width, h: el.style.height, position: el.style.position, free: el.dataset.free };
      const r0 = el.getBoundingClientRect();
      const grabDX = startX - r0.left, grabDY = startY - r0.top;
      const absolute = isAbsolute(el) || el.dataset.free === '1';
      let moved = false, detached = false;
      let snapshot = null; // docked reorder snapshot (fixed at drag start)
      let dropZone = null;

      // Candidate drop zones in this tab: every element that holds layout
      // panels. The tab itself is the free zone (dockable only when it is
      // a grid/flex container, e.g. #tab-cook / #tab-play; #tab-visualize
      // is a stage, so drops there stay free).
      const zones = [];
      if (tab) {
        for (const z of [tab, ...tab.querySelectorAll('*')]) {
          if ([...z.children].some((c) => c.dataset && c.dataset.layoutPanel)) zones.push(z);
        }
      }
      const zoneAt = (x, y) => {
        const hit = document.elementFromPoint(x, y);
        if (!hit) return null;
        for (let n = hit; n && n !== document.body; n = n.parentElement) {
          if (zones.includes(n)) return n;
          if (n === tab) return tab;
        }
        return null;
      };
      const zoneIsDockable = (z) => {
        if (!z || z === tab) {
          if (!z) return false;
          const d = getComputedStyle(z).display;
          return d === 'grid' || d === 'flex';
        }
        return true;
      };

      const dockSnapshot = (parent) => {
        const sibs = [...parent.children].filter((c) => c.dataset && c.dataset.layoutPanel);
        sibs.forEach((s, i) => { if (!s.style.order) s.style.order = String(i); });
        const rects = sibs.map((s) => {
          const r = s.getBoundingClientRect();
          return { el: s, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
        });
        const spreadX = Math.max(...rects.map((r) => r.cx)) - Math.min(...rects.map((r) => r.cx));
        const spreadY = Math.max(...rects.map((r) => r.cy)) - Math.min(...rects.map((r) => r.cy));
        return { parent, rects, axis: spreadX >= spreadY ? 'x' : 'y' };
      };
      const applySlotOrder = (snap, x, y) => {
        // Slot from the FIXED snapshot — the pointer's position against
        // the MIDPOINTS between the siblings' start-of-drag centres, so
        // a swap never flips the answer on the next move (the 0.2.6
        // oscillation) and the panel follows the pointer promptly.
        const others = snap.rects.filter((s) => s.el !== el);
        const centres = snap.rects.map((s) => (snap.axis === 'x' ? s.cx : s.cy)).sort((a, b) => a - b);
        const v = snap.axis === 'x' ? x : y;
        let idx = 0;
        for (let i = 0; i < centres.length - 1; i++) {
          if (v > (centres[i] + centres[i + 1]) / 2) idx = i + 1; else break;
        }
        const finalOrder = others.map((o) => o.el);
        finalOrder.splice(idx, 0, el);
        finalOrder.forEach((s, i) => { s.style.order = String(i); });
      };
      const dockInto = (zone, x, y) => {
        // One-shot dock at drop time: insert at the slot under the pointer.
        const kids = [...zone.children].filter((c) => c.dataset && c.dataset.layoutPanel && c !== el);
        // Slot axis: a multi-column grid docks by x, a vertical flow by y.
        const cols = (getComputedStyle(zone).gridTemplateColumns || '').trim().split(/\s+/).filter(Boolean).length;
        const horizontal = cols > 1;
        let idx = kids.length;
        for (let i = 0; i < kids.length; i++) {
          const r = kids[i].getBoundingClientRect();
          const c = horizontal ? r.left + r.width / 2 : r.top + r.height / 2;
          if ((horizontal ? x : y) < c) { idx = i; break; }
        }
        delete el.dataset.free;
        el.style.position = ''; el.style.left = ''; el.style.top = '';
        el.style.width = ''; el.style.height = ''; el.style.flexBasis = '';
        if (idx >= kids.length) zone.appendChild(el);
        else zone.insertBefore(el, kids[idx]);
        const all = [...zone.children].filter((c) => c.dataset && c.dataset.layoutPanel);
        all.forEach((s, i) => { s.style.order = String(i); });
        // A flex-column zone (e.g. #tab-play) would shrink a scrollable
        // panel to its automatic minimum (overflow makes it 0): pin the
        // height it had when the drag started, and don't let it shrink.
        if (getComputedStyle(zone).display === 'flex'
          && getComputedStyle(zone).flexDirection === 'column') {
          el.style.flex = '0 0 auto';
          el.style.height = Math.round(r0.height) + 'px';
        }
      };
      const detachToFree = (x, y) => {
        // Leave the flow: the panel becomes an absolutely-positioned
        // child of the tab and follows the pointer.
        detached = true;
        el.dataset.free = '1';
        const w = el.offsetWidth, h = el.offsetHeight;
        tab.appendChild(el);
        el.style.position = 'absolute';
        el.style.width = w + 'px';
        el.style.height = h + 'px';
        el.style.order = '';
        moveFree(x, y);
      };
      const moveFree = (x, y) => {
        const tr = tab.getBoundingClientRect();
        const w = el.offsetWidth, h = el.offsetHeight;
        el.style.left = Math.max(0, Math.min(tr.width - 80, x - tr.left - grabDX)) + 'px';
        el.style.top = Math.max(0, Math.min(tr.height - 40, y - tr.top - grabDY)) + 'px';
      };
      const unpinAbsolute = () => {
        // v0.2.7: freeze the size and clear the opposite edges, so
        // left/top translate the panel rigidly instead of stretching it
        // against a stylesheet bottom:/right: constraint.
        el.style.width = el.offsetWidth + 'px';
        el.style.height = el.offsetHeight + 'px';
        el.style.right = 'auto';
        el.style.bottom = 'auto';
      };

      if (absolute) {
        unpinAbsolute();
      } else {
        snapshot = dockSnapshot(el.parentElement);
      }
      el.classList.add('layout-dragging');
      // v0.2.7: the dragged panel must not occlude the drop target —
      // elementFromPoint would hit the panel itself instead of the zone
      // beneath it. pointer-events:none for the drag's duration.
      el.style.pointerEvents = 'none';
      // v0.2.7: move/up listeners live on WINDOW (capture phase), not on
      // the grip. A captured pointer can be LOST mid-drag on real Windows
      // (autoscroll near the top edge fires lostpointercapture — the live
      // map's drag died at y≈78 on the repro, the drop never ran, and the
      // panel stayed free). Window listeners see the events wherever the
      // pointer ends up, so the drop always runs. setPointerCapture stays
      // as a best-effort (it also suppresses native drag/selection).
      const onMove = (e2) => {
        const dx = e2.clientX - startX, dy = e2.clientY - startY;
        if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
        if (!moved) return;
        if (absolute || detached) {
          moveFree(e2.clientX, e2.clientY);
        } else {
          // Still docked: leave the parent? Detach once the pointer is
          // clearly outside the parent's box.
          const pr = el.parentElement.getBoundingClientRect();
          if (e2.clientX < pr.left - 12 || e2.clientX > pr.right + 12
            || e2.clientY < pr.top - 12 || e2.clientY > pr.bottom + 12) {
            detachToFree(e2.clientX, e2.clientY);
          } else {
            applySlotOrder(snapshot, e2.clientX, e2.clientY);
          }
        }
        // Highlight the zone the pointer is over (dock targets light up).
        const z = zoneAt(e2.clientX, e2.clientY);
        if (z !== dropZone) {
          if (dropZone) dropZone.classList.remove('layout-drop-zone');
          dropZone = z;
          if (dropZone && dropZone !== el.parentElement) dropZone.classList.add('layout-drop-zone');
        }
      };
      const onUp = (e2) => {
        el.classList.remove('layout-dragging');
        el.style.pointerEvents = ''; // restore (set none for the drag)
        if (dropZone) dropZone.classList.remove('layout-drop-zone');
        window.removeEventListener('pointermove', onMove, true);
        window.removeEventListener('pointerup', onUp, true);
        window.removeEventListener('pointercancel', onUp, true);
        if (!moved) return;
        if (detached) {
          // Dropped free: dock into a container under the pointer, stay
          // free over the tab, or snap back home if outside the tab.
          const z = zoneAt(e2.clientX, e2.clientY);
          if (z && z !== tab && zoneIsDockable(z)) {
            dockInto(z, e2.clientX, e2.clientY);
          } else if (z === tab && zoneIsDockable(tab) && tab !== homeParent) {
            // The tab itself is a flow container (e.g. #tab-play): dock
            // as a flex/grid item at the pointer's slot.
            dockInto(tab, e2.clientX, e2.clientY);
          } else if (!z) {
            // Outside the tab entirely: snap back home.
            delete el.dataset.free;
            el.style.position = homePos.position; el.style.left = homePos.left;
            el.style.top = homePos.top; el.style.width = homePos.w; el.style.height = homePos.h;
            el.style.order = homeOrder;
            homeParent.insertBefore(el, homeNext);
          }
          // else: dropped over the tab's free area — stay free where it is.
        }
        refreshAllGrips();
        persist();
      };
      window.addEventListener('pointermove', onMove, true);
      window.addEventListener('pointerup', onUp, true);
      window.addEventListener('pointercancel', onUp, true);
    });
  }

  /* ---------- resize: corner grip (mode from CURRENT parent) ---------- */
  function attachResize(el) {
    const grip = document.createElement('div');
    grip.className = 'resize-grip';
    grip.title = 'Drag to resize this panel';
    el.appendChild(grip);
    grip.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      if (isFiller(el)) return; // filler column has nothing to resize
      ev.preventDefault();
      ev.stopPropagation();
      try { grip.setPointerCapture(ev.pointerId); } catch (_) {}
      // Mode is read from the panel's CURRENT parent — panels can move.
      const parent = el.parentElement;
      const inGrid2 = GRID_TABS.some((sel) => parent.matches(sel));
      const inPlayPanels = parent.id === 'play-panels';
      const absolute = isAbsolute(el) || el.dataset.free === '1';
      const isStrip = el.id === 'play-viz' || el.id === 'play-top';
      const inTabFlow = parent.classList && parent.classList.contains('panel');
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
        } else if (isStrip || inTabFlow) {
          el.style.flexBasis = Math.max(60, startH + dy) + 'px';
          el.style.height = Math.max(60, startH + dy) + 'px';
        }
      };
      const onUp = () => {
        // v0.2.7: window-level listeners (see attachDrag) — a lost
        // pointer capture must not strand a resize mid-drag either.
        window.removeEventListener('pointermove', onMove, true);
        window.removeEventListener('pointerup', onUp, true);
        window.removeEventListener('pointercancel', onUp, true);
        persist();
      };
      window.addEventListener('pointermove', onMove, true);
      window.addEventListener('pointerup', onUp, true);
      window.addEventListener('pointercancel', onUp, true);
    });
  }

  function init(cfg) {
    for (const el of panels()) {
      if (!homes.has(el)) homes.set(el, { parent: el.parentElement, next: el.nextSibling });
      if (!el.dataset.layoutInit) {
        el.dataset.layoutInit = '1';
        attachDrag(el);
        attachResize(el);
      }
    }
    if (cfg && cfg.layout) applySaved(cfg.layout);
    refreshAllGrips();
  }

  return { init, resetLayout, hidePanel, showPanel, hiddenPanels, persist };
})();
