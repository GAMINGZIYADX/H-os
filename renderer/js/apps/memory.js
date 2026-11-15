// =============================================================================
// apps/memory.js — Memory
// =============================================================================
// The rules live in puzzles/memoryEngine.js (tested separately). This file is the table.
//
//   Click a card to turn it over, then another. A pair stays face up; a miss turns back after a moment.
//   Find every pair in as few moves as you can. (Turning a new card also hides a missed pair at once.)

import { el } from '../dom.js';
import { iconEl } from '../icons.js';
import { registerApp } from '../appRegistry.js';
import { confirmDialog } from '../ui/dialogs.js';
import { emit } from '../events.js';
import * as Y from '../puzzles/memoryEngine.js';
import { fmtTime, getBest, recordBest, showWinCard, loadSave, writeSave } from '../puzzles/gameKit.js';

const LEVELS = [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']];
const MISS_MS = 900;   // how long a wrong pair stays visible

// Twelve little pictures, our own drawings. They use the card's text colour (see games.css), so the
// colours can be retuned in theme.css. Every entry: [name, SVG shapes].
const SYMBOLS = [
  ['Tulip', '<path d="M12 21v-9" fill="none" stroke-width="2" stroke-linecap="round"/><path d="M6 4l3 3 3-3 3 3 3-3c1 7-1 11-6 11S5 11 6 4Z" stroke="none"/>'],
  ['Heart', '<path d="M12 20.5C5 15.5 3 11.5 3 8.5A4.5 4.5 0 0 1 12 6.5a4.5 4.5 0 0 1 9 2c0 3-2 7-9 12Z" stroke="none"/>'],
  ['Star', '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9Z" stroke="none"/>'],
  ['Sun', '<circle cx="12" cy="12" r="4.5" stroke="none"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" fill="none" stroke-width="2" stroke-linecap="round"/>'],
  ['Moon', '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" stroke="none"/>'],
  ['Leaf', '<path d="M5 19C5 10 10 5 20 4c0 10-5 15-14 15Z" stroke="none"/>'],
  ['Cloud', '<path d="M7 18a4 4 0 0 1-.6-7.95A5.5 5.5 0 0 1 17 9a4.5 4.5 0 0 1 .5 9Z" stroke="none"/>'],
  ['Raindrop', '<path d="M12 3C8 9 6 12 6 15a6 6 0 0 0 12 0c0-3-2-6-6-12Z" stroke="none"/>'],
  ['Butterfly', '<path d="M12 12C8 4 2 5 3 11c.6 4 5 4.5 9 1Zm0 0c4-8 10-7 9-1-.6 4-5 4.5-9 1Z" stroke="none"/><path d="M12 6.5v12" fill="none" stroke-width="2" stroke-linecap="round"/>'],
  ['Mushroom', '<path d="M3.5 12a8.5 8.5 0 0 1 17 0Z" stroke="none"/><path d="M9 13h6v5a3 3 0 0 1-6 0Z" stroke="none"/>'],
  ['Flower', '<g stroke="none"><circle cx="12" cy="6" r="3.3"/><circle cx="17.7" cy="10.1" r="3.3"/><circle cx="15.5" cy="16.9" r="3.3"/><circle cx="8.5" cy="16.9" r="3.3"/><circle cx="6.3" cy="10.1" r="3.3"/></g><circle class="mm-hole" cx="12" cy="12" r="2.6" stroke="none"/>'],
  ['Gem', '<path d="M12 3l8 6-8 12L4 9Z" stroke="none"/>'],
];

// A card's picture as an element. (The SVG text above is our own constant, never user input.)
function symbolEl(n) {
  const wrap = el('span', 'mm-art');
  wrap.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" aria-hidden="true">${SYMBOLS[n][1]}</svg>`;
  return wrap;
}

function create(container, ctx) {
  ctx.setTitle('Memory');

  const st = {
    level: 'medium',
    game: null,
    elapsed: 0,
    ended: false,
  };
  let destroyed = false;
  let clock = null;
  let missTimer = null;
  let winLayer = null;
  let cards = [];

  // ---- layout ----
  const root = el('div', 'gk mm');
  root.tabIndex = -1;

  const head = el('div', 'gk-head');
  const movesChip = el('div', 'gk-chip');
  const timeChip = el('div', 'gk-chip');
  const bestChip = el('div', 'gk-chip');
  const levels = el('div', 'gk-seg');
  const levelBtns = LEVELS.map(([id, label]) => {
    const b = el('button', 'gk-seg-btn', label);
    b.addEventListener('click', () => startNewGame(id));
    levels.append(b);
    return [id, b];
  });
  const bNew = el('button', 'btn btn-primary', 'New game');
  bNew.addEventListener('click', () => startNewGame(st.level));
  head.append(movesChip, timeChip, bestChip, levels, bNew);

  const stage = el('div', 'mm-stage');
  const board = el('div', 'mm-board');
  stage.append(board);
  const status = el('div', 'gk-status', 'Turn over two cards to look for a pair.');
  root.append(head, stage, status);
  container.append(root);

  // ---------------------------------------------------------------------------
  // Building and painting
  // ---------------------------------------------------------------------------
  function buildBoard() {
    const g = st.game;
    board.replaceChildren();
    board.style.setProperty('--cols', String(g.cols));
    board.style.setProperty('--rows', String(g.rows));
    cards = g.deck.map((symbol, i) => {
      const card = el('button', 'mm-card');
      card.dataset.i = String(i);
      card.dataset.s = String(symbol);
      card.tabIndex = -1;
      const inner = el('span', 'mm-inner');
      const back = el('span', 'mm-face mm-back');
      back.append(iconEl('tulip', 'mm-back-icon'));
      const front = el('span', 'mm-face mm-front');
      front.append(symbolEl(symbol));
      inner.append(back, front);
      card.append(inner);
      card.setAttribute('aria-label', 'Face-down card');
      card.addEventListener('pointerdown', (e) => { if (e.button === 0) { e.preventDefault(); root.focus({ preventScroll: true }); flipCard(i); } });
      board.append(card);
      return card;
    });
  }

  // Remember the game in progress. Cards that are only turned up for a moment are saved face down.
  function save() {
    const g = st.game;
    if (st.ended || g.moves === 0) { writeSave('memory', null); return; }
    writeSave('memory', {
      level: st.level, deck: Array.from(g.deck), state: Array.from(g.state, (s) => (s === Y.MATCHED ? '2' : '0')).join(''),
      moves: g.moves, elapsed: st.elapsed,
    });
  }

  function paint() {
    const g = st.game;
    cards.forEach((card, i) => {
      const s = g.state[i];
      card.classList.toggle('is-up', s !== Y.DOWN);
      card.classList.toggle('is-matched', s === Y.MATCHED);
      card.setAttribute('aria-label', s === Y.DOWN ? 'Face-down card' : SYMBOLS[g.deck[i]][0]);
    });
    movesChip.textContent = `Moves ${g.moves}`;
    timeChip.textContent = fmtTime(st.elapsed);
    const best = getBest('memory', st.level);
    bestChip.textContent = best ? `Best ${best} moves` : 'Best -';
    levelBtns.forEach(([id, b]) => b.classList.toggle('is-active', id === st.level));
    save();
  }

  // ---------------------------------------------------------------------------
  // Playing
  // ---------------------------------------------------------------------------
  function startClock() {
    if (clock || st.ended) return;
    clock = setInterval(() => {
      if (destroyed) return;
      st.elapsed++;
      timeChip.textContent = fmtTime(st.elapsed);
    }, 1000);
  }
  function stopClock() {
    if (clock) clearInterval(clock);
    clock = null;
  }
  function stopMissTimer() {
    if (missTimer) clearTimeout(missTimer);
    missTimer = null;
  }

  function flipCard(i) {
    if (destroyed || st.ended) return;
    const g = st.game;
    stopMissTimer();                      // (flipping a new card hides a missed pair by itself)
    const result = Y.flip(g, i);
    if (result === 'ignored') { paint(); return; }
    startClock();
    paint();
    if (result === 'first') emit('sound:play', 'tick');
    else if (result === 'match') emit('sound:play', 'capture');
    else if (result === 'miss') {
      emit('sound:play', 'move');
      status.textContent = 'Not a pair. Remember where they are!';
      missTimer = setTimeout(() => {
        missTimer = null;
        if (destroyed) return;
        Y.resolve(st.game);
        paint();
      }, MISS_MS);
    }
    if (result === 'match') status.textContent = '';
    if (Y.isWon(g)) finish();
  }

  function finish() {
    st.ended = true;
    stopClock();
    stopMissTimer();
    const g = st.game;
    const record = recordBest('memory', st.level, g.moves, 'low');
    status.textContent = '';
    paint();
    emit('sound:play', 'win');
    winLayer = showWinCard(root, {
      title: 'All pairs found!',
      message: `${g.pairs} pairs in ${g.moves} moves and ${fmtTime(st.elapsed)}.${record ? '  A new record!' : ''}`,
      actions: [{ label: 'Admire the table' }, { label: 'New game', primary: true, onClick: () => startNewGame(st.level, true) }],
    });
  }

  async function startNewGame(level = st.level, force = false, rng = Math.random) {
    const g = st.game;
    const inProgress = g && !st.ended && g.moves > 0;
    if (!force && inProgress && !(await confirmDialog({
      title: 'Start a new game?', message: 'Your current game will be lost.', icon: 'tulip', confirmLabel: 'New game', danger: true,
    }))) return;
    if (destroyed || !Y.LEVELS[level]) return;
    if (winLayer) winLayer.remove();
    winLayer = null;
    stopClock();
    stopMissTimer();
    st.level = level;
    st.game = Y.newGame(level, rng);
    st.elapsed = 0;
    st.ended = false;
    status.textContent = 'Turn over two cards to look for a pair.';
    buildBoard();
    paint();
    emit('sound:play', 'tick');
  }

  let restored = false;
  const saved = loadSave('memory');
  if (saved) {
    try {
      const g = Y.newGame(saved.level);
      if (saved.deck.length !== g.deck.length || saved.state.length !== g.deck.length) throw new Error('bad save');
      g.deck = saved.deck;
      g.state = Uint8Array.from(saved.state, Number);
      g.moves = saved.moves;
      g.matched = g.state.filter((s) => s === Y.MATCHED).length / 2;
      st.level = saved.level;
      st.game = g;
      st.elapsed = saved.elapsed;
      status.textContent = 'Welcome back! Your game was kept.';
      buildBoard();
      paint();
      startClock();
      restored = true;
    } catch (err) {
      console.error('Memory: could not use the saved game:', err);
    }
  }
  if (!restored) startNewGame('medium', true);
  root.focus({ preventScroll: true });   // so the keyboard works right after the window opens

  const instance = {
    onFocus() { if (!destroyed) root.focus({ preventScroll: true }); },
    // Shut down asks every window first: a good moment to write the latest state down.
    canClose() { save(); return true; },
    destroy() { save(); destroyed = true; stopClock(); stopMissTimer(); },
    _state: st,
    _api: { flip: flipCard, newGame: startNewGame, hasClock: () => clock !== null },
  };
  if (window.__hos) (window.__hos.apps ||= {}).memory = instance; // development only
  return instance;
}

export function registerMemory() {
  registerApp({
    id: 'memory',
    name: 'Memory',
    icon: 'memory',
    keywords: 'puzzle cards pairs match flip concentration game',
    category: 'puzzle',
    description: 'Turn over the cards and find every matching pair in as few moves as you can.',
    defaultSize: { w: 600, h: 560 },
    minSize: { w: 420, h: 420 },
    singleInstance: true,
    create,
  });
}
