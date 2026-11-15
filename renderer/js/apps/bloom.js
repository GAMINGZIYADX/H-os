// =============================================================================
// apps/bloom.js — Tulip Bloom
// =============================================================================
// The rules live in puzzles/bloomEngine.js (tested separately). This file is the garden.
//
//   Pressing a tulip flips it and its four neighbours (closed <-> open). Make every tulip bloom.
//   Arrow keys move, Space / Enter presses, H = hint, R = reset this puzzle.
//   Using a hint means this puzzle will not set a record.

import { el } from '../dom.js';
import { registerApp } from '../appRegistry.js';
import { confirmDialog } from '../ui/dialogs.js';
import { emit } from '../events.js';
import * as B from '../puzzles/bloomEngine.js';
import { getBest, recordBest, showWinCard } from '../puzzles/gameKit.js';

const SIZES = [['small', 'Small 4x4'], ['medium', 'Medium 5x5'], ['large', 'Large 6x6']];

// One tulip: an open flower and a closed bud, one of them shown at a time (see games.css).
// (The SVG text is our own constant, never user input.)
const FLOWER_SVG = `<svg viewBox="0 0 40 40" aria-hidden="true">
  <g class="bl-flower"><circle class="bl-petal" cx="20" cy="9.5" r="7"/><circle class="bl-petal" cx="30" cy="16.8" r="7"/><circle class="bl-petal" cx="26.2" cy="28.5" r="7"/><circle class="bl-petal" cx="13.8" cy="28.5" r="7"/><circle class="bl-petal" cx="10" cy="16.8" r="7"/><circle class="bl-core" cx="20" cy="20" r="5"/></g>
  <g class="bl-bud"><path class="bl-stem" d="M20 34V22" fill="none" stroke-width="2.6" stroke-linecap="round"/><path class="bl-cup" d="M12.5 9.5l4 4 3.5-4 3.5 4 4-4c1.3 9.5-1.5 17-7.5 17s-8.8-7.5-7.5-17Z"/></g>
</svg>`;

