// sweepEngine.js — the rules of Tulip Sweep (a thorn-finding game; no screen code here).
//
// The field is a grid of hidden cells. Some hide a thorn ball (a "mine"). Opening a cell shows how many
// of its 8 neighbours are thorns. Open every safe cell to win; open a thorn and you lose.
// Mines are only placed at the FIRST opening, so the first click is always safe (and so is its whole
// neighbourhood, so you start with a proper clearing).

import { randomInt } from './rng.js';

export const LEVELS = {
  easy: { rows: 9, cols: 9, mines: 10 },
  medium: { rows: 16, cols: 16, mines: 40 },
  hard: { rows: 16, cols: 30, mines: 99 },
};

export const HIDDEN = 0, OPEN = 1, FLAG = 2;

export function newField(rows, cols, mines) {
  const size = rows * cols;
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 2 || cols < 2 || mines < 1 || mines >= size) {
    throw new Error('bad field size');
  }
  return {
    rows, cols, mines,
    placed: false,                      // mines are placed at the first opening
    hasMine: new Uint8Array(size),
    near: new Uint8Array(size),         // how many thorns touch each cell
    state: new Uint8Array(size),        // HIDDEN / OPEN / FLAG
    opened: 0,
    flags: 0,
    lost: false,
    won: false,
    boom: -1,                           // the thorn that was opened
  };
}

// The (up to 8) cells around i.
export function neighbors(field, i) {
  const r = Math.floor(i / field.cols), c = i % field.cols;
  const out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < field.rows && cc >= 0 && cc < field.cols) out.push(rr * field.cols + cc);
    }
  }
  return out;
}

function placeMines(field, safe, rng) {
  const size = field.rows * field.cols;
  // keep the clicked cell and its neighbours free, unless the field is too small for that
  let banned = new Set([safe, ...neighbors(field, safe)]);
  if (size - banned.size < field.mines) banned = new Set([safe]);
  const pool = [];
  for (let i = 0; i < size; i++) if (!banned.has(i)) pool.push(i);
  for (let k = 0; k < field.mines; k++) {            // pick `mines` cells at random (partial shuffle)
    const j = k + randomInt(rng, pool.length - k);
    [pool[k], pool[j]] = [pool[j], pool[k]];
    field.hasMine[pool[k]] = 1;
  }
  for (let i = 0; i < size; i++) {
    let n = 0;
    for (const j of neighbors(field, i)) n += field.hasMine[j];
    field.near[i] = n;
  }
  field.placed = true;
}

const over = (field) => field.lost || field.won;

function checkWon(field) {
  if (!field.lost && field.opened === field.rows * field.cols - field.mines) {
    field.won = true;
    // every thorn gets a flag, like a tidy finished garden
    for (let i = 0; i < field.state.length; i++) if (field.hasMine[i]) field.state[i] = FLAG;
    field.flags = field.mines;
  }
}

// Open one cell (flood-filling through empty areas). Returns the list of cells that were opened.
// Mutates the field. Opening a thorn sets field.lost.
export function reveal(field, i, rng = Math.random) {
  if (!Number.isInteger(i) || i < 0 || i >= field.state.length) return [];
  if (over(field) || field.state[i] !== HIDDEN) return [];
  if (!field.placed) placeMines(field, i, rng);
  if (field.hasMine[i]) {
    field.lost = true;
    field.boom = i;
    return [i];
  }
  const opened = [];
  const stack = [i];
  field.state[i] = OPEN;                  // mark when pushed, so a cell is never queued twice
  while (stack.length) {                  // (a loop, not recursion: the hard field has 480 cells)
    const cur = stack.pop();
    opened.push(cur);
    if (field.near[cur] === 0) {
      for (const n of neighbors(field, cur)) {
        if (field.state[n] === HIDDEN) { field.state[n] = OPEN; stack.push(n); }
      }
    }
  }
  field.opened += opened.length;
  checkWon(field);
  return opened;
}

// "Chording": on an opened number whose flags already add up to it, open all its other neighbours at once.
export function chord(field, i, rng = Math.random) {
  if (!Number.isInteger(i) || i < 0 || i >= field.state.length) return [];
  if (over(field) || field.state[i] !== OPEN || field.near[i] === 0) return [];
  const around = neighbors(field, i);
  const flagged = around.filter((n) => field.state[n] === FLAG).length;
  if (flagged !== field.near[i]) return [];
  const opened = [];
  for (const n of around) {
    if (field.state[n] === HIDDEN) opened.push(...reveal(field, n, rng));
  }
  return opened;
}

// Put a flag on a hidden cell, or take it off. Returns true if something changed.
export function toggleFlag(field, i) {
  if (!Number.isInteger(i) || i < 0 || i >= field.state.length) return false;
  if (over(field) || field.state[i] === OPEN) return false;
  if (field.state[i] === FLAG) { field.state[i] = HIDDEN; field.flags--; }
  else { field.state[i] = FLAG; field.flags++; }
  return true;
}

export const minesLeft = (field) => field.mines - field.flags;

// ---- saving and loading a game in progress ----
// A field is saved as two strings: where the thorns are ('1') and what is opened ('1') / flagged ('2').
export function fieldToSave(field) {
  return { mines: Array.from(field.hasMine).join(''), state: Array.from(field.state).join('') };
}

// Rebuild a field from a save (throws if the strings do not fit the size).
export function fieldFromSave(rows, cols, mines, minesText, stateText) {
  const field = newField(rows, cols, mines);
  const size = rows * cols;
  if (minesText.length !== size || stateText.length !== size) throw new Error('bad save');
  for (let i = 0; i < size; i++) {
    field.hasMine[i] = minesText[i] === '1' ? 1 : 0;
    field.state[i] = Number(stateText[i]);
  }
  if (field.hasMine.reduce((a, b) => a + b, 0) !== mines) throw new Error('bad save');
  for (let i = 0; i < size; i++) {
    let n = 0;
    for (const j of neighbors(field, i)) n += field.hasMine[j];
    field.near[i] = n;
    if (field.state[i] === OPEN) field.opened++;
    if (field.state[i] === FLAG) field.flags++;
  }
  field.placed = true;
  return field;
}
