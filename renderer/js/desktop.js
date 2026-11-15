// desktop.js — the desktop: icon grid, selection, dragging, right-click menu, mascot.
//
// How the icon grid works
// -----------------------
// The desktop is divided into invisible cells (CELL_W x CELL_H pixels). Every icon
// sits in exactly one cell, identified by (col, row). Icons are positioned with
// CSS `transform: translate(x, y)`, which the browser can animate smoothly.
// When you drop icons we "snap" them to the nearest free cell and save the
// (col, row) of every icon in settings, so the layout survives a restart.

import { el } from './dom.js';
import { iconEl } from './icons.js';
import { listApps, getApp, launchApp } from './appRegistry.js';
import { getSetting, setSetting } from './settingsStore.js';
import { showContextMenu } from './contextMenu.js';
import { toast } from './notifications.js';
import { createMascot } from './mascot.js';

const CELL_W = 92;
const CELL_H = 104;
const PAD = 10;            // space around the whole grid
const DRAG_THRESHOLD = 5;  // pixels the mouse must move before a click becomes a drag
const DOUBLE_CLICK_MS = 450;

let root = null;
let icons = [];            // [{ app, el, col, row }]
let cols = 1;
let rows = 1;
const selected = new Set(); // ids of selected icons
let lastClick = { id: null, time: 0, x: 0, y: 0 }; // for our own double-click detection

export function initDesktop() {
  root = document.getElementById('desktop');
  root.append(createMascot());

  // One icon per app flagged `desktop: true`.
  icons = listApps()
    .filter((app) => app.desktop)
    .map((app) => {
      const node = el('div', 'desk-icon');
      node.dataset.appId = app.id;
      node.title = app.name;
      node.append(iconEl(app.icon), el('div', 'desk-icon-label', app.name));
      root.append(node);
      return { app, el: node, col: 0, row: 0 };
    });

  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('contextmenu', onContextMenu);
  document.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', layoutIcons);
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

function taskbarHeight() {
  return parseInt(getComputedStyle(document.documentElement).getPropertyValue('--taskbar-height'), 10) || 48;
}

function measureGrid() {
  cols = Math.max(1, Math.floor((window.innerWidth - PAD * 2) / CELL_W));
  rows = Math.max(1, Math.floor((window.innerHeight - taskbarHeight() - PAD * 2) / CELL_H));
}

const key = (col, row) => `${col},${row}`;
const clampCell = (col, row) => ({ col: Math.min(cols - 1, Math.max(0, col)), row: Math.min(rows - 1, Math.max(0, row)) });

// Closest free cell to (col,row), searching outward in rings. `taken` is a Set of "col,row".
function nearestFree(col, row, taken) {
  const start = clampCell(col, row);
  let best = null;
  let bestDist = Infinity;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      if (taken.has(key(c, r))) continue;
      const d = (c - start.col) ** 2 + (r - start.row) ** 2;
      if (d < bestDist) { bestDist = d; best = { col: c, row: r }; }
    }
  }
  return best; // null only if the desktop is completely full
}

function placeIcon(icon, col, row) {
  icon.col = col;
  icon.row = row;
  icon.el.style.transform = `translate(${PAD + col * CELL_W}px, ${PAD + row * CELL_H}px)`;
}

// Work out where every icon goes: saved cell if it's free, otherwise the first free cell
// (filling columns top to bottom, like Windows).
export function layoutIcons() {
  if (!root || root.closest('[hidden]')) return; // can't measure while hidden
  measureGrid();
  const saved = getSetting('desktopIcons') || {};
  const taken = new Set();

  for (const icon of icons) {            // pass 1: icons with a saved spot
    const pos = saved[icon.app.id];
    if (!pos) continue;
    let { col, row } = clampCell(pos.col, pos.row);
    if (taken.has(key(col, row))) ({ col, row } = nearestFree(col, row, taken) || { col, row });
    taken.add(key(col, row));
    placeIcon(icon, col, row);
  }
  for (const icon of icons) {            // pass 2: new icons flow into free cells
    if (saved[icon.app.id]) continue;
    let spot = null;
    for (let c = 0; c < cols && !spot; c++) {
      for (let r = 0; r < rows && !spot; r++) if (!taken.has(key(c, r))) spot = { col: c, row: r };
    }
    spot = spot || { col: 0, row: 0 };
    taken.add(key(spot.col, spot.row));
    placeIcon(icon, spot.col, spot.row);
  }
}

