// =============================================================================
// windowManager.js — opens, moves, resizes, snaps and closes app windows.
// =============================================================================
//
// THE BIG PICTURE (read this first!)
// ----------------------------------
// * An APP is a description registered in appRegistry.js: { id, name, icon,
//   defaultSize, create(container, ctx) }. The window manager knows nothing about
//   what an app does. It only builds a window frame and hands the app an empty
//   container <div> to fill.
//
// * A WINDOW is one object (`win`, see openWindow) holding the DOM element, its
//   position/size ("bounds") and its state. All windows live inside #windows-layer,
//   which covers the screen ABOVE the taskbar, so a window can never hide behind it.
//
// * Position is set with the CSS `translate` property (cheap: the browser just
//   moves a layer, no re-layout) and size with width/height. That is what keeps
//   dragging smooth at 60fps. (We keep CSS `transform` free for open/close animations.)
//
// * Z-ORDER is the `stack` array: the LAST window in it is on top. focus() moves a
//   window to the end and re-numbers every z-index.
//
// * The taskbar is a separate module. We talk to it only through events.js:
//     we emit   'windows:changed'  (list of windows)
//     we listen 'window:toggle', 'window:close', 'desktop:show'
//
// WHAT AN APP'S create() RECEIVES
//   create(container, ctx)  where ctx = { windowId, options, setTitle(t), close(), launch(appId) }
//   and may return an object with any of these optional hooks:
//     { destroy(), onFocus(), onChange(info), canClose() -> bool | Promise<bool> }
// =============================================================================

import { el } from './dom.js';
import { iconEl } from './icons.js';
import { setLauncher, launchApp } from './appRegistry.js';
import { on, emit } from './events.js';
import { toast } from './notifications.js';

const DEFAULT_MIN = { w: 320, h: 200 }; // smallest size unless the app says otherwise
const SNAP_EDGE = 6;                    // pointer within this many px of a screen edge = snap
const ANIM_MS = 220;                    // maximize / snap / minimize animation length
const TITLEBAR_H = 38;
const KEEP_VISIBLE = 120;               // px of a window that must stay on screen sideways

let layer = null;        // #windows-layer
let preview = null;      // the translucent snap preview
const wins = new Map();  // windowId -> win
let stack = [];          // windows from BOTTOM to TOP (z-order)
let focusedId = null;
let nextId = 1;
let hiddenByShowDesktop = [];

export function initWindowManager() {
  layer = document.getElementById('windows-layer');
  preview = el('div', 'snap-preview');
  layer.append(preview);

  setLauncher(openWindow); // from now on launchApp() opens real windows

  on('window:toggle', (id) => toggleWindow(id));
  on('window:close', (id) => closeWindow(id));
  on('desktop:show', showDesktop);
  on('power:restart', closeAllNow);
  window.addEventListener('resize', refitAll);
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const layerSize = () => ({ w: layer.clientWidth, h: layer.clientHeight });
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));

function emitChanged() {
  const list = [...wins.values()].map((w) => ({
    id: w.id,
    appId: w.appId,
    title: w.title,
    focused: w.id === focusedId,
    minimized: w.minimized,
  }));
  emit('windows:changed', list);
}

// Tell the app its window moved / resized / changed state.
function notify(win) {
  if (win.instance && win.instance.onChange) {
    win.instance.onChange({ ...win.bounds, state: win.state, focused: win.id === focusedId });
  }
}

// Write bounds to the DOM. `translate` moves; width/height resize.
function applyBounds(win) {
  const b = win.bounds;
  win.el.style.translate = `${b.x}px ${b.y}px`;
  win.el.style.width = b.w + 'px';
  win.el.style.height = b.h + 'px';
  notify(win);
}

// Set bounds, optionally with a smooth animation (used for maximize / snap / restore).
function setBounds(win, bounds, animate = false) {
  win.bounds = { ...bounds };
  if (animate) {
    win.el.classList.add('is-animating');
    clearTimeout(win.animTimer);
    win.animTimer = setTimeout(() => win.el.classList.remove('is-animating'), ANIM_MS + 40);
  }
  applyBounds(win);
}

// Keep a normal window usable: not under the taskbar, titlebar reachable, not tiny.
function clampBounds(b, win) {
  const { w: LW, h: LH } = layerSize();
  const w = clamp(b.w, win.min.w, LW);
  const h = clamp(b.h, win.min.h, LH);
  return {
    w,
    h,
    x: clamp(b.x, KEEP_VISIBLE - w, LW - KEEP_VISIBLE),
    y: clamp(b.y, 0, LH - TITLEBAR_H),
  };
}

