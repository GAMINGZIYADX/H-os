// =============================================================================
// H-os — saved games (main process)
// -----------------------------------------------------------------------------
// Every game can keep its game in progress in settings.json under "gameSaves", so closing the window
// (or H-os) never loses it. As with all settings, the renderer's data is NOT trusted: each game has a
// validator below that accepts exactly the shape that game writes (known keys, bounded whole numbers,
// strings of the right alphabet and length) and drops everything else. A bad save simply means that
// game starts fresh.
//
// Sudoku keeps its own older "sudoku" setting; the other games use this file.
// Keep the sizes in sync with the games (tools/test-games.js checks the Tulip Sweep, Memory and Tulip
// Bloom sizes against the real engines).
// =============================================================================

const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const isStr = (v, re) => typeof v === 'string' && re.test(v);
const inList = (v, list) => list.includes(v);
const count = (s, ch) => s.split(ch).length - 1;

// Tulip Sweep sizes (renderer/js/puzzles/sweepEngine.js)
const SWEEP = { easy: { rows: 9, cols: 9, mines: 10 }, medium: { rows: 16, cols: 16, mines: 40 }, hard: { rows: 16, cols: 30, mines: 99 } };
// Memory sizes (memoryEngine.js)
const MEMORY = { easy: 12, medium: 16, hard: 24 };
const MEMORY_SYMBOLS = 12;
// Tulip Bloom sizes (bloomEngine.js)
const BLOOM = { small: 4, medium: 5, large: 6 };
// Snake board (apps/snake.js)
const SNAKE = { cols: 20, rows: 15 };

