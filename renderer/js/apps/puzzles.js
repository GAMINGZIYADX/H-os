// apps/puzzles.js — the Puzzles hub: a window listing every game.
// A game appears here when its app is registered with  category: 'puzzle'  (and a description),
// so adding a new game later means just registering it, nothing to change in this file.

import { el } from '../dom.js';
import { iconEl } from '../icons.js';
import { registerApp, listApps, launchApp } from '../appRegistry.js';

function create(container, ctx) {
  ctx.setTitle('Puzzles');
  const root = el('div', 'pz');
  root.append(el('h2', 'pz-title', 'Puzzles & games'), el('p', 'pz-sub', 'Pick something to play. More games are always easy to add.'));

  const grid = el('div', 'pz-grid');
  const games = listApps().filter((a) => a.category === 'puzzle');
  for (const game of games) {
    const card = el('button', 'pz-card');
    card.append(iconEl(game.icon, 'pz-icon'));
    const text = el('div', 'pz-text');
    text.append(el('div', 'pz-name', game.name), el('div', 'pz-desc', game.description || ''));
    card.append(text);
    card.addEventListener('click', () => launchApp(game.id));
    grid.append(card);
  }
  root.append(grid);
  container.append(root);
  return {};
}

export function registerPuzzlesHub() {
  registerApp({
    id: 'puzzles',
    name: 'Puzzles',
    icon: 'puzzles',
    desktop: true,
    keywords: 'games sudoku chess play puzzles',
    defaultSize: { w: 560, h: 420 },
    minSize: { w: 360, h: 260 },
    singleInstance: true,
    create,
  });
}
