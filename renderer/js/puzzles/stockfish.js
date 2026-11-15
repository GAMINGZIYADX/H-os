// =============================================================================
// puzzles/stockfish.js — talks to the Stockfish chess engine (WASM, in a Web Worker)
// =============================================================================
// Stockfish speaks "UCI", a simple text protocol: we post lines like "position fen …" and
// "go movetime 500" to the worker, and it posts back "info …" and "bestmove e2e4".
// Running in a Worker keeps the engine's thinking off the main thread, so H-os stays smooth.
//
// Stockfish is GPL-3.0 software (see renderer/vendor/stockfish/Copying.txt).

export class StockfishEngine {
  constructor() {
    this.worker = new Worker(new URL('../../vendor/stockfish/stockfish.js', import.meta.url));
    this.listeners = new Set();
    this.search = null;       // the search in progress: { resolve, onInfo, cancelled }
    this.generation = 0;      // counts think() calls, so only the newest one actually starts a search
    this.worker.onmessage = (event) => this.#onLine(String(event.data));
    this.worker.onerror = (event) => console.error('Stockfish worker error:', event.message);
    this.ready = this.#handshake();
  }

  #send(line) {
    this.worker.postMessage(line);
  }

  // Wait for one particular reply line.
  #waitFor(test, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.listeners.delete(listener); reject(new Error('The chess engine did not answer.')); }, timeoutMs);
      const listener = (line) => {
        if (test(line)) { clearTimeout(timer); this.listeners.delete(listener); resolve(line); }
      };
      this.listeners.add(listener);
    });
  }

  async #handshake() {
    const ok = this.#waitFor((l) => l === 'uciok');
    this.#send('uci');
    await ok;
    this.#send('setoption name Hash value 16');
    const ready = this.#waitFor((l) => l === 'readyok');
    this.#send('isready');
    await ready;
  }

  #onLine(line) {
    for (const fn of [...this.listeners]) fn(line);
    if (!this.search) return;
    if (line.startsWith('info ')) {
      const info = parseInfo(line);
      if (info && this.search.onInfo) this.search.onInfo(info);
    } else if (line.startsWith('bestmove')) {
      const s = this.search;
      this.search = null;
      const move = line.split(' ')[1];
      s.resolve(s.cancelled || !move || move === '(none)' ? null : move);
    }
  }

  // 0 (weakest) .. 20 (full strength)
  async setSkill(level) {
    await this.ready;
    this.#send(`setoption name Skill Level value ${Math.max(0, Math.min(20, Math.round(level)))}`);
  }

  // Think about a position. Resolves with the best move ("e2e4", "e7e8q") or null if cancelled.
  //   goArgs: "movetime 500" or "depth 14" or "infinite"
  async think(fen, goArgs, onInfo = null) {
    const generation = ++this.generation;
    await this.ready;
    await this.stop(); // finish any previous search first
    if (generation !== this.generation) return null; // a newer request arrived while we waited: it wins
    return new Promise((resolve) => {
      this.search = { resolve, onInfo, cancelled: false };
      this.#send('position fen ' + fen);
      this.#send('go ' + goArgs);
    });
  }

  // Stop the current search (if any) and wait until the engine has really stopped.
  stop() {
    if (!this.search) return Promise.resolve();
    const s = this.search;
    s.cancelled = true;
    return new Promise((resolve) => {
      const previous = s.resolve;
      s.resolve = (move) => { previous(move); resolve(); };
      this.#send('stop');
    });
  }

  destroy() {
    try { this.worker.terminate(); } catch { /* ignore */ }
    this.listeners.clear();
    this.search = null;
  }
}

// "info depth 12 score cp 34 multipv 1 pv e2e4 e7e5" -> { depth, cp, mate, pv: ['e2e4', …] }
function parseInfo(line) {
  const parts = line.split(' ');
  const info = { depth: null, cp: null, mate: null, pv: [] };
  for (let i = 1; i < parts.length; i++) {
    if (parts[i] === 'depth') info.depth = Number(parts[i + 1]);
    else if (parts[i] === 'score') {
      if (parts[i + 1] === 'cp') info.cp = Number(parts[i + 2]);
      else if (parts[i + 1] === 'mate') info.mate = Number(parts[i + 2]);
    } else if (parts[i] === 'pv') {
      info.pv = parts.slice(i + 1);
      break;
    }
  }
  return info.cp === null && info.mate === null ? null : info;
}
