// =============================================================================
// apps/sweep.js — Tulip Sweep
// =============================================================================
// The rules live in puzzles/sweepEngine.js (tested separately). This file is the field.
//
//   Left-click opens a bud. Right-click (or F, or the Flag button) plants a flag where you think a
//   thorn ball hides. A number tells how many thorns touch that cell. Click an opened number whose flags
//   add up to it (or middle-click) to open all its other neighbours at once.
//   Arrow keys move, Space / Enter opens, F flags. The first click is always safe.

import { el } from '../dom.js';
import { iconEl } from '../icons.js';
import { registerApp } from '../appRegistry.js';
import { confirmDialog } from '../ui/dialogs.js';
import { emit } from '../events.js';
import * as S from '../puzzles/sweepEngine.js';
import { fmtTime, getBest, recordBest, showWinCard } from '../puzzles/gameKit.js';

const LEVELS = [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']];

function create(container, ctx) {
  ctx.setTitle('Tulip Sweep');

  const st = {
    level: 'easy',
    field: null,
    rng: Math.random,
    flagMode: false,     // the Flag button: a left-click plants a flag (handy without a right mouse button)
    cursor: -1,          // keyboard position
    elapsed: 0,
    ended: false,
  };
  let destroyed = false;
  let timer = null;
  let winLayer = null;
  let cells = [];
  let shown = [];        // what each cell currently displays (so we only touch the cells that changed)

  // ---- layout ----
  const root = el('div', 'gk sw');
  root.tabIndex = -1;

  const head = el('div', 'gk-head');
  const minesChip = el('div', 'gk-chip sw-mines');
  const timeChip = el('div', 'gk-chip sw-time');
  const bestChip = el('div', 'gk-chip');
  const levels = el('div', 'gk-seg');
  const levelBtns = LEVELS.map(([id, label]) => {
    const b = el('button', 'gk-seg-btn', label);
    b.addEventListener('click', () => startNewGame(id));
    levels.append(b);
    return [id, b];
  });
  head.append(minesChip, timeChip, bestChip, levels);

  const stage = el('div', 'sw-stage');
  const board = el('div', 'sw-board');
  board.addEventListener('contextmenu', (e) => e.preventDefault());
  stage.append(board);

  const status = el('div', 'gk-status');
  const foot = el('div', 'gk-foot');
  const bFlag = el('button', 'btn');
  bFlag.append(iconEl('flag'), el('span', '', 'Flag'));
  bFlag.title = 'Flag mode: a left-click plants a flag (F)';
  bFlag.addEventListener('click', () => { st.flagMode = !st.flagMode; paintChrome(); });
  const bNew = el('button', 'btn btn-primary', 'New game');
  bNew.addEventListener('click', () => startNewGame(st.level));
  foot.append(bFlag, bNew);

  root.append(head, stage, status, foot);
  container.append(root);

  // ---------------------------------------------------------------------------
  // Building and painting the field
  // ---------------------------------------------------------------------------
  function buildBoard() {
    const f = st.field;
    board.replaceChildren();
    board.style.setProperty('--cols', String(f.cols));
    board.style.setProperty('--rows', String(f.rows));
    cells = [];
    shown = [];
    for (let i = 0; i < f.rows * f.cols; i++) {
      const b = el('button', 'sw-cell');
      b.dataset.i = String(i);
      b.tabIndex = -1;
      b.addEventListener('pointerdown', (e) => onPointer(e, i));
      board.append(b);
      cells.push(b);
      shown.push('');
    }
  }

  function paintCell(i) {
    const f = st.field;
    const s = f.state[i];
    let sig;
    if (s === S.OPEN) sig = 'o' + f.near[i];
    else if (f.lost && f.hasMine[i]) sig = s === S.FLAG ? 'F' : (i === f.boom ? 'B' : 'M');
    else if (f.lost && s === S.FLAG) sig = 'W';           // a flag on a safe cell
    else sig = s === S.FLAG ? 'F' : 'h';
    const key = sig + (i === st.cursor ? '*' : '');
    if (shown[i] === key) return;
    shown[i] = key;

    const b = cells[i];
    b.replaceChildren();
    b.removeAttribute('data-n');
    b.className = 'sw-cell';
    if (i === st.cursor) b.classList.add('is-cursor');
    if (sig[0] === 'o') {
      b.classList.add('is-open');
      if (f.near[i]) { b.textContent = String(f.near[i]); b.dataset.n = String(f.near[i]); }
    } else if (sig === 'F') {
      b.classList.add('is-flag');
      b.append(iconEl('flag'));
    } else if (sig === 'M' || sig === 'B') {
      b.classList.add('is-open', 'is-mine');
      if (sig === 'B') b.classList.add('is-boom');
      b.append(iconEl('thorn'));
    } else if (sig === 'W') {
      b.classList.add('is-open', 'is-wrong');
      b.append(iconEl('flag'));
    }
    b.setAttribute('aria-label', sig === 'h' ? 'Closed bud' : sig === 'F' ? 'Flag' : sig[0] === 'o' ? `Open, ${f.near[i]}` : 'Thorn');
  }

  function paintAll() {
    for (let i = 0; i < cells.length; i++) paintCell(i);
    paintChrome();
  }

  function paintChrome() {
    const f = st.field;
    minesChip.textContent = `Thorns ${S.minesLeft(f)}`;
    timeChip.textContent = fmtTime(st.elapsed);
    const best = getBest('sweep', st.level);
    bestChip.textContent = best ? `Best ${fmtTime(best)}` : 'Best -';
    levelBtns.forEach(([id, b]) => b.classList.toggle('is-active', id === st.level));
    bFlag.classList.toggle('is-on', st.flagMode);
  }

  function say(text) { status.textContent = text; }

  // ---------------------------------------------------------------------------
  // Playing
  // ---------------------------------------------------------------------------
  function onPointer(e, i) {
    if (destroyed) return;
    e.preventDefault();
    root.focus({ preventScroll: true });
    st.cursor = i;
    if (e.button === 2) flag(i);
    else if (e.button === 1) chord(i);
    else if (e.button === 0) {
      if (st.flagMode) flag(i);
      else if (st.field.state[i] === S.OPEN) chord(i);
      else open(i);
    }
  }

  function startTimerIfNeeded() {
    if (timer || st.ended) return;
    timer = setInterval(() => {
      if (destroyed) return;
      st.elapsed++;
      timeChip.textContent = fmtTime(st.elapsed);
    }, 1000);
  }
  function stopTimer() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function open(i) {
    if (st.ended) return;
    const f = st.field;
    if (f.state[i] === S.FLAG) return;
    const opened = S.reveal(f, i, st.rng);
    if (opened.length) startTimerIfNeeded();
    afterAction(opened.length > 1 ? 'place' : 'tick');
  }

  function chord(i) {
    if (st.ended) return;
    const opened = S.chord(st.field, i, st.rng);
    if (opened.length || st.field.lost) afterAction('place');
  }

  function flag(i) {
    if (st.ended) return;
    if (S.toggleFlag(st.field, i)) {
      emit('sound:play', 'tick');
      paintCell(i);
      paintChrome();
    }
  }

  function afterAction(sound) {
    const f = st.field;
    paintAll();
    if (f.lost) return finish(false);
    if (f.won) return finish(true);
    emit('sound:play', sound);
  }

  function finish(won) {
    st.ended = true;
    stopTimer();
    if (won) {
      const seconds = Math.max(1, st.elapsed);
      const record = recordBest('sweep', st.level, seconds, 'low');
      paintChrome();
      say('');
      emit('sound:play', 'win');
      winLayer = showWinCard(root, {
        title: 'Garden cleared!',
        message: `Every thorn found in ${fmtTime(st.elapsed)}.${record ? '  A new best time!' : ''}`,
        actions: [{ label: 'Admire the field' }, { label: 'New game', primary: true, onClick: () => startNewGame(st.level, true) }],
      });
    } else {
      say('Ouch, a thorn! The thorns are shown. Wrongly placed flags are crossed out.');
      emit('sound:play', 'gameover');
      winLayer = showWinCard(root, {
        title: 'Ouch, a thorn!',
        message: 'Take a look at the field, or try again.',
        petals: false,
        actions: [{ label: 'Look at the field' }, { label: 'Try again', primary: true, onClick: () => startNewGame(st.level, true) }],
      });
    }
  }

  async function startNewGame(level = st.level, force = false, rng = Math.random) {
    const f = st.field;
    const inProgress = f && !st.ended && f.opened > 0;
    if (!force && inProgress && !(await confirmDialog({
      title: 'Start a new game?', message: 'Your current game will be lost.', icon: 'tulip', confirmLabel: 'New game', danger: true,
    }))) return;
    if (destroyed) return;
    const lv = S.LEVELS[level];
    if (!lv) return;
    if (winLayer) winLayer.remove();
    winLayer = null;
    stopTimer();
    st.level = level;
    st.rng = rng;
    st.field = S.newField(lv.rows, lv.cols, lv.mines);
    st.elapsed = 0;
    st.ended = false;
    st.cursor = -1;
    say('');
    buildBoard();
    paintAll();
    emit('sound:play', 'tick');
  }

  // ---------------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------------
  root.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const f = st.field;
    const k = e.key;
    if (k.startsWith('Arrow')) {
      e.preventDefault();
      const cur = st.cursor < 0 ? 0 : st.cursor;
      let r = Math.floor(cur / f.cols), c = cur % f.cols;
      if (st.cursor >= 0) {
        if (k === 'ArrowUp') r = Math.max(0, r - 1);
        if (k === 'ArrowDown') r = Math.min(f.rows - 1, r + 1);
        if (k === 'ArrowLeft') c = Math.max(0, c - 1);
        if (k === 'ArrowRight') c = Math.min(f.cols - 1, c + 1);
      }
      const old = st.cursor;
      st.cursor = r * f.cols + c;
      if (old >= 0) paintCell(old);
      paintCell(st.cursor);
    } else if (k === ' ' || k === 'Enter') {
      e.preventDefault();
      if (st.cursor < 0) return;
      if (f.state[st.cursor] === S.OPEN) chord(st.cursor); else open(st.cursor);
    } else if (k.toLowerCase() === 'f') {
      e.preventDefault();
      if (st.cursor >= 0) flag(st.cursor);
    }
  });

  startNewGame('easy', true);

  root.focus({ preventScroll: true });   // so the keyboard works right after the window opens

  const instance = {
    onFocus() { if (!destroyed) root.focus({ preventScroll: true }); },
    destroy() { destroyed = true; stopTimer(); },
    _state: st,
    _api: { open, flag, chord, newGame: startNewGame },
  };
  if (window.__hos) (window.__hos.apps ||= {}).sweep = instance; // development only
  return instance;
}

export function registerSweep() {
  registerApp({
    id: 'sweep',
    name: 'Tulip Sweep',
    icon: 'sweep',
    keywords: 'puzzle mines minesweeper thorns flags bombs game',
    category: 'puzzle',
    description: 'Open the buds and flag every hidden thorn. The numbers are your clues.',
    defaultSize: { w: 640, h: 660 },
    minSize: { w: 420, h: 480 },
    singleInstance: true,
    create,
  });
}
