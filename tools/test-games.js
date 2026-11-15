// Tests for the game engines (Number Match, Tulip Sweep, Tulip Merge, Snake) and the saved-scores setting.
//   Run:  node tools/test-games.js
const path = require('path');
const { pathToFileURL } = require('url');

let failed = 0;
const expect = (name, ok, extra = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };
const load = (file) => import(pathToFileURL(path.join(__dirname, '..', 'renderer', 'js', 'puzzles', file)).href);

(async () => {
  const { makeRng, shuffled } = await load('rng.js');

  // ---------------------------------------------------------------- rng
  {
    const a = makeRng(7), b = makeRng(7), c = makeRng(8);
    const seqA = [a(), a(), a()], seqB = [b(), b(), b()], seqC = [c(), c(), c()];
    expect('rng: same seed gives the same numbers', seqA.join() === seqB.join());
    expect('rng: a different seed gives different numbers', seqA.join() !== seqC.join());
    expect('rng: numbers stay in [0, 1)', seqA.every((x) => x >= 0 && x < 1));
    expect('shuffle: keeps every item exactly once', shuffled([1, 2, 3, 4, 5, 6], makeRng(1)).sort().join() === '1,2,3,4,5,6');
  }

  // ---------------------------------------------------------------- Number Match
  {
    const N = await load('numberMatchEngine.js');
    const W = N.WIDTH;
    const row = (...v) => [...v, ...new Array(W - v.length).fill(1)]; // pad a row with harmless 1s

    expect('nummatch: equal digits next to each other match', N.canMatch([3, 3, 5, 9, 9, 9, 9, 9, 9], 0, 1));
    expect('nummatch: digits adding up to 10 match', N.canMatch([3, 7, 5, 9, 9, 9, 9, 9, 9], 0, 1));
    expect('nummatch: other pairs do not match', !N.canMatch([3, 4, 5, 9, 9, 9, 9, 9, 9], 0, 1));
    expect('nummatch: a digit never matches itself', !N.canMatch([3, 7, 5, 9, 9, 9, 9, 9, 9], 0, 0));
    expect('nummatch: a digit in between blocks the match', !N.canMatch([3, 5, 3, 9, 9, 9, 9, 9, 9], 0, 2));
    expect('nummatch: cleared cells in between do not block', N.canMatch([3, 0, 0, 3, 9, 9, 9, 9, 9], 0, 3));
    expect('nummatch: reading order wraps from the end of a row to the next', N.canMatch([...row(1, 1, 1, 1, 1, 1, 1, 1, 4), 6, ...new Array(8).fill(2)], 8, 9));
    expect('nummatch: same column matches straight down', N.canMatch([5, 1, 1, 1, 1, 1, 1, 1, 1, 5, 2, 2, 2, 2, 2, 2, 2, 2], 0, 9));
    expect('nummatch: column match is blocked by a digit in between',
      !N.canMatch([5, 1, 1, 1, 1, 1, 1, 1, 1, 6, 2, 2, 2, 2, 2, 2, 2, 2, 5, 3, 3, 3, 3, 3, 3, 3, 3], 0, 18));
    expect('nummatch: diagonals never match', !N.canMatch([5, 1, 1, 1, 1, 1, 1, 1, 1, 2, 5, 2, 2, 2, 2, 2, 2, 2], 0, 10));
    expect('nummatch: out-of-range or fractional indexes are refused', !N.canMatch([3, 3], 0, 5) && !N.canMatch([3, 3], -1, 1) && !N.canMatch([3, 3], 0, 0.5));

    // matching removes the pair, and empty rows vanish
    const g0 = { cells: [3, 7, 4, 4, 4, 4, 4, 4, 4, 0, 0, 0, 0, 0, 0, 0, 0, 6], adds: 5, score: 0, matches: 0 };
    const g1 = N.match(g0, 0, 1);
    expect('nummatch: matching clears both digits and scores', g1.cells[0] === 0 && g1.cells[1] === 0 && g1.score === N.PAIR_POINTS && g1.matches === 1);
    expect('nummatch: matching leaves the old game untouched', g0.cells[0] === 3 && g0.score === 0);
    expect('nummatch: an invalid match returns null', N.match(g0, 0, 2) === null);
    const g2 = N.match({ cells: [3, 7, 0, 0, 0, 0, 0, 0, 0, 4, 4, 4, 4, 4, 4, 4, 4, 4], adds: 5, score: 0, matches: 0 }, 0, 1);
    expect('nummatch: a fully cleared row disappears with a bonus', g2.cells.length === 9 && g2.cells[0] === 4 && g2.score === N.PAIR_POINTS + N.ROW_POINTS);
    const won = N.match({ cells: [3, 7, 0, 0, 0, 0, 0, 0, 0], adds: 2, score: 0, matches: 0 }, 0, 1);
    expect('nummatch: clearing everything wins (bonus for unused adds)', N.status(won) === 'won' && won.score === N.PAIR_POINTS + N.ROW_POINTS + 2 * N.WIN_BONUS_PER_ADD);

    // add numbers
    const g3 = { cells: [3, 0, 7, 0, 0, 0, 0, 0, 5, 0, 1], adds: 2, score: 0, matches: 0 };
    const g4 = N.addNumbers(g3);
    expect('nummatch: add numbers copies the remaining digits in order', g4.cells.slice(11).join() === '3,7,5,1' && g4.adds === 1 && g4.cells.length === 15);
    expect('nummatch: add numbers is refused when none are left', N.addNumbers({ ...g3, adds: 0 }) === null);

    // finding moves, stuck detection
    expect('nummatch: findMove finds a pair', JSON.stringify(N.findMove([1, 2, 3, 4, 3, 7])) === '[4,5]');
    expect('nummatch: findMove returns null when nothing matches', N.findMove([1, 2, 4, 8, 3, 9]) === null);
    expect('nummatch: stuck = no moves and no adds left', N.status({ cells: [1, 2, 4, 8], adds: 0, score: 0, matches: 0 }) === 'stuck');
    expect('nummatch: not stuck while an add is left', N.status({ cells: [1, 2, 4, 8], adds: 1, score: 0, matches: 0 }) === 'playing');

    // every new game is playable
    let allOk = true, widths = true;
    for (let seed = 1; seed <= 300; seed++) {
      const g = N.newGame(makeRng(seed));
      if (!N.findMove(g.cells) || g.cells.length !== N.START_CELLS || g.adds !== N.MAX_ADDS) allOk = false;
      if (g.cells.some((v) => v < 1 || v > 9)) widths = false;
    }
    expect('nummatch: 300 random starts all have a first move', allOk);
    expect('nummatch: starting digits are all 1 to 9', widths);

    // a whole game can be played with hints until the end (it must end: won, or stuck)
    const rng = makeRng(99);
    let game = N.newGame(rng), steps = 0;
    while (N.status(game) === 'playing' && steps < 5000) {
      const mv = N.findMove(game.cells);
      game = mv ? N.match(game, mv[0], mv[1]) : N.addNumbers(game);
      steps++;
    }
    expect('nummatch: a hint-driven game always reaches an end', N.status(game) !== 'playing', `(${N.status(game)} after ${steps} steps)`);
  }

  // ---------------------------------------------------------------- Tulip Sweep
  {
    const S = await load('sweepEngine.js');
    const mineCount = (f) => f.hasMine.reduce((a, b) => a + b, 0);

    // the first opening is always safe, and so are its neighbours (several seeds, every level)
    let safe = true, counts = true;
    for (const [name, lv] of Object.entries(S.LEVELS)) {
      for (let seed = 1; seed <= 40; seed++) {
        const f = S.newField(lv.rows, lv.cols, lv.mines);
        const first = (seed * 7) % (lv.rows * lv.cols);
        S.reveal(f, first, makeRng(seed));
        if (f.lost || f.hasMine[first] || S.neighbors(f, first).some((n) => f.hasMine[n])) safe = false;
        if (mineCount(f) !== lv.mines) counts = false;
      }
    }
    expect('sweep: the first opening (and its neighbours) is never a thorn', safe);
    expect('sweep: the right number of thorns is placed at every level', counts);
    expect('sweep: nothing is placed before the first opening', mineCount(S.newField(9, 9, 10)) === 0);

    // a hand-made field:  row0: . . .   thorn at index 2 of a 3x3 -> near counts
    const f = S.newField(3, 3, 1);
    f.hasMine[8] = 1; f.placed = true;                       // thorn in the bottom-right corner
    for (let i = 0; i < 9; i++) { let n = 0; for (const j of S.neighbors(f, i)) n += f.hasMine[j]; f.near[i] = n; }
    expect('sweep: counts the thorns around a cell', f.near[4] === 1 && f.near[5] === 1 && f.near[7] === 1 && f.near[0] === 0);
    const opened = S.reveal(f, 0);
    expect('sweep: opening an empty cell flood-fills the clearing', opened.length === 8 && f.opened === 8);
    expect('sweep: opening every safe cell wins and flags the thorns', f.won && f.state[8] === S.FLAG && S.minesLeft(f) === 0);

    const g = S.newField(3, 3, 1);
    g.hasMine[0] = 1; g.placed = true;
    for (let i = 0; i < 9; i++) { let n = 0; for (const j of S.neighbors(g, i)) n += g.hasMine[j]; g.near[i] = n; }
    S.reveal(g, 0);
    expect('sweep: opening a thorn loses', g.lost && g.boom === 0);
    expect('sweep: nothing can be opened after losing', S.reveal(g, 8).length === 0 && !S.toggleFlag(g, 8));

    // flags and chording
    const h = S.newField(3, 3, 1);
    h.hasMine[0] = 1; h.placed = true;
    for (let i = 0; i < 9; i++) { let n = 0; for (const j of S.neighbors(h, i)) n += h.hasMine[j]; h.near[i] = n; }
    expect('sweep: a flag can be placed and removed', S.toggleFlag(h, 0) && h.state[0] === S.FLAG && h.flags === 1 && S.toggleFlag(h, 0) && h.state[0] === S.HIDDEN && h.flags === 0);
    expect('sweep: a flagged cell cannot be opened', (S.toggleFlag(h, 0), S.reveal(h, 0).length === 0 && !h.lost));
    S.toggleFlag(h, 0);                                        // un-flag
    S.reveal(h, 4);                                            // the centre: shows 1
    expect('sweep: chording with too few flags does nothing', S.chord(h, 4).length === 0);
    S.toggleFlag(h, 0);
    const chorded = S.chord(h, 4);
    expect('sweep: chording with enough flags opens the other neighbours (and wins here)', chorded.length === 7 && h.won);
    const k = S.newField(3, 3, 1);
    k.hasMine[0] = 1; k.placed = true;
    for (let i = 0; i < 9; i++) { let n = 0; for (const j of S.neighbors(k, i)) n += k.hasMine[j]; k.near[i] = n; }
    S.reveal(k, 4);
    S.toggleFlag(k, 1);                                        // a WRONG flag (the thorn is at 0)
    S.chord(k, 4);
    expect('sweep: chording next to a wrong flag opens the thorn and loses', k.lost);

    // the hard field floods without a stack overflow
    const big = S.newField(100, 100, 1);
    big.hasMine[9999] = 1; big.placed = true;
    for (let i = 0; i < 10000; i++) { let n = 0; for (const j of S.neighbors(big, i)) n += big.hasMine[j]; big.near[i] = n; }
    expect('sweep: a 10000-cell flood fill works (no recursion)', S.reveal(big, 0).length === 9999 && big.won);
    let threw = false;
    try { S.newField(3, 3, 9); } catch { threw = true; }
    expect('sweep: a field with no room for safe cells is refused', threw);
  }

  // ---------------------------------------------------------------- Tulip Merge
  {
    const M = await load('mergeEngine.js');
    const noSpawn = () => 0.5; // rng for tests that don't care where the new tile goes
    const slide = (rowValues, dir = 'left') => {
      const grid = [rowValues, [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
      const r = M.move(M.fromGrid(grid), dir, noSpawn);
      return { ...r, row: M.toGrid(r.game)[0] };
    };
    expect('merge: [2,2,2,2] left -> [4,4,0,0] (each tile joins once)', slide([2, 2, 2, 2]).row.join() === '4,4,0,0');
    expect('merge: [2,2,4,0] left -> [4,4,0,0]', slide([2, 2, 4, 0]).row.join() === '4,4,0,0');
    expect('merge: [4,2,2,0] left -> [4,4,0,0]', slide([4, 2, 2, 0]).row.join() === '4,4,0,0');
    expect('merge: [2,0,0,2] left -> [4,0,0,0]', slide([2, 0, 0, 2]).row.join() === '4,0,0,0');
    expect('merge: [2,2,2,0] left -> [4,2,0,0] (the one nearest the wall joins first)', slide([2, 2, 2, 0]).row.join() === '4,2,0,0');
    expect('merge: [2,2,2,0] right -> [0,0,2,4]', slide([2, 2, 2, 0], 'right').row.join() === '0,0,2,4');
    expect('merge: [2,4,8,16] cannot move left (nothing happens)', slide([2, 4, 8, 16]).moved === false);
    const sc = slide([2, 2, 4, 4]);
    expect('merge: score grows by the new tiles (4 + 8)', sc.gained === 12 && sc.game.score === 12);

    // vertical moves
    const col = M.fromGrid([[2, 0, 0, 0], [2, 0, 0, 0], [4, 0, 0, 0], [0, 0, 0, 0]]);
    const up = M.move(col, 'up', noSpawn);
    expect('merge: up joins the column', M.toGrid(up.game).map((r) => r[0]).join().startsWith('4,4'));
    const down = M.move(col, 'down', noSpawn);
    expect('merge: down slides the column to the bottom', M.toGrid(down.game).map((r) => r[0]).join().endsWith('4,4') || M.toGrid(down.game).map((r) => r[0]).slice(2).join() === '4,4');

    // a new tile appears only if something moved
    const moved = slide([0, 2, 0, 0]);
    expect('merge: a move spawns exactly one new tile', moved.game.tiles.length === 2 && moved.spawned && (moved.spawned.v === 2 || moved.spawned.v === 4));
    const still = slide([2, 4, 8, 16]);
    expect('merge: no change means no new tile and the same game object', still.game.tiles.length === 4 && !still.spawned);

    // ids: sliding keeps ids, joining makes a new tile and reports ghosts
    const idGame = M.fromGrid([[2, 2, 0, 4], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
    const idMove = M.move(idGame, 'left', noSpawn);
    expect('merge: a join reports its new tile and the two old tiles as ghosts', idMove.merged.length === 1 && idMove.ghosts.length === 2 && idMove.ghosts.every((x) => x.r === 0 && x.c === 0));
    const four = idMove.game.tiles.find((t) => t.v === 4 && t.c === 1);
    expect('merge: tiles that only slide keep their id', four && four.id === idGame.tiles.find((t) => t.v === 4).id);

    // game over / reaching the goal
    const full = M.fromGrid([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]]);
    expect('merge: a full board with no equal neighbours is over', full.over === true && !M.canMove(full));
    const almost = M.fromGrid([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 2, 8]]);
    expect('merge: a full board with one pair left is not over', !almost.over && M.canMove(almost));
    const last = M.move(almost, 'left', noSpawn);
    expect('merge: the last move can end the game', last.moved && (last.game.over === true || M.canMove(last.game)));
    const goal = M.move(M.fromGrid([[1024, 1024, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), 'left', noSpawn);
    expect('merge: making 2048 sets "reached"', goal.game.reached === true);

    // 500 random moves: tile count, ids, positions stay sane
    const rng = makeRng(5);
    let game = M.newGame(rng), sane = true, spawnsOk = true;
    const dirs = M.DIRECTIONS;
    for (let n = 0; n < 500 && !game.over; n++) {
      const before = game.tiles.reduce((s, t) => s + t.v, 0);
      const r = M.move(game, dirs[Math.floor(rng() * 4)], rng);
      if (r.moved) {
        const after = r.game.tiles.reduce((s, t) => s + t.v, 0);
        if (after - before !== r.spawned.v) spawnsOk = false;          // sliding and joining never change the total
      }
      game = r.game;
      const seen = new Set();
      for (const t of game.tiles) {
        const key = t.r * 4 + t.c;
        if (seen.has(key) || t.r < 0 || t.c < 0 || t.r > 3 || t.c > 3) sane = false;
        seen.add(key);
      }
      if (new Set(game.tiles.map((t) => t.id)).size !== game.tiles.length) sane = false;
    }
    expect('merge: 500 random moves never overlap tiles or reuse ids', sane);
    expect('merge: the total value only grows by the spawned tile', spawnsOk);
  }

  // ---------------------------------------------------------------- Snake
  {
    const K = await load('snakeEngine.js');
    const noRng = () => 0;
    const g = K.newGame({ cols: 10, rows: 8 }, noRng);
    expect('snake: starts with 3 segments facing right and food on the board', g.snake.length === 3 && g.dir === 'right' && g.food && g.alive);
    expect('snake: the food never starts on the snake', !g.snake.some((p) => p.x === g.food.x && p.y === g.food.y));
    const head0 = { ...g.snake[0] };
    expect('snake: a step moves the head one cell', K.step(g, noRng) !== 'dead' && g.snake[0].x === head0.x + 1 && g.snake.length === 3);

    K.turn(g, 'left');
    expect('snake: it cannot turn straight back into itself', g.queue.length === 0);
    K.turn(g, 'up'); K.turn(g, 'left'); K.turn(g, 'down');
    expect('snake: two quick turns are both remembered (a third is not)', g.queue.join() === 'up,left');
    K.step(g, noRng);
    expect('snake: the next step uses the first queued turn', g.dir === 'up' && g.queue.join() === 'left');

    // eating
    const e = K.newGame({ cols: 10, rows: 8 }, noRng);
    e.food = { x: e.snake[0].x + 1, y: e.snake[0].y };
    const r = K.step(e, makeRng(3));
    expect('snake: eating grows the snake, scores, and puts out new food', r === 'eat' && e.snake.length === 4 && e.score === K.FOOD_POINTS && !e.snake.some((p) => p.x === e.food.x && p.y === e.food.y));

    // walls and wrapping
    const w = K.newGame({ cols: 6, rows: 5 }, noRng);
    let result = 'move', guard = 0;
    while (result !== 'dead' && guard++ < 20) result = K.step(w, noRng);
    expect('snake: hitting the wall ends the game', result === 'dead' && !w.alive);
    expect('snake: nothing moves after the game ended', K.step(w, noRng) === 'dead');
    const wr = K.newGame({ cols: 6, rows: 5, wrap: true }, noRng);
    wr.food = { x: 0, y: 0 };
    for (let i = 0; i < 12; i++) K.step(wr, noRng);
    expect('snake: with wrap-around you come out on the other side and live', wr.alive && wr.snake.every((p) => p.x >= 0 && p.x < 6));

    // biting yourself
    const s = K.newGame({ cols: 10, rows: 10 }, noRng);
    s.snake = [{ x: 4, y: 4 }, { x: 4, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 4 }, { x: 5, y: 3 }, { x: 4, y: 3 }];
    s.dir = 'up'; s.food = { x: 0, y: 0 };
    K.turn(s, 'right');
    expect('snake: running into its own body ends the game', K.step(s, noRng) === 'dead');
    // the tail cell is free in the same step (chasing your own tail is fine)
    const t = K.newGame({ cols: 10, rows: 10 }, noRng);
    t.snake = [{ x: 4, y: 4 }, { x: 5, y: 4 }, { x: 5, y: 5 }, { x: 4, y: 5 }];
    t.dir = 'down'; t.food = { x: 0, y: 0 };
    K.turn(t, 'left');
    expect('snake: moving into the cell the tail just left is allowed', (K.turn(t, 'down'), true) && K.step(t, noRng) !== 'dead');

    // filling the whole board wins
    const f = K.newGame({ cols: 3, rows: 2 }, noRng);
    f.snake = [{ x: 2, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }];
    f.dir = 'down'; f.food = { x: 2, y: 1 };
    expect('snake: eating the last free cell is a win', K.step(f, noRng) === 'won' && f.won);
  }

  // ---------------------------------------------------------------- Memory
  {
    const Y = await load('memoryEngine.js');
    for (const [level, lv] of Object.entries(Y.LEVELS)) {
      const g = Y.newGame(level, makeRng(3));
      const counts = {};
      for (const s of g.deck) counts[s] = (counts[s] || 0) + 1;
      expect(`memory: ${level} has ${lv.cols * lv.rows} cards, every symbol exactly twice`,
        g.deck.length === lv.cols * lv.rows && Object.keys(counts).length === lv.pairs && Object.values(counts).every((c) => c === 2) && lv.pairs * 2 === lv.cols * lv.rows);
    }
    expect('memory: the same seed deals the same deck', Y.newGame('hard', makeRng(9)).deck.join() === Y.newGame('hard', makeRng(9)).deck.join());
    expect('memory: different seeds deal different decks', Y.newGame('hard', makeRng(9)).deck.join() !== Y.newGame('hard', makeRng(10)).deck.join());

    const g = Y.newGame('easy', makeRng(1));
    const a = 0, same = g.deck.findIndex((s, i) => i !== 0 && s === g.deck[0]);
    const other = g.deck.findIndex((s) => s !== g.deck[0]);
    expect('memory: the first card turns up', Y.flip(g, a) === 'first' && g.state[a] === Y.UP && g.moves === 0);
    expect('memory: the same card cannot be flipped twice', Y.flip(g, a) === 'ignored');
    expect('memory: the matching card makes a pair', Y.flip(g, same) === 'match' && g.state[a] === Y.MATCHED && g.state[same] === Y.MATCHED && g.moves === 1 && g.matched === 1);
    expect('memory: matched cards cannot be flipped', Y.flip(g, a) === 'ignored');
    Y.flip(g, other);
    const miss = g.deck.findIndex((s, i) => s !== g.deck[other] && g.state[i] === Y.DOWN);
    expect('memory: a wrong second card is a miss and both stay up for a moment', Y.flip(g, miss) === 'miss' && g.state[other] === Y.UP && g.state[miss] === Y.UP && g.moves === 2);
    expect('memory: resolve turns the missed pair face down', Y.resolve(g) && g.state[other] === Y.DOWN && g.state[miss] === Y.DOWN && !g.pending);
    Y.flip(g, other); Y.flip(g, miss);          // miss again
    const third = g.deck.findIndex((s, i) => g.state[i] === Y.DOWN && i !== other && i !== miss);
    expect('memory: flipping a new card turns the missed pair back by itself', Y.flip(g, third) === 'first' && g.state[other] === Y.DOWN && g.state[miss] === Y.DOWN);
    expect('memory: bad indexes are ignored', Y.flip(g, -1) === 'ignored' && Y.flip(g, 999) === 'ignored' && Y.flip(g, 1.5) === 'ignored');
    // playing perfectly wins
    const w = Y.newGame('hard', makeRng(2));
    for (let i = 0; i < w.deck.length; i++) {
      if (w.state[i] !== Y.DOWN) continue;
      Y.flip(w, i);
      Y.flip(w, w.deck.findIndex((s, j) => j > i && s === w.deck[i]));
    }
    expect('memory: finding every pair wins in exactly one move per pair', Y.isWon(w) && w.moves === 12);
    expect('memory: nothing happens after winning', Y.flip(w, 0) === 'ignored');
  }

  // ---------------------------------------------------------------- Tulip Bloom
  {
    const B = await load('bloomEngine.js');
    const b3 = new Uint8Array(9).fill(1);
    B.press(b3, 3, 4);
    expect('bloom: pressing the middle flips it and its 4 neighbours', b3.join('') === '101000101');
    const corner = new Uint8Array(9).fill(1);
    B.press(corner, 3, 0);
    expect('bloom: a corner has only 2 neighbours', corner.join('') === '001011111');
    const twice = new Uint8Array(16).fill(1);
    B.press(twice, 4, 5); B.press(twice, 4, 5);
    expect('bloom: pressing twice changes nothing', B.isSolved(twice));

    // every size: puzzles are solvable, never start solved, and the solution really solves them
    let ok = true, notSolved = true, small = true;
    for (const [name, n] of Object.entries(B.SIZES)) {
      for (let seed = 1; seed <= 25; seed++) {
        const p = B.newPuzzle(n, makeRng(seed));
        if (B.isSolved(p.board)) notSolved = false;
        const sol = B.solve(p.board, n);
        if (!sol) { ok = false; continue; }
        const test = Uint8Array.from(p.board);
        for (const i of sol) B.press(test, n, i);
        if (!B.isSolved(test)) ok = false;
        const pressedCount = sol.length;
        if (pressedCount > n * n) small = false;
      }
    }
    expect('bloom: 75 puzzles (all sizes) are solvable and the solver solves them', ok);
    expect('bloom: no puzzle starts solved', notSolved);
    expect('bloom: a solution never presses more than every cell once', small);
    expect('bloom: Reset data keeps a copy of the starting position', (() => { const p = B.newPuzzle(5, makeRng(4)); B.press(p.board, 5, 3); return p.start.join() !== p.board.join(); })());

    // the solver agrees with brute force on 4x4: a position is solvable exactly when some set of presses makes it
    const reachable = new Map();
    for (let mask = 0; mask < 65536; mask++) {
      const b = new Uint8Array(16).fill(1);
      let cnt = 0;
      for (let i = 0; i < 16; i++) if (mask & (1 << i)) { B.press(b, 4, i); cnt++; }
      const key = b.join('');
      if (!reachable.has(key) || reachable.get(key) > cnt) reachable.set(key, cnt);
    }
    let agree = true, minimal = true, unsolvableSeen = 0;
    const rng = makeRng(77);
    for (let t = 0; t < 400; t++) {
      const b = Uint8Array.from({ length: 16 }, () => (rng() < 0.5 ? 1 : 0));
      const sol = B.solve(b, 4);
      const key = b.join('');
      if (reachable.has(key) !== (sol !== null)) agree = false;
      if (sol === null) unsolvableSeen++;
      else if (sol.length !== reachable.get(key)) minimal = false;
    }
    expect('bloom: 400 random 4x4 positions: the solver says solvable exactly when brute force does', agree);
    expect('bloom: and its answer is always the shortest one', minimal);
    expect('bloom: it really does report unsolvable positions as null', unsolvableSeen > 0);

    // following the hints (one press at a time) always reaches the goal
    let followed = true;
    for (const n of [4, 5, 6]) {
      const p = B.newPuzzle(n, makeRng(n * 11));
      let guard = 0;
      while (!B.isSolved(p.board) && guard++ < 60) B.press(p.board, n, B.solve(p.board, n)[0]);
      if (!B.isSolved(p.board)) followed = false;
    }
    expect('bloom: pressing the first hint again and again solves the puzzle', followed);
  }

  // ---------------------------------------------------------------- saved scores (settings.json)
  {
    const settings = require('../mainSettings.js');
    const clean = settings.sanitize({ gameStats: { snake: { score: 120, evil: 5 }, sweep: { easy: 33, medium: 1.5, hard: -4 }, merge: { score: 99999999999 }, nope: { score: 1 } } });
    expect('settings: known scores are kept', clean.gameStats.snake.score === 120 && clean.gameStats.sweep.easy === 33);
    expect('settings: unknown games and records are dropped', !clean.gameStats.nope && clean.gameStats.snake.evil === undefined);
    expect('settings: fractions, negatives and huge numbers are dropped', clean.gameStats.sweep.medium === undefined && clean.gameStats.sweep.hard === undefined && !clean.gameStats.merge);
    expect('settings: garbage is ignored', JSON.stringify(settings.sanitize({ gameStats: 'x' }).gameStats) === undefined || settings.sanitize({ gameStats: [1] }).gameStats === undefined);
    expect('settings: an empty record set is fine', JSON.stringify(settings.sanitize({ gameStats: {} }).gameStats) === '{}');
  }

  console.log(failed ? `\n${failed} FAILED` : '\nAll game tests passed.');
  process.exit(failed ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
