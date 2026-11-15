// apps/calculator.js — Calculator (the maths lives in calcEngine.js, which is tested separately).
// Mouse or keyboard: digits, + - * /, Enter or =, Backspace, Esc (clear), % and .

import { el } from '../dom.js';
import { registerApp } from '../appRegistry.js';
import { createCalc } from '../calcEngine.js';

// Add thousands separators to the whole-number part only ("1234567.89" -> "1,234,567.89").
function pretty(text) {
  if (!/^-?[0-9.]+$/.test(text)) return text; // exponent form etc.: leave alone
  const negative = text.startsWith('-');
  const [whole, fraction] = text.replace('-', '').split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (negative ? '-' : '') + grouped + (fraction !== undefined ? '.' + fraction : '');
}

function create(container, ctx) {
  ctx.setTitle('Calculator');
  const calc = createCalc();
  const root = el('div', 'calc');
  root.tabIndex = -1;
  const exprEl = el('div', 'calc-expr');
  const displayEl = el('div', 'calc-display', '0');
  const screen = el('div', 'calc-screen');
  screen.append(exprEl, displayEl);
  const keys = el('div', 'calc-keys');
  root.append(screen, keys);
  container.append(root);

  const KEYS = [
    ['%', 'fn', () => calc.percent()], ['CE', 'fn', () => calc.clearEntry()], ['C', 'fn', () => calc.clear()], ['⌫', 'fn', () => calc.backspace()],
    ['1/x', 'fn', () => calc.unary('reciprocal')], ['x²', 'fn', () => calc.unary('square')], ['√x', 'fn', () => calc.unary('sqrt')], ['÷', 'op', () => calc.op('/')],
    ['7', 'num', () => calc.digit(7)], ['8', 'num', () => calc.digit(8)], ['9', 'num', () => calc.digit(9)], ['×', 'op', () => calc.op('*')],
    ['4', 'num', () => calc.digit(4)], ['5', 'num', () => calc.digit(5)], ['6', 'num', () => calc.digit(6)], ['−', 'op', () => calc.op('-')],
    ['1', 'num', () => calc.digit(1)], ['2', 'num', () => calc.digit(2)], ['3', 'num', () => calc.digit(3)], ['+', 'op', () => calc.op('+')],
    ['±', 'num', () => calc.negate()], ['0', 'num', () => calc.digit(0)], ['.', 'num', () => calc.dot()], ['=', 'eq', () => calc.equals()],
  ];
  for (const [label, kind, action] of KEYS) {
    const b = el('button', `calc-key calc-${kind}`, label);
    b.dataset.key = label;
    // pointerdown + preventDefault keeps keyboard focus on the calculator
    b.addEventListener('pointerdown', (e) => e.preventDefault());
    b.addEventListener('click', () => { action(); paint(); root.focus({ preventScroll: true }); });
    keys.append(b);
  }

  function paint() {
    const s = calc.state;
    const text = s.error || pretty(s.entry);
    displayEl.textContent = text;
    displayEl.classList.toggle('is-error', Boolean(s.error));
    // shrink long numbers to fit
    const length = text.length;
    displayEl.style.fontSize = length > 16 ? '22px' : length > 12 ? '30px' : length > 9 ? '38px' : '46px';
    exprEl.textContent = s.expr;
  }

  const MAP = { '+': () => calc.op('+'), '-': () => calc.op('-'), '*': () => calc.op('*'), '/': () => calc.op('/'), '%': () => calc.percent(), '.': () => calc.dot(), ',': () => calc.dot(), '=': () => calc.equals(), Enter: () => calc.equals(), Backspace: () => calc.backspace(), Escape: () => calc.clear(), Delete: () => calc.clearEntry() };
  root.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (/^[0-9]$/.test(e.key)) calc.digit(Number(e.key));
    else if (MAP[e.key]) MAP[e.key]();
    else return;
    e.preventDefault();
    paint();
  });

  paint();
  root.focus();
  return { onFocus() { root.focus({ preventScroll: true }); }, _calc: calc };
}

export function registerCalculator() {
  registerApp({
    id: 'calculator',
    name: 'Calculator',
    icon: 'calculator',
    keywords: 'math numbers add subtract',
    defaultSize: { w: 340, h: 520 },
    minSize: { w: 300, h: 460 },
    resizable: false,
    create,
  });
}
