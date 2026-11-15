// mergeEngine.js — the rules of Tulip Merge (slide numbered tiles; equal tiles join and double).
//
// Every tile has an id so the screen can animate it sliding. A move slides all tiles as far as they
// go in one direction; two equal tiles that bump into each other become ONE tile of double value
// (each tile joins at most once per move, so [2,2,2,2] slid left becomes [4,4,.,.]).
// After a move that changed something, one new tile (2, or sometimes 4) appears in a free cell.
// The game is over when the board is full and nothing can join.

import { randomInt } from './rng.js';

export const SIZE = 4;
export const GOAL = 2048;
export const DIRECTIONS = ['left', 'right', 'up', 'down'];

function freeCells(game) {
  const taken = new Set(game.tiles.map((t) => t.r * game.size + t.c));
  const free = [];
  for (let i = 0; i < game.size * game.size; i++) if (!taken.has(i)) free.push(i);
  return free;
}

// Add a 2 (9 times in 10) or a 4 to a random free cell. Returns the new tile, or null if the board is full.
function spawn(game, rng) {
  const free = freeCells(game);
  if (!free.length) return null;
  const cell = free[randomInt(rng, free.length)];
  const tile = { id: game.nextId++, v: rng() < 0.9 ? 2 : 4, r: Math.floor(cell / game.size), c: cell % game.size };
  game.tiles.push(tile);
  return tile;
}

// Is there any move left? (a free cell, or two equal neighbours)
export function canMove(game) {
  if (freeCells(game).length) return true;
  const at = new Map(game.tiles.map((t) => [t.r * game.size + t.c, t.v]));
  for (const t of game.tiles) {
    if (t.c + 1 < game.size && at.get(t.r * game.size + t.c + 1) === t.v) return true;
    if (t.r + 1 < game.size && at.get((t.r + 1) * game.size + t.c) === t.v) return true;
  }
  return false;
}

export function newGame(rng = Math.random, size = SIZE) {
  const game = { size, tiles: [], nextId: 1, score: 0, reached: false, over: false };
  spawn(game, rng);
  spawn(game, rng);
  return game;
}

// A game from a plain 2D list of values (0 = empty). Used by tests.
export function fromGrid(grid, score = 0) {
  const size = grid.length;
  const game = { size, tiles: [], nextId: 1, score, reached: false, over: false };
  grid.forEach((row, r) => row.forEach((v, c) => { if (v) game.tiles.push({ id: game.nextId++, v, r, c }); }));
  game.reached = game.tiles.some((t) => t.v >= GOAL);
  game.over = !canMove(game);
  return game;
}

export function toGrid(game) {
  const grid = Array.from({ length: game.size }, () => new Array(game.size).fill(0));
  for (const t of game.tiles) grid[t.r][t.c] = t.v;
  return grid;
}

// Slide everything. Returns
//   { game, moved, gained, merged: [ids of the new double tiles], ghosts: [{ id, r, c }], spawned: tile|null }
// `ghosts` are the two old tiles of every join: they slide to the spot and then vanish.
// If nothing moved, `game` is the unchanged input and `moved` is false (and no tile spawns).
export function move(game, dir, rng = Math.random) {
  const size = game.size;
  const horizontal = dir === 'left' || dir === 'right';
  const forward = dir === 'left' || dir === 'up';     // walking along the line towards its start
  const tiles = [];
  const ghosts = [];
  const merged = [];
  let moved = false;
  let gained = 0;
  let nextId = game.nextId;

  for (let line = 0; line < size; line++) {
    // the tiles of this row/column, nearest to the wall first
    const inLine = game.tiles
      .filter((t) => (horizontal ? t.r : t.c) === line)
      .sort((a, b) => (horizontal ? a.c - b.c : a.r - b.r) * (forward ? 1 : -1));
    const out = [];
    for (const t of inLine) {
      const last = out[out.length - 1];
      if (last && !last.joined && last.v === t.v) { last.joined = true; last.v *= 2; last.from.push(t); }
      else out.push({ v: t.v, joined: false, from: [t] });
    }
    out.forEach((entry, k) => {
      const pos = forward ? k : size - 1 - k;
      const r = horizontal ? line : pos;
      const c = horizontal ? pos : line;
      if (entry.joined) {
        const tile = { id: nextId++, v: entry.v, r, c };
        tiles.push(tile);
        merged.push(tile.id);
        gained += entry.v;
        for (const old of entry.from) ghosts.push({ id: old.id, r, c });
        moved = true;
      } else {
        const old = entry.from[0];
        if (old.r !== r || old.c !== c) moved = true;
        tiles.push({ id: old.id, v: old.v, r, c });
      }
    });
  }
  if (!moved) return { game, moved: false, gained: 0, merged: [], ghosts: [], spawned: null };

  const next = { ...game, tiles, nextId, score: game.score + gained };
  const spawned = spawn(next, rng);
  if (next.tiles.some((t) => t.v >= GOAL)) next.reached = true;
  next.over = !canMove(next);
  return { game: next, moved: true, gained, merged, ghosts, spawned };
}
