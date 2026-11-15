// numberMatchEngine.js — the rules of Number Match (no screen code here, so it can be tested alone).
//
// The board is a long list of digits shown 9 per row. 0 means "cleared".
// Two digits can be matched when
//   1. they are equal (3 and 3) OR they add up to 10 (3 and 7), and
//   2. nothing but cleared cells lies between them, either
//        - along the reading order (left to right, and the end of a row continues on the next row), or
//        - straight down the same column.
// "Add numbers" copies every digit still on the board to the end (a limited number of times).
// Clear the whole board to win. If no match is possible and no "Add numbers" is left, you are stuck.

import { randomInt } from './rng.js';

export const WIDTH = 9;
export const START_CELLS = 27;   // three rows to begin with
export const MAX_ADDS = 5;
export const PAIR_POINTS = 10;
export const ROW_POINTS = 50;
export const WIN_BONUS_PER_ADD = 100;

// The first digit after position i in reading order (skipping cleared cells), or -1.
function nextInReading(cells, i) {
  for (let j = i + 1; j < cells.length; j++) if (cells[j] !== 0) return j;
  return -1;
}
// The first digit below position i in the same column (skipping cleared cells), or -1.
function nextInColumn(cells, i) {
  for (let j = i + WIDTH; j < cells.length; j += WIDTH) if (cells[j] !== 0) return j;
  return -1;
}

const valuesMatch = (x, y) => x !== 0 && y !== 0 && (x === y || x + y === 10);

// Can the digits at a and b be removed together?
export function canMatch(cells, a, b) {
  if (a === b || !Number.isInteger(a) || !Number.isInteger(b)) return false;
  if (a < 0 || b < 0 || a >= cells.length || b >= cells.length) return false;
  if (a > b) [a, b] = [b, a];
  if (!valuesMatch(cells[a], cells[b])) return false;
  // b must be the very next digit after a, either along the reading order or down the column
  return nextInReading(cells, a) === b || nextInColumn(cells, a) === b;
}

// The first possible match as [a, b], or null.
export function findMove(cells) {
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === 0) continue;
    for (const j of [nextInReading(cells, i), nextInColumn(cells, i)]) {
      if (j >= 0 && valuesMatch(cells[i], cells[j])) return [i, j];
    }
  }
  return null;
}

// Rows that became completely empty disappear (the rest moves up). Returns { cells, removed }.
export function dropEmptyRows(cells) {
  const out = [];
  let removed = 0;
  for (let start = 0; start < cells.length; start += WIDTH) {
    const row = cells.slice(start, start + WIDTH);
    if (row.every((v) => v === 0)) removed++;
    else out.push(...row);
  }
  return { cells: out, removed };
}

// A fresh game. The first rows always contain at least one match, so you are never stuck at the start.
export function newGame(rng = Math.random) {
  let cells;
  do {
    cells = Array.from({ length: START_CELLS }, () => 1 + randomInt(rng, 9));
  } while (!findMove(cells));
  return { cells, adds: MAX_ADDS, score: 0, matches: 0 };
}

// Match two digits. Returns the new game, or null if they cannot be matched.
export function match(game, a, b) {
  if (!canMatch(game.cells, a, b)) return null;
  const cells = game.cells.slice();
  cells[a] = 0;
  cells[b] = 0;
  const { cells: tidy, removed } = dropEmptyRows(cells);
  const next = { ...game, cells: tidy, matches: game.matches + 1, score: game.score + PAIR_POINTS + removed * ROW_POINTS };
  if (tidy.length === 0) next.score += game.adds * WIN_BONUS_PER_ADD; // finished: bonus for every unused "Add numbers"
  return next;
}

// "Add numbers": copy every remaining digit, in order, to the end. Returns the new game, or null if not allowed.
export function addNumbers(game) {
  if (game.adds <= 0) return null;
  const copies = game.cells.filter((v) => v !== 0);
  if (copies.length === 0) return null;
  return { ...game, cells: [...game.cells, ...copies], adds: game.adds - 1 };
}

// 'won' (board empty), 'stuck' (no match and no adds left), or 'playing'.
export function status(game) {
  if (game.cells.every((v) => v === 0)) return 'won';
  if (game.adds <= 0 && !findMove(game.cells)) return 'stuck';
  return 'playing';
}