// "Refresh" in the menu: re-lay out with a little flash so you can see it did something.
function refresh() {
  layoutIcons();
  icons.forEach((icon, i) => {
    icon.el.classList.remove('is-refreshing');
    void icon.el.offsetWidth;
    icon.el.style.animationDelay = i * 40 + 'ms';
    icon.el.classList.add('is-refreshing');
  });
}

function saveAllPositions() {
  const map = {};
  for (const icon of icons) map[icon.app.id] = { col: icon.col, row: icon.row };
  setSetting('desktopIcons', map);
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

function paintSelection() {
  for (const icon of icons) icon.el.classList.toggle('is-selected', selected.has(icon.app.id));
}
function selectOnly(id) {
  selected.clear();
  if (id) selected.add(id);
  paintSelection();
}
const iconById = (id) => icons.find((i) => i.app.id === id);

// ---------------------------------------------------------------------------
// Mouse: clicking, dragging icons, rubber-band selection
// ---------------------------------------------------------------------------

function onPointerDown(event) {
  if (event.button !== 0) return; // right-click is handled by 'contextmenu'
  const iconNode = event.target.closest('.desk-icon');
  if (iconNode) pressIcon(event, iconNode.dataset.appId);
  else startRubberBand(event);
}

function pressIcon(event, id) {
  const additive = event.ctrlKey || event.metaKey;
  const wasSelected = selected.has(id);
  if (additive) {
    if (wasSelected) selected.delete(id); else selected.add(id);
  } else if (!wasSelected) {
    selectOnly(id);
  }
  paintSelection();

  // If you press on one icon of a multi-selection and release without dragging,
  // the selection collapses to just that icon (same as Windows).
  const collapseOnRelease = !additive && wasSelected && selected.size > 1;
  const startX = event.clientX;
  const startY = event.clientY;
  let dragging = false;
  const moving = icons.filter((i) => selected.has(i.app.id));

  root.setPointerCapture(event.pointerId);

  function onMove(e) {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!dragging) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      dragging = true;
      moving.forEach((i) => i.el.classList.add('is-dragging'));
    }
    for (const icon of moving) {
      icon.el.style.transform = `translate(${PAD + icon.col * CELL_W + dx}px, ${PAD + icon.row * CELL_H + dy}px)`;
    }
  }

  function onUp(e) {
    root.removeEventListener('pointermove', onMove);
    root.removeEventListener('pointerup', onUp);
    root.removeEventListener('pointercancel', onUp);
    if (root.hasPointerCapture(e.pointerId)) root.releasePointerCapture(e.pointerId);

    if (dragging) {
      moving.forEach((i) => i.el.classList.remove('is-dragging'));
      dropIcons(moving, Math.round((e.clientX - startX) / CELL_W), Math.round((e.clientY - startY) / CELL_H));
      return;
    }
    if (collapseOnRelease) { selectOnly(id); }

    // Our own double-click detection (more reliable than the browser's while we use pointer capture).
    const now = performance.now();
    const isDouble = lastClick.id === id && now - lastClick.time < DOUBLE_CLICK_MS && Math.hypot(e.clientX - lastClick.x, e.clientY - lastClick.y) < 8;
    lastClick = isDouble ? { id: null, time: 0, x: 0, y: 0 } : { id, time: now, x: e.clientX, y: e.clientY };
    if (isDouble) launchApp(id);
  }

  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerup', onUp);
  root.addEventListener('pointercancel', onUp);
}

// Drop dragged icons `dCol`/`dRow` cells away from where they started.
function dropIcons(moving, dCol, dRow) {
  const movingIds = new Set(moving.map((i) => i.app.id));
  const taken = new Set(icons.filter((i) => !movingIds.has(i.app.id)).map((i) => key(i.col, i.row)));
  // Place in a stable order so neighbours keep their relative order.
  const ordered = [...moving].sort((a, b) => a.col - b.col || a.row - b.row);
  for (const icon of ordered) {
    const want = clampCell(icon.col + dCol, icon.row + dRow);
    const spot = taken.has(key(want.col, want.row)) ? nearestFree(want.col, want.row, taken) || { col: icon.col, row: icon.row } : want;
    taken.add(key(spot.col, spot.row));
    placeIcon(icon, spot.col, spot.row);
  }
  saveAllPositions();
}