// The rectangle each snap zone fills.
function zoneBounds(zone) {
  const { w: LW, h: LH } = layerSize();
  const half = Math.floor(LW / 2);
  if (zone === 'left') return { x: 0, y: 0, w: half, h: LH };
  if (zone === 'right') return { x: half, y: 0, w: LW - half, h: LH };
  return { x: 0, y: 0, w: LW, h: LH }; // 'max'
}

// ---------------------------------------------------------------------------
// Opening a window
// ---------------------------------------------------------------------------

function controlButton(iconName, label, extraClass = '') {
  const btn = el('button', ('win-ctrl ' + extraClass).trim());
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.append(iconEl(iconName));
  return btn;
}

export function openWindow(app, options = {}) {
  // Single-instance apps (e.g. Settings): just bring the existing window forward.
  if (app.singleInstance) {
    const existing = [...wins.values()].find((w) => w.appId === app.id);
    if (existing) {
      if (existing.minimized) restoreFromMinimized(existing);
      else focusWindow(existing);
      return existing.id;
    }
  }

  const id = nextId++;
  const { w: LW, h: LH } = layerSize();
  const min = { ...DEFAULT_MIN, ...(app.minSize || {}) };
  const want = app.defaultSize || { w: 700, h: 480 };

  // Size: what the app asked for, but always fitting on screen.
  const w = clamp(want.w, min.w, LW - 24);
  const h = clamp(want.h, min.h, LH - 24);
  // Position: cascade each new window a little down and to the right.
  const step = wins.size % 8;
  const x = clamp(70 + step * 32, 0, LW - w);
  const y = clamp(40 + step * 32, 0, LH - h);

  const win = {
    id,
    appId: app.id,
    app,
    title: app.name,
    bounds: { x, y, w, h },
    restoreBounds: null,   // remembered size/position while maximized or snapped
    state: 'normal',       // 'normal' | 'maximized' | 'snapped'
    minimized: false,
    closing: false,
    canResize: app.resizable !== false,
    min,
    instance: null,
    animTimer: null,
  };

  // ---- Build the frame ----
  const frame = el('div', 'win');
  frame.tabIndex = -1; // lets the window hold keyboard focus (so desktop shortcuts stay quiet)
  frame.dataset.windowId = String(id);
  frame.setAttribute('role', 'dialog');
  frame.setAttribute('aria-label', app.name);

  const titlebar = el('div', 'win-titlebar');
  const titleEl = el('div', 'win-title', win.title);
  const controls = el('div', 'win-controls');
  const btnMin = controlButton('win-min', 'Minimize');
  const btnMax = controlButton('win-max', 'Maximize');
  const btnClose = controlButton('close', 'Close', 'is-close');
  controls.append(btnMin);
  if (win.canResize) controls.append(btnMax);
  controls.append(btnClose);
  titlebar.append(iconEl(app.icon, 'win-icon'), titleEl, controls);

  const body = el('div', 'win-body');
  frame.append(titlebar, body);

  // Eight invisible grab handles: 4 edges + 4 corners.
  if (win.canResize) {
    for (const dir of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
      const handle = el('div', 'win-handle win-handle-' + dir);
      handle.addEventListener('pointerdown', (e) => startResize(win, dir, e));
      frame.append(handle);
    }
  }

  Object.assign(win, { el: frame, titleEl, btnMax, body });
  wins.set(id, win);
  stack.push(win);
  layer.insertBefore(frame, preview);
  applyBounds(win);

  // ---- Wire up behaviour ----
  frame.addEventListener('pointerdown', () => focusWindow(win), true); // any click inside focuses
  titlebar.addEventListener('pointerdown', (e) => startDrag(win, e));
  titlebar.addEventListener('dblclick', (e) => {
    if (win.canResize && !e.target.closest('.win-controls')) toggleMaximize(win);
  });
  btnMin.addEventListener('click', () => minimizeWindow(win));
  btnMax.addEventListener('click', () => toggleMaximize(win));
  btnClose.addEventListener('click', () => closeWindow(id));

  // Opening animation.
  frame.classList.add('is-opening');
  frame.addEventListener('animationend', () => frame.classList.remove('is-opening'), { once: true });

  focusWindow(win);

  // ---- Let the app fill the body ----
  const ctx = {
    windowId: id,
    options,
    setTitle(text) {
      win.title = text;
      titleEl.textContent = text;
      frame.setAttribute('aria-label', text);
      emitChanged();
    },
    close: () => closeWindow(id),
    launch: (appId, opts) => launchApp(appId, opts),
  };
  try {
    const made = app.create(body, ctx);
    Promise.resolve(made)
      .then((instance) => { win.instance = instance || null; notify(win); })
      .catch((err) => showAppError(win, err));
  } catch (err) {
    showAppError(win, err);
  }

  emitChanged();
  return id;
}

