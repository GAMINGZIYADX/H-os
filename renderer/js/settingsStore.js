// settingsStore.js — the one place that knows the user's settings.
//
//   await loadSettings();            // once, at startup
//   getSetting('wallpaper')          // read
//   setSetting('wallpaper', 'dusk')  // change: updates the screen NOW and saves soon
//   onSettingChange((key, value) => …)  // react when something changes
//
// Saving goes through window.hos.settings (main process writes settings.json).
// Changes are batched for 250ms so dragging things around doesn't hammer the disk.

import { applyAppearance } from './appearance.js';

// Keep in sync with DEFAULTS in mainSettings.js (used when not running in Electron).
export const DEFAULTS = {
  theme: 'light',
  accent: 'pink',
  wallpaper: 'day',
  taskbarAlign: 'center',
  sounds: true,
  pinned: ['explorer', 'terminal', 'puzzles', 'notepad', 'settings'],
  desktopIcons: {},
  recent: [],
};

const APPEARANCE_KEYS = ['theme', 'accent', 'wallpaper', 'taskbarAlign'];

let data = structuredClone(DEFAULTS);
let pending = {};       // changes not yet written to disk
let saveTimer = null;
const listeners = new Set();

export async function loadSettings() {
  try {
    if (window.hos) data = { ...structuredClone(DEFAULTS), ...(await window.hos.settings.load()) };
  } catch (err) {
    console.error('Could not load settings, using defaults:', err);
  }
  applyAppearance(data);
}

export function getSetting(key) {
  return data[key];
}

export function setSetting(key, value) {
  data[key] = value;
  pending[key] = value;
  if (APPEARANCE_KEYS.includes(key)) applyAppearance(data);
  for (const fn of [...listeners]) fn(key, value);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSettings, 250);
}

export function onSettingChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Write pending changes to disk right away (called before quitting).
export async function flushSettings() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (Object.keys(pending).length === 0) return;
  const patch = pending;
  pending = {};
  try {
    if (window.hos) await window.hos.settings.save(patch);
  } catch (err) {
    console.error('Could not save settings:', err);
  }
}

// Remember a file the user opened (shown under "Recommended" in the Start menu).
// File apps call this in milestone 4.
export function addRecent({ name, path }) {
  const rest = data.recent.filter((r) => r.path !== path);
  setSetting('recent', [{ name, path, time: Date.now() }, ...rest].slice(0, 12));
}
