// gameKit.js — small helpers shared by the game apps (Number Match, Tulip Sweep, Tulip Merge, Snake…).
//
//   fmtTime(75)                          -> '01:15'
//   getBest('sweep', 'easy')             -> the saved personal best (a number) or null
//   recordBest('sweep', 'easy', 42, 'low')  -> true if 42 is a new record ('low' = smaller is better)
//   showWinCard(root, { title, message, actions })   -> the petals-and-card overlay
//   cssColor('--snake-head')             -> the real colour (for drawing on a canvas)
//
// Personal bests are kept in the "gameStats" setting. The main process only accepts the games and
// record names listed in GAME_STATS (mainSettings.js), so a new game must be added there too.

import { el } from '../dom.js';
import { iconEl } from '../icons.js';
import { getSetting, setSetting } from '../settingsStore.js';

// The falling petals use the palette from theme.css.
const PETAL_COLORS = ['var(--tulip-pink)', 'var(--tulip-rose)', 'var(--tulip-magenta)', 'var(--tulip-pink-light)', 'var(--lavender)', 'var(--sun)'];

export const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export function getBest(game, key) {
  const stats = getSetting('gameStats');
  const v = stats && stats[game] ? stats[game][key] : null;
  return Number.isInteger(v) && v > 0 ? v : null;
}

// Save `value` if it beats the old record. `better` is 'high' (scores) or 'low' (times, moves).
// Returns true when a new record was set.
export function recordBest(game, key, value, better = 'high') {
  value = Math.round(value);
  if (!Number.isFinite(value) || value < 1) return false;
  const old = getBest(game, key);
  const beats = old === null || (better === 'high' ? value > old : value < old);
  if (!beats) return false;
  const stats = { ...(getSetting('gameStats') || {}) };
  stats[game] = { ...(stats[game] || {}), [key]: value };
  setSetting('gameStats', stats);
  return true;
}

// Turn a CSS variable (or any colour) into a real colour string, for <canvas> drawing,
// which cannot use var(). It asks the browser by styling a hidden probe element.
export function cssColor(nameOrColor) {
  const probe = document.createElement('i');
  probe.style.color = nameOrColor.startsWith('--') ? `var(${nameOrColor})` : nameOrColor;
  probe.style.display = 'none';
  document.body.append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color;
}

// The celebration / game-over overlay: covers `root` (which must be position: relative).
//   actions: [{ label, primary, onClick }]   -> buttons on the card (every button also closes the overlay)
// Returns the overlay element; call .remove() to dismiss it.
export function showWinCard(root, { title, message, icon = 'tulip', petals = true, actions = [] }) {
  const layer = el('div', 'gk-win');
  if (petals) {
    for (let k = 0; k < 40; k++) {
      const petal = el('span', 'gk-petal');
      const size = 10 + Math.random() * 16;
      Object.assign(petal.style, {
        left: Math.random() * 100 + '%',
        width: size + 'px',
        height: size * 1.4 + 'px',
        background: PETAL_COLORS[k % PETAL_COLORS.length],
        animationDuration: 4 + Math.random() * 4 + 's',
        animationDelay: Math.random() * 2.5 + 's',
        '--drift': (Math.random() * 120 - 60) + 'px',
        '--spin': (Math.random() * 540 - 270) + 'deg',
      });
      layer.append(petal);
    }
  }
  const card = el('div', 'gk-win-card');
  card.append(iconEl(icon, 'gk-win-icon'), el('h2', '', title), el('p', '', message));
  const row = el('div', 'dialog-actions');
  let primary = null;
  for (const a of actions) {
    const b = el('button', 'btn' + (a.primary ? ' btn-primary' : ''), a.label);
    b.addEventListener('click', () => { layer.remove(); root.focus({ preventScroll: true }); if (a.onClick) a.onClick(); }); // keys keep working
    row.append(b);
    if (a.primary) primary = b;
  }
  card.append(row);
  layer.append(card);
  root.append(layer);
  if (primary) primary.focus({ preventScroll: true });
  return layer;
}