const VALIDATORS = {
  // Number Match: the digits (0 = cleared), "Add numbers" left, score, matches made.
  nummatch(s) {
    if (!isObj(s) || !isStr(s.cells, /^[0-9]{1,1000}$/) || !/[1-9]/.test(s.cells)) return null;
    if (!isInt(s.adds, 0, 5) || !isInt(s.score, 0, 10000000) || !isInt(s.matches, 0, 100000)) return null;
    return { cells: s.cells, adds: s.adds, score: s.score, matches: s.matches };
  },

  // Tulip Sweep: size, where the thorns are (0/1 per cell), what is opened / flagged (0/1/2 per cell), seconds.
  sweep(s) {
    if (!isObj(s) || !inList(s.level, Object.keys(SWEEP))) return null;
    const lv = SWEEP[s.level], size = lv.rows * lv.cols;
    if (!isStr(s.mines, /^[01]+$/) || s.mines.length !== size || count(s.mines, '1') !== lv.mines) return null;
    if (!isStr(s.state, /^[012]+$/) || s.state.length !== size || !isInt(s.elapsed, 0, 10000000)) return null;
    for (let i = 0; i < size; i++) if (s.state[i] === '1' && s.mines[i] === '1') return null; // an opened thorn would be a lost game
    if (!s.state.includes('1')) return null;
    return { level: s.level, mines: s.mines, state: s.state, elapsed: s.elapsed };
  },

  // Tulip Merge: the tiles as [row, column, value] (values are powers of two), score.
  merge(s) {
    if (!isObj(s) || !Array.isArray(s.tiles) || s.tiles.length < 1 || s.tiles.length > 16) return null;
    if (!isInt(s.score, 0, 100000000)) return null;
    const seen = new Set();
    const tiles = [];
    for (const t of s.tiles) {
      if (!Array.isArray(t) || t.length !== 3 || !isInt(t[0], 0, 3) || !isInt(t[1], 0, 3)) return null;
      const v = t[2];
      if (!isInt(v, 2, 131072) || (v & (v - 1)) !== 0) return null;
      if (seen.has(t[0] * 4 + t[1])) return null;
      seen.add(t[0] * 4 + t[1]);
      tiles.push([t[0], t[1], v]);
    }
    return { tiles, score: s.score };
  },

  // Snake: speed, edges, direction, the snake's cells (head first), the tulip, score.
  snake(s) {
    if (!isObj(s) || !inList(s.speed, ['slow', 'normal', 'fast']) || typeof s.wrap !== 'boolean') return null;
    if (!inList(s.dir, ['up', 'down', 'left', 'right']) || !isInt(s.score, 0, 1000000)) return null;
    const cell = (c) => Array.isArray(c) && c.length === 2 && isInt(c[0], 0, SNAKE.cols - 1) && isInt(c[1], 0, SNAKE.rows - 1);
    if (!Array.isArray(s.snake) || s.snake.length < 3 || s.snake.length > SNAKE.cols * SNAKE.rows - 1 || !s.snake.every(cell)) return null;
    if (!cell(s.food)) return null;
    const seen = new Set(s.snake.map((c) => c[1] * SNAKE.cols + c[0]));
    if (seen.size !== s.snake.length || seen.has(s.food[1] * SNAKE.cols + s.food[0])) return null;
    return { speed: s.speed, wrap: s.wrap, dir: s.dir, snake: s.snake.map((c) => [c[0], c[1]]), food: [s.food[0], s.food[1]], score: s.score };
  },

  // Memory: size, the symbol under every card, which cards are matched (2) or face down (0), moves, seconds.
  memory(s) {
    if (!isObj(s) || !inList(s.level, Object.keys(MEMORY))) return null;
    const cards = MEMORY[s.level];
    if (!Array.isArray(s.deck) || s.deck.length !== cards || !s.deck.every((v) => isInt(v, 0, MEMORY_SYMBOLS - 1))) return null;
    const times = {};
    for (const v of s.deck) times[v] = (times[v] || 0) + 1;
    if (!Object.values(times).every((n) => n === 2)) return null;           // every symbol exactly twice
    if (!isStr(s.state, /^[02]+$/) || s.state.length !== cards) return null;
    for (let i = 0; i < cards; i++) {                                         // matched cards come in equal pairs
      if (s.state[i] === '2' && !s.deck.some((v, j) => j !== i && v === s.deck[i] && s.state[j] === '2')) return null;
    }
    if (!s.state.includes('0')) return null;                                 // all matched = a finished game
    if (!isInt(s.moves, 0, 100000) || !isInt(s.elapsed, 0, 10000000)) return null;
    return { level: s.level, deck: [...s.deck], state: s.state, moves: s.moves, elapsed: s.elapsed };
  },

  // Tulip Bloom: size, the garden now, the garden at the start (for Reset), presses, hints used.
  bloom(s) {
    if (!isObj(s) || !inList(s.size, Object.keys(BLOOM))) return null;
    const cells = BLOOM[s.size] ** 2;
    if (!isStr(s.board, /^[01]+$/) || s.board.length !== cells || !isStr(s.start, /^[01]+$/) || s.start.length !== cells) return null;
    if (!s.board.includes('0')) return null;                                  // all bloomed = solved
    if (!isInt(s.presses, 0, 100000) || !isInt(s.hints, 0, 100000)) return null;
    return { size: s.size, board: s.board, start: s.start, presses: s.presses, hints: s.hints };
  },

  // Chess: the game as PGN text (plain printable characters only) and the controls.
  chess(s) {
    if (!isObj(s) || !isStr(s.pgn, /^[\x20-\x7e\n]{1,30000}$/)) return null;
    if (!inList(s.mode, ['ai', 'two', 'analysis']) || !inList(s.human, ['w', 'b']) || !inList(s.colorChoice, ['w', 'b', 'random'])) return null;
    if (!isInt(s.level, 0, 20) || typeof s.flipped !== 'boolean') return null;
    return { pgn: s.pgn, mode: s.mode, human: s.human, colorChoice: s.colorChoice, level: s.level, flipped: s.flipped };
  },
};

// Returns a NEW object with only the valid saves ({} if the input is not an object).
function sanitizeGameSaves(input) {
  const out = {};
  if (!isObj(input)) return out;
  for (const [game, validate] of Object.entries(VALIDATORS)) {
    if (!Object.prototype.hasOwnProperty.call(input, game)) continue;
    const clean = validate(input[game]);
    if (clean) out[game] = clean;
  }
  return out;
}

module.exports = { sanitizeGameSaves, VALIDATORS, SWEEP, MEMORY, BLOOM, SNAKE };
