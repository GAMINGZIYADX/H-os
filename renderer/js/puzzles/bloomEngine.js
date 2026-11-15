// bloomEngine.js — the rules of Tulip Bloom (a "lights out" style puzzle; no screen code here).
//
// A grid of tulips, each either bloomed (1) or closed (0). Pressing a tulip flips it AND its four
// neighbours (up, down, left, right). Make every tulip bloom.
// Puzzles are made by pressing random tulips on a fully bloomed garden, so every puzzle can be solved.
// solve() finds a shortest list of presses for ANY position (or null if there is none), which is what
// the Hint button uses.

import { randomInt } from './rng.js';

export const SIZES = { small: 4, medium: 5, large: 6 };

// Press cell i: flip it and its neighbours (the board is changed in place).
export function press(board, n, i) {
  const r = Math.floor(i / n), c = i % n;
  board[i] ^= 1;
  if (r > 0) board[i - n] ^= 1;
  if (r < n - 1) board[i + n] ^= 1;
  if (c > 0) board[i - 1] ^= 1;
  if (c < n - 1) board[i + 1] ^= 1;
}

export const isSolved = (board) => board.every((v) => v === 1);

// A new puzzle: { board, n, start } (start is a copy of the starting position, for "Reset").
export function newPuzzle(n, rng = Math.random) {
  const board = new Uint8Array(n * n).fill(1);
  do {
    board.fill(1);
    for (let i = 0; i < n * n; i++) if (rng() < 0.5) press(board, n, i);
  } while (isSolved(board));
  return { n, board, start: Uint8Array.from(board) };
}

// The fewest presses that bloom everything, as a sorted list of cell numbers, or null if impossible.
// Method: every press is a column of 0/1s; we need  (sum of the pressed columns) = (closed cells), counting
// in twos (XOR). That is a system of linear equations over {0,1}, solved by Gaussian elimination. If the
// system has free choices, we try all of them (at most 2^4) and keep the smallest answer.
export function solve(board, n) {
  const m = n * n;
  // rows = cells, columns = presses (+ the goal as the last column)
  const rows = [];
  for (let cell = 0; cell < m; cell++) {
    const row = new Uint8Array(m + 1);
    const probe = new Uint8Array(m);
    for (let p = 0; p < m; p++) {
      probe.fill(0);
      press(probe, n, p);
      row[p] = probe[cell];
    }
    row[m] = board[cell] === 1 ? 0 : 1;      // closed cells must be flipped an odd number of times
    rows.push(row);
  }
  const pivotOfCol = new Array(m).fill(-1);
  let rank = 0;
  for (let col = 0; col < m && rank < m; col++) {
    let pivot = -1;
    for (let r = rank; r < m; r++) if (rows[r][col]) { pivot = r; break; }
    if (pivot < 0) continue;
    [rows[rank], rows[pivot]] = [rows[pivot], rows[rank]];
    for (let r = 0; r < m; r++) {
      if (r !== rank && rows[r][col]) for (let k = col; k <= m; k++) rows[r][k] ^= rows[rank][k];
    }
    pivotOfCol[col] = rank;
    rank++;
  }
  for (let r = rank; r < m; r++) if (rows[r][m]) return null;   // 0 = 1: no solution
  const free = [];
  for (let col = 0; col < m; col++) if (pivotOfCol[col] < 0) free.push(col);

  let best = null;
  for (let mask = 0; mask < (1 << free.length); mask++) {
    const x = new Uint8Array(m);
    free.forEach((col, k) => { x[col] = (mask >> k) & 1; });
    for (let col = 0; col < m; col++) {
      const r = pivotOfCol[col];
      if (r < 0) continue;
      let v = rows[r][m];
      for (const f of free) if (rows[r][f] && x[f]) v ^= 1;
      x[col] = v;
    }
    const presses = [];
    for (let i = 0; i < m; i++) if (x[i]) presses.push(i);
    if (!best || presses.length < best.length) best = presses;
  }
  return best;
}
