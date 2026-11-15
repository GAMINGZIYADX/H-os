// =============================================================================
// H-os — settings file (main process)
// -----------------------------------------------------------------------------
// All user settings live in ONE JSON file inside Electron's per-user data
// folder (app.getPath('userData'), e.g. %APPDATA%\H-os\settings.json).
//
// The renderer can ask to load / save settings, but it never touches the file
// itself. Everything it sends is checked by sanitize() below: unknown keys are
// dropped and wrong types / out-of-range values are ignored, so a bug (or a
// hand-edited file) can never put garbage in here.
// =============================================================================

const { app } = require('electron');
const fs = require('fs');
const path = require('path');

// Keep in sync with DEFAULTS in renderer/js/settingsStore.js.
const DEFAULTS = {
  theme: 'light',
  accent: 'pink',
  wallpaper: 'day',
  taskbarAlign: 'center',
  sounds: true,
  pinned: ['explorer', 'terminal', 'puzzles', 'notepad', 'settings'], // taskbar pins (app ids)
  desktopIcons: {},                                                    // { appId: { col, row } }
  recent: [],                                                          // [{ name, path, time }]
  explorer: { view: 'details', sortKey: 'name', sortDir: 'asc', showHidden: false }, // File Explorer preferences
  sudoku: null,                                                        // game in progress (see sanitize)
  sudokuBest: { easy: null, medium: null, hard: null },                 // best times in seconds
  volume: 70,                                                          // 0-100, system sounds
  brightness: 100,                                                     // 40-100, the 'brightness' slider (a soft dimming overlay)
  userName: '',                                                        // shown in the Start menu ('' = your computer's user name)
  pin: null,                                                           // optional lock-screen PIN: { salt, hash } (never the PIN itself)
};

// Settings that may only be one of a few allowed words.
const ENUMS = {
  theme: ['light', 'dark'],
  accent: ['pink', 'red', 'yellow', 'purple', 'white'],
  wallpaper: ['day', 'dusk', 'pastel'],
  taskbarAlign: ['center', 'left'],
};
const EXPLORER_ENUMS = { view: ['details', 'list', 'grid'], sortKey: ['name', 'date', 'size', 'type'], sortDir: ['asc', 'desc'] };

const ID_PATTERN = /^[a-z0-9-]{1,40}$/; // app ids: lowercase letters, digits, dashes

function settingsFile() {
  return path.join(app.getPath('userData'), 'settings.json');
}

// Returns a NEW object containing only the valid parts of `input`.
function sanitize(input) {
  const out = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;

  for (const [key, allowed] of Object.entries(ENUMS)) {
    if (allowed.includes(input[key])) out[key] = input[key];
  }

  if (typeof input.sounds === 'boolean') out.sounds = input.sounds;

  if (Array.isArray(input.pinned)) {
    out.pinned = input.pinned.filter((id) => typeof id === 'string' && ID_PATTERN.test(id)).slice(0, 30);
  }

  if (input.desktopIcons && typeof input.desktopIcons === 'object' && !Array.isArray(input.desktopIcons)) {
    const icons = {};
    for (const [id, pos] of Object.entries(input.desktopIcons).slice(0, 100)) {
      const okCell = (n) => Number.isInteger(n) && n >= 0 && n <= 500;
      if (ID_PATTERN.test(id) && pos && okCell(pos.col) && okCell(pos.row)) icons[id] = { col: pos.col, row: pos.row };
    }
    out.desktopIcons = icons;
  }

  if (Array.isArray(input.recent)) {
    out.recent = input.recent
      .filter((r) => r && typeof r.name === 'string' && typeof r.path === 'string' && r.name.length <= 260 && r.path.length <= 1024)
      .slice(0, 12)
      .map((r) => ({ name: r.name, path: r.path, time: Number.isFinite(r.time) ? r.time : Date.now() }));
  }

  if (input.explorer && typeof input.explorer === 'object' && !Array.isArray(input.explorer)) {
    const e = input.explorer;
    const ex = {};
    for (const [k, allowed] of Object.entries(EXPLORER_ENUMS)) if (allowed.includes(e[k])) ex[k] = e[k];
    if (typeof e.showHidden === 'boolean') ex.showHidden = e.showHidden;
    out.explorer = { ...DEFAULTS.explorer, ...ex };
  }

  if (Number.isInteger(input.volume) && input.volume >= 0 && input.volume <= 100) out.volume = input.volume;
  if (Number.isInteger(input.brightness) && input.brightness >= 40 && input.brightness <= 100) out.brightness = input.brightness;
  if (typeof input.userName === 'string') out.userName = input.userName.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 30);
  if (input.pin === null) out.pin = null;
  else if (input.pin && typeof input.pin === 'object' && /^[0-9a-f]{32}$/.test(input.pin.salt) && /^[0-9a-f]{64}$/.test(input.pin.hash)) {
    out.pin = { salt: input.pin.salt, hash: input.pin.hash };
  }

  // Sudoku: the game in progress (all strings of digits + bit masks, validated strictly).
  if (input.sudoku === null) out.sudoku = null;
  else if (input.sudoku && typeof input.sudoku === 'object' && !Array.isArray(input.sudoku)) {
    const s = input.sudoku;
    const okStr = (v, re) => typeof v === 'string' && re.test(v);
    const okInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
    if (
      ['easy', 'medium', 'hard'].includes(s.difficulty) && okStr(s.puzzle, /^[0-9]{81}$/) && okStr(s.solution, /^[1-9]{81}$/) &&
      okStr(s.values, /^[0-9]{81}$/) && Array.isArray(s.notes) && s.notes.length === 81 && s.notes.every((n) => okInt(n, 0, 511)) &&
      okInt(s.elapsed, 0, 10000000) && okInt(s.hints, 0, 81) && typeof s.solved === 'boolean'
    ) {
      out.sudoku = { difficulty: s.difficulty, puzzle: s.puzzle, solution: s.solution, values: s.values, notes: [...s.notes], elapsed: s.elapsed, hints: s.hints, solved: s.solved };
    }
  }
  if (input.sudokuBest && typeof input.sudokuBest === 'object' && !Array.isArray(input.sudokuBest)) {
    const best = {};
    for (const level of ['easy', 'medium', 'hard']) {
      const v = input.sudokuBest[level];
      best[level] = Number.isInteger(v) && v > 0 && v <= 10000000 ? v : null;
    }
    out.sudokuBest = best;
  }

  return out;
}

let cache = null;

function freshDefaults() {
  return JSON.parse(JSON.stringify(DEFAULTS));
}

// Read settings.json (once), falling back to defaults if it's missing or broken.
function load() {
  if (cache) return cache;
  try {
    const raw = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    cache = { ...freshDefaults(), ...sanitize(raw) };
  } catch {
    cache = freshDefaults(); // first run, or unreadable file: start fresh
  }
  return cache;
}

// Merge a (sanitized) patch into the settings and write the file.
function save(patch) {
  cache = { ...load(), ...sanitize(patch) };
  try {
    const file = settingsFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // Write to a temp file first, then rename: a crash can't leave half a file.
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
    fs.renameSync(tmp, file);
  } catch (err) {
    console.log('[main] could not write settings:', err.message);
  }
  return cache;
}

module.exports = { load, save, sanitize };
