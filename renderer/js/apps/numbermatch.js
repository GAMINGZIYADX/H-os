// =============================================================================
// apps/numbermatch.js — Number Match
// =============================================================================
// The rules live in puzzles/numberMatchEngine.js (tested separately). This file is the board.
//
//   Click two digits that are equal or add up to 10 and have nothing but cleared cells between them
//   (along the reading order, or straight down a column). Clear the whole board to win.
//   A = add numbers, H = hint, Esc = unselect.

import { el } from '../dom.js';
import { registerApp } from '../appRegistry.js';
import { confirmDialog } from '../ui/dialogs.js';
import { emit } from '../events.js';
import * as N from '../puzzles/numberMatchEngine.js';
import { getBest, recordBest, showWinCard } from '../puzzles/gameKit.js';

function create(container, ctx) {
  ctx.setTitle('Number Match');

  // ---- game state ----
  const st = {
    game: N.newGame(),
    selected: -1,
    hint: null,        // [a, b] currently glowing, or null
    message: '',
    ended: false,      // the won / stuck card has been shown
  };
  let destroyed = false;
  let winLayer = null;

  // ---- layout ----
  const root = el('div', 'gk nm');
  root.tabIndex = -1;

  const head = el('div', 'gk-head');
  const scoreChip = el('div', 'gk-chip');
  const bestChip = el('div', 'gk-chip');
  const addsChip = el('div', 'gk-chip');
  head.append(scoreChip, addsChip, bestChip);

  const scroll = el('div', 'nm-scroll');
  const board = el('div', 'nm-board');
  board.addEventListener('contextmenu', (e) => e.preventDefault());
  scroll.append(board);

  const status = el('div', 'gk-status');

  const foot = el('div', 'gk-foot');
  const bHint = el('button', 'btn', 'Hint');
  bHint.addEventListener('click', hint);
  const bAdd = el('button', 'btn btn-primary');
  bAdd.addEventListener('click', addNumbers);
  const bNew = el('button', 'btn', 'New game');
  bNew.addEventListener('click', () => startNewGame());
  foot.append(bHint, bAdd, bNew);

  root.append(head, scroll, status, foot);
  container.append(root);

  // ---------------------------------------------------------------------------
  // Painting
  // ---------------------------------------------------------------------------
  let cells = [];

  function render() {
    const values = st.game.cells;
    // the board grows when numbers are added and shrinks when rows are cleared: rebuild when the count changes
    if (cells.length !== values.length) {
      board.replaceChildren();
      cells = values.map((_, i) => {
        const b = el('button', 'nm-cell');
        b.dataset.i = String(i);
        b.tabIndex = -1;
        b.addEventListener('pointerdown', (e) => { if (e.button === 0) { e.preventDefault(); onCell(i); root.focus({ preventScroll: true }); } });
        board.append(b);
        return b;
      });
    }
    values.forEach((v, i) => {
      const b = cells[i];
      b.textContent = v ? String(v) : '';
      b.classList.toggle('is-clear', v === 0);
      b.classList.toggle('is-selected', i === st.selected);
      b.classList.toggle('is-hint', Boolean(st.hint) && st.hint.includes(i));
      b.setAttribute('aria-label', v ? `Digit ${v}` : 'Cleared');
    });
    scoreChip.textContent = `Score ${st.game.score}`;
    addsChip.textContent = `Adds left ${st.game.adds}`;
    const best = getBest('nummatch', 'score');
    bestChip.textContent = best ? `Best ${best}` : 'Best -';
    bAdd.textContent = `Add numbers (${st.game.adds})`;
    bAdd.disabled = st.game.adds <= 0 || N.status(st.game) !== 'playing';
    bHint.disabled = N.status(st.game) !== 'playing';
    status.textContent = st.message;
  }

  function say(text) {
    st.message = text;
    status.textContent = text;
  }

  // ---------------------------------------------------------------------------
  // Playing
  // ---------------------------------------------------------------------------
  function onCell(i) {
    if (destroyed || N.status(st.game) !== 'playing') return;
    if (st.game.cells[i] === 0) return;
    st.hint = null;
    if (st.selected === -1) {
      st.selected = i;
      emit('sound:play', 'tick');
    } else if (st.selected === i) {
      st.selected = -1;
    } else {
      const next = N.match(st.game, st.selected, i);
      if (next) {
        st.game = next;
        st.selected = -1;
        say('');
        emit('sound:play', 'capture');
        render();
        afterMove();
        return;
      }
      // not a match: the new digit becomes the selected one
      emit('sound:play', 'error');
      say('Those two cannot be matched. They must be equal or add up to 10, with nothing between them.');
      st.selected = i;
    }
    render();
  }

  function addNumbers() {
    if (destroyed) return;
    const next = N.addNumbers(st.game);
    if (!next) return;
    st.game = next;
    st.selected = -1;
    st.hint = null;
    say('Added a copy of every remaining number.');
    emit('sound:play', 'place');
    render();
    scroll.scrollTop = scroll.scrollHeight;
  }

  function hint() {
    if (destroyed || N.status(st.game) !== 'playing') return;
    const move = N.findMove(st.game.cells);
    st.selected = -1;
    if (move) {
      st.hint = move;
      say('');
      emit('sound:play', 'hint');
      // make sure the hinted pair is visible
      const target = cells[move[0]];
      if (target && target.scrollIntoView) target.scrollIntoView({ block: 'nearest' });
    } else {
      st.hint = null;
      say(st.game.adds > 0 ? 'No matches left. Try "Add numbers".' : 'No matches left.');
    }
    render();
  }

  function afterMove() {
    const result = N.status(st.game);
    if (result === 'playing' || st.ended) return;
    st.ended = true;
    const record = recordBest('nummatch', 'score', st.game.score);
    emit('sound:play', result === 'won' ? 'win' : 'gameover');
    const extra = record ? '  A new best score!' : '';
    winLayer = showWinCard(root, result === 'won'
      ? { title: 'Board cleared!', message: `Final score ${st.game.score}.${extra}`, actions: [{ label: 'New game', primary: true, onClick: () => startNewGame(true) }] }
      : { title: 'No more moves', message: `You finished with ${st.game.score} points.${extra}`, icon: 'tulip', petals: false, actions: [{ label: 'New game', primary: true, onClick: () => startNewGame(true) }] });
    render();
  }

  async function startNewGame(force = false, rng = Math.random) {
    const inProgress = N.status(st.game) === 'playing' && st.game.matches > 0;
    if (!force && inProgress && !(await confirmDialog({
      title: 'Start a new game?', message: 'Your current game will be lost.', icon: 'tulip', confirmLabel: 'New game', danger: true,
    }))) return;
    if (destroyed) return;
    if (winLayer) winLayer.remove();
    winLayer = null;
    st.game = N.newGame(rng);
    st.selected = -1;
    st.hint = null;
    st.ended = false;
    say('');
    render();
    scroll.scrollTop = 0;
    emit('sound:play', 'tick');
  }

  // ---------------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------------
  root.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'a') { e.preventDefault(); addNumbers(); }
    else if (k === 'h') { e.preventDefault(); hint(); }
    else if (k === 'escape') { st.selected = -1; st.hint = null; render(); }
  });

  render();

  root.focus({ preventScroll: true });   // so the keyboard works right after the window opens

  const instance = {
    onFocus() { if (!destroyed) root.focus({ preventScroll: true }); },
    destroy() { destroyed = true; },
    _state: st,
    _api: { click: onCell, add: addNumbers, hint, newGame: startNewGame, render, afterMove },
  };
  if (window.__hos) (window.__hos.apps ||= {}).nummatch = instance; // development only
  return instance;
}

export function registerNumberMatch() {
  registerApp({
    id: 'nummatch',
    name: 'Number Match',
    icon: 'nummatch',
    keywords: 'puzzle numbers pairs ten sum match digits game',
    category: 'puzzle',
    description: 'Clear the board by pairing equal numbers, or numbers that add up to 10.',
    defaultSize: { w: 500, h: 640 },
    minSize: { w: 400, h: 480 },
    singleInstance: true,
    create,
  });
}
