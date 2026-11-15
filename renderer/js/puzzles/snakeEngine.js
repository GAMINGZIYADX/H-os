// snakeEngine.js — the rules of Snake (a snake collects tulips and grows; no screen code here).
//
// The state is changed IN PLACE by step(), which the screen calls on a timer.
// turn() only records what the player wants; the snake obeys at the next step. Up to two turns can wait,
// so a quick "up, then left" between two steps is not lost, and the snake can never turn straight back
// into itself.

import { randomInt } from './rng.js';

export const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
export const FOOD_POINTS = 10;

// A random free cell for the next tulip (null if the snake fills the whole board).
function placeFood(game, rng) {
  const taken = new Set(game.snake.map((p) => p.y * game.cols + p.x));
  const free = [];
  for (let i = 0; i < game.cols * game.rows; i++) if (!taken.has(i)) free.push(i);
  if (!free.length) return null;
  const cell = free[randomInt(rng, free.length)];
  return { x: cell % game.cols, y: Math.floor(cell / game.cols) };
}

// wrap: true = the edges connect (you come out on the other side); false = walls hurt.
export function newGame({ cols = 20, rows = 15, wrap = false } = {}, rng = Math.random) {
  const y = Math.floor(rows / 2);
  const x = Math.floor(cols / 3);
  const game = {
    cols, rows, wrap,
    snake: [{ x: x + 2, y }, { x: x + 1, y }, { x, y }],   // the head comes first
    dir: 'right',
    queue: [],
    food: null,
    score: 0,
    alive: true,
    won: false,
  };
  game.food = placeFood(game, rng);
  return game;
}

// The player wants to go this way next.
export function turn(game, dir) {
  if (!DIRS[dir] || !game.alive) return;
  const planned = game.queue.length ? game.queue[game.queue.length - 1] : game.dir;
  if (dir === planned || dir === OPPOSITE[planned]) return;
  if (game.queue.length < 2) game.queue.push(dir);
}

// Move one cell. Returns 'move', 'eat', 'dead' or 'won'.
export function step(game, rng = Math.random) {
  if (!game.alive) return 'dead';
  if (game.queue.length) game.dir = game.queue.shift();
  const d = DIRS[game.dir];
  const head = game.snake[0];
  let x = head.x + d.x, y = head.y + d.y;
  if (game.wrap) {
    x = (x + game.cols) % game.cols;
    y = (y + game.rows) % game.rows;
  } else if (x < 0 || y < 0 || x >= game.cols || y >= game.rows) {
    game.alive = false;
    return 'dead';
  }
  const eating = Boolean(game.food) && game.food.x === x && game.food.y === y;
  // the tail moves away this step (unless we grow), so it is not an obstacle
  const body = eating ? game.snake : game.snake.slice(0, -1);
  if (body.some((p) => p.x === x && p.y === y)) {
    game.alive = false;
    return 'dead';
  }
  game.snake.unshift({ x, y });
  if (!eating) {
    game.snake.pop();
    return 'move';
  }
  game.score += FOOD_POINTS;
  game.food = placeFood(game, rng);
  if (!game.food) {
    game.won = true;
    game.alive = false;
    return 'won';
  }
  return 'eat';
}
