// Tests for the Calculator engine.   Run:  node tools/test-calc.js
const path = require('path');
const { pathToFileURL } = require('url');

let failed = 0;
const expect = (name, ok, extra = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };

(async () => {
  const { createCalc } = await import(pathToFileURL(path.join(__dirname, '..', 'renderer', 'js', 'calcEngine.js')).href);
  // type a little script: digits and operator keys
  const run = (script) => {
    const c = createCalc();
    for (const ch of script) {
      if (/[0-9]/.test(ch)) c.digit(Number(ch));
      else if (ch === '.') c.dot();
      else if (ch === '=') c.equals();
      else if ('+-*/'.includes(ch)) c.op(ch);
      else if (ch === '%') c.percent();
      else if (ch === 'n') c.negate();
      else if (ch === 'b') c.backspace();
      else if (ch === 'r') c.unary('sqrt');
      else if (ch === 's') c.unary('square');
      else if (ch === 'i') c.unary('reciprocal');
      else if (ch === 'C') c.clear();
    }
    return c;
  };
  const show = (script) => { const c = run(script); return c.state.error || c.state.entry; };

  expect('1+2=3', show('1+2=') === '3');
  expect('0.1+0.2 reads 0.3', show('0.1+0.2=') === '0.3');
  expect('10/4=2.5', show('10/4=') === '2.5');
  expect('chain works like Windows: 2+3*4=20', show('2+3*4=') === '20');
  expect('repeat equals: 2+3== is 8', show('2+3==') === '8');
  expect('repeat equals: 2*3=== is 54', show('2*3===') === '54');
  expect('divide by zero is an error message', show('5/0=') === 'Cannot divide by zero');
  expect('the calculator recovers after an error (typing a digit)', (() => { const c = run('5/0='); c.digit(7); return c.state.entry === '7' && !c.state.error; })());
  expect('percent: 200+10% = 220', show('200+10%=') === '220');
  expect('percent alone is 0', show('50%') === '0');
  expect('negate: 5 -> -5', show('5n') === '-5');
  expect('negate twice', show('5nn') === '5');
  expect('negative arithmetic: 5n+2= is -3', show('5n+2=') === '-3');
  expect('backspace: 123b is 12', show('123b') === '12');
  expect('backspace down to 0', show('5b') === '0');
  expect('backspace on a negative: -5 b is 0', show('5nb') === '0');
  expect('decimal entry: 1.5+1.5=3', show('1.5+1.5=') === '3');
  expect('only one decimal point', show('1.2.3') === '1.23');
  expect('leading zeros collapse', show('0007') === '7');
  expect('sqrt: 81 -> 9', show('81r') === '9');
  expect('sqrt of a negative is invalid', show('4nr') === 'Invalid input');
  expect('square: 12 -> 144', show('12s') === '144');
  expect('reciprocal: 4 -> 0.25', show('4i') === '0.25');
  expect('1/0 reciprocal is an error', show('0i') === 'Cannot divide by zero');
  expect('digit limit (16 digits)', show('12345678901234567890').replace(/\./g, '').length === 16);
  expect('after = typing starts a new number', (() => { const c = run('2+3='); c.digit(9); return c.state.entry === '9'; })());
  expect('after = an operator continues with the result', show('2+3=*4=') === '20');
  expect('changing the operator before typing: 5+*3= is 15', show('5+*3=') === '15');
  expect('equals with only an operator uses the same number: 6*= is 36', show('6*=') === '36');
  expect('C clears everything', show('12+3C') === '0');
  expect('huge results stay readable: 99999999*99999999', show('99999999*99999999=') === '9999999800000000');
  console.log(failed ? `\n${failed} FAILED` : '\nall calculator tests passed');
  process.exit(failed ? 1 : 0);
})();
