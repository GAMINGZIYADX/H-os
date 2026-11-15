// =============================================================================
// calcEngine.js — the brain of the Calculator (no DOM, so Node can test it).
// =============================================================================
// It behaves like the standard Windows calculator: operations are worked out as you go
// (2 + 3 × 4 = 20), "=" repeats the last operation, and "%" means "this much of the number so far".

export const OPS = {
  '+': { symbol: '+', apply: (a, b) => a + b },
  '-': { symbol: '−', apply: (a, b) => a - b },
  '*': { symbol: '×', apply: (a, b) => a * b },
  '/': { symbol: '÷', apply: (a, b) => { if (b === 0) throw new Error('Cannot divide by zero'); return a / b; } },
};

const MAX_DIGITS = 16;

// 0.1 + 0.2 should read 0.3, not 0.30000000000000004: keep 12 significant digits.
export function fmt(n) {
  if (!Number.isFinite(n)) throw new Error('Overflow');
  return String(Number(n.toPrecision(12)));
}

export function createCalc() {
  const s = { entry: '0', acc: null, op: null, awaiting: false, justEquals: false, lastOp: null, lastOperand: null, expr: '', error: null };

  const value = () => parseFloat(s.entry);
  const fail = (e) => {
    s.error = e.message || 'Error';
    s.entry = '0'; s.acc = null; s.op = null; s.awaiting = false; s.justEquals = false; s.expr = '';
  };
  const guard = (fn) => { try { fn(); } catch (e) { fail(e); } };

  return {
    state: s,

    digit(d) {
      if (s.error) this.clear();
      if (s.awaiting || s.justEquals) { s.entry = '0'; s.awaiting = false; if (s.justEquals) { s.justEquals = false; s.expr = ''; } }
      const digits = s.entry.replace(/[-.]/g, '').length;
      if (digits >= MAX_DIGITS) return;
      s.entry = s.entry === '0' ? String(d) : s.entry === '-0' ? '-' + d : s.entry + d;
    },

    dot() {
      if (s.error) this.clear();
      if (s.awaiting || s.justEquals) { s.entry = '0'; s.awaiting = false; if (s.justEquals) { s.justEquals = false; s.expr = ''; } }
      if (!s.entry.includes('.')) s.entry += '.';
    },

    op(key) {
      if (s.error) return;
      guard(() => {
        s.justEquals = false;
        if (s.acc !== null && s.op && !s.awaiting) {
          s.acc = OPS[s.op].apply(s.acc, value());
          s.entry = fmt(s.acc);
        } else if (s.acc === null || !s.op) {
          s.acc = value();
        }
        s.op = key;
        s.awaiting = true;
        s.expr = `${fmt(s.acc)} ${OPS[key].symbol}`;
      });
    },

    equals() {
      if (s.error) return;
      guard(() => {
        if (s.op) {
          const a = s.acc;
          const b = s.awaiting ? s.acc : value();
          const result = OPS[s.op].apply(a, b);
          s.expr = `${fmt(a)} ${OPS[s.op].symbol} ${fmt(b)} =`;
          s.lastOp = s.op;
          s.lastOperand = b;
          s.acc = null; s.op = null; s.awaiting = false;
          s.entry = fmt(result);
          s.justEquals = true;
        } else if (s.lastOp) { // pressing = again repeats the last operation
          const a = value();
          const result = OPS[s.lastOp].apply(a, s.lastOperand);
          s.expr = `${fmt(a)} ${OPS[s.lastOp].symbol} ${fmt(s.lastOperand)} =`;
          s.entry = fmt(result);
          s.justEquals = true;
        }
      });
    },

    percent() {
      if (s.error) return;
      guard(() => {
        const base = s.acc !== null && s.op ? s.acc : 0;
        const result = (base * value()) / 100;
        s.entry = fmt(result);
        s.awaiting = false;
      });
    },

    negate() {
      if (s.error) return;
      if (s.awaiting) { s.entry = '0'; s.awaiting = false; }
      if (s.entry === '0') return;
      s.entry = s.entry.startsWith('-') ? s.entry.slice(1) : '-' + s.entry;
    },

    unary(kind) { // 'sqrt' | 'square' | 'reciprocal'
      if (s.error) return;
      guard(() => {
        const x = value();
        let result;
        let label;
        if (kind === 'sqrt') { if (x < 0) throw new Error('Invalid input'); result = Math.sqrt(x); label = `√(${fmt(x)})`; }
        else if (kind === 'square') { result = x * x; label = `sqr(${fmt(x)})`; }
        else { if (x === 0) throw new Error('Cannot divide by zero'); result = 1 / x; label = `1/(${fmt(x)})`; }
        s.entry = fmt(result);
        s.expr = label;
        if (!s.op) s.justEquals = true;
        s.awaiting = false;
      });
    },

    backspace() {
      if (s.error) { this.clear(); return; }
      if (s.awaiting || s.justEquals) return;
      s.entry = s.entry.length > 1 && !(s.entry.length === 2 && s.entry.startsWith('-')) ? s.entry.slice(0, -1) : '0';
    },

    clearEntry() { s.error = null; s.entry = '0'; s.awaiting = false; },
    clear() { Object.assign(s, { entry: '0', acc: null, op: null, awaiting: false, justEquals: false, lastOp: null, lastOperand: null, expr: '', error: null }); },
  };
}
