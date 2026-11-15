// =============================================================================
// apps/sudoku.js — Sudoku
// =============================================================================
// Puzzle logic lives in puzzles/sudokuEngine.js (tested separately). This file is the board.
//
//   Click a cell, then a number (or press 1-9). N = notes (pencil marks), H = hint,
//   Backspace/Delete = erase, arrows move, Ctrl+Z / Ctrl+Y = undo / redo.
//   The game in progress is saved automatically and comes back next time.

import { el } from '../dom.js';
import { iconEl } from '../icons.js';
import { registerApp } from '../appRegistry.js';
import { getSetting, setSetting } from '../settingsStore.js';
import { confirmDialog } from '../ui/dialogs.js';
import { emit } from '../events.js';
import * as E from '../puzzles/sudokuEngine.js';

const LEVELS = [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']];
const PETAL_COLORS = ['#f4a6c0', '#ee82a8', '#e0558b', '#fbd3e1', '#c9b8f0', '#ffe08a', '#c2306b'];

const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

function create(container, ctx) {
  ctx.setTitle('Sudoku');

  // ---- game state ----
  const g = {
    difficulty: 'medium',
    puzzle: new Int8Array(81),
    solution: new Int8Array(81),
    values: new Int8Array(81),
    notes: new Uint16Array(81),        // bit d-1 set = pencil mark d
    hinted: new Set(),                  // cells filled by a hint (not counted as the player's own)
    selected: -1,
    notesMode: false,
    showErrors: true,
    elapsed: 0,
    hints: 0,
    solved: false,
    paused: false,
    undo: [],
    redo: [],
  };
  let destroyed = false;
  let timer = null;

  // ---- layout ----
  const root = el('div', 'sd');
  root.tabIndex = -1;
  const stage = el('div', 'sd-stage');
  const board = el('div', 'sd-board');
  const cells = [];
  for (let i = 0; i < 81; i++) {
    const cell = el('button', 'sd-cell');
    cell.dataset.i = String(i);
    cell.tabIndex = -1;
    cell.setAttribute('aria-label', `Row ${E.ROW(i) + 1}, column ${E.COL(i) + 1}`);
    if (E.COL(i) % 3 === 2 && E.COL(i) !== 8) cell.classList.add('box-right');
    if (E.ROW(i) % 3 === 2 && E.ROW(i) !== 8) cell.classList.add('box-bottom');
    const value = el('span', 'sd-value');
    const noteGrid = el('span', 'sd-notes');
    for (let d = 1; d <= 9; d++) noteGrid.append(el('i', '', String(d)));
    cell.append(value, noteGrid);
    cell.addEventListener('pointerdown', (e) => { e.preventDefault(); select(i); root.focus({ preventScroll: true }); });
    board.append(cell);
    cells.push({ cell, value, notes: [...noteGrid.children] });
  }
  const pauseCover = el('div', 'sd-pause', 'Paused. Click to resume.');
  pauseCover.hidden = true;
  pauseCover.addEventListener('click', () => setPaused(false));
  stage.append(board, pauseCover);

  const side = el('div', 'sd-side');
  const timerEl = el('div', 'sd-timer', '00:00');
  const infoEl = el('div', 'sd-info');
  const levelRow = el('div', 'sd-levels');
  const levelBtns = LEVELS.map(([id, label]) => {
    const b = el('button', 'sd-level', label);
    b.addEventListener('click', () => startNewGame(id));
    levelRow.append(b);
    return [id, b];
  });

  const pad = el('div', 'sd-pad');
  const padBtns = [];
  for (let d = 1; d <= 9; d++) {
    const b = el('button', 'sd-key');
    b.append(el('b', '', String(d)), el('small', ''));
    b.addEventListener('click', () => enter(d));
    pad.append(b);
    padBtns.push(b);
  }

  const tools = el('div', 'sd-tools');
  const tool = (icon, label, onClick) => {
    const b = el('button', 'sd-tool');
    b.title = label;
    b.append(iconEl(icon), el('span', 'sd-tool-label', label));
    b.addEventListener('click', onClick);
    tools.append(b);
    return b;
  };
  const bUndo = tool('back', 'Undo', undo);
  const bRedo = tool('forward', 'Redo', redo);
  const bErase = tool('close', 'Erase', erase);
  const bNotes = tool('rename', 'Notes', () => { g.notesMode = !g.notesMode; paintTools(); });
  const bHint = tool('info', 'Hint', hint);
  const bPause = tool('sleep', 'Pause', () => setPaused(!g.paused));

  const options = el('label', 'sd-option');
  const errCheck = el('input');
  errCheck.type = 'checkbox';
  errCheck.checked = g.showErrors;
  errCheck.addEventListener('change', () => { g.showErrors = errCheck.checked; paintAll(); });
  options.append(errCheck, el('span', '', 'Highlight mistakes'));

  const newBtn = el('button', 'btn btn-primary sd-new', 'New game');
  newBtn.addEventListener('click', () => startNewGame(g.difficulty));

  side.append(timerEl, infoEl, levelRow, pad, tools, options, newBtn);
  root.append(stage, side);
  container.append(root);

  const winLayer = el('div', 'sd-win');
  winLayer.hidden = true;
  root.append(winLayer);

  // ---------------------------------------------------------------------------
  // Painting
  // ---------------------------------------------------------------------------
  const sameUnit = (a, b) => E.ROW(a) === E.ROW(b) || E.COL(a) === E.COL(b) || E.BOX(a) === E.BOX(b);

  function paintAll() {
    const conflicts = g.showErrors ? E.findConflicts(g.values) : new Set();
    const picked = g.selected >= 0 ? g.values[g.selected] : 0;
    for (let i = 0; i < 81; i++) {
      const { cell, value, notes } = cells[i];
      const v = g.values[i];
      const given = g.puzzle[i] !== 0;
      value.textContent = v ? String(v) : '';
      for (let d = 1; d <= 9; d++) notes[d - 1].classList.toggle('on', !v && Boolean(g.notes[i] & (1 << (d - 1))));
      const wrong = g.showErrors && v && !given && !g.hinted.has(i) && (v !== g.solution[i] || conflicts.has(i));
      cell.classList.toggle('is-given', given);
      cell.classList.toggle('is-hint', g.hinted.has(i));
      cell.classList.toggle('is-selected', i === g.selected);
      cell.classList.toggle('is-peer', g.selected >= 0 && i !== g.selected && sameUnit(i, g.selected));
      cell.classList.toggle('is-same', picked !== 0 && v === picked && i !== g.selected);
      cell.classList.toggle('is-error', Boolean(wrong));
    }
    // number pad: how many of each digit are still missing
    const placed = new Array(10).fill(0);
    for (const v of g.values) if (v) placed[v]++;
    padBtns.forEach((b, k) => {
      const d = k + 1;
      const left = 9 - placed[d];
      b.querySelector('small').textContent = left > 0 ? String(left) : '';
      b.classList.toggle('is-done', left <= 0);
      b.classList.toggle('is-picked', picked === d);
    });
    paintTools();
    infoEl.textContent = `${LEVELS.find((l) => l[0] === g.difficulty)[1]} · ${g.hints} hint${g.hints === 1 ? '' : 's'}`;
    const best = (getSetting('sudokuBest') || {})[g.difficulty];
    if (best) infoEl.textContent += ` · best ${fmtTime(best)}`;
    levelBtns.forEach(([id, b]) => b.classList.toggle('is-active', id === g.difficulty));
  }

  function paintTools() {
    bUndo.disabled = g.undo.length === 0 || g.solved;
    bRedo.disabled = g.redo.length === 0 || g.solved;
    bNotes.classList.toggle('is-on', g.notesMode);
    bNotes.querySelector('.sd-tool-label').textContent = g.notesMode ? 'Notes: on' : 'Notes';
    bErase.disabled = g.solved;
    bHint.disabled = g.solved;
    bPause.querySelector('.sd-tool-label').textContent = g.paused ? 'Resume' : 'Pause';
  }

  // ---------------------------------------------------------------------------
  // Saving
  // ---------------------------------------------------------------------------
  function save() {
    if (destroyed) return;
    setSetting('sudoku', {
      difficulty: g.difficulty,
      puzzle: E.toString(g.puzzle),
      solution: E.toString(g.solution),
      values: E.toString(g.values),
      notes: Array.from(g.notes),
      elapsed: g.elapsed,
      hints: g.hints,
      solved: g.solved,
    });
  }

  function load(saved) {
    g.difficulty = saved.difficulty;
    g.puzzle = E.fromString(saved.puzzle);
    g.solution = E.fromString(saved.solution);
    g.values = E.fromString(saved.values);
    g.notes = Uint16Array.from(saved.notes);
    g.elapsed = saved.elapsed;
    g.hints = saved.hints;
    g.solved = saved.solved;
    g.hinted = new Set();
    g.undo = [];
    g.redo = [];
    g.selected = -1;
  }

  // ---------------------------------------------------------------------------
  // Playing
  // ---------------------------------------------------------------------------
  // Every change is recorded as a list of cell edits so Undo/Redo can replay it.
  function apply(changes) {
    const entry = [];
    for (const [i, v, n] of changes) {
      if (g.values[i] === v && g.notes[i] === n) continue;
      entry.push({ i, oldV: g.values[i], oldN: g.notes[i], newV: v, newN: n });
      g.values[i] = v;
      g.notes[i] = n;
    }
    if (!entry.length) return false;
    g.undo.push(entry);
    g.redo = [];
    return true;
  }

  function enter(d) {
    if (g.solved || g.paused) return;
    const i = g.selected;
    if (i < 0 || g.puzzle[i]) return;
    if (g.notesMode) {
      if (g.values[i]) return; // notes only go in empty cells
      apply([[i, 0, g.notes[i] ^ (1 << (d - 1))]]);
      emit('sound:play', 'tick');
    } else {
      const same = g.values[i] === d;
      const changes = [[i, same ? 0 : d, 0]];
      if (!same) {
        // placing a digit removes that pencil mark from everything it can see
        for (const p of E.PEERS[i]) if (g.notes[p] & (1 << (d - 1))) changes.push([p, g.values[p], g.notes[p] & ~(1 << (d - 1))]);
      }
      g.hinted.delete(i);
      apply(changes);
      emit('sound:play', same ? 'tick' : 'place');
    }
    afterChange();
  }

  function erase() {
    const i = g.selected;
    if (g.solved || g.paused || i < 0 || g.puzzle[i]) return;
    g.hinted.delete(i);
    if (apply([[i, 0, 0]])) { emit('sound:play', 'tick'); afterChange(); }
  }

  function undo() {
    const entry = g.undo.pop();
    if (!entry || g.solved) return;
    for (const c of entry) { g.values[c.i] = c.oldV; g.notes[c.i] = c.oldN; }
    g.redo.push(entry);
    afterChange(false);
  }
  function redo() {
    const entry = g.redo.pop();
    if (!entry || g.solved) return;
    for (const c of entry) { g.values[c.i] = c.newV; g.notes[c.i] = c.newN; }
    g.undo.push(entry);
    afterChange();
  }

  function hint() {
    if (g.solved || g.paused) return;
    let target = g.selected;
    const needs = (i) => !g.puzzle[i] && g.values[i] !== g.solution[i];
    if (target < 0 || !needs(target)) {
      // prefer a cell that has only one possibility left (a "natural" next step), else any wrong/empty cell
      const open = [...Array(81).keys()].filter(needs);
      if (!open.length) return;
      const easy = open.filter((i) => E.bitCount(E.candidates(g.values, i)) === 1);
      const pool = easy.length ? easy : open;
      target = pool[Math.floor(Math.random() * pool.length)];
    }
    g.selected = target;
    g.hints++;
    const d = g.solution[target];
    const changes = [[target, d, 0]];
    for (const p of E.PEERS[target]) if (g.notes[p] & (1 << (d - 1))) changes.push([p, g.values[p], g.notes[p] & ~(1 << (d - 1))]);
    apply(changes);
    g.hinted.add(target);
    emit('sound:play', 'hint');
    afterChange();
  }

  function afterChange(checkWin = true) {
    paintAll();
    save();
    if (checkWin && !g.solved && g.values.every((v, i) => v === g.solution[i])) win();
  }

  function select(i) {
    g.selected = i;
    paintAll();
  }

  // ---------------------------------------------------------------------------
  // Winning
  // ---------------------------------------------------------------------------
  function win() {
    g.solved = true;
    stopTimer();
    g.selected = -1;
    paintAll();
    let message = `You solved it in ${fmtTime(g.elapsed)}!`;
    if (g.hints === 0) {
      const best = getSetting('sudokuBest') || {};
      if (!best[g.difficulty] || g.elapsed < best[g.difficulty]) {
        setSetting('sudokuBest', { ...best, [g.difficulty]: g.elapsed });
        message += '  A new best time!';
      }
    } else {
      message += `  (${g.hints} hint${g.hints === 1 ? '' : 's'} used, so no record this time)`;
    }
    save();
    emit('sound:play', 'win');
    showWin(message);
  }

  function showWin(message) {
    winLayer.hidden = false;
    winLayer.replaceChildren();
    // falling tulip petals
    for (let k = 0; k < 44; k++) {
      const petal = el('span', 'sd-petal');
      const size = 10 + Math.random() * 16;
      Object.assign(petal.style, {
        left: Math.random() * 100 + '%',
        width: size + 'px',
        height: size * 1.4 + 'px',
        background: PETAL_COLORS[k % PETAL_COLORS.length],
        animationDuration: 4 + Math.random() * 4 + 's',
        animationDelay: Math.random() * 2.5 + 's',
        '--drift': (Math.random() * 120 - 60) + 'px',
        '--spin': (Math.random() * 540 - 270) + 'deg',
      });
      winLayer.append(petal);
    }
    const card = el('div', 'sd-win-card');
    card.append(iconEl('tulip', 'sd-win-icon'), el('h2', '', 'Solved!'), el('p', '', message));
    const again = el('button', 'btn btn-primary', 'New game');
    again.addEventListener('click', () => startNewGame(g.difficulty));
    const close = el('button', 'btn', 'Admire the board');
    close.addEventListener('click', () => { winLayer.hidden = true; });
    const actions = el('div', 'dialog-actions');
    actions.append(close, again);
    card.append(actions);
    winLayer.append(card);
    again.focus();
  }

  // ---------------------------------------------------------------------------
  // New game, timer, pause
  // ---------------------------------------------------------------------------
  async function startNewGame(level) {
    const hasProgress = !g.solved && g.values.some((v, i) => v && !g.puzzle[i]);
    if (hasProgress && !(await confirmDialog({
      title: 'Start a new game?', message: 'Your current game will be lost.', icon: 'sudoku', confirmLabel: 'New game', danger: true,
    }))) return;
    const made = E.generate(level);
    g.difficulty = level;
    g.puzzle = made.puzzle;
    g.solution = made.solution;
    g.values = Int8Array.from(made.puzzle);
    g.notes = new Uint16Array(81);
    g.hinted = new Set();
    g.undo = [];
    g.redo = [];
    g.selected = -1;
    g.elapsed = 0;
    g.hints = 0;
    g.solved = false;
    winLayer.hidden = true;
    setPaused(false);
    timerEl.textContent = fmtTime(0);
    paintAll();
    save();
    startTimer();
    emit('sound:play', 'tick');
  }

  function startTimer() {
    stopTimer();
    timer = setInterval(() => {
      if (g.paused || g.solved || destroyed) return;
      g.elapsed++;
      timerEl.textContent = fmtTime(g.elapsed);
      if (g.elapsed % 10 === 0) save(); // keep the saved clock reasonably fresh
    }, 1000);
  }
  function stopTimer() {
    if (timer) clearInterval(timer);
    timer = null;
  }
  function setPaused(paused) {
    if (g.solved) paused = false;
    g.paused = paused;
    pauseCover.hidden = !paused;
    board.classList.toggle('is-paused', paused);
    paintTools();
  }

  // ---------------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------------
  root.addEventListener('keydown', (e) => {
    const k = e.key;
    const ctrl = e.ctrlKey || e.metaKey;
    if (/^[1-9]$/.test(k) && !ctrl) { e.preventDefault(); enter(Number(k)); }
    else if (k === 'Backspace' || k === 'Delete' || k === '0') { e.preventDefault(); erase(); }
    else if (k.toLowerCase() === 'n' && !ctrl) { e.preventDefault(); g.notesMode = !g.notesMode; paintTools(); }
    else if (k.toLowerCase() === 'h' && !ctrl) { e.preventDefault(); hint(); }
    else if (ctrl && k.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (ctrl && (k.toLowerCase() === 'y' || (k.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    else if (k.startsWith('Arrow')) {
      e.preventDefault();
      const cur = g.selected < 0 ? 40 : g.selected;
      let r = E.ROW(cur), c = E.COL(cur);
      if (k === 'ArrowUp') r = Math.max(0, r - 1);
      if (k === 'ArrowDown') r = Math.min(8, r + 1);
      if (k === 'ArrowLeft') c = Math.max(0, c - 1);
      if (k === 'ArrowRight') c = Math.min(8, c + 1);
      select(r * 9 + c);
    }
  });

  // ---------------------------------------------------------------------------
  // Start: resume the saved game, or begin a fresh one
  // ---------------------------------------------------------------------------
  const saved = getSetting('sudoku');
  if (saved && saved.puzzle) {
    load(saved);
    paintAll();
    timerEl.textContent = fmtTime(g.elapsed);
    if (g.solved) showWin(`Finished in ${fmtTime(g.elapsed)}. Start a new game when you like!`);
    else startTimer();
  } else {
    const made = E.generate('medium');
    g.puzzle = made.puzzle;
    g.solution = made.solution;
    g.values = Int8Array.from(made.puzzle);
    paintAll();
    save();
    startTimer();
  }

  const instance = {
    onFocus() { if (!destroyed) root.focus({ preventScroll: true }); },
    destroy() { destroyed = true; stopTimer(); setSetting('sudoku', {
      difficulty: g.difficulty, puzzle: E.toString(g.puzzle), solution: E.toString(g.solution), values: E.toString(g.values),
      notes: Array.from(g.notes), elapsed: g.elapsed, hints: g.hints, solved: g.solved,
    }); },
    _game: g,
    _api: { enter, select, hint, undo, redo, erase, startNewGame },
  };
  if (window.__hos) (window.__hos.apps ||= {}).sudoku = instance; // development only
  return instance;
}

export function registerSudoku() {
  registerApp({
    id: 'sudoku',
    name: 'Sudoku',
    icon: 'sudoku',
    keywords: 'puzzle numbers grid game',
    category: 'puzzle',
    description: 'Fill the grid so every row, column and box holds 1 to 9.',
    defaultSize: { w: 760, h: 600 },
    minSize: { w: 560, h: 480 },
    singleInstance: true,
    create,
  });
}
