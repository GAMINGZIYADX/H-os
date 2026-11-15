// memoryEngine.js — the rules of Memory (turn cards over, find the matching pairs; no screen code here).
//
// Every card hides a symbol (a number from 0 to SYMBOL_COUNT-1), and every symbol appears exactly twice.
// Turn two cards over: a pair stays face up, a miss turns both face down again (the screen waits a moment
// first so you can look; call resolve() to turn them back, or just flip the next card, which does it for you).

import { shuffled } from './rng.js';

export const SYMBOL_COUNT = 12;
export const LEVELS = {
  easy: { cols: 4, rows: 3, pairs: 6 },
  medium: { cols: 4, rows: 4, pairs: 8 },
  hard: { cols: 6, rows: 4, pairs: 12 },
};

export const DOWN = 0, UP = 1, MATCHED = 2;

// A shuffled deck: `pairs` different symbols, two cards each.
export function newDeck(pairs, rng = Math.random) {
  if (!Number.isInteger(pairs) || pairs < 1 || pairs > SYMBOL_COUNT) throw new Error('bad pair count');
  const symbols = shuffled([...Array(SYMBOL_COUNT).keys()], rng).slice(0, pairs);
  return shuffled([...symbols, ...symbols], rng);
}

export function newGame(level = 'medium', rng = Math.random) {
  const lv = LEVELS[level];
  if (!lv) throw new Error('unknown level');
  const deck = newDeck(lv.pairs, rng);
  return {
    level, cols: lv.cols, rows: lv.rows, pairs: lv.pairs,
    deck,                                 // the symbol under each card
    state: new Uint8Array(deck.length),   // DOWN / UP / MATCHED
    first: -1,                            // the first card of the current try, or -1
    pending: null,                        // [a, b]: a missed pair still showing, waiting to be turned back
    moves: 0,                             // one move = two cards turned
    matched: 0,                           // pairs found
  };
}

export const isWon = (game) => game.matched === game.pairs;

// Turn the pending missed pair face down again. Returns true if there was one.
export function resolve(game) {
  if (!game.pending) return false;
  for (const i of game.pending) if (game.state[i] === UP) game.state[i] = DOWN;
  game.pending = null;
  return true;
}

// Turn card i over. Returns 'ignored' | 'first' | 'match' | 'miss'.
export function flip(game, i) {
  if (!Number.isInteger(i) || i < 0 || i >= game.deck.length) return 'ignored';
  if (isWon(game)) return 'ignored';
  resolve(game);                                   // a missed pair is turned back by the next click
  if (game.state[i] !== DOWN) return 'ignored';
  game.state[i] = UP;
  if (game.first < 0) {
    game.first = i;
    return 'first';
  }
  const a = game.first;
  game.first = -1;
  game.moves++;
  if (game.deck[a] === game.deck[i]) {
    game.state[a] = MATCHED;
    game.state[i] = MATCHED;
    game.matched++;
    return 'match';
  }
  game.pending = [a, i];
  return 'miss';
}