// If an app crashes while starting, show a friendly message instead of a broken window.
function showAppError(win, err) {
  console.error(`App "${win.appId}" failed to start:`, err);
  win.body.replaceChildren(el('div', 'win-error', 'Oops, this app tripped over a tulip and could not start.'));
  toast({ title: win.title, message: 'This app could not start.', icon: 'tulip' });
}

// ---------------------------------------------------------------------------
// Focus & z-order
// ---------------------------------------------------------------------------

export function focusWindow(win) {
  if (!win || win.minimized || win.closing) return;
  const alreadyTop = stack[stack.length - 1] === win && focusedId === win.id;
  if (alreadyTop) return;

  stack = stack.filter((w) => w !== win);
  stack.push(win);
  stack.forEach((w, i) => { w.el.style.zIndex = String(i + 1); });

  const changed = focusedId !== win.id;
  focusedId = win.id;
  for (const w of wins.values()) w.el.classList.toggle('is-focused', w === win);
  if (changed && win.instance && win.instance.onFocus) win.instance.onFocus();
  emitChanged();
}

// After a window closes/minimizes, focus the next one down (if any).
function focusTop() {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (!stack[i].minimized && !stack[i].closing) {
      focusedId = null; // force the change
      focusWindow(stack[i]);
      return;
    }
  }
  focusedId = null;
  for (const w of wins.values()) w.el.classList.remove('is-focused');
  emitChanged();
}

// Taskbar click: minimized -> restore, in front -> minimize, behind -> bring forward.
function toggleWindow(id) {
  const win = wins.get(id);
  if (!win) return;
  if (win.minimized) restoreFromMinimized(win);
  else if (focusedId === win.id) minimizeWindow(win);
  else focusWindow(win);
}

// ---------------------------------------------------------------------------
// Minimize / restore (the window flies toward / out of its taskbar button)
// ---------------------------------------------------------------------------

function originTowardsTaskbar(win) {
  const btn = document.querySelector(`.tb-btn[data-app-id="${CSS.escape(win.appId)}"]`);
  const { w: LW, h: LH } = layerSize();
  let tx = LW / 2;
  let ty = LH + 40;
  if (btn) {
    const r = btn.getBoundingClientRect();
    tx = r.left + r.width / 2;
    ty = r.top + r.height / 2;
  }
  // transform-origin is measured from the window's own top-left corner.
  win.el.style.transformOrigin = `${tx - win.bounds.x}px ${ty - win.bounds.y}px`;
}

export function minimizeWindow(win) {
  if (!win || win.minimized || win.closing) return;
  win.minimized = true;
  originTowardsTaskbar(win);
  win.el.classList.remove('is-restoring');
  win.el.classList.add('is-minimizing');
  clearTimeout(win.animTimer);
  win.animTimer = setTimeout(() => {
    if (win.minimized) win.el.classList.add('is-hidden'); // really hide it once the animation is done
  }, ANIM_MS);
  if (focusedId === win.id) focusTop();
  else emitChanged();
}

function restoreFromMinimized(win) {
  if (!win.minimized) return;
  win.minimized = false;
  clearTimeout(win.animTimer);
  originTowardsTaskbar(win);
  win.el.classList.remove('is-hidden', 'is-minimizing');
  win.el.classList.add('is-restoring');
  win.animTimer = setTimeout(() => {
    win.el.classList.remove('is-restoring');
    win.el.style.transformOrigin = '';
  }, ANIM_MS + 40);
  focusedId = null; // force the focus change
  focusWindow(win);
}

// "Show desktop" strip: minimize everything; press again to bring it all back.
function showDesktop() {
  const visible = stack.filter((w) => !w.minimized && !w.closing);
  if (visible.length) {
    hiddenByShowDesktop = visible.map((w) => w.id);
    visible.forEach(minimizeWindow);
  } else {
    hiddenByShowDesktop.forEach((id) => {
      const w = wins.get(id);
      if (w) restoreFromMinimized(w);
    });
    hiddenByShowDesktop = [];
  }
}

