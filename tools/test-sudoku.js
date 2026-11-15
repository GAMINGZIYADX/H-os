// Tests for the Sudoku engine.   Run:  node tools/test-sudoku.js
const path = require('path');
const { pathToFileURL } = require('url');

let failed = 0;
const expect = (name, ok, extra = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };

(async () => {
  const E = await import(pathToFileURL(path.join(__dirname, '..', 'renderer', 'js', 'puzzles', 'sudokuEngine.js')).href);

  // a classic puzzle with a known single solution
  const known = E.fromString('530070000600195000098000060800060003400803001700020006060000280000419005000080079');
  const knownSolution = '534678912672195348198342567859761423426853791713924856961537284287419635345286179';
  const r = E.solve(known, { limit: 2 });
  expect('solver: classic puzzle has exactly one solution', r.count === 1 && E.toString(r.solutions[0]) === knownSolution);
  expect('solver: solveWithSingles finishes the classic puzzle', E.toString(E.solveWithSingles(known).grid) === knownSolution);
  expect('solver: empty grid has many solutions (stops at the limit)', E.countSolutions(new Int8Array(81), 2) === 2);
  const broken = Int8Array.from(known); broken[2] = 5; // 5 twice in row 0
  expect('solver: contradictory grid has no solutions', E.countSolutions(broken, 2) === 0);
  expect('conflicts: finds duplicates', E.findConflicts(broken).has(0) && E.findConflicts(broken).has(2));
  expect('conflicts: clean grid has none', E.findConflicts(known).size === 0);

  const validSolution = (g) => {
    for (let k = 0; k < 9; k++) {
      const row = new Set(), col = new Set(), box = new Set();
      for (let j = 0; j < 9; j++) {
        row.add(g[k * 9 + j]); col.add(g[j * 9 + k]);
        box.add(g[(Math.floor(k / 3) * 3 + Math.floor(j / 3)) * 9 + (k % 3) * 3 + (j % 3)]);
      }
      if (row.size !== 9 || col.size !== 9 || box.size !== 9 || row.has(0)) return false;
    }
    return true;
  };

  for (const level of ['easy', 'medium', 'hard']) {
    const N = 12;
    let uniqueAll = true, validAll = true, matchAll = true, singlesAll = true;
    let minClues = 99, maxClues = 0, hardEasyCount = 0;
    const t0 = Date.now();
    for (let n = 0; n < N; n++) {
      const g = E.generate(level);
      const count = [...g.puzzle].filter(Boolean).length;
      minClues = Math.min(minClues, count); maxClues = Math.max(maxClues, count);
      if (E.countSolutions(g.puzzle, 2) !== 1) uniqueAll = false;
      if (!validSolution(g.solution)) validAll = false;
      if (g.puzzle.some((v, i) => v && v !== g.solution[i])) matchAll = false;
      if (level !== 'hard' && !E.solveWithSingles(g.puzzle).solved) singlesAll = false;
      if (level === 'hard' && E.solveWithSingles(g.puzzle).solved) hardEasyCount++;
    }
    const ms = (Date.now() - t0) / N;
    expect(`${level}: ${N} puzzles all have exactly one solution`, uniqueAll);
    expect(`${level}: solutions are valid sudokus and match the givens`, validAll && matchAll);
    expect(`${level}: clue counts ${minClues}-${maxClues} are in range`, minClues >= E.DIFFICULTY[level].clues[0] - 4 && maxClues <= E.DIFFICULTY[level].clues[1]);
    if (level !== 'hard') expect(`${level}: solvable with singles only (no guessing)`, singlesAll);
    if (level === 'hard') expect('hard: puzzles need more than singles (real deduction)', hardEasyCount === 0, `(${hardEasyCount} too easy)`);
    expect(`${level}: generating takes ${Math.round(ms)}ms on average (< 1500)`, ms < 1500);
  }

  console.log(failed ? `\n${failed} FAILED` : '\nall sudoku tests passed');
  process.exit(failed ? 1 : 0);
})();
