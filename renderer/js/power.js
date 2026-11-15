// power.js — Sleep, Restart and Shut down.
//
//   shutDown()  goodbye animation, then really quit  (the ONLY way out of the fullscreen app,
//               besides the Ctrl+Alt+Shift+Q emergency exit handled in main.js)
//   restart()   replays boot + lock WITHOUT quitting  (main.js listens for 'power:restart')
//   sleep()     dark screen until you click or press a key, then the lock screen
//               (main.js listens for 'power:wake')
//
// Alt+F4 / closing the window asks "Shut down H-os?" first (showShutdownDialog).

import { el } from './dom.js';
import { iconEl } from './icons.js';
import { createTulip } from './tulip.js';
import { emit } from './events.js';
import { flushSettings } from './settingsStore.js';

let dialogOpen = false;
let shuttingDown = false;
let sleeping = false;

// Call once at startup: listens for Alt+F4 / window-close requests from main.js.
export function initPower() {
  if (window.hos) window.hos.onShutdownRequest(() => showShutdownDialog());
}

// The "Shut down H-os?" question.
export function showShutdownDialog() {
  if (dialogOpen || shuttingDown) return;
  dialogOpen = true;

  const backdrop = el('div', 'dialog-backdrop');
  const dialog = el('div', 'dialog');
  dialog.setAttribute('role', 'alertdialog');
  dialog.setAttribute('aria-label', 'Shut down H-os');

  const icon = createTulip('tulip-icon');
  icon.classList.add('dialog-icon');

  const stay = el('button', 'btn', 'Stay');
  stay.dataset.action = 'stay';
  const shutdown = el('button', 'btn btn-primary', 'Shut down');
  shutdown.dataset.action = 'shutdown';
  const actions = el('div', 'dialog-actions');
  actions.append(stay, shutdown);

  dialog.append(
    icon,
    el('h2', '', 'Shut down H-os?'),
    el('p', '', 'Your tulips will be tucked in for the night. Anything unsaved will be lost.'),
    actions,
  );
  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);
  shutdown.focus(); // like Windows: Enter confirms

  function close() {
    dialogOpen = false;
    window.removeEventListener('keydown', onKey, true);
    backdrop.remove();
  }
  function onKey(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  }
  window.addEventListener('keydown', onKey, true);
  stay.addEventListener('click', close);
  backdrop.addEventListener('pointerdown', (e) => { if (e.target === backdrop) close(); });
  shutdown.addEventListener('click', () => {
    close();
    shutDown();
  });
}

// Plays the goodbye animation, saves settings, then really quits.
export function shutDown() {
  if (shuttingDown) return;
  shuttingDown = true;

  const goodbye = el('div', 'goodbye');
  goodbye.append(createTulip('boot-logo'), el('h2', '', 'Time to rest your tulips'));
  document.body.appendChild(goodbye);

  // Save settings while the animation plays, and wait for BOTH before quitting.
  Promise.all([flushSettings(), new Promise((resolve) => setTimeout(resolve, 2200))]).then(() => {
    if (window.hos) window.hos.quit();
    else console.log('H-os would quit now (not running inside Electron).');
  });
}

// Restart: same as a fresh start, but without leaving the app.
export function restart() {
  if (shuttingDown) return;
  emit('power:restart');
}

// Sleep: black screen; any click or key wakes up to the lock screen.
export function sleep() {
  if (sleeping || shuttingDown) return;
  sleeping = true;

  const screen = el('div', 'sleep-screen');
  const moon = iconEl('sleep', 'sleep-moon');
  screen.append(moon, el('p', 'sleep-text', 'Sleeping… click or press a key to wake'));
  document.body.appendChild(screen);

  // Ignore the first moment so the click that chose "Sleep" can't wake it instantly.
  let armed = false;
  setTimeout(() => { armed = true; }, 900);

  function wake(event) {
    if (!armed || event.repeat) return;
    window.removeEventListener('keydown', wake, true);
    window.removeEventListener('pointerdown', wake, true);
    screen.classList.add('is-waking');
    setTimeout(() => {
      screen.remove();
      sleeping = false;
    }, 400);
    emit('power:wake');
  }
  window.addEventListener('keydown', wake, true);
  window.addEventListener('pointerdown', wake, true);
}