// ---------------------------------------------------------------------------
// Maximize / snap / restore
// ---------------------------------------------------------------------------

function updateStateClasses(win) {
  win.el.classList.toggle('is-maximized', win.state === 'maximized');
  win.el.classList.toggle('is-snapped', win.state === 'snapped');
  const maxed = win.state === 'maximized';
  win.btnMax.replaceChildren(iconEl(maxed ? 'win-restore' : 'win-max'));
  win.btnMax.title = maxed ? 'Restore down' : 'Maximize';
  win.btnMax.setAttribute('aria-label', win.btnMax.title);
}

function toggleMaximize(win) {
  if (win.state === 'normal') applyZone(win, 'max');
  else restoreWindow(win);
}

// Put a window into a snap zone ('left' | 'right' | 'max'), animated.
function applyZone(win, zone) {
  if (!win.canResize) return;
  if (win.state === 'normal') win.restoreBounds = { ...win.bounds }; // remember where to come back to
  win.state = zone === 'max' ? 'maximized' : 'snapped';
  updateStateClasses(win);
  setBounds(win, zoneBounds(zone), true);
  win.snapZone = zone;
}

// Back to the size/position from before maximizing or snapping.
function restoreWindow(win) {
  if (win.state === 'normal') return;
  const target = clampBounds(win.restoreBounds || { x: 80, y: 60, w: 700, h: 480 }, win);
  win.state = 'normal';
  win.restoreBounds = null;
  win.snapZone = null;
  updateStateClasses(win);
  setBounds(win, target, true);
}

// Which snap zone is the pointer in? (null = none)
function zoneAt(px, py) {
  const { w: LW } = layerSize();
  if (py <= SNAP_EDGE) return 'max';
  if (px <= SNAP_EDGE) return 'left';
  if (px >= LW - 1 - SNAP_EDGE) return 'right';
  return null;
}

function showPreview(zone) {
  if (!zone) { preview.classList.remove('is-visible'); return; }
  const b = zoneBounds(zone);
  const inset = 6;
  Object.assign(preview.style, {
    left: b.x + inset + 'px',
    top: b.y + inset + 'px',
    width: b.w - inset * 2 + 'px',
    height: b.h - inset * 2 + 'px',
  });
  preview.classList.add('is-visible');
}

// When the screen size changes, re-fit everything.
function refitAll() {
  const { w: LW, h: LH } = layerSize();
  if (LW === 0 || LH === 0) return; // shell is hidden (lock screen); nothing to measure
  for (const win of wins.values()) {
    if (win.state === 'maximized') setBounds(win, zoneBounds('max'));
    else if (win.state === 'snapped') setBounds(win, zoneBounds(win.snapZone));
    else setBounds(win, clampBounds(win.bounds, win));
  }
}

// ---------------------------------------------------------------------------
// Dragging the titlebar (with Win11-style snapping)
// ---------------------------------------------------------------------------

function startDrag(win, event) {
  if (event.button !== 0 || event.target.closest('.win-controls')) return;
  const titlebar = event.currentTarget;
  const startX = event.clientX;
  const startY = event.clientY;
  let grabX = startX - win.bounds.x; // where inside the window we grabbed it
  let grabY = startY - win.bounds.y;
  let dragging = false;
  let latest = null;
  let frameId = 0;
  let zone = null;

  titlebar.setPointerCapture(event.pointerId);

  // Runs at most once per screen refresh (requestAnimationFrame) => smooth.
  function frame() {
    frameId = 0;
    const next = clampBounds({ ...win.bounds, x: latest.clientX - grabX, y: latest.clientY - grabY }, win);
    win.bounds = next;
    win.el.style.translate = `${next.x}px ${next.y}px`;
    notify(win);
    zone = win.canResize ? zoneAt(latest.clientX, latest.clientY) : null;
    showPreview(zone);
  }

  function onMove(e) {
    if (!dragging) {
      if (Math.hypot(e.clientX - startX, e.clientY - startY) < 4) return; // still just a click
      dragging = true;
      if (win.state !== 'normal') pullOutOfMaximized(e);
      win.el.classList.add('is-dragging');
    }
    latest = e;
    if (!frameId) frameId = requestAnimationFrame(frame);
  }

  // Dragging a maximized/snapped window shrinks it back to its old size under the pointer.
  function pullOutOfMaximized(e) {
    const old = win.bounds;
    const rb = win.restoreBounds || { w: 700, h: 480 };
    const ratio = old.w > 0 ? (startX - old.x) / old.w : 0.5; // how far along the titlebar we grabbed
    win.state = 'normal';
    win.snapZone = null;
    win.restoreBounds = null;
    win.el.classList.remove('is-animating');
    updateStateClasses(win);
    const nb = { w: rb.w, h: rb.h, x: Math.round(e.clientX - rb.w * ratio), y: old.y };
    win.bounds = nb;
    grabX = e.clientX - nb.x;
    grabY = startY - old.y;
    applyBounds(win);
  }

  function onUp() {
    titlebar.removeEventListener('pointermove', onMove);
    titlebar.removeEventListener('pointerup', onUp);
    titlebar.removeEventListener('pointercancel', onUp);
    if (frameId) { cancelAnimationFrame(frameId); frame(); } // flush the last position
    showPreview(null);
    if (dragging) {
      win.el.classList.remove('is-dragging');
      if (zone) applyZone(win, zone);
    }
  }

  titlebar.addEventListener('pointermove', onMove);
  titlebar.addEventListener('pointerup', onUp);
  titlebar.addEventListener('pointercancel', onUp);
}

