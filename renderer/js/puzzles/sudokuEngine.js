// =============================================================================
// puzzles/sudokuEngine.js — Sudoku logic: solving, generating, checking.
// =============================================================================
// No DOM in here, so it can be tested from Node (tools/test-sudoku.js).
//
// A grid is an Int8Array of 81 numbers: 0 = empty, 1..9 = a digit.
// Cell index i = row * 9 + col.  Digits are tracked as bit masks (digit d -> bit d-1)
// so "which digits are still possible here?" is a handful of fast bit operations.

export const ROW = (i) => Math.floor(i / 9);
export const COL = (i) => i % 9;
export const BOX = (i) => Math.floor(ROW(i) / 3) * 3 + Math.floor(COL(i) / 3);
const ALL = 0b111111111;

// For every cell, the 20 other cells that share its row, column or 3x3 box.
export const PEERS = Array.from({ length: 81 }, (_, i) => {
  const out = [];
  for (let j = 0; j < 81; j++) {
    if (j !== i && (ROW(j) === ROW(i) || COL(j) === COL(i) || BOX(j) === BOX(i))) out.push(j);
  }
  return out;
});

const bitCount = (m) => { let n = 0; while (m) { m &= m - 1; n++; } return n; };
const digitsOf = (m) => { const d = []; for (let k = 1; k <= 9; k++) if (m & (1 << (k - 1))) d.push(k); return d; };
export { digitsOf, bitCount };

function shuffle(array, rng) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Digits that could still go in cell i (as a bit mask), given the current grid.
export function candidates(grid, i) {
  let used = 0;
  for (const p of PEERS[i]) if (grid[p]) used |= 1 << (grid[p] - 1);
  return ALL & ~used;
}

// ---------------------------------------------------------------------------
// Backtracking solver. Always branches on the cell with the FEWEST possibilities
// (which makes even hard puzzles solve in a blink). Stops after `limit` solutions.
// ---------------------------------------------------------------------------
export function solve(startGrid, { limit = 1, rng = null } = {}) {
  const grid = Int8Array.from(startGrid);
  const rows = new Array(9).fill(0);
  const cols = new Array(9).fill(0);
  const boxes = new Array(9).fill(0);
  for (let i = 0; i < 81; i++) {
    if (grid[i]) {
      const bit = 1 << (grid[i] - 1);
      if ((rows[ROW(i)] & bit) || (cols[COL(i)] & bit) || (boxes[BOX(i)] & bit)) return { count: 0, solutions: [] }; // already contradictory
      rows[ROW(i)] |= bit; cols[COL(i)] |= bit; boxes[BOX(i)] |= bit;
    }
  }
  const solutions = [];
  let count = 0;

  function search() {
    // find the empty cell with the fewest candidates
    let best = -1;
    let bestMask = 0;
    let bestCount = 10;
    for (let i = 0; i < 81; i++) {
      if (grid[i]) continue;
      const mask = ALL & ~(rows[ROW(i)] | cols[COL(i)] | boxes[BOX(i)]);
      const n = bitCount(mask);
      if (n < bestCount) {
        best = i; bestMask = mask; bestCount = n;
        if (n <= 1) break;
      }
    }
    if (best === -1) { // no empty cell left: solved
      count++;
      if (solutions.length < limit) solutions.push(Int8Array.from(grid));
      return count >= limit;
    }
    if (bestCount === 0) return false; // dead end
    let digits = digitsOf(bestMask);
    if (rng) shuffle(digits, rng);
    for (const d of digits) {
      const bit = 1 << (d - 1);
      grid[best] = d;
      rows[ROW(best)] |= bit; cols[COL(best)] |= bit; boxes[BOX(best)] |= bit;
      const stop = search();
      grid[best] = 0;
      rows[ROW(best)] &= ~bit; cols[COL(best)] &= ~bit; boxes[BOX(best)] &= ~bit;
      if (stop) return true;
    }
    return false;
  }
  search();
  return { count, solutions };
}

export const countSolutions = (grid, limit = 2) => solve(grid, { limit }).count;