function create(container, ctx) {
  ctx.setTitle('Tulip Bloom');

  const st = {
    size: 'medium',
    n: 5,
    puzzle: null,      // { n, board, start }
    presses: 0,
    hints: 0,
    hintCell: -1,
    cursor: -1,
    ended: false,
  };
  let destroyed = false;
  let winLayer = null;
  let cells = [];

  // ---- layout ----
  const root = el('div', 'gk bl');
  root.tabIndex = -1;

  const head = el('div', 'gk-head');
  const pressChip = el('div', 'gk-chip');
  const bestChip = el('div', 'gk-chip');
  const sizes = el('div', 'gk-seg');
  const sizeBtns = SIZES.map(([id, label]) => {
    const b = el('button', 'gk-seg-btn', label);
    b.addEventListener('click', () => startNewGame(id));
    sizes.append(b);
    return [id, b];
  });
  head.append(pressChip, bestChip, sizes);

  const stage = el('div', 'bl-stage');
  const board = el('div', 'bl-board');
  stage.append(board);
  const status = el('div', 'gk-status', 'Pressing a tulip flips it and its four neighbours. Make them all bloom!');

  const foot = el('div', 'gk-foot');
  const bHint = el('button', 'btn', 'Hint');
  bHint.addEventListener('click', hint);
  const bReset = el('button', 'btn', 'Reset');
  bReset.addEventListener('click', reset);
  const bNew = el('button', 'btn btn-primary', 'New puzzle');
  bNew.addEventListener('click', () => startNewGame(st.size));
  foot.append(bHint, bReset, bNew);

  root.append(head, stage, status, foot);
  container.append(root);

  // ---------------------------------------------------------------------------
  // Building and painting
  // ---------------------------------------------------------------------------
  function buildBoard() {
    board.replaceChildren();
    board.style.setProperty('--n', String(st.n));
    cells = [];
    for (let i = 0; i < st.n * st.n; i++) {
      const b = el('button', 'bl-cell');
      b.dataset.i = String(i);
      b.tabIndex = -1;
      b.innerHTML = FLOWER_SVG;
      b.addEventListener('pointerdown', (e) => { if (e.button === 0) { e.preventDefault(); root.focus({ preventScroll: true }); st.cursor = i; press(i); } });
      board.append(b);
      cells.push(b);
    }
  }

  function paint() {
    const bd = st.puzzle.board;
    cells.forEach((b, i) => {
      b.classList.toggle('is-on', bd[i] === 1);
      b.classList.toggle('is-hint', i === st.hintCell);
      b.classList.toggle('is-cursor', i === st.cursor);
      b.setAttribute('aria-label', bd[i] === 1 ? 'Open tulip' : 'Closed tulip');
    });
    pressChip.textContent = `Presses ${st.presses}`;
    const best = getBest('bloom', st.size);
    bestChip.textContent = best ? `Best ${best}` : 'Best -';
    sizeBtns.forEach(([id, b]) => b.classList.toggle('is-active', id === st.size));
    bHint.disabled = st.ended;
  }

  // ---------------------------------------------------------------------------
  // Playing
  // ---------------------------------------------------------------------------
  function press(i) {
    if (destroyed || st.ended || i < 0 || i >= st.n * st.n) return;
    B.press(st.puzzle.board, st.n, i);
    st.presses++;
    st.hintCell = -1;
    status.textContent = '';
    emit('sound:play', 'tick');
    paint();
    if (B.isSolved(st.puzzle.board)) finish();
  }

  function hint() {
    if (destroyed || st.ended) return;
    const solution = B.solve(st.puzzle.board, st.n);
    if (!solution || !solution.length) return;
    st.hints++;
    st.hintCell = solution[0];
    status.textContent = `Try the glowing tulip. (${solution.length} press${solution.length === 1 ? '' : 'es'} to go at best. Hints mean no record this time.)`;
    emit('sound:play', 'hint');
    paint();
  }

  function reset() {
    if (destroyed) return;
    if (winLayer) { winLayer.remove(); winLayer = null; }
    st.puzzle.board = Uint8Array.from(st.puzzle.start);
    st.presses = 0;
    st.hintCell = -1;
    st.ended = false;
    status.textContent = 'Back to the start of this puzzle.';
    emit('sound:play', 'tick');
    paint();
  }

  function finish() {
    st.ended = true;
    let record = false;
    if (st.hints === 0) record = recordBest('bloom', st.size, st.presses, 'low');
    paint();
    emit('sound:play', 'win');
    winLayer = showWinCard(root, {
      title: 'Everything is blooming!',
      message: `Solved in ${st.presses} presses.${record ? '  A new record!' : st.hints ? `  (${st.hints} hint${st.hints === 1 ? '' : 's'} used, so no record this time)` : ''}`,
      actions: [{ label: 'Admire the garden' }, { label: 'New puzzle', primary: true, onClick: () => startNewGame(st.size, true) }],
    });
  }

  async function startNewGame(size = st.size, force = false, rng = Math.random) {
    const inProgress = st.puzzle && !st.ended && st.presses > 0;
    if (!force && inProgress && !(await confirmDialog({
      title: 'Start a new puzzle?', message: 'Your current puzzle will be lost.', icon: 'tulip', confirmLabel: 'New puzzle', danger: true,
    }))) return;
    if (destroyed || !B.SIZES[size]) return;
    if (winLayer) winLayer.remove();
    winLayer = null;
    st.size = size;
    st.n = B.SIZES[size];
    st.puzzle = B.newPuzzle(st.n, rng);
    st.presses = 0;
    st.hints = 0;
    st.hintCell = -1;
    st.cursor = -1;
    st.ended = false;
    status.textContent = 'Pressing a tulip flips it and its four neighbours. Make them all bloom!';
    buildBoard();
    paint();
    emit('sound:play', 'tick');
  }

  // ---------------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------------
  root.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const n = st.n, k = e.key;
    if (k.startsWith('Arrow')) {
      e.preventDefault();
      if (st.cursor < 0) st.cursor = 0;
      else {
        let r = Math.floor(st.cursor / n), c = st.cursor % n;
        if (k === 'ArrowUp') r = Math.max(0, r - 1);
        if (k === 'ArrowDown') r = Math.min(n - 1, r + 1);
        if (k === 'ArrowLeft') c = Math.max(0, c - 1);
        if (k === 'ArrowRight') c = Math.min(n - 1, c + 1);
        st.cursor = r * n + c;
      }
      paint();
    } else if (k === ' ' || k === 'Enter') {
      e.preventDefault();
      if (st.cursor >= 0) press(st.cursor);
    } else if (k.toLowerCase() === 'h') { e.preventDefault(); hint(); }
    else if (k.toLowerCase() === 'r') { e.preventDefault(); reset(); }
  });

  startNewGame('medium', true);
  root.focus({ preventScroll: true });   // so the keyboard works right after the window opens

  const instance = {
    onFocus() { if (!destroyed) root.focus({ preventScroll: true }); },
    destroy() { destroyed = true; },
    _state: st,
    _api: { press, hint, reset, newGame: startNewGame },
  };
  if (window.__hos) (window.__hos.apps ||= {}).bloom = instance; // development only
  return instance;
}

export function registerBloom() {
  registerApp({
    id: 'bloom',
    name: 'Tulip Bloom',
    icon: 'bloom',
    keywords: 'puzzle lights out flip toggle flowers grid game',
    category: 'puzzle',
    description: 'Each press flips a tulip and its neighbours. Make the whole garden bloom.',
    defaultSize: { w: 520, h: 640 },
    minSize: { w: 380, h: 480 },
    singleInstance: true,
    create,
  });
}
