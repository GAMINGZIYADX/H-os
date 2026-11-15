// =============================================================================
// Number Match / Tulip Sweep / Tulip Merge / Snake smoke test
// (part of `npm run smoke`; alone together with the other games: `npm run smoke:games`).
// Real mouse + keyboard input drives the games; a few boards are set up through the development hook
// (window.__hos.apps.<game>) so the test is exact and repeatable.
// =============================================================================

exports.run = async function runMoreGames(t) {
  const { js, check, snap, sleep, click, clickOn, key, mouse } = t;

  const waitFor = async (expr, ms = 8000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      try { if (await js(expr)) return true; } catch { /* page busy */ }
      await sleep(100);
    }
    return false;
  };
  const closeAll = async () => {
    await js(`window.__hos.windows().forEach((w) => window.__hos.events.emit('window:close', w.id)); 0`);
    await sleep(600);
  };
  const rectOf = (selector) => js(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, left: b.left, top: b.top, w: b.width, h: b.height }; })()`);
  const launch = async (id, readySelector) => {
    await js(`window.__hos.launch(${JSON.stringify(id)}); 0`);
    return waitFor(`!!document.querySelector(${JSON.stringify('.win.is-focused ' + readySelector)})`);
  };
  const app = (name, expr) => js(`(() => { const a = window.__hos.apps.${name}; const st = a._state; return ${expr}; })()`);
  const stat = (game, k) => js(`((window.__hos.settings.getSetting('gameStats') || {}).${game} || {}).${k} || null`);
  // run code in the page with the seeded random generator available as `makeRng`
  const withRng = (code) => js(`(async () => { const { makeRng } = await import('./js/puzzles/rng.js'); ${code} })()`);

  await closeAll();
  await js(`window.__hos.settings.setSetting('theme', 'light'); window.__hos.settings.setSetting('accent', 'pink'); window.__hos.settings.setSetting('gameStats', {}); window.__hos.settings.setSetting('gameSaves', {}); 0`);

  // ===================================================================== Number Match
  check('nummatch: opens with 27 digits and 5 adds', await launch('nummatch', '.nm-cell') && (await js(`document.querySelectorAll('.win.is-focused .nm-cell').length`)) === 27);
  check('nummatch: the window title is right', (await js(`document.querySelector('.win.is-focused .win-title').textContent`)) === 'Number Match');
  await snap('70-numbermatch.png');

  // a known board: row 0 = 3 7 4 4 4 4 4 4 4,  row 1 = 9 9 8 8 8 8 8 8 6
  const board = `[3,7,4,4,4,4,4,4,4, 9,9,8,8,8,8,8,8,6]`;
  const setBoard = (cells, adds = 5) => js(`(() => { const a = window.__hos.apps.nummatch; Object.assign(a._state, { game: { cells: ${cells}, adds: ${adds}, score: 0, matches: 0 }, selected: -1, hint: null, ended: false }); a._api.render(); return 0; })()`);
  await setBoard(board);
  const cellRect = (i) => rectOf(`.win.is-focused .nm-cell[data-i="${i}"]`);
  let r = await cellRect(0);
  await click(r.x, r.y);
  check('nummatch: clicking a digit selects it', await app('nummatch', `st.selected`) === 0);
  r = await cellRect(1);
  await click(r.x, r.y);
  check('nummatch: clicking a partner (3 and 7 make 10) clears both', (await app('nummatch', `st.game.cells[0] === 0 && st.game.cells[1] === 0 && st.game.score === 10 && st.selected === -1`)));
  check('nummatch: cleared cells look empty', (await js(`document.querySelectorAll('.win.is-focused .nm-cell.is-clear').length`)) === 2);

  // a wrong pair: 4 and 9 (4 + 9 != 10; they are not equal); then the new digit stays selected
  r = await cellRect(2); await click(r.x, r.y);
  r = await cellRect(9); await click(r.x, r.y);
  check('nummatch: a wrong pair is refused with a hint of the rule and the board is unchanged',
    (await app('nummatch', `st.game.cells[2] === 4 && st.game.cells[9] === 9 && st.selected === 9`)) && (await js(`document.querySelector('.win.is-focused .gk-status').textContent`)).includes('add up to 10'));
  r = await cellRect(9); await click(r.x, r.y);   // click the selected digit again: unselect
  check('nummatch: clicking the selected digit again unselects it', (await app('nummatch', `st.selected`)) === -1);

  // hint highlights a real pair; the pair really matches
  await clickOn('.win.is-focused .gk-foot .btn', 'Hint');
  const hinted = await app('nummatch', `st.hint`);
  check('nummatch: Hint glows exactly two digits that can be matched', hinted && hinted.length === 2 && (await js(`document.querySelectorAll('.win.is-focused .nm-cell.is-hint').length`)) === 2);
  await snap('71-numbermatch-hint.png');

  // add numbers
  const before = await app('nummatch', `({ length: st.game.cells.length, filled: st.game.cells.filter(Boolean).length })`);
  await clickOn('.win.is-focused .gk-foot .btn', 'Add numbers');
  check('nummatch: Add numbers appends a copy of every remaining digit', (await app('nummatch', `st.game.cells.length`)) === before.length + before.filled && (await js(`document.querySelectorAll('.win.is-focused .nm-cell').length`)) === before.length + before.filled);
  check('nummatch: and uses up one add', (await app('nummatch', `st.game.adds`)) === 4 && (await js(`document.querySelector('.win.is-focused .gk-chip:nth-child(2)').textContent`)).includes('4'));

  // winning: two digits left
  await setBoard(`[4,6,0,0,0,0,0,0,0]`, 3);
  r = await cellRect(0); await click(r.x, r.y);
  r = await cellRect(1); await click(r.x, r.y);
  check('nummatch: clearing the board wins (with a bonus for unused adds)', await waitFor(`!!document.querySelector('.win.is-focused .gk-win')`) && (await app('nummatch', `st.game.score`)) === 10 + 50 + 300);
  check('nummatch: the best score is saved', (await stat('nummatch', 'score')) === 360);
  await snap('72-numbermatch-win.png');
  await clickOn('.win.is-focused .gk-win .btn', 'New game');
  check('nummatch: "New game" deals a fresh board', await waitFor(`document.querySelectorAll('.win.is-focused .nm-cell').length === 27 && !document.querySelector('.win.is-focused .gk-win')`));

  // stuck: after the last possible match and no adds left
  await setBoard(`[3,3,1,2,0,0,0,0,0]`, 0);
  r = await cellRect(0); await click(r.x, r.y);
  r = await cellRect(1); await click(r.x, r.y);
  check('nummatch: no moves and no adds left shows "No more moves"', await waitFor(`!!document.querySelector('.win.is-focused .gk-win') && document.querySelector('.win.is-focused .gk-win h2').textContent === 'No more moves'`));
  await closeAll();
  check('nummatch: closing the window leaves nothing behind', (await js(`window.__hos.windows().length`)) === 0);

  // ===================================================================== Tulip Sweep
  check('sweep: opens with an easy 9x9 field of 81 buds', await launch('sweep', '.sw-cell') && (await js(`document.querySelectorAll('.win.is-focused .sw-cell').length`)) === 81);
  check('sweep: shows 10 thorns to find', (await js(`document.querySelector('.win.is-focused .sw-mines').textContent`)) === 'Thorns 10');
  await snap('73-sweep-new.png');

  await withRng(`window.__hos.apps.sweep._api.newGame('easy', true, makeRng(11)); return 0;`);
  const sw = (i) => rectOf(`.win.is-focused .sw-cell[data-i="${i}"]`);
  r = await sw(40);
  await click(r.x, r.y);
  check('sweep: the first click opens a safe clearing (never a thorn)', await app('sweep', `st.field.placed && !st.field.lost && st.field.state[40] === 1 && st.field.opened >= 9`));
  check('sweep: opened cells are drawn open', (await js(`document.querySelectorAll('.win.is-focused .sw-cell.is-open').length`)) === (await app('sweep', `st.field.opened`)));
  await snap('74-sweep-playing.png');
  await sleep(1300);
  check('sweep: the clock runs after the first click', (await app('sweep', `st.elapsed`)) >= 1 && (await js(`document.querySelector('.win.is-focused .sw-time').textContent`)) !== '00:00');

  // right-click flags a hidden cell, again removes the flag
  const hidden = await app('sweep', `[...st.field.state].findIndex((s) => s === 0)`);
  r = await sw(hidden);
  await click(r.x, r.y, 'right');
  check('sweep: right-click plants a flag', (await js(`document.querySelectorAll('.win.is-focused .sw-cell.is-flag').length`)) === 1 && (await js(`document.querySelector('.win.is-focused .sw-mines').textContent`)) === 'Thorns 9');
  check('sweep: right-click on the board does not pop up the desktop menu', await js(`!document.querySelector('.ctx-menu')`));
  await click(r.x, r.y, 'right');
  check('sweep: right-click again takes the flag away', (await js(`document.querySelectorAll('.win.is-focused .sw-cell.is-flag').length`)) === 0);
  // a flagged cell is protected from a left-click
  await click(r.x, r.y, 'right');
  await click(r.x, r.y);
  check('sweep: a flagged cell cannot be opened by accident', (await app('sweep', `st.field.state[${hidden}]`)) === 2);
  await click(r.x, r.y, 'right');

  // keyboard: arrows move, F flags
  await app('sweep', `(st.cursor = ${hidden}, 0)`);
  await key('Right');
  const moved = await app('sweep', `st.cursor`);
  check('sweep: arrow keys move the cursor', moved === hidden + 1 || moved === hidden - (hidden % 9));
  await key('f');
  check('sweep: F flags the cursor cell', (await app('sweep', `st.field.state[st.cursor]`)) === 2);
  await key('f');

  // losing: click a thorn
  const thorn = await app('sweep', `st.field.hasMine.findIndex((m, i) => m && st.field.state[i] === 0)`);
  r = await sw(thorn);
  await click(r.x, r.y);
  check('sweep: opening a thorn loses and shows the thorns', await waitFor(`!!document.querySelector('.win.is-focused .gk-win')`) && (await js(`document.querySelectorAll('.win.is-focused .sw-cell.is-mine').length`)) === 10);
  check('sweep: the thorn you hit is marked', (await js(`document.querySelectorAll('.win.is-focused .sw-cell.is-boom').length`)) === 1);
  check('sweep: the clock stops', await (async () => { const a = await app('sweep', `st.elapsed`); await sleep(1300); return (await app('sweep', `st.elapsed`)) === a; })());
  await snap('75-sweep-lost.png');
  await clickOn('.win.is-focused .gk-win .btn', 'Try again');
  check('sweep: "Try again" starts a fresh field', await waitFor(`!document.querySelector('.win.is-focused .gk-win')`) && (await app('sweep', `st.field.opened === 0 && !st.field.placed && st.elapsed === 0`)));

  // winning: open every safe cell
  await withRng(`window.__hos.apps.sweep._api.newGame('easy', true, makeRng(5)); return 0;`);
  r = await sw(0);
  await click(r.x, r.y);
  await js(`(() => { const a = window.__hos.apps.sweep; const f = a._state.field; for (let i = 0; i < f.state.length; i++) if (!f.hasMine[i]) a._api.open(i); return 0; })()`);
  check('sweep: opening every safe cell wins', await waitFor(`!!document.querySelector('.win.is-focused .gk-win') && document.querySelector('.win.is-focused .gk-win h2').textContent === 'Garden cleared!'`));
  check('sweep: the winning time is saved as the easy best', (await stat('sweep', 'easy')) >= 1);
  check('sweep: every thorn ends up flagged', (await js(`document.querySelectorAll('.win.is-focused .sw-cell.is-flag').length`)) === 10);
  await snap('76-sweep-won.png');
  await clickOn('.win.is-focused .gk-win .btn', 'Admire the field');
  check('sweep: "Admire the field" closes the card', await js(`!document.querySelector('.win.is-focused .gk-win')`));

  // the other levels
  await clickOn('.win.is-focused .gk-seg-btn', 'Medium');
  check('sweep: Medium is 16x16 with 40 thorns', await waitFor(`document.querySelectorAll('.win.is-focused .sw-cell').length === 256`) && (await js(`document.querySelector('.win.is-focused .sw-mines').textContent`)) === 'Thorns 40');
  await clickOn('.win.is-focused .gk-seg-btn', 'Hard');
  check('sweep: Hard is 30x16 with 99 thorns', await waitFor(`document.querySelectorAll('.win.is-focused .sw-cell').length === 480`) && (await js(`document.querySelector('.win.is-focused .sw-mines').textContent`)) === 'Thorns 99');
  const hardBoard = await rectOf('.win.is-focused .sw-board');
  check('sweep: the hard board fits inside its window', hardBoard && hardBoard.w > 200 && hardBoard.h > 100);
  r = await sw(200);
  await click(r.x, r.y);
  await sleep(200);
  await snap('77-sweep-hard.png');
  await closeAll();
  const sweepClock = await app('sweep', `st.elapsed`);
  await sleep(1400);
  check('sweep: closing the window stops its clock', (await app('sweep', `st.elapsed`)) === sweepClock);

  // ===================================================================== Tulip Merge
  check('merge: opens with a 4x4 board and two tiles', await launch('merge', '.mg-tile') && (await js(`document.querySelectorAll('.win.is-focused .mg-tile').length`)) === 2);
  await snap('78-merge-new.png');
  const loadGrid = (grid) => js(`window.__hos.apps.merge._api.load(${JSON.stringify(grid)}); 0`);
  await loadGrid([[2, 2, 0, 4], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  await app('merge', `(st.rng = () => 0.99, 0)`);
  await key('Left');
  await sleep(450);
  check('merge: Left joins the two 2s into a 4 and slides the other 4 next to it', (await app('merge', `st.game.tiles.filter((t) => t.r === 0).sort((a, b) => a.c - b.c).map((t) => t.v + '@' + t.c).join()`)) === '4@0,4@1');
  check('merge: the score counts the join', (await app('merge', `st.game.score`)) === 4 && (await js(`document.querySelector('.win.is-focused .gk-chip').textContent`)) === 'Score 4');
  check('merge: a new tile appeared after the move', (await app('merge', `st.game.tiles.length`)) === 3);
  check('merge: the old tiles are gone from the screen after the slide', (await js(`document.querySelectorAll('.win.is-focused .mg-tile').length`)) === 3);
  await snap('79-merge-move.png');

  await key('z', ['control']);
  check('merge: Ctrl+Z undoes the move (score back to 0, the three old tiles are back)', await app('merge', `st.game.score === 0 && st.game.tiles.length === 3 && st.game.tiles.every((t) => t.r === 0)`));
  check('merge: undo also redraws the old tiles', (await js(`[...document.querySelectorAll('.win.is-focused .mg-tile')].map((e) => e.textContent).sort().join()`)) === '2,2,4');

  // a swipe with the real mouse
  await loadGrid([[0, 0, 0, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  const mb = await rectOf('.win.is-focused .mg-board');
  mouse('mouseMove', mb.x + 60, mb.y);
  mouse('mouseDown', mb.x + 60, mb.y);
  await sleep(30);
  mouse('mouseMove', mb.x - 20, mb.y, { modifiers: ['leftButtonDown'] });
  mouse('mouseMove', mb.x - 60, mb.y, { modifiers: ['leftButtonDown'] });
  mouse('mouseUp', mb.x - 60, mb.y);
  await sleep(350);
  check('merge: swiping with the mouse slides the tiles', await app('merge', `st.game.tiles.some((t) => t.v === 2 && t.r === 0 && t.c === 0)`));

  // game over: one move left, and after it the board is full with nothing to join
  await loadGrid([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [2, 2, 8, 16]]);
  await app('merge', `(st.rng = () => 0.5, 0)`);
  await key('Left');
  check('merge: when nothing can move any more the game ends', await waitFor(`!!document.querySelector('.win.is-focused .gk-win') && document.querySelector('.win.is-focused .gk-win h2').textContent === 'No more moves'`));
  check('merge: the best score and biggest tile are saved', (await stat('merge', 'score')) >= 4 && (await stat('merge', 'tile')) >= 16);
  await snap('80-merge-over.png');
  await clickOn('.win.is-focused .gk-win .btn', 'Undo last move');
  check('merge: "Undo last move" takes the card away and gives the move back', await waitFor(`!document.querySelector('.win.is-focused .gk-win')`) && (await app('merge', `!st.game.over`)));

  // reaching 2048
  await loadGrid([[1024, 1024, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  await key('Left');
  check('merge: making 2048 celebrates once and lets you keep going', await waitFor(`!!document.querySelector('.win.is-focused .gk-win') && document.querySelector('.win.is-focused .gk-win h2').textContent === 'You made 2048!'`));
  await snap('81-merge-2048.png');
  await clickOn('.win.is-focused .gk-win .btn', 'Keep going');
  await key('Right');
  check('merge: after "Keep going" the game continues without another celebration', !(await js(`!!document.querySelector('.win.is-focused .gk-win')`)));
  await closeAll();

  // ===================================================================== Snake
  check('snake: opens with a canvas and waits for the first key', await launch('snake', '.sn-canvas') && (await app('snake', `st.mode`)) === 'ready');
  check('snake: starts 3 long with a tulip on the board', (await app('snake', `st.game.snake.length === 3 && !!st.game.food`)));
  await snap('82-snake-ready.png');
  await withRng(`window.__hos.apps.snake._api.newGame(makeRng(4)); return 0;`);
  const x0 = await app('snake', `st.game.snake[0].x`);
  await key('Right');
  check('snake: the first arrow key starts the game', (await app('snake', `st.mode`)) === 'running' && (await app('snake', `window.__hos.apps.snake._api.hasClock()`)));
  await sleep(700);
  check('snake: the snake moves on its own', (await app('snake', `st.game.snake[0].x`)) >= x0 + 3);
  await snap('83-snake-playing.png');
  await key('Down');
  await sleep(150);
  check('snake: an arrow key turns it', (await app('snake', `st.game.dir`)) === 'down');
  await key('Up');
  await sleep(150);
  check('snake: it cannot turn straight back into itself', (await app('snake', `st.game.dir`)) === 'down' && (await app('snake', `st.game.alive`)));

  // Space pauses and resumes
  await key('Space');
  check('snake: Space pauses (and the clock stops)', (await app('snake', `st.mode`)) === 'paused' && !(await app('snake', `window.__hos.apps.snake._api.hasClock()`)));
  const frozen = await app('snake', `st.game.snake[0].y`);
  await sleep(400);
  check('snake: nothing moves while paused', (await app('snake', `st.game.snake[0].y`)) === frozen);
  await key('Space');
  check('snake: Space resumes', (await app('snake', `st.mode`)) === 'running');

  // leaving the window pauses by itself
  await js(`window.__hos.launch('calculator'); 0`);
  check('snake: switching to another window pauses the game', await waitFor(`window.__hos.apps.snake._state.mode === 'paused'`));
  await clickOn('.tb-btn[data-app-id="snake"]');
  await sleep(300);
  const stageRect = await rectOf('.win.is-focused .sn-stage');
  await click(stageRect.x, stageRect.y);
  check('snake: clicking the board continues', (await app('snake', `st.mode`)) === 'running');

  // dying against the wall records the score
  await app('snake', `(st.game.score = 70, st.game.dir = 'right', st.game.queue = [], st.game.snake = [{ x: st.game.cols - 1, y: 3 }, { x: st.game.cols - 2, y: 3 }, { x: st.game.cols - 3, y: 3 }], st.game.food = { x: 0, y: 12 }, 0)`);
  check('snake: running into the wall ends the game', await waitFor(`window.__hos.apps.snake._state.mode === 'over'`, 3000));
  check('snake: the game-over text shows the score', (await js(`document.querySelector('.win.is-focused .sn-veil').textContent`)).includes('Game over, 70'));
  check('snake: the best score is saved', (await stat('snake', 'score')) === 70);
  await snap('84-snake-over.png');
  await key('Space');
  check('snake: Space after game over starts a fresh game', (await app('snake', `st.mode`)) === 'ready' && (await app('snake', `st.game.score`)) === 0);

  // wrap-around button
  await clickOn('.win.is-focused .gk-head .btn', 'Edges: walls');
  check('snake: the Edges button switches to wrap-around', (await app('snake', `st.wrap && st.game.wrap`)) && (await js(`document.querySelector('.win.is-focused .gk-head .btn.is-on').textContent`)) === 'Edges: wrap');
  await clickOn('.win.is-focused .gk-seg-btn', 'Fast');
  check('snake: the speed buttons change the speed', (await app('snake', `st.speed`)) === 'fast');

  await key('Right');
  await closeAll();
  check('snake: closing the window stops the clock and the listeners', !(await js(`window.__hos.apps.snake._api.hasClock()`)));

  // ===================================================================== Memory
  check('memory: opens with a 4x4 table of 16 cards', await launch('memory', '.mm-card') && (await js(`document.querySelectorAll('.win.is-focused .mm-card').length`)) === 16);
  await withRng(`window.__hos.apps.memory._api.newGame('easy', true, makeRng(6)); return 0;`);
  check('memory: Easy has 12 cards (6 pairs)', (await js(`document.querySelectorAll('.win.is-focused .mm-card').length`)) === 12);
  await snap('92-memory-new.png');
  const deck = await app('memory', `Array.from(st.game.deck)`);
  const pairOf = (i) => deck.findIndex((s, j) => j !== i && s === deck[i]);
  const card = (i) => rectOf(`.win.is-focused .mm-card[data-i="${i}"]`);
  r = await card(0); await click(r.x, r.y);
  check('memory: clicking a card turns it over', (await js(`document.querySelectorAll('.win.is-focused .mm-card.is-up').length`)) === 1);
  r = await card(pairOf(0)); await click(r.x, r.y);
  check('memory: the matching card makes a pair that stays face up', (await js(`document.querySelectorAll('.win.is-focused .mm-card.is-matched').length`)) === 2 && (await app('memory', `st.game.moves === 1 && st.game.matched === 1`)));
  await sleep(1300);
  check('memory: the clock runs after the first card', (await app('memory', `st.elapsed`)) >= 1);

  // a miss: two cards that do not match turn back by themselves
  const free = deck.map((s, i) => i).filter((i) => i !== 0 && i !== pairOf(0));
  const m1 = free[0], m2 = free.find((i) => deck[i] !== deck[m1]);
  r = await card(m1); await click(r.x, r.y);
  r = await card(m2); await click(r.x, r.y);
  check('memory: a wrong pair shows both cards for a moment', (await js(`document.querySelectorAll('.win.is-focused .mm-card.is-up').length`)) === 4);
  await snap('93-memory-miss.png');
  await sleep(1200);
  check('memory: then turns them back face down', (await js(`document.querySelectorAll('.win.is-focused .mm-card.is-up').length`)) === 2);
  // flipping the next card hides a missed pair at once
  r = await card(m1); await click(r.x, r.y);
  r = await card(m2); await click(r.x, r.y);
  const third = free.find((i) => i !== m1 && i !== m2);
  r = await card(third); await click(r.x, r.y);
  check('memory: turning a new card hides the missed pair immediately', (await app('memory', `st.game.state[${m1}] === 0 && st.game.state[${m2}] === 0 && st.game.state[${third}] === 1`)));
  // finish the game (the rest through the development hook), the record is the number of moves
  await js(`(() => {
    const a = window.__hos.apps.memory; const g = a._state.game;
    if (g.first >= 0) { const f = g.first; a._api.flip(g.deck.findIndex((s, k) => k !== f && s === g.deck[f])); }   // complete the try that is open
    for (let i = 0; i < g.deck.length; i++) { if (g.state[i] !== 0) continue; a._api.flip(i); a._api.flip(g.deck.findIndex((s, k) => k > i && s === g.deck[i])); }
    return 0;
  })()`);
  check('memory: finding every pair wins', await waitFor(`!!document.querySelector('.win.is-focused .gk-win') && document.querySelector('.win.is-focused .gk-win h2').textContent === 'All pairs found!'`));
  check('memory: the fewest moves is saved as the record', (await stat('memory', 'easy')) === (await app('memory', `st.game.moves`)));
  check('memory: the clock stops at the end', !(await js(`window.__hos.apps.memory._api.hasClock()`)));
  await snap('94-memory-won.png');
  await clickOn('.win.is-focused .gk-win .btn', 'New game');
  check('memory: "New game" deals a new table', await waitFor(`!document.querySelector('.win.is-focused .gk-win')`) && (await app('memory', `st.game.moves === 0 && st.game.matched === 0`)));
  await clickOn('.win.is-focused .gk-seg-btn', 'Hard');
  check('memory: Hard has 24 cards (12 pairs)', await waitFor(`document.querySelectorAll('.win.is-focused .mm-card').length === 24`));
  await snap('95-memory-hard.png');
  await app('memory', `(a._api.flip(0), 0)`);
  await closeAll();
  const memClock = await app('memory', `window.__hos.apps.memory._api.hasClock()`);
  check('memory: closing the window stops its clock', memClock === false);

  // ===================================================================== Tulip Bloom
  check('bloom: opens with a 5x5 garden of 25 tulips', await launch('bloom', '.bl-cell') && (await js(`document.querySelectorAll('.win.is-focused .bl-cell').length`)) === 25);
  await withRng(`window.__hos.apps.bloom._api.newGame('medium', true, makeRng(8)); return 0;`);
  await snap('96-bloom-new.png');
  const solveNow = () => js(`(async () => { const B = await import('./js/puzzles/bloomEngine.js'); const a = window.__hos.apps.bloom; return B.solve(a._state.puzzle.board, a._state.n); })()`);
  const boardNow = () => app('bloom', `Array.from(st.puzzle.board)`);
  const bl = (i) => rectOf(`.win.is-focused .bl-cell[data-i="${i}"]`);
  check('bloom: the puzzle starts with some closed tulips', (await js(`document.querySelectorAll('.win.is-focused .bl-cell:not(.is-on)').length`)) > 0);
  const before2 = await boardNow();
  r = await bl(12);
  await click(r.x, r.y);
  const after2 = await boardNow();
  const flipped = after2.map((v, i) => (v !== before2[i] ? i : -1)).filter((i) => i >= 0);
  check('bloom: pressing the middle tulip flips it and its 4 neighbours', flipped.join() === '7,11,12,13,17' && (await app('bloom', `st.presses`)) === 1);
  r = await bl(0);
  const before3 = await boardNow();
  await click(r.x, r.y);
  const after3 = await boardNow();
  check('bloom: a corner flips only itself and 2 neighbours', after3.map((v, i) => (v !== before3[i] ? i : -1)).filter((i) => i >= 0).join() === '0,1,5');
  await clickOn('.win.is-focused .gk-foot .btn', 'Hint');
  const hintCell = await app('bloom', `st.hintCell`);
  const sol0 = (await solveNow())[0];
  check('bloom: Hint makes exactly one tulip glow, and it is the first press of a shortest solution', hintCell === sol0 && (await js(`document.querySelectorAll('.win.is-focused .bl-cell.is-hint').length`)) === 1);
  await snap('97-bloom-hint.png');
  await clickOn('.win.is-focused .gk-foot .btn', 'Reset');
  check('bloom: Reset returns to the starting position', (await app('bloom', `st.presses === 0 && Array.from(st.puzzle.board).join() === Array.from(st.puzzle.start).join()`)));

  // keyboard
  await key('Right');
  await key('Space');
  check('bloom: arrow keys move and Space presses', (await app('bloom', `st.presses === 1 && st.cursor === 1`)));
  await clickOn('.win.is-focused .gk-foot .btn', 'New puzzle');   // asks, because a puzzle is going
  check('bloom: a puzzle in progress asks before it is replaced', await waitFor(`!!document.querySelector('.dialog')`));
  await clickOn('.dialog .btn', 'New puzzle');
  check('bloom: confirming deals a new puzzle', await waitFor(`!document.querySelector('.dialog')`) && (await app('bloom', `st.presses === 0`)));

  // solve a puzzle with real clicks only, following the solver
  await withRng(`window.__hos.apps.bloom._api.newGame('small', true, makeRng(21)); return 0;`);
  const plan = await solveNow();
  for (const i of plan) {
    r = await bl(i);
    await click(r.x, r.y);
  }
  check('bloom: pressing the solution wins', await waitFor(`!!document.querySelector('.win.is-focused .gk-win') && document.querySelector('.win.is-focused .gk-win h2').textContent === 'Everything is blooming!'`));
  check('bloom: the winning press count is saved (no hints used)', (await stat('bloom', 'small')) === plan.length);
  await snap('98-bloom-won.png');
  await clickOn('.win.is-focused .gk-win .btn', 'New puzzle');
  check('bloom: Large is 6x6', await (async () => { await clickOn('.win.is-focused .gk-seg-btn', 'Large'); return waitFor(`document.querySelectorAll('.win.is-focused .bl-cell').length === 36`); })());
  await closeAll();
  check('bloom: closing the window leaves nothing behind', (await js(`window.__hos.windows().length`)) === 0);

  // ===================================================================== games keep their progress when closed
  await js(`window.__hos.settings.setSetting('gameSaves', {}); 0`);
  // The renderer's save goes through the real settings sanitizer of the main process and comes back:
  // this proves that what every game writes is something the main process accepts.
  const survives = (game) => js(`(async () => {
    const s = window.__hos.settings;
    const saves = s.getSetting('gameSaves');
    if (!saves[${JSON.stringify(game)}]) return 'no save';
    await window.hos.settings.save({ gameSaves: saves });
    const loaded = await window.hos.settings.load();
    const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);   // (key order does not matter)
    return JSON.stringify(canon(loaded.gameSaves[${JSON.stringify(game)}])) === JSON.stringify(canon(saves[${JSON.stringify(game)}])) ? 'ok' : 'changed by the main process';
  })()`);
  const savedOf = (game) => js(`(window.__hos.settings.getSetting('gameSaves') || {})[${JSON.stringify(game)}] || null`);

  // ---- Number Match
  await launch('nummatch', '.nm-cell');
  await setBoard(`[3,7,4,4,4,4,4,4,4, 9,9,8,8,8,8,8,8,6, 1,2,3,4,5,6,7,8,9]`, 4);
  r = await cellRect(0); await click(r.x, r.y);
  r = await cellRect(1); await click(r.x, r.y);
  const nmBefore = await app('nummatch', `st.game.cells.join('')`);
  await closeAll();
  check('saves: Number Match is saved when the window closes', (await savedOf('nummatch')) !== null && (await survives('nummatch')) === 'ok');
  await launch('nummatch', '.nm-cell');
  check('saves: Number Match comes back exactly as it was', (await app('nummatch', `st.game.cells.join('') === ${JSON.stringify(nmBefore)} && st.game.score === 10 && st.game.adds === 4`)) && (await js(`document.querySelectorAll('.win.is-focused .nm-cell').length`)) === 27);
  await setBoard(`[4,6,0,0,0,0,0,0,0]`, 0);
  r = await cellRect(0); await click(r.x, r.y);
  r = await cellRect(1); await click(r.x, r.y);
  await waitFor(`!!document.querySelector('.win.is-focused .gk-win')`);
  await closeAll();
  check('saves: a finished Number Match is not kept (the next one is fresh)', (await savedOf('nummatch')) === null);

  // ---- Tulip Sweep
  await launch('sweep', '.sw-cell');
  await withRng(`window.__hos.apps.sweep._api.newGame('medium', true, makeRng(13)); return 0;`);
  r = await rectOf('.win.is-focused .sw-cell[data-i="120"]');
  await click(r.x, r.y);
  const sweepHidden = await app('sweep', `[...st.field.state].findIndex((s) => s === 0)`);
  r = await rectOf(`.win.is-focused .sw-cell[data-i="${sweepHidden}"]`);
  await click(r.x, r.y, 'right');
  await sleep(1300);
  const swBefore = await app('sweep', `({ opened: st.field.opened, state: Array.from(st.field.state).join(''), mines: Array.from(st.field.hasMine).join(''), flags: st.field.flags })`);
  await closeAll();
  check('saves: Tulip Sweep is saved when the window closes', (await savedOf('sweep')) !== null && (await survives('sweep')) === 'ok');
  await launch('sweep', '.sw-cell');
  const swAfter = await app('sweep', `({ opened: st.field.opened, state: Array.from(st.field.state).join(''), mines: Array.from(st.field.hasMine).join(''), flags: st.field.flags, level: st.level, elapsed: st.elapsed })`);
  check('saves: Tulip Sweep comes back with the same thorns, opened cells and flag', swAfter.opened === swBefore.opened && swAfter.state === swBefore.state && swAfter.mines === swBefore.mines && swAfter.flags === 1 && swAfter.level === 'medium');
  check('saves: and its clock carries on from where it was', swAfter.elapsed >= 1 && (await js(`document.querySelectorAll('.win.is-focused .sw-cell').length`)) === 256 && (await js(`document.querySelectorAll('.win.is-focused .sw-cell.is-flag').length`)) === 1);
  await snap('99-sweep-restored.png');
  // a lost game is not kept
  const swMine = await app('sweep', `st.field.hasMine.findIndex((m, i) => m && st.field.state[i] === 0)`);
  r = await rectOf(`.win.is-focused .sw-cell[data-i="${swMine}"]`);
  await click(r.x, r.y);
  await closeAll();
  check('saves: a lost Tulip Sweep is not kept', (await savedOf('sweep')) === null);

  // ---- Tulip Merge
  await launch('merge', '.mg-tile');
  await js(`window.__hos.apps.merge._api.load([[2,4,8,16],[0,0,0,0],[0,0,0,0],[0,0,64,2]]); window.__hos.apps.merge._state.game.score = 123; window.__hos.apps.merge._api.slide('down'); 0`);
  await sleep(300);
  const mgBefore = await app('merge', `JSON.stringify(st.game.tiles.map((t) => [t.r, t.c, t.v]).sort())`);
  const mgScore = await app('merge', `st.game.score`);
  await closeAll();
  check('saves: Tulip Merge is saved when the window closes', (await savedOf('merge')) !== null && (await survives('merge')) === 'ok');
  await launch('merge', '.mg-tile');
  check('saves: Tulip Merge comes back with the same tiles and score', (await app('merge', `JSON.stringify(st.game.tiles.map((t) => [t.r, t.c, t.v]).sort()) === ${JSON.stringify(mgBefore)} && st.game.score === ${mgScore}`)) && (await js(`document.querySelectorAll('.win.is-focused .mg-tile').length`)) === (await app('merge', `st.game.tiles.length`)));
  await snap('100-merge-restored.png');
  await js(`window.__hos.apps.merge._api.load([[2,4,2,4],[4,2,4,2],[2,4,2,4],[2,2,8,16]]); 0`);
  await app('merge', `(st.rng = () => 0.5, 0)`);
  await key('Left');
  await waitFor(`!!document.querySelector('.win.is-focused .gk-win')`);
  await closeAll();
  check('saves: a finished (stuck) Tulip Merge is not kept', (await savedOf('merge')) === null);

  // ---- Snake
  await launch('snake', '.sn-canvas');
  await withRng(`window.__hos.apps.snake._api.newGame(makeRng(4)); return 0;`);
  await key('Right');
  await app('snake', `(st.game.food = { x: st.game.snake[0].x + 2, y: st.game.snake[0].y }, 0)`);
  await waitFor(`window.__hos.apps.snake._state.game.score >= 10`, 3000);
  await key('Down');
  await sleep(150);
  await js(`window.__hos.apps.snake._api.pause(); 0`);        // (a step may happen at any moment, so stop the clock before taking the picture)
  const snBefore = await app('snake', `JSON.stringify({ s: st.game.snake, d: st.game.dir, sc: st.game.score })`);
  await closeAll();
  check('saves: Snake is saved when the window closes', (await savedOf('snake')) !== null && (await survives('snake')) === 'ok');
  await launch('snake', '.sn-canvas');
  const snAfter = await app('snake', `JSON.stringify({ s: st.game.snake, d: st.game.dir, sc: st.game.score })`);
  check('saves: Snake comes back where it was, paused (no step happened while it was closed)', snAfter === snBefore && (await app('snake', `st.mode`)) === 'paused' && !(await app('snake', `window.__hos.apps.snake._api.hasClock()`)));
  await snap('101-snake-restored.png');
  await key('Space');
  check('saves: Space continues the restored Snake', (await app('snake', `st.mode`)) === 'running');
  await app('snake', `(st.game.snake = [{ x: st.game.cols - 1, y: 3 }, { x: st.game.cols - 2, y: 3 }, { x: st.game.cols - 3, y: 3 }], st.game.dir = 'right', st.game.queue = [], 0)`);
  await waitFor(`window.__hos.apps.snake._state.mode === 'over'`, 3000);
  await closeAll();
  check('saves: a finished Snake game is not kept', (await savedOf('snake')) === null);

  // ---- Memory
  await launch('memory', '.mm-card');
  await withRng(`window.__hos.apps.memory._api.newGame('easy', true, makeRng(6)); return 0;`);
  const mmDeck = await app('memory', `Array.from(st.game.deck)`);
  const mmPair = mmDeck.findIndex((s, j) => j > 0 && s === mmDeck[0]);
  await js(`window.__hos.apps.memory._api.flip(0); window.__hos.apps.memory._api.flip(${mmPair}); 0`);
  await sleep(1200);
  const mmBefore = await app('memory', `({ moves: st.game.moves, state: Array.from(st.game.state).join(''), deck: Array.from(st.game.deck).join('') })`);
  await closeAll();
  check('saves: Memory is saved when the window closes', (await savedOf('memory')) !== null && (await survives('memory')) === 'ok');
  await launch('memory', '.mm-card');
  const mmAfter = await app('memory', `({ moves: st.game.moves, state: Array.from(st.game.state).join(''), deck: Array.from(st.game.deck).join(''), matched: st.game.matched, level: st.level, elapsed: st.elapsed })`);
  check('saves: Memory comes back with the same cards, the found pair and the move count', mmAfter.deck === mmBefore.deck && mmAfter.state === mmBefore.state && mmAfter.moves === mmBefore.moves && mmAfter.matched === 1 && mmAfter.level === 'easy' && (await js(`document.querySelectorAll('.win.is-focused .mm-card.is-matched').length`)) === 2);
  await snap('102-memory-restored.png');
  await closeAll();

  // ---- Tulip Bloom
  await launch('bloom', '.bl-cell');
  await withRng(`window.__hos.apps.bloom._api.newGame('medium', true, makeRng(8)); return 0;`);
  await js(`window.__hos.apps.bloom._api.press(6); window.__hos.apps.bloom._api.press(12); window.__hos.apps.bloom._api.hint(); 0`);
  const blBefore = await app('bloom', `({ board: Array.from(st.puzzle.board).join(''), start: Array.from(st.puzzle.start).join(''), presses: st.presses, hints: st.hints })`);
  await closeAll();
  check('saves: Tulip Bloom is saved when the window closes', (await savedOf('bloom')) !== null && (await survives('bloom')) === 'ok');
  await launch('bloom', '.bl-cell');
  const blAfter = await app('bloom', `({ board: Array.from(st.puzzle.board).join(''), start: Array.from(st.puzzle.start).join(''), presses: st.presses, hints: st.hints, size: st.size })`);
  check('saves: Tulip Bloom comes back with the same garden, presses and hints', blAfter.board === blBefore.board && blAfter.start === blBefore.start && blAfter.presses === 2 && blAfter.hints === 1 && blAfter.size === 'medium');
  await clickOn('.win.is-focused .gk-foot .btn', 'Reset');
  check('saves: Reset still goes back to the real starting position after a restore', (await app('bloom', `Array.from(st.puzzle.board).join('') === ${JSON.stringify(blBefore.start)}`)));
  await snap('103-bloom-restored.png');
  await closeAll();

  // ---- Chess
  await launch('chess', '.ch-board');
  await js(`window.__hos.apps.chess._api.setMode('two'); 0`);
  await js(`(() => { const c = window.__hos.apps.chess; c._api.commit({ from: 'e2', to: 'e4' }); c._api.commit({ from: 'e7', to: 'e5' }); c._api.commit({ from: 'g1', to: 'f3' }); return 0; })()`);
  await closeAll();
  check('saves: Chess is saved when the window closes', (await savedOf('chess')) !== null && (await survives('chess')) === 'ok');
  await launch('chess', '.ch-board');
  check('saves: Chess comes back with the same moves, mode and side to move', (await js(`window.__hos.apps.chess._game.history().join(' ')`)) === 'e4 e5 Nf3' && (await js(`window.__hos.apps.chess._state.mode`)) === 'two' && (await js(`document.querySelector('.win.is-focused .ch-select').value`)) === 'two');
  await snap('104-chess-restored.png');
  await js(`(() => { const c = window.__hos.apps.chess; c._api.setMode('ai'); return 0; })()`);
  await closeAll();
  check('saves: a Chess game with no moves yet is not kept', (await savedOf('chess')) === null);
  // a damaged save never breaks a game: it just starts fresh
  await js(`window.__hos.settings.setSetting('gameSaves', { chess: { pgn: 'this is not chess', mode: 'two', human: 'w', colorChoice: 'w', level: 3, flipped: false }, snake: { speed: 'fast' }, sweep: { level: 'easy' }, nummatch: { cells: 5 } }); 0`);
  check('saves: a broken Chess save starts a fresh game', await launch('chess', '.ch-board') && (await js(`window.__hos.apps.chess._game.history().length`)) === 0);
  check('saves: a broken Snake / Sweep / Number Match save starts fresh games too', await launch('snake', '.sn-canvas') && await launch('sweep', '.sw-cell') && await launch('nummatch', '.nm-cell') && (await js(`document.querySelectorAll('.win.is-focused .nm-cell').length`)) === 27);
  await closeAll();
  await js(`window.__hos.settings.setSetting('gameSaves', {}); 0`);

  // ===================================================================== all of them from the Puzzles hub, then dark + purple
  await js(`window.__hos.launch('puzzles'); 0`);
  check('hub: lists all eight games', await waitFor(`document.querySelectorAll('.win.is-focused .pz-card').length === 8`));
  await snap('85-puzzles-hub.png');
  await clickOn('.win.is-focused .pz-card', 'Number Match');
  check('hub: Number Match opens from its card', await waitFor(`!!document.querySelector('.win.is-focused .nm-board')`));
  await closeAll();

  await js(`window.__hos.settings.setSetting('theme', 'dark'); window.__hos.settings.setSetting('accent', 'purple'); 0`);
  await sleep(300);
  await launch('nummatch', '.nm-cell');
  await js(`window.__hos.apps.nummatch._api.hint(); 0`);
  await sleep(300);
  await snap('86-numbermatch-dark.png');
  await launch('sweep', '.sw-cell');
  await withRng(`window.__hos.apps.sweep._api.newGame('easy', true, makeRng(11)); return 0;`);
  r = await sw(40);
  await click(r.x, r.y);
  const darkHidden = await app('sweep', `[...st.field.state].findIndex((s) => s === 0)`);
  r = await sw(darkHidden);
  await click(r.x, r.y, 'right');
  await sleep(200);
  await snap('87-sweep-dark.png');
  await launch('merge', '.mg-tile');
  await loadGrid([[2, 4, 8, 16], [32, 64, 128, 256], [512, 1024, 2, 4], [0, 0, 8, 0]]);
  await sleep(200);
  await snap('88-merge-dark.png');
  await launch('snake', '.sn-canvas');
  await sleep(300);
  await snap('89-snake-dark.png');
  await launch('memory', '.mm-card');
  await withRng(`window.__hos.apps.memory._api.newGame('medium', true, makeRng(2)); return 0;`);
  for (const i of [0, 1, 2]) await js(`window.__hos.apps.memory._api.flip(${i}); 0`);
  await sleep(500);
  await snap('90-memory-dark.png');
  await launch('bloom', '.bl-cell');
  await withRng(`window.__hos.apps.bloom._api.newGame('medium', true, makeRng(8)); return 0;`);
  await js(`window.__hos.apps.bloom._api.hint(); 0`);
  await sleep(500);
  await snap('91-bloom-dark.png');
  await closeAll();
  await js(`window.__hos.settings.setSetting('theme', 'light'); window.__hos.settings.setSetting('accent', 'pink'); 0`);
};
