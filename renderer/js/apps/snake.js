// =============================================================================
// apps/snake.js — Snake
// =============================================================================
// The rules live in puzzles/snakeEngine.js (tested separately). This file draws the garden on a <canvas>
// and runs the clock.
//
//   Arrow keys or W A S D steer. Space (or P) pauses. Collect the tulips to grow; do not run into the
//   wall (unless "Wrap" is on) or into yourself.
//   The game pauses by itself when its window loses focus or is minimised, and stops its timer when closed.

import { el } from '../dom.js';
import { registerApp } from '../appRegistry.js';
import { confirmDialog } from '../ui/dialogs.js';
import { emit, on } from '../events.js';
import { onSettingChange } from '../settingsStore.js';
import * as K from '../puzzles/snakeEngine.js';
import { getBest, recordBest, cssColor } from '../puzzles/gameKit.js';

const SPEEDS = [['slow', 'Slow', 170], ['normal', 'Normal', 120], ['fast', 'Fast', 80]];
const KEYS = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
};
const COLS = 20, ROWS = 15;

function create(container, ctx) {
  ctx.setTitle('Snake');

  const st = {
    speed: 'normal',
    wrap: false,
    game: K.newGame({ cols: COLS, rows: ROWS, wrap: false }),
    mode: 'ready',        // 'ready' (waiting for the first key), 'running', 'paused', 'over'
    rng: Math.random,
    note: '',             // the text over the board when it is not running
  };
  let destroyed = false;
  let timer = null;
  let colors = null;

  // ---- layout ----
  const root = el('div', 'gk sn');
  root.tabIndex = -1;

  const head = el('div', 'gk-head');
  const scoreChip = el('div', 'gk-chip');
  const bestChip = el('div', 'gk-chip');
  const speeds = el('div', 'gk-seg');
  const speedBtns = SPEEDS.map(([id, label]) => {
    const b = el('button', 'gk-seg-btn', label);
    b.addEventListener('click', () => changeOptions({ speed: id }));
    speeds.append(b);
    return [id, b];
  });
  const bWrap = el('button', 'btn');
  bWrap.title = 'Wrap: the edges connect, so the snake comes out on the other side';
  bWrap.addEventListener('click', () => changeOptions({ wrap: !st.wrap }));
  const bNew = el('button', 'btn btn-primary', 'New game');
  bNew.addEventListener('click', () => changeOptions({}));
  head.append(scoreChip, bestChip, speeds, bWrap, bNew);

  const stage = el('div', 'sn-stage');
  const canvas = document.createElement('canvas');
  canvas.className = 'sn-canvas';
  stage.append(canvas);
  const veil = el('div', 'sn-veil');
  stage.append(veil);
  root.append(head, stage);
  container.append(root);

  // ---------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------
  function readColors() {
    colors = {
      a: cssColor('--snake-a'), b: cssColor('--snake-b'), head: cssColor('--snake-head'), body: cssColor('--snake-body'),
      food: cssColor('--snake-food'), stem: cssColor('--snake-stem'), eye: cssColor('--white'), pupil: cssColor('--text'),
    };
  }

  let cell = 24;
  function fit() {
    const g = st.game;
    const w = stage.clientWidth, h = stage.clientHeight;
    if (w < 10 || h < 10) return;
    cell = Math.max(6, Math.floor(Math.min(w / g.cols, h / g.rows)));
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cell * g.cols * dpr);
    canvas.height = Math.round(cell * g.rows * dpr);
    canvas.style.width = cell * g.cols + 'px';
    canvas.style.height = cell * g.rows + 'px';
    draw();
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function draw() {
    if (!colors) readColors();
    const g = st.game;
    const c = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let y = 0; y < g.rows; y++) {
      for (let x = 0; x < g.cols; x++) {
        c.fillStyle = (x + y) % 2 ? colors.b : colors.a;
        c.fillRect(x * cell, y * cell, cell, cell);
      }
    }
    // the tulip
    if (g.food) {
      const cx = g.food.x * cell + cell / 2, cy = g.food.y * cell + cell / 2;
      c.strokeStyle = colors.stem;
      c.lineWidth = Math.max(2, cell * 0.1);
      c.lineCap = 'round';
      c.beginPath(); c.moveTo(cx, cy + cell * 0.38); c.lineTo(cx, cy); c.stroke();
      c.fillStyle = colors.food;
      c.beginPath();
      c.moveTo(cx - cell * 0.3, cy - cell * 0.32);
      c.lineTo(cx - cell * 0.15, cy - cell * 0.12);
      c.lineTo(cx, cy - cell * 0.34);
      c.lineTo(cx + cell * 0.15, cy - cell * 0.12);
      c.lineTo(cx + cell * 0.3, cy - cell * 0.32);
      c.quadraticCurveTo(cx + cell * 0.36, cy + cell * 0.2, cx, cy + cell * 0.24);
      c.quadraticCurveTo(cx - cell * 0.36, cy + cell * 0.2, cx - cell * 0.3, cy - cell * 0.32);
      c.fill();
    }
    // the snake: body first, head on top
    const pad = cell * 0.08;
    for (let i = g.snake.length - 1; i >= 0; i--) {
      const p = g.snake[i];
      c.fillStyle = i === 0 ? colors.head : colors.body;
      roundRect(c, p.x * cell + pad, p.y * cell + pad, cell - pad * 2, cell - pad * 2, cell * 0.28);
      c.fill();
    }
    const h = g.snake[0];
    const d = K.DIRS[g.dir];
    const hx = h.x * cell + cell / 2, hy = h.y * cell + cell / 2;
    for (const side of [-1, 1]) {   // two eyes, looking where the snake goes
      const ex = hx + d.x * cell * 0.16 + (d.y !== 0 ? side * cell * 0.17 : 0);
      const ey = hy + d.y * cell * 0.16 + (d.x !== 0 ? side * cell * 0.17 : 0);
      c.fillStyle = colors.eye;
      c.beginPath(); c.arc(ex, ey, cell * 0.12, 0, Math.PI * 2); c.fill();
      c.fillStyle = colors.pupil;
      c.beginPath(); c.arc(ex + d.x * cell * 0.04, ey + d.y * cell * 0.04, cell * 0.06, 0, Math.PI * 2); c.fill();
    }
  }

  function paintChrome() {
    scoreChip.textContent = `Score ${st.game.score}`;
    const best = getBest('snake', 'score');
    bestChip.textContent = best ? `Best ${best}` : 'Best -';
    speedBtns.forEach(([id, b]) => b.classList.toggle('is-active', id === st.speed));
    bWrap.textContent = st.wrap ? 'Edges: wrap' : 'Edges: walls';
    bWrap.classList.toggle('is-on', st.wrap);
    veil.hidden = st.mode === 'running';
    veil.replaceChildren(el('span', 'sn-veil-text', st.note));
  }

  // ---------------------------------------------------------------------------
  // The clock
  // ---------------------------------------------------------------------------
  const stepMs = () => SPEEDS.find((s) => s[0] === st.speed)[2];

  function stopClock() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function startClock() {
    stopClock();
    timer = setInterval(tick, stepMs());
  }

  // One step of the game (the clock calls this; tests can call it too).
  function tick() {
    if (destroyed || st.mode !== 'running') return;
    const result = K.step(st.game, st.rng);
    if (result === 'eat') {
      emit('sound:play', 'place');
      recordBest('snake', 'score', st.game.score);
    } else if (result === 'dead' || result === 'won') {
      stopClock();
      st.mode = 'over';
      recordBest('snake', 'score', st.game.score);
      st.note = result === 'won' ? 'You filled the whole garden! Press Space for a new game.' : `Game over, ${st.game.score} points. Press Space to play again.`;
      emit('sound:play', result === 'won' ? 'win' : 'gameover');
    }
    draw();
    paintChrome();
  }

  function start() {
    if (st.mode === 'over') return newGame();
    if (st.mode === 'running') return;
    st.mode = 'running';
    st.note = '';
    startClock();
    paintChrome();
  }

  function pause(why) {
    if (st.mode !== 'running') return;
    stopClock();
    st.mode = 'paused';
    st.note = why || 'Paused. Press Space to continue.';
    paintChrome();
  }

  function newGame(rng = Math.random) {
    stopClock();
    st.rng = rng;
    st.game = K.newGame({ cols: COLS, rows: ROWS, wrap: st.wrap }, rng);
    st.mode = 'ready';
    st.note = 'Press an arrow key or Space to start.';
    fit();
    paintChrome();
  }

  // Speed / edges / New game button: restart (asking first if a game is going).
  async function changeOptions(change) {
    const playing = st.game.alive && st.game.score > 0 && st.mode !== 'ready';
    if (playing) {
      const wasRunning = st.mode === 'running';
      pause('Paused.');
      const ok = await confirmDialog({ title: 'Start a new game?', message: 'Your current game will be lost.', icon: 'tulip', confirmLabel: 'New game', danger: true });
      if (destroyed) return;
      if (!ok) { if (wasRunning) { st.note = 'Paused. Press Space to continue.'; paintChrome(); } return; }
    }
    if (change.speed) st.speed = change.speed;
    if (typeof change.wrap === 'boolean') st.wrap = change.wrap;
    newGame();
  }

  // ---------------------------------------------------------------------------
  // Keyboard and window focus
  // ---------------------------------------------------------------------------
  function steer(dir) {
    if (st.mode === 'over') return;
    if (st.mode === 'paused') start();
    else if (st.mode === 'ready') start();
    K.turn(st.game, dir);
    // the very first key in "ready" mode must not be a U-turn into the body: the engine ignores it already
  }

  root.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const dir = KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
    if (dir) { e.preventDefault(); steer(dir); }
    else if (e.key === ' ' || e.key.toLowerCase() === 'p') {
      e.preventDefault();
      if (st.mode === 'running') pause();
      else start();
    }
  });
  stage.addEventListener('pointerdown', () => { root.focus({ preventScroll: true }); if (st.mode === 'paused' || st.mode === 'ready') start(); });

  // Pause when this window is not the focused one (switched to another window, minimised, "show desktop").
  const stopListening = on('windows:changed', (list) => {
    if (destroyed) return;
    const me = list.find((w) => w.id === ctx.windowId);
    if (me && (!me.focused || me.minimized)) pause('Paused while you were away. Press Space to continue.');
  });
  const stopSettings = onSettingChange((key) => {
    if (key === 'theme' || key === 'accent') { colors = null; draw(); }
  });

  const resizer = new ResizeObserver(() => { if (!destroyed) fit(); });
  resizer.observe(stage);

  newGame();

  root.focus({ preventScroll: true });   // so the keyboard works right after the window opens

  const instance = {
    onFocus() { if (!destroyed) root.focus({ preventScroll: true }); },
    destroy() {
      destroyed = true;
      stopClock();
      resizer.disconnect();
      stopListening();
      stopSettings();
    },
    _state: st,
    _api: { tick, start, pause, steer, newGame, hasClock: () => timer !== null },
  };
  if (window.__hos) (window.__hos.apps ||= {}).snake = instance; // development only
  return instance;
}

export function registerSnake() {
  registerApp({
    id: 'snake',
    name: 'Snake',
    icon: 'snake',
    keywords: 'arcade tulips grow worm game',
    category: 'puzzle',
    description: 'Collect tulips to grow longer. Do not bump into the wall or yourself!',
    defaultSize: { w: 640, h: 560 },
    minSize: { w: 420, h: 400 },
    singleInstance: true,
    create,
  });
}
