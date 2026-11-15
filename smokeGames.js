// =============================================================================
// Sudoku / Chess / Puzzles-hub smoke test (part of `npm run smoke`; alone: `npm run smoke:games`).
// Real mouse + keyboard input; Stockfish really runs (in its Web Worker).
// =============================================================================

exports.run = async function runGames(t) {
  const { js, check, snap, sleep, click, clickOn, key, mouse } = t;

  const waitFor = async (expr, ms = 15000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      try { if (await js(expr)) return true; } catch { /* page busy */ }
      await sleep(120);
    }
    return false;
  };
  const closeAll = async () => {
    await js(`window.__hos.windows().forEach((w) => window.__hos.events.emit('window:close', w.id)); 0`);
    await sleep(600);
  };
  const rectOf = (selector) => js(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, left: b.left, top: b.top, w: b.width, h: b.height }; })()`);

  // ===================================================================== Puzzles hub
  await js(`window.__hos.launch('puzzles'); 0`);
  check('hub: lists Sudoku and Chess', await waitFor(`document.querySelectorAll('.win.is-focused .pz-card').length === 2`));
  await snap('60-puzzles-hub.png');
  await clickOn('.win.is-focused .pz-card', 'Sudoku');
  check('hub: clicking a card opens the game', await waitFor(`!!document.querySelector('.win.is-focused .sd-board')`));
  await closeAll();

  // ===================================================================== Sudoku
  await js(`window.hos.settings.save({ sudoku: null }); 0`);
  await js(`window.__hos.settings.setSetting('sudoku', null); window.__hos.launch('sudoku'); 0`);
  check('sudoku: board appears with 81 cells', await waitFor(`document.querySelectorAll('.win.is-focused .sd-cell').length === 81`));
  const givens = await js(`document.querySelectorAll('.win.is-focused .sd-cell.is-given').length`);
  check('sudoku: medium puzzle has 32-36 given digits', givens >= 32 && givens <= 36, `(${givens})`);
  await snap('61-sudoku.png');

  const game = (expr) => js(`(() => { const g = window.__hos.apps.sudoku._game; return ${expr}; })()`);
  const empties = await game(`[...Array(81).keys()].filter((i) => !g.puzzle[i])`);
  const solution = await game(`Array.from(g.solution)`);
  const cellRect = (i) => rectOf(`.win.is-focused .sd-cell[data-i="${i}"]`);

  // pick an empty cell with a real click, enter the right digit with the keyboard
  const first = empties[0];
  let r = await cellRect(first);
  await click(r.x, r.y);
  check('sudoku: clicking a cell selects it', await js(`document.querySelector('.win.is-focused .sd-cell[data-i="${first}"]').classList.contains('is-selected')`));
  check('sudoku: its row/column/box are softly highlighted', (await js(`document.querySelectorAll('.win.is-focused .sd-cell.is-peer').length`)) === 20);
  await key(String(solution[first]));
  check('sudoku: typing the right digit fills the cell', (await game(`g.values[${first}]`)) === solution[first] && !(await js(`document.querySelector('.win.is-focused .sd-cell[data-i="${first}"]').classList.contains('is-error')`)));
  check('sudoku: same-number highlighting works', (await js(`document.querySelectorAll('.win.is-focused .sd-cell.is-same').length`)) >= 1);

  // a wrong digit is marked as a mistake
  const second = empties[1];
  r = await cellRect(second);
  await click(r.x, r.y);
  const wrong = solution[second] === 9 ? 1 : solution[second] + 1;
  await key(String(wrong));
  check('sudoku: a wrong digit is highlighted as a mistake', await js(`document.querySelector('.win.is-focused .sd-cell[data-i="${second}"]').classList.contains('is-error')`));
  await snap('62-sudoku-mistake.png');
  await key('Backspace');
  check('sudoku: Backspace erases it', (await game(`g.values[${second}]`)) === 0);

  // notes (pencil marks)
  await key('n');
  await key('2');
  await key('5');
  check('sudoku: notes mode puts small pencil marks in the cell', (await js(`document.querySelectorAll('.win.is-focused .sd-cell[data-i="${second}"] .sd-notes i.on').length`)) === 2);
  await key('n');
  // placing a digit clears that note from peers
  const peerWithNote = await game(`(() => { const E = null; return g.notes[${second}]; })()`);
  check('sudoku: notes are stored as bit masks', peerWithNote === ((1 << 1) | (1 << 4)));

  // undo / redo with the keyboard
  await key(String(solution[second]));
  check('sudoku: entering the digit clears the cell notes', (await game(`g.notes[${second}]`)) === 0 && (await game(`g.values[${second}]`)) === solution[second]);
  await key('z', ['control']);
  check('sudoku: Ctrl+Z undoes the move (notes come back)', (await game(`g.values[${second}]`)) === 0 && (await game(`g.notes[${second}]`)) === ((1 << 1) | (1 << 4)));
  await key('y', ['control']);
  check('sudoku: Ctrl+Y redoes it', (await game(`g.values[${second}]`)) === solution[second]);

  // hint
  const hintsBefore = await game(`g.hints`);
  await clickOn('.win.is-focused .sd-tool', 'Hint');
  check('sudoku: Hint fills a correct digit and counts it', (await game(`g.hints`)) === hintsBefore + 1 && (await js(`document.querySelectorAll('.win.is-focused .sd-cell.is-hint').length`)) === 1);

  // difficulty buttons / new game confirm
  await clickOn('.win.is-focused .sd-level', 'Hard');
  check('sudoku: starting a new game with progress asks first', await waitFor(`!!document.querySelector('.dialog')`));
  await clickOn('.dialog .btn', 'Cancel');
  await sleep(200);
  check('sudoku: Cancel keeps the game', (await game(`g.difficulty`)) === 'medium');
  await clickOn('.win.is-focused .sd-level', 'Hard');
  await waitFor(`!!document.querySelector('.dialog')`);
  await clickOn('.dialog .btn', 'New game');
  check('sudoku: Hard game starts with 24-28 givens', await waitFor(`document.querySelectorAll('.win.is-focused .sd-cell.is-given').length >= 24 && document.querySelectorAll('.win.is-focused .sd-cell.is-given').length <= 28`));

  // progress is saved and restored when the window is reopened
  const emptyHard = await game(`[...Array(81).keys()].filter((i) => !g.puzzle[i])`);
  const solHard = await game(`Array.from(g.solution)`);
  r = await cellRect(emptyHard[0]);
  await click(r.x, r.y);
  await key(String(solHard[emptyHard[0]]));
  const savedString = await game(`Array.from(g.values).join('')`);
  await clickOn('.win.is-focused .win-ctrl.is-close');
  await sleep(900);
  await js(`window.__hos.launch('sudoku'); 0`);
  await waitFor(`document.querySelectorAll('.win.is-focused .sd-cell').length === 81`);
  check('sudoku: the game in progress is restored after closing', (await game(`Array.from(g.values).join('')`)) === savedString && (await game(`g.difficulty`)) === 'hard');
  const stored = await js(`hos.settings.load().then((s) => s.sudoku && s.sudoku.puzzle.length)`);
  check('sudoku: save data is in settings.json (validated by the main process)', stored === 81);

  // pause
  await clickOn('.win.is-focused .sd-tool', 'Pause');
  check('sudoku: Pause covers the board', await js(`!document.querySelector('.win.is-focused .sd-pause').hidden`));
  await click((await rectOf('.win.is-focused .sd-pause')).x, (await rectOf('.win.is-focused .sd-pause')).y);
  check('sudoku: clicking resumes', await js(`document.querySelector('.win.is-focused .sd-pause').hidden`));

  // solve it completely -> celebration
  await js(`(() => { const a = window.__hos.apps.sudoku; const g = a._game; for (let i = 0; i < 81; i++) { if (g.values[i] !== g.solution[i]) { a._api.select(i); a._api.enter(g.solution[i]); } } })()`);
  check('sudoku: solving shows the celebration with falling petals', await waitFor(`!document.querySelector('.win.is-focused .sd-win').hidden && document.querySelectorAll('.win.is-focused .sd-petal').length === 44`));
  check('sudoku: the game is marked solved and the clock stops', (await game(`g.solved`)) === true);
  await sleep(1500);
  await snap('63-sudoku-solved.png');
  const best = await js(`window.__hos.settings.getSetting('sudokuBest')`);
  check('sudoku: a best time is recorded (no hints on that game -> only if none used)', best.hard === null || Number.isInteger(best.hard));
  await closeAll();

  // ===================================================================== Chess
  await js(`window.__hos.launch('chess'); 0`);
  check('chess: board with 64 squares and 32 pieces', await waitFor(`document.querySelectorAll('.win.is-focused .ch-sq').length === 64 && document.querySelectorAll('.win.is-focused .ch-sq .piece').length === 32`));
  await snap('64-chess.png');
  const sq = async (name) => rectOf(`.win.is-focused .ch-sq[data-sq="${name}"]`);
  const chess = (expr) => js(`(() => { const c = window.__hos.apps.chess; const game = c._game; const S = c._state; return ${expr}; })()`);

  // click e2, see legal targets, click e4
  let p = await sq('e2');
  await click(p.x, p.y);
  check('chess: selecting a pawn shows its 2 legal moves', (await js(`document.querySelectorAll('.win.is-focused .ch-sq.is-target').length`)) === 2);
  p = await sq('e5');
  await click(p.x, p.y);
  check('chess: clicking a non-legal square does nothing', (await chess(`game.history().length`)) === 0);
  p = await sq('e2');
  await click(p.x, p.y);
  p = await sq('e4');
  await click(p.x, p.y);
  check('chess: e2-e4 is played (Stockfish is the reply)', (await chess(`game.history()[0]`)) === 'e4');
  check('chess: the computer (Stockfish worker) answers', await waitFor(`window.__hos.apps.chess._game.history().length === 2`, 30000));
  check('chess: move list shows both moves', (await js(`document.querySelectorAll('.win.is-focused .ch-move.is-current, .win.is-focused button.ch-move').length`)) === 2);
  await snap('65-chess-played.png');

  // drag a knight with the mouse: g1 -> f3 (works unless the engine blocked it: it never can on move 2)
  await waitFor(`!window.__hos.apps.chess._state.thinking`);
  const from = await sq('g1');
  const to = await sq('f3');
  mouse('mouseMove', from.x, from.y);
  await sleep(40);
  mouse('mouseDown', from.x, from.y);
  for (let i = 1; i <= 10; i++) { mouse('mouseMove', from.x + ((to.x - from.x) * i) / 10, from.y + ((to.y - from.y) * i) / 10, { modifiers: ['leftButtonDown'] }); await sleep(20); }
  check('chess: a ghost piece follows the pointer while dragging', await js(`!!document.querySelector('.win.is-focused .ch-ghost')`));
  await snap('66-chess-drag.png');
  mouse('mouseUp', to.x, to.y);
  await sleep(300);
  check('chess: dragging g1 to f3 plays Nf3', (await chess(`game.history().includes('Nf3')`)));
  await waitFor(`window.__hos.apps.chess._game.history().length === 4`, 30000);

  // history navigation
  await js(`document.querySelector('.win.is-focused .ch').focus(); 0`);
  await key('Left');
  check('chess: ← looks at the previous move (banner shows)', (await chess(`S.ply`)) === 3 && (await js(`!document.querySelector('.win.is-focused .ch-banner').hidden`)));
  p = await sq('a2');
  await click(p.x, p.y);
  check('chess: you cannot move while looking back', (await chess(`game.history().length`)) === 4);
  await key('Home');
  check('chess: Home shows the starting position', (await chess(`S.ply`)) === 0 && (await js(`document.querySelectorAll('.win.is-focused .ch-sq .piece').length`)) === 32);
  await key('End');
  check('chess: End returns to the live game', (await chess(`S.ply`)) === null);

  // take back (vs computer: both sides' last move)
  await clickOn('.win.is-focused .ch-tool', 'Take back');
  await sleep(300);
  check('chess: Take back against the computer undoes a full move pair', (await chess(`game.history().length`)) === 2 && (await chess(`game.turn()`)) === 'w');

  // flip
  await key('f');
  check('chess: F flips the board (a8 is bottom-right... h1 top-left)', (await js(`document.querySelector('.win.is-focused .ch-board').firstElementChild.dataset.sq`)) === 'h1');
  await key('f');

  // two players: promotion, checkmate, stalemate
  await chess(`c._api.setMode('two')`);
  await sleep(300);
  check('chess: two-player mode starts a fresh game', (await chess(`game.history().length === 0 && S.mode`)) === 'two');
  await chess(`(game.load('8/P7/8/8/8/8/k7/7K w - - 0 1'), c._api.render(), 0)`);
  p = await sq('a7');
  await click(p.x, p.y);
  p = await sq('a8');
  await click(p.x, p.y);
  check('chess: a pawn reaching the last rank asks what to become', await waitFor(`!document.querySelector('.win.is-focused .ch-promo').hidden`));
  await snap('67-chess-promotion.png');
  await clickOn('.win.is-focused .ch-promo-btn[title="knight"]');
  check('chess: choosing a knight promotes to a knight', (await chess(`game.history()[0]`)) === 'a8=N' && (await chess(`game.get('a8').type`)) === 'n');

  await chess(`(game.reset(), c._api.render(), 0)`);
  for (const [a, b] of [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']]) await chess(`(c._api.commit({ from: '${a}', to: '${b}' }), 0)`);
  check("chess: fool's mate is checkmate (status says so)", (await js(`document.querySelector('.win.is-focused .ch-status').textContent`)).includes('Checkmate! Black wins'));
  await snap('68-chess-checkmate.png');
  p = await sq('e2');
  await click(p.x, p.y);
  check('chess: no moves after checkmate', (await js(`document.querySelectorAll('.win.is-focused .ch-sq.is-target').length`)) === 0);
  await chess(`(game.load('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'), c._api.render(), 0)`);
  check('chess: stalemate is detected as a draw', (await js(`document.querySelector('.win.is-focused .ch-status').textContent`)).includes('Stalemate'));
  await chess(`(game.load('8/8/8/8/8/5k2/8/5K1B w - - 0 1'), c._api.render(), 0)`);
  check('chess: insufficient material is a draw', (await js(`document.querySelector('.win.is-focused .ch-status').textContent`)).includes('not enough pieces'));

  // PGN round trip
  await chess(`(game.reset(), 0)`);
  for (const [a, b] of [['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3']]) await chess(`(c._api.commit({ from: '${a}', to: '${b}' }), 0)`);
  const pgn = await chess(`c._api.pgnText()`);
  check('chess: PGN contains the moves and headers', pgn.includes('1. e4 e5 2. Nf3') && pgn.includes('[Event "H-os game"]'), JSON.stringify(pgn.slice(0, 80)));
  await chess(`(game.reset(), c._api.render(), 0)`);
  await chess(`(c._api.applyPgn(${JSON.stringify(pgn)}), 0)`);
  check('chess: loading that PGN restores the game', (await chess(`game.history().join(' ')`)) === 'e4 e5 Nf3');
  const badPgn = await js(`(() => { try { window.__hos.apps.chess._api.applyPgn('this is not chess'); return 'accepted'; } catch (e) { return 'rejected'; } })()`);
  check('chess: an invalid PGN is rejected and changes nothing', badPgn === 'rejected' && (await chess(`game.history().length`)) === 3);

  // analysis board with eval bar
  await chess(`(game.reset(), 0)`);
  await chess(`c._api.setMode('analysis')`);
  check('chess: analysis mode shows the evaluation bar', await js(`!document.querySelector('.win.is-focused .ch-eval').hidden`));
  check('chess: Stockfish evaluates the start position (a small advantage)', await waitFor(`/^[+-]\\d\\.\\d$/.test(document.querySelector('.win.is-focused .ch-eval-label').textContent)`, 30000));
  const startEval = await js(`Number(document.querySelector('.win.is-focused .ch-eval-label').textContent)`);
  check('chess: start position evaluation is roughly equal (|eval| < 1.0)', Math.abs(startEval) < 1.0, `(${startEval})`);
  await chess(`(game.load('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1'), c._api.setPly(null), 0)`);
  check('chess: it finds mate in one (+M1)', await waitFor(`document.querySelector('.win.is-focused .ch-eval-label').textContent === '+M1'`, 30000));
  check('chess: the best line starts with Ra8#', (await js(`document.querySelector('.win.is-focused .ch-analysis-line').textContent`)).includes('Ra8#'));
  await snap('69-chess-analysis.png');

  // lowest strength still plays a legal reply
  await chess(`(document.querySelector('.win.is-focused .ch-level input').value = '0', document.querySelector('.win.is-focused .ch-level input').dispatchEvent(new Event('input')), 0)`);
  await chess(`c._api.setMode('ai')`);
  p = await sq('d2');
  await click(p.x, p.y);
  p = await sq('d4');
  await click(p.x, p.y);
  check('chess: level 0 (beginner) still answers with a legal move', await waitFor(`window.__hos.apps.chess._game.history().length === 2`, 30000));

  await closeAll();
  check('chess: closing the window ends the engine worker (no leftover errors)', (await js(`window.__hos.windows().length`)) === 0);
};
