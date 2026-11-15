// =============================================================================
// apps/chess.js — Chess
// =============================================================================
// Rules come from chess.js (legal moves, check, checkmate, draws, PGN). The computer opponent
// and the analysis board use Stockfish, running in a Web Worker (puzzles/stockfish.js).
//
//   Move: click a piece then a square, or drag it. Pawns reaching the end ask what to become.
//   Modes: Play vs computer · Two players · Analysis (live evaluation bar + best line)
//   Move list on the right: click a move (or use ← → Home End) to look back; "Return to game" resumes.
//   F flips the board · Ctrl+Z takes a move back · PGN: save / load / copy.

import { el } from '../dom.js';
import { iconEl } from '../icons.js';
import { registerApp } from '../appRegistry.js';
import { pieceSvg, PIECE_NAMES } from '../puzzles/chessPieces.js';
import { StockfishEngine } from '../puzzles/stockfish.js';
import { fsApi } from '../fsClient.js';
import { confirmDialog } from '../ui/dialogs.js';
import { toast } from '../notifications.js';
import { emit } from '../events.js';

const FILES = 'abcdefgh';
const LEVEL_NAMES = ['Beginner', 'Beginner', 'Beginner', 'Casual', 'Casual', 'Casual', 'Casual', 'Club', 'Club', 'Club', 'Club', 'Strong', 'Strong', 'Strong', 'Strong', 'Expert', 'Expert', 'Master', 'Master', 'Master', 'Full strength'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function create(container, ctx) {
  ctx.setTitle('Chess');
  const root = el('div', 'ch');
  root.tabIndex = -1;
  container.append(root);

  // Load chess.js lazily so a missing file shows a message instead of breaking H-os.
  let Chess;
  try {
    ({ Chess } = await import('../../vendor/chess/chess.js'));
  } catch (err) {
    console.error(err);
    root.append(el('div', 'win-error', 'The chess library is missing. Run "npm install" and restart H-os.'));
    return {};
  }

  const game = new Chess();
  const S = {
    mode: 'ai',          // 'ai' | 'two' | 'analysis'
    human: 'w',          // which side you play against the computer
    colorChoice: 'w',    // 'w' | 'b' | 'random' (applied on New game)
    level: 8,            // 0..20
    flipped: false,
    ply: null,           // null = the live position; a number = looking back at that move
    selected: null,
    targets: [],         // legal moves from the selected square (verbose)
    drag: null,
    thinking: false,
    token: 0,            // bumped whenever a computer search should be forgotten
    engine: null,
    promotion: null,
    evalWhite: null,     // { cp, mate, depth, line }
  };
  let destroyed = false;

  // ---------------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------------
  const stage = el('div', 'ch-stage');
  const wrap = el('div', 'ch-wrap');
  const evalBar = el('div', 'ch-eval');
  const evalBlack = el('div', 'ch-eval-black');
  const evalLabel = el('div', 'ch-eval-label', '0.0');
  evalBar.append(evalBlack, evalLabel);
  const boardEl = el('div', 'ch-board');
  const promoEl = el('div', 'ch-promo');
  promoEl.hidden = true;
  wrap.append(evalBar, boardEl, promoEl);
  stage.append(wrap);

  const side = el('div', 'ch-side');
  const statusEl = el('div', 'ch-status');
  const viewBanner = el('button', 'ch-banner', 'Viewing an earlier move. Return to the game');
  viewBanner.hidden = true;
  viewBanner.addEventListener('click', () => setPly(null));

  // controls
  const modeSel = el('select', 'ch-select');
  for (const [v, l] of [['ai', 'Play vs computer'], ['two', 'Two players'], ['analysis', 'Analysis board']]) {
    const o = el('option', '', l);
    o.value = v;
    modeSel.append(o);
  }
  const colorSel = el('select', 'ch-select');
  for (const [v, l] of [['w', 'Play as White'], ['b', 'Play as Black'], ['random', 'Random side']]) {
    const o = el('option', '', l);
    o.value = v;
    colorSel.append(o);
  }
  const levelRow = el('label', 'ch-level');
  const levelText = el('span', 'ch-level-text');
  const levelInput = el('input');
  levelInput.type = 'range';
  levelInput.min = '0';
  levelInput.max = '20';
  levelInput.value = String(S.level);
  levelRow.append(levelText, levelInput);
  const controls = el('div', 'ch-controls');
  controls.append(modeSel, colorSel, levelRow);

  const toolRow = el('div', 'ch-tools');
  const tool = (icon, label, onClick) => {
    const b = el('button', 'ch-tool');
    b.title = label;
    b.setAttribute('aria-label', label);
    b.append(iconEl(icon), el('span', '', label));
    b.addEventListener('click', onClick);
    toolRow.append(b);
    return b;
  };
  const bNew = tool('refresh', 'New game', () => newGame());
  const bUndo = tool('back', 'Take back', takeBack);
  const bFlip = tool('sort', 'Flip', () => { S.flipped = !S.flipped; render(); });
  const bSave = tool('download', 'Save PGN', savePgn);
  const bLoad = tool('open', 'Load PGN', loadPgn);
  const bCopy = tool('copy', 'Copy PGN', copyPgn);

  const analysisEl = el('div', 'ch-analysis');
  analysisEl.hidden = true;

  const movesWrap = el('div', 'ch-moves');
  const nav = el('div', 'ch-nav');
  const navBtn = (label, title, onClick) => {
    const b = el('button', 'ex-btn ch-navbtn', label);
    b.title = title;
    b.addEventListener('click', onClick);
    nav.append(b);
    return b;
  };
  navBtn('⏮', 'First move (Home)', () => setPly(0));
  navBtn('◀', 'Previous move (←)', () => stepPly(-1));
  navBtn('▶', 'Next move (→)', () => stepPly(1));
  navBtn('⏭', 'Latest move (End)', () => setPly(null));

  side.append(statusEl, viewBanner, controls, toolRow, analysisEl, movesWrap, nav);
  root.append(stage, side);

  // ---------------------------------------------------------------------------
  // Helpers about positions
  // ---------------------------------------------------------------------------
  const history = () => game.history({ verbose: true });
  const livePly = () => history().length;
  const currentPly = () => (S.ply === null ? livePly() : S.ply);

  function fenAtPly(k) {
    const h = history();
    if (k >= h.length) return game.fen();
    return k === 0 ? h[0].before : h[k - 1].after;
  }
  const viewPosition = () => (S.ply === null ? game : new Chess(fenAtPly(S.ply)));
  const isOver = () => game.isGameOver();

  function humanMayMove(color) {
    if (S.ply !== null || S.thinking || isOver()) return false;
    if (color !== game.turn()) return false;
    return S.mode !== 'ai' || color === S.human;
  }

  // ---------------------------------------------------------------------------
  // Drawing the board
  // ---------------------------------------------------------------------------
  function render() {
    const view = viewPosition();
    const h = history();
    const k = currentPly();
    const last = k > 0 ? h[k - 1] : null;
    const board = view.board();
    const checkedKing = view.isCheck() ? view.turn() : null;

    boardEl.replaceChildren();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const rr = S.flipped ? 7 - r : r;
        const cc = S.flipped ? 7 - c : c;
        const sq = FILES[cc] + (8 - rr);
        const piece = board[rr][cc];
        const cell = el('div', 'ch-sq ' + ((rr + cc) % 2 === 0 ? 'light' : 'dark'));
        cell.dataset.sq = sq;
        if (c === 0) cell.append(el('span', 'ch-rank', String(8 - rr)));
        if (r === 7) cell.append(el('span', 'ch-file', FILES[cc]));
        if (S.selected === sq) cell.classList.add('is-selected');
        if (last && (last.from === sq || last.to === sq)) cell.classList.add('is-last');
        const target = S.targets.find((m) => m.to === sq);
        if (target) cell.classList.add(target.captured || target.flags.includes('e') ? 'is-capture' : 'is-target');
        if (piece) {
          const node = pieceSvg(piece.color, piece.type);
          node.setAttribute('title', `${piece.color === 'w' ? 'White' : 'Black'} ${PIECE_NAMES[piece.type]}`);
          if (checkedKing && piece.type === 'k' && piece.color === checkedKing) cell.classList.add('is-check');
          if (S.drag && S.drag.moved && S.drag.from === sq) node.classList.add('is-dragging');
          cell.append(node);
        }
        boardEl.append(cell);
      }
    }
    renderStatus();
    renderMoves();
    renderEval();
    levelText.textContent = `Level ${S.level} · ${LEVEL_NAMES[S.level]}`;
    colorSel.hidden = levelRow.hidden = S.mode !== 'ai';
    evalBar.hidden = S.mode !== 'analysis';
    analysisEl.hidden = S.mode !== 'analysis';
    bUndo.disabled = livePly() === 0 || S.thinking && S.mode !== 'ai';
    viewBanner.hidden = S.ply === null;
    if (S.ply !== null) viewBanner.textContent = `Viewing move ${S.ply} of ${livePly()}. Return to the game`;
  }

  function statusText() {
    if (game.isCheckmate()) return `Checkmate! ${game.turn() === 'w' ? 'Black' : 'White'} wins.`;
    if (game.isStalemate()) return 'Stalemate. The game is a draw.';
    if (game.isInsufficientMaterial()) return 'Draw: not enough pieces left to checkmate.';
    if (game.isThreefoldRepetition()) return 'Draw by threefold repetition.';
    if (game.isDrawByFiftyMoves()) return 'Draw by the fifty-move rule.';
    if (game.isDraw()) return 'The game is a draw.';
    const who = game.turn() === 'w' ? 'White' : 'Black';
    if (S.thinking) return 'Stockfish is thinking…';
    return game.isCheck() ? `${who} to move. Check!` : `${who} to move`;
  }
  function renderStatus() {
    statusEl.textContent = statusText();
    statusEl.classList.toggle('is-over', isOver());
    statusEl.classList.toggle('is-thinking', S.thinking);
    const who = S.mode === 'ai' ? (S.human === 'w' ? 'You are White' : 'You are Black') : S.mode === 'two' ? 'Two players' : 'Analysis';
    statusEl.dataset.sub = who;
  }

  function renderMoves() {
    const h = history();
    const k = currentPly();
    movesWrap.replaceChildren();
    if (!h.length) {
      movesWrap.append(el('div', 'ch-moves-empty', 'No moves yet. White starts!'));
      return;
    }
    for (let i = 0; i < h.length; i += 2) {
      const row = el('div', 'ch-move-row');
      row.append(el('span', 'ch-move-no', `${i / 2 + 1}.`));
      for (const j of [i, i + 1]) {
        if (!h[j]) { row.append(el('span', 'ch-move')); continue; }
        const b = el('button', 'ch-move' + (j + 1 === k ? ' is-current' : ''), h[j].san);
        b.addEventListener('click', () => setPly(j + 1 === h.length ? null : j + 1));
        row.append(b);
      }
      movesWrap.append(row);
    }
    movesWrap.querySelector('.is-current')?.scrollIntoView({ block: 'nearest' });
    if (k === h.length) movesWrap.scrollTop = movesWrap.scrollHeight;
  }

  // ---------------------------------------------------------------------------
  // Moving pieces
  // ---------------------------------------------------------------------------
  function squareAt(event) {
    const r = boardEl.getBoundingClientRect();
    let c = Math.floor(((event.clientX - r.left) / r.width) * 8);
    let rw = Math.floor(((event.clientY - r.top) / r.height) * 8);
    if (c < 0 || c > 7 || rw < 0 || rw > 7) return null;
    if (S.flipped) { c = 7 - c; rw = 7 - rw; }
    return FILES[c] + (8 - rw);
  }

  function select(sq) {
    S.selected = sq;
    S.targets = sq ? game.moves({ square: sq, verbose: true }) : [];
    render();
  }

  boardEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || S.promotion) return;
    root.focus({ preventScroll: true });
    const sq = squareAt(e);
    if (!sq) return;
    // clicking a highlighted destination completes the move
    if (S.selected && S.targets.some((m) => m.to === sq)) { attemptMove(S.selected, sq); return; }
    const piece = (S.ply === null ? game : viewPosition()).get(sq);
    if (piece && humanMayMove(piece.color)) {
      select(sq);
      startDrag(e, sq, piece);
    } else if (S.selected) {
      select(null);
    }
  });

  function startDrag(event, from, piece) {
    const startX = event.clientX;
    const startY = event.clientY;
    const drag = { from, moved: false, ghost: null };
    S.drag = drag;
    boardEl.setPointerCapture(event.pointerId);

    const place = (e) => {
      const r = boardEl.getBoundingClientRect();
      const size = r.width / 8;
      drag.ghost.style.transform = `translate(${e.clientX - r.left - size / 2}px, ${e.clientY - r.top - size / 2}px)`;
    };
    const move = (e) => {
      if (!drag.moved) {
        if (Math.hypot(e.clientX - startX, e.clientY - startY) < 5) return;
        drag.moved = true;
        const ghost = pieceSvg(piece.color, piece.type);
        ghost.classList.add('ch-ghost');
        boardEl.append(ghost);
        drag.ghost = ghost;
        boardEl.querySelector(`[data-sq="${from}"] .piece`)?.classList.add('is-dragging');
      }
      place(e);
    };
    const up = (e) => {
      boardEl.removeEventListener('pointermove', move);
      boardEl.removeEventListener('pointerup', up);
      boardEl.removeEventListener('pointercancel', up);
      S.drag = null;
      if (drag.ghost) drag.ghost.remove();
      if (!drag.moved) return;
      const to = squareAt(e);
      if (to && S.targets.some((m) => m.to === to)) attemptMove(from, to);
      else render();
    };
    boardEl.addEventListener('pointermove', move);
    boardEl.addEventListener('pointerup', up);
    boardEl.addEventListener('pointercancel', up);
  }

  function attemptMove(from, to) {
    const options = S.targets.filter((m) => m.from === from && m.to === to);
    if (!options.length) return;
    if (options.some((m) => m.promotion)) askPromotion(from, to, options[0].color);
    else commit({ from, to });
  }

  function askPromotion(from, to, color) {
    S.promotion = { from, to };
    promoEl.replaceChildren(el('div', 'ch-promo-title', 'Promote to…'));
    const row = el('div', 'ch-promo-row');
    for (const t of ['q', 'r', 'b', 'n']) {
      const b = el('button', 'ch-promo-btn');
      b.title = PIECE_NAMES[t];
      b.append(pieceSvg(color, t));
      b.addEventListener('click', () => { closePromotion(); commit({ from, to, promotion: t }); });
      row.append(b);
    }
    const cancel = el('button', 'btn ch-promo-cancel', 'Cancel');
    cancel.addEventListener('click', () => { closePromotion(); select(null); });
    promoEl.append(row, cancel);
    promoEl.hidden = false;
    row.firstElementChild.focus();
  }
  function closePromotion() {
    S.promotion = null;
    promoEl.hidden = true;
  }

  // Play a move on the real game.
  function commit(m) {
    let made;
    try {
      made = game.move(m);
    } catch {
      select(null);
      return;
    }
    S.selected = null;
    S.targets = [];
    S.ply = null;
    S.evalWhite = null;
    emit('sound:play', game.isCheckmate() || game.isDraw() ? 'gameover' : game.isCheck() ? 'check' : made.captured ? 'capture' : 'move');
    render();
    afterMove();
  }

  function afterMove() {
    if (isOver()) { S.token++; return; }
    if (S.mode === 'ai' && game.turn() !== S.human) computerMove();
    else if (S.mode === 'analysis') analyse();
  }

  // ---------------------------------------------------------------------------
  // Stockfish
  // ---------------------------------------------------------------------------
  async function getEngine() {
    if (!S.engine) S.engine = new StockfishEngine();
    await S.engine.ready;
    return S.engine;
  }

  async function computerMove() {
    const token = ++S.token;
    S.thinking = true;
    render();
    const started = performance.now();
    try {
      const engine = await getEngine();
      await engine.setSkill(S.level);
      const movetime = 150 + S.level * 50;
      const best = await engine.think(game.fen(), `movetime ${movetime}`);
      const wait = 400 - (performance.now() - started); // never answer instantly: feels more natural
      if (wait > 0) await sleep(wait);
      if (token !== S.token || destroyed || !best) return;
      S.thinking = false;
      commit({ from: best.slice(0, 2), to: best.slice(2, 4), promotion: best[4] });
    } catch (err) {
      console.error(err);
      if (token === S.token) {
        S.thinking = false;
        S.mode = 'two';
        modeSel.value = 'two';
        toast({ title: 'Chess', message: "The chess engine couldn't start, so this is now a two-player game.", icon: 'chess', duration: 6000 });
        render();
      }
    } finally {
      if (token === S.token && S.thinking) { S.thinking = false; render(); }
    }
  }

  async function analyse() {
    if (S.mode !== 'analysis' || destroyed) return;
    const token = ++S.token;
    const fen = fenAtPly(currentPly());
    const turn = fen.split(' ')[1];
    try {
      const engine = await getEngine();
      await engine.setSkill(20);
      await engine.think(fen, 'depth 18', (info) => {
        if (token !== S.token) return;
        const sign = turn === 'w' ? 1 : -1; // Stockfish scores from the side to move; we show White's view
        S.evalWhite = {
          cp: info.cp === null ? null : info.cp * sign,
          mate: info.mate === null ? null : info.mate * sign,
          depth: info.depth,
          line: pvToSan(fen, info.pv),
        };
        renderEval();
      });
    } catch (err) {
      console.error(err);
      toast({ title: 'Analysis', message: "The chess engine couldn't start.", icon: 'chess' });
    }
  }

  // "e2e4 e7e5 g1f3" -> "e4 e5 Nf3" (using a scratch game)
  function pvToSan(fen, pv) {
    const scratch = new Chess(fen);
    const out = [];
    for (const uci of pv.slice(0, 8)) {
      try {
        out.push(scratch.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san);
      } catch { break; }
    }
    return out;
  }

  function renderEval() {
    if (S.mode !== 'analysis') return;
    const e = S.evalWhite;
    let whitePart = 50;
    let label = '…';
    if (e) {
      if (e.mate !== null) {
        whitePart = e.mate > 0 ? 100 : 0;
        label = (e.mate > 0 ? '+' : '-') + 'M' + Math.abs(e.mate);
      } else {
        whitePart = 100 / (1 + Math.exp(-e.cp / 260));
        label = (e.cp >= 0 ? '+' : '') + (e.cp / 100).toFixed(1);
      }
    }
    // the bar is "black on top, white on the bottom" (flipped with the board)
    evalBar.classList.toggle('is-flipped', S.flipped);
    evalBlack.style.height = 100 - whitePart + '%';
    evalLabel.textContent = label;
    analysisEl.replaceChildren(
      el('div', 'ch-analysis-score', e ? `Evaluation ${label}${e.depth ? ` · depth ${e.depth}` : ''}` : 'Thinking…'),
      el('div', 'ch-analysis-line', e && e.line.length ? 'Best line: ' + e.line.join(' ') : ''),
    );
  }

  // ---------------------------------------------------------------------------
  // New game, take back, navigation
  // ---------------------------------------------------------------------------
  async function newGame(skipConfirm = false) {
    if (!skipConfirm && livePly() > 0 && !isOver()) {
      const ok = await confirmDialog({ title: 'Start a new game?', message: 'The current game will be lost. (You can save it as a PGN first.)', icon: 'chess', confirmLabel: 'New game', danger: true });
      if (!ok) { // cancelled: put the controls back to match the game that is still being played
        modeSel.value = S.mode;
        colorSel.value = S.colorChoice;
        levelInput.value = String(S.level);
        return;
      }
    }
    S.token++;
    if (S.engine) S.engine.stop();
    S.thinking = false;
    game.reset();
    S.mode = modeSel.value;
    S.level = Number(levelInput.value);
    S.colorChoice = colorSel.value;
    S.human = S.colorChoice === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : S.colorChoice;
    S.flipped = S.mode === 'ai' && S.human === 'b';
    S.ply = null;
    S.selected = null;
    S.targets = [];
    S.evalWhite = null;
    closePromotion();
    render();
    afterMove();
  }

  function takeBack() {
    if (livePly() === 0) return;
    S.token++;
    if (S.engine) S.engine.stop();
    S.thinking = false;
    // against the computer, take back BOTH sides' last moves so it's your turn again
    const count = S.mode === 'ai' && game.turn() === S.human && livePly() >= 2 ? 2 : 1;
    for (let i = 0; i < count; i++) game.undo();
    S.ply = null;
    S.selected = null;
    S.targets = [];
    S.evalWhite = null;
    render();
    if (S.mode === 'ai' && game.turn() !== S.human && !isOver()) computerMove();
    else if (S.mode === 'analysis') analyse();
  }

  function setPly(k) {
    const live = livePly();
    S.ply = k === null || k >= live ? null : Math.max(0, k);
    S.selected = null;
    S.targets = [];
    closePromotion();
    render();
    if (S.mode === 'analysis') analyse();
  }
  const stepPly = (d) => setPly(Math.max(0, Math.min(livePly(), currentPly() + d)));

  // ---------------------------------------------------------------------------
  // PGN
  // ---------------------------------------------------------------------------
  function pgnText() {
    const today = new Date();
    const date = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;
    const white = S.mode === 'ai' ? (S.human === 'w' ? 'You' : `Stockfish (level ${S.level})`) : 'White';
    const black = S.mode === 'ai' ? (S.human === 'b' ? 'You' : `Stockfish (level ${S.level})`) : 'Black';
    game.header('Event', 'H-os game', 'Site', 'H-os', 'Date', date, 'White', white, 'Black', black);
    return game.pgn({ newline: '\n' });
  }

  async function savePgn() {
    try {
      const path = await fsApi.pickSaveFile('h-os-game.pgn');
      if (!path) return;
      const saved = await fsApi.writeText(path, pgnText() + '\n', 'lf');
      toast({ title: 'Game saved', message: saved.name, icon: 'chess', duration: 3000 });
    } catch (err) {
      toast({ title: "Couldn't save the game", message: err.message, icon: 'chess', duration: 6000 });
    }
  }

  // Replace the current game with a PGN (throws if it isn't a valid game).
  function applyPgn(text) {
    new Chess().loadPgn(text); // validate on a scratch game first, so a bad file changes nothing
    S.token++;
    if (S.engine) S.engine.stop();
    S.thinking = false;
    game.loadPgn(text);
    if (S.mode === 'ai') { S.mode = 'two'; modeSel.value = 'two'; }
    S.flipped = false;
    S.ply = null;
    S.selected = null;
    S.targets = [];
    S.evalWhite = null;
    closePromotion();
    render();
    if (S.mode === 'analysis') analyse();
  }

  async function loadPgn() {
    try {
      const path = await fsApi.pickOpenFile('text');
      if (!path) return;
      const file = await fsApi.readText(path);
      applyPgn(file.text);
      toast({ title: 'Game loaded', message: `${file.name} · ${livePly()} moves`, icon: 'chess', duration: 3000 });
    } catch (err) {
      toast({ title: "Couldn't load that game", message: err.message || 'That file is not a valid PGN.', icon: 'chess', duration: 6000 });
    }
  }

  async function copyPgn() {
    const r = await window.hos.clipboard.writeText(pgnText());
    toast({ title: r.ok ? 'PGN copied' : "Couldn't copy", message: r.ok ? 'Paste it anywhere.' : r.error.message, icon: 'chess', duration: 2500 });
  }

  // ---------------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------------
  modeSel.addEventListener('change', () => newGame());
  colorSel.addEventListener('change', () => { S.colorChoice = colorSel.value; });
  levelInput.addEventListener('input', () => { S.level = Number(levelInput.value); render(); });

  root.addEventListener('keydown', (e) => {
    if (e.target.matches('select, input')) return;
    const k = e.key;
    if (S.promotion) { if (k === 'Escape') { closePromotion(); select(null); } return; }
    if (k === 'ArrowLeft') { e.preventDefault(); stepPly(-1); }
    else if (k === 'ArrowRight') { e.preventDefault(); stepPly(1); }
    else if (k === 'Home') { e.preventDefault(); setPly(0); }
    else if (k === 'End') { e.preventDefault(); setPly(null); }
    else if (k.toLowerCase() === 'f' && !e.ctrlKey) { S.flipped = !S.flipped; render(); }
    else if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'z') { e.preventDefault(); takeBack(); }
    else if (k === 'Escape') select(null);
  });

  render();
  afterMove();

  const instance = {
    onFocus() { if (!destroyed && document.activeElement === document.body) root.focus({ preventScroll: true }); },
    destroy() {
      destroyed = true;
      S.token++;
      if (S.engine) S.engine.destroy();
    },
    // for tests
    _game: game, _state: S,
    _api: { commit, newGame, setPly, takeBack, attemptMove, select, applyPgn, render, pgnText, setMode(m) { modeSel.value = m; return newGame(true); } },
  };
  if (window.__hos) (window.__hos.apps ||= {}).chess = instance; // development only
  return instance;
}

export function registerChess() {
  registerApp({
    id: 'chess',
    name: 'Chess',
    icon: 'chess',
    keywords: 'puzzle stockfish board game',
    category: 'puzzle',
    description: 'Play the computer, a friend, or analyse a position.',
    defaultSize: { w: 940, h: 640 },
    minSize: { w: 640, h: 500 },
    create,
  });
}