// Click-and-drag on empty desktop draws a selection rectangle.
function startRubberBand(event) {
  const additive = event.ctrlKey || event.metaKey;
  const baseSelection = additive ? new Set(selected) : new Set();
  if (!additive) selectOnly(null);

  const rect = el('div', 'select-rect');
  root.append(rect);
  const startX = event.clientX;
  const startY = event.clientY;
  const boxes = icons.map((i) => ({ id: i.app.id, r: i.el.getBoundingClientRect() })); // cache once

  root.setPointerCapture(event.pointerId);

  function onMove(e) {
    const x1 = Math.min(startX, e.clientX), x2 = Math.max(startX, e.clientX);
    const y1 = Math.min(startY, e.clientY), y2 = Math.max(startY, e.clientY);
    Object.assign(rect.style, { left: x1 + 'px', top: y1 + 'px', width: x2 - x1 + 'px', height: y2 - y1 + 'px' });
    selected.clear();
    baseSelection.forEach((id) => selected.add(id));
    for (const b of boxes) {
      const overlaps = b.r.left < x2 && b.r.right > x1 && b.r.top < y2 && b.r.bottom > y1;
      if (overlaps) selected.add(b.id);
    }
    paintSelection();
  }
  function onUp(e) {
    root.removeEventListener('pointermove', onMove);
    root.removeEventListener('pointerup', onUp);
    root.removeEventListener('pointercancel', onUp);
    if (root.hasPointerCapture(e.pointerId)) root.releasePointerCapture(e.pointerId);
    rect.remove();
  }
  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerup', onUp);
  root.addEventListener('pointercancel', onUp);
}

// ---------------------------------------------------------------------------
// Right-click menus
// ---------------------------------------------------------------------------

function onContextMenu(event) {
  event.preventDefault();
  const iconNode = event.target.closest('.desk-icon');
  if (iconNode) {
    const id = iconNode.dataset.appId;
    if (!selected.has(id)) selectOnly(id);
    const app = getApp(id);
    const pinned = getSetting('pinned') || [];
    const isPinned = pinned.includes(id);
    showContextMenu(event.clientX, event.clientY, [
      { label: 'Open', icon: 'open', onSelect: () => launchApp(id) },
      { separator: true },
      {
        label: isPinned ? 'Unpin from taskbar' : 'Pin to taskbar',
        icon: 'pin',
        onSelect: () => setSetting('pinned', isPinned ? pinned.filter((p) => p !== id) : [...pinned, id]),
      },
    ]);
    void app;
    return;
  }

  selectOnly(null);
  const current = getSetting('wallpaper');
  const wallpaper = (id, label) => ({ label, checked: current === id, onSelect: () => setSetting('wallpaper', id) });
  showContextMenu(event.clientX, event.clientY, [
    {
      label: 'New folder',
      icon: 'folder-plus',
      onSelect: () => toast({ title: 'New folder', message: 'Real folders arrive with File Explorer in milestone 4.', icon: 'explorer' }),
    },
    {
      label: 'Change wallpaper',
      icon: 'wallpaper',
      submenu: [wallpaper('day', 'Tulip field (day)'), wallpaper('dusk', 'Tulip dusk'), wallpaper('pastel', 'Pastel gradient')],
    },
    { separator: true },
    { label: 'Refresh', icon: 'refresh', onSelect: refresh },
    { label: 'Settings', icon: 'settings', onSelect: () => launchApp('settings') },
  ]);
}

// ---------------------------------------------------------------------------
// Keyboard (only when nothing else, like a window, has keyboard focus)
// ---------------------------------------------------------------------------

function onKeyDown(event) {
  if (!root || root.closest('[hidden]') || event.target !== document.body) return;
  if (event.key === 'Enter') {
    for (const id of [...selected]) launchApp(id);
  } else if (event.key === 'Escape') {
    selectOnly(null);
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
    event.preventDefault();
    icons.forEach((i) => selected.add(i.app.id));
    paintSelection();
  }
}