// ---------------------------------------------------------------------------
// Resizing from any edge or corner
// ---------------------------------------------------------------------------

function startResize(win, dir, event) {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  focusWindow(win);
  const handle = event.currentTarget;
  const start = { ...win.bounds };
  const startX = event.clientX;
  const startY = event.clientY;
  const { w: LW, h: LH } = layerSize();
  let latest = null;
  let frameId = 0;

  handle.setPointerCapture(event.pointerId);

  function frame() {
    frameId = 0;
    const dx = latest.clientX - startX;
    const dy = latest.clientY - startY;
    let { x, y, w, h } = start;

    // East / south edges: grow to the right / down (never past the screen, never below min size).
    if (dir.includes('e')) w = clamp(start.w + dx, win.min.w, LW - start.x);
    if (dir.includes('s')) h = clamp(start.h + dy, win.min.h, LH - start.y);
    // West / north edges: the OPPOSITE edge stays put, so both position and size change.
    if (dir.includes('w')) {
      const right = start.x + start.w;
      x = clamp(start.x + dx, Math.min(0, start.x), right - win.min.w);
      w = right - x;
    }
    if (dir.includes('n')) {
      const bottom = start.y + start.h;
      y = clamp(start.y + dy, 0, bottom - win.min.h);
      h = bottom - y;
    }
    setBounds(win, { x, y, w, h });
  }

  function onMove(e) {
    latest = e;
    if (!frameId) frameId = requestAnimationFrame(frame);
  }
  function onUp() {
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', onUp);
    handle.removeEventListener('pointercancel', onUp);
    if (frameId) { cancelAnimationFrame(frameId); frame(); }
    win.el.classList.remove('is-resizing');
  }

  win.el.classList.add('is-resizing');
  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onUp);
  handle.addEventListener('pointercancel', onUp);
}

// ---------------------------------------------------------------------------
// Closing
// ---------------------------------------------------------------------------

export async function closeWindow(id) {
  const win = wins.get(id);
  if (!win || win.closing) return;

  // An app can say "wait, unsaved changes!" by returning false from canClose().
  if (win.instance && win.instance.canClose) {
    try {
      if (!(await win.instance.canClose())) return;
    } catch (err) {
      console.error('canClose failed:', err);
    }
  }

  win.closing = true;
  wins.delete(id);
  stack = stack.filter((w) => w !== win);
  win.el.classList.add('is-closing');
  win.el.style.pointerEvents = 'none';
  if (focusedId === id) focusTop();
  else emitChanged();

  setTimeout(() => destroyWindow(win), 180);
}

function destroyWindow(win) {
  try {
    if (win.instance && win.instance.destroy) win.instance.destroy();
  } catch (err) {
    console.error('destroy failed:', err);
  }
  win.el.remove();
}

// Restart: remove every window immediately (no animation).
function closeAllNow() {
  for (const win of [...wins.values()]) destroyWindow(win);
  wins.clear();
  stack = [];
  focusedId = null;
  hiddenByShowDesktop = [];
  showPreview(null);
  emitChanged();
}

// For tests / debugging: current windows as plain data.
export function debugWindows() {
  return [...wins.values()].map((w) => ({
    id: w.id, appId: w.appId, state: w.state, minimized: w.minimized,
    focused: w.id === focusedId, z: Number(w.el.style.zIndex), ...w.bounds,
  }));
}