// Solve using only "naked singles" (a cell with one possibility) and "hidden singles"
// (a digit with one possible place in a row/column/box). If this alone finishes the
// puzzle, a person can solve it without guessing: that's our definition of easy/medium.
export function solveWithSingles(startGrid) {
  const grid = Int8Array.from(startGrid);
  let progress = true;
  while (progress) {
    progress = false;
    for (let i = 0; i < 81; i++) {
      if (grid[i]) continue;
      const mask = candidates(grid, i);
      if (mask === 0) return { grid, solved: false }; // contradiction
      if (bitCount(mask) === 1) { grid[i] = digitsOf(mask)[0]; progress = true; }
    }
    // hidden singles
    const units = [];
    for (let k = 0; k < 9; k++) {
      units.push([...Array(9)].map((_, j) => k * 9 + j));                                   // row k
      units.push([...Array(9)].map((_, j) => j * 9 + k));                                   // column k
      units.push([...Array(9)].map((_, j) => (Math.floor(k / 3) * 3 + Math.floor(j / 3)) * 9 + (k % 3) * 3 + (j % 3))); // box k
    }
    for (const unit of units) {
      for (let d = 1; d <= 9; d++) {
        let spot = -1;
        let places = 0;
        let alreadyThere = false;
        for (const i of unit) {
          if (grid[i] === d) { alreadyThere = true; break; }
          if (!grid[i] && (candidates(grid, i) & (1 << (d - 1)))) { places++; spot = i; }
        }
        if (!alreadyThere && places === 1) { grid[spot] = d; progress = true; }
      }
    }
  }
  return { grid, solved: grid.every((v) => v !== 0) };
}

// Which filled cells break the rules (the same digit twice in a row, column or box)?
export function findConflicts(grid) {
  const bad = new Set();
  for (let i = 0; i < 81; i++) {
    if (!grid[i]) continue;
    for (const p of PEERS[i]) if (grid[p] === grid[i]) { bad.add(i); bad.add(p); }
  }
  return bad;
}

// ---------------------------------------------------------------------------
// Generating puzzles with exactly ONE solution
// ---------------------------------------------------------------------------
// target = how many given digits we try to leave; mustBeSingles = a human can solve it
// without guessing.
export const DIFFICULTY = {
  easy: { clues: [40, 45], mustBeSingles: true },
  medium: { clues: [32, 36], mustBeSingles: true },
  hard: { clues: [24, 28], mustBeSingles: false },
};

// Hard puzzles must NOT be solvable by singles alone (they need real deduction); we retry a few times.
export function generate(difficulty = 'medium', rng = Math.random) {
  let result = generateOnce(difficulty, rng);
  for (let tries = 0; difficulty === 'hard' && tries < 30 && solveWithSingles(result.puzzle).solved; tries++) {
    result = generateOnce(difficulty, rng);
  }
  return result;
}

function generateOnce(difficulty, rng) {
  const spec = DIFFICULTY[difficulty] || DIFFICULTY.medium;
  const target = spec.clues[0] + Math.floor(rng() * (spec.clues[1] - spec.clues[0] + 1));

  // 1. a complete random valid grid
  const solution = solve(new Int8Array(81), { limit: 1, rng }).solutions[0];

  // 2. take digits away one at a time, keeping the solution unique
  const puzzle = Int8Array.from(solution);
  let clues = 81;
  for (const i of shuffle([...Array(81).keys()], rng)) {
    if (clues <= target) break;
    const keep = puzzle[i];
    puzzle[i] = 0;
    const unique = countSolutions(puzzle, 2) === 1;
    if (unique && (!spec.mustBeSingles || solveWithSingles(puzzle).solved)) clues--;
    else puzzle[i] = keep; // putting it back
  }
  return { puzzle, solution, clues };
}

// Strings are how puzzles are stored in settings: 81 characters, "0" = empty.
export const toString = (grid) => Array.from(grid).join('');
export const fromString = (s) => Int8Array.from(s.split('').map(Number));
