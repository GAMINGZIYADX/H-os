// =============================================================================
// apps/merge.js — Tulip Merge
// =============================================================================
// The rules live in puzzles/mergeEngine.js (tested separately). This file is the board and the sliding.
//
//   Arrow keys (or W A S D, or a swipe) slide every tile. Two equal tiles that touch join into one
//   tile of double value. Reach 2048 (and keep going if you like!). Ctrl+Z = undo.

import { el } from '../dom.js';
import { registerApp } from '../appRegistry.js';
import { confirmDialog } from '../ui/dialogs.js';
import { emit } from '../events.js';
import * as M from '../puzzles/mergeEngine.js';
import { getBest, recordBest, showWinCard } from '../puzzles/gameKit.js';

const KEYS = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  a: 'left', d: 'right', w: 'up', s: 'down',
};
const SLIDE_MS = 120;   // keep in sync with the transition in games.css
const MAX_UNDO = 10;

function create(container, ctx) {
  ctx.setTitle('Tulip Merge');

  const st = {
    game: M.newGame(),
    history: [],           // earlier games, for Undo
    rng: Math.random,
    celebrated: false,     // the "you made 2048" card has been shown for this game
  };
  let destroyed = false;
  let winLayer = null;
  const timers = new Set();
  const tiles = new Map(); // tile id -> its element

  // ---- layout ----
  const root = el('div', 'gk mg');
  root.tabIndex = -1;

  const head = el('div', 'gk-head');
  const scoreChip = el('div', 'gk-chip');
  const bestChip = el('div', 'gk-chip');
  const bUndo = el('button', 'btn', 'Undo');
  bUndo.addEventListener('click', undo);
  const bNew = el('button', 'btn btn-primary', 'New game');
  bNew.addEventListener('click', () => startNewGame());
  head.append(scoreChip, bestChip, bUndo, bNew);

  const stage = el('div', 'mg-stage');
  const board = el('div', 'mg-board');
  board.style.setProperty('--n', String(st.game.size));
  for (let i = 0; i < st.game.size * st.game.size; i++) board.append(el('div', 'mg-slot'));
  const layer = el('div', 'mg-tiles');
  board.append(layer);
  stage.append(board);

  const status = el('div', 'gk-status', 'Slide with the arrow keys or swipe. Equal tiles join!');
  root.append(head, stage, status);
  container.append(root);

  const later = (fn, ms) => {
    const id = setTimeout(() => { timers.delete(id); if (!destroyed) fn(); }, ms);
    timers.add(id);
  };

  // ---------------------------------------------------------------------------
  // Tiles on screen
  // ---------------------------------------------------------------------------
  function put(node, t) {
    node.style.setProperty('--r', String(t.r));
    node.style.setProperty('--c', String(t.c));
  }

  function makeTile(t, how) {
    const node = el('div', 'mg-tile', String(t.v));
    node.style.setProperty('--lv', String(Math.log2(t.v)));
    node.dataset.digits = String(String(t.v).length);
    node.dataset.value = String(t.v);
    if (how) node.classList.add(how);
    put(node, t);
    return node;
  }

  // Show the game with no animation (new game, undo).
  function rebuild() {
    layer.replaceChildren();
    tiles.clear();
    for (const t of st.game.tiles) {
      const node = makeTile(t);
      tiles.set(t.id, node);
      layer.append(node);
    }
  }

  // Show the result of a move: tiles slide, joined tiles slide together and are replaced by the new one.
  function animate(result) {
    for (const ghost of result.ghosts) {
      const node = tiles.get(ghost.id);
      if (!node) continue;
      tiles.delete(ghost.id);
      put(node, ghost);
      later(() => node.remove(), SLIDE_MS);
      // (the node is removed even if the app is destroyed: the whole window goes away anyway)
    }
    const joined = new Set(result.merged);
    for (const t of st.game.tiles) {
      const node = tiles.get(t.id);
      if (node) { put(node, t); continue; }
      const fresh = makeTile(t, joined.has(t.id) ? 'is-joined' : 'is-new');
      tiles.set(t.id, fresh);
      layer.append(fresh);
    }
  }

  function paintChrome() {
    scoreChip.textContent = `Score ${st.game.score}`;
    const best = getBest('merge', 'score');
    bestChip.textContent = best ? `Best ${best}` : 'Best -';
    bUndo.disabled = st.history.length === 0;
  }

  // ---------------------------------------------------------------------------
  // Playing
  // ---------------------------------------------------------------------------
  function slide(dir) {
    if (destroyed || st.game.over || winLayer) return;
    const result = M.move(st.game, dir, st.rng);
    if (!result.moved) return;
    st.history.push(st.game);
    if (st.history.length > MAX_UNDO) st.history.shift();
    st.game = result.game;
    animate(result);
    emit('sound:play', result.merged.length ? 'capture' : 'tick');
    saveBest();
    paintChrome();
    status.textContent = '';
    if (st.game.over) finish();
    else if (st.game.reached && !st.celebrated) celebrate();
  }

  function saveBest() {
    recordBest('merge', 'score', st.game.score);
    recordBest('merge', 'tile', Math.max(0, ...st.game.tiles.map((t) => t.v)));
  }

  function celebrate() {
    st.celebrated = true;
    emit('sound:play', 'win');
    winLayer = showWinCard(root, {
      title: 'You made 2048!',
      message: `Score ${st.game.score}. You can keep going for a bigger tulip.`,
      actions: [
        { label: 'Keep going', primary: true, onClick: () => { winLayer = null; root.focus({ preventScroll: true }); } },
        { label: 'New game', onClick: () => { winLayer = null; startNewGame(true); } },
      ],
    });
  }

  function finish() {
    emit('sound:play', 'gameover');
    const big = Math.max(...st.game.tiles.map((t) => t.v));
    winLayer = showWinCard(root, {
      title: 'No more moves',
      message: `Final score ${st.game.score}. Biggest tile ${big}.`,
      petals: false,
      actions: [
        { label: 'Undo last move', onClick: () => { winLayer = null; undo(); } },
        { label: 'New game', primary: true, onClick: () => { winLayer = null; startNewGame(true); } },
      ],
    });
  }

  function undo() {
    if (destroyed || !st.history.length) return;
    if (winLayer) { winLayer.remove(); winLayer = null; }
    st.game = st.history.pop();
    rebuild();
    paintChrome();
    emit('sound:play', 'tick');
  }

  async function startNewGame(force = false, rng = Math.random) {
    const inProgress = !st.game.over && st.history.length > 0;
    if (!force && inProgress && !(await confirmDialog({
      title: 'Start a new game?', message: 'Your current game will be lost.', icon: 'tulip', confirmLabel: 'New game', danger: true,
    }))) return;
    if (destroyed) return;
    if (winLayer) winLayer.remove();
    winLayer = null;
    st.rng = rng;
    st.game = M.newGame(rng);
    st.history = [];
    st.celebrated = false;
    rebuild();
    paintChrome();
    emit('sound:play', 'tick');
    root.focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------------------
  // Keyboard and swipes
  // ---------------------------------------------------------------------------
  root.addEventListener('keydown', (e) => {
    if (e.altKey) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if (e.ctrlKey || e.metaKey) return;
    const dir = KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
    if (dir) { e.preventDefault(); slide(dir); }
  });

  let swipe = null;
  board.addEventListener('pointerdown', (e) => {
    root.focus({ preventScroll: true });
    swipe = { x: e.clientX, y: e.clientY, id: e.pointerId };
    try { board.setPointerCapture(e.pointerId); } catch { /* the pointer may already be gone */ }
  });
  board.addEventListener('pointerup', (e) => {
    if (!swipe || swipe.id !== e.pointerId) return;
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    swipe = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 28) return;
    slide(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  });
  board.addEventListener('pointercancel', () => { swipe = null; });

  rebuild();
  paintChrome();

  root.focus({ preventScroll: true });   // so the keyboard works right after the window opens

  const instance = {
    onFocus() { if (!destroyed) root.focus({ preventScroll: true }); },
    destroy() { destroyed = true; for (const id of timers) clearTimeout(id); timers.clear(); },
    _state: st,
    _api: {
      slide, undo, newGame: startNewGame,
      // tests: put a ready-made board on the screen, e.g. load([[2,2,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]])
      load(grid) { st.game = M.fromGrid(grid); st.history = []; st.celebrated = false; if (winLayer) { winLayer.remove(); winLayer = null; } rebuild(); paintChrome(); },
    },
  };
  if (window.__hos) (window.__hos.apps ||= {}).merge = instance; // development only
  return instance;
}

export function registerMerge() {
  registerApp({
    id: 'merge',
    name: 'Tulip Merge',
    icon: 'merge',
    keywords: 'puzzle numbers tiles slide join double 2048 game',
    category: 'puzzle',
    description: 'Slide the tiles. Two equal numbers join into one that is twice as big.',
    defaultSize: { w: 480, h: 620 },
    minSize: { w: 340, h: 440 },
    singleInstance: true,
    create,
  });
}
