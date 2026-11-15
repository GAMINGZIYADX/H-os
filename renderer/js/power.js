// power.js — shutting down H-os.
//
// The ONLY way out of the fullscreen app is:
//   ask ("Shut down H-os?") -> goodbye animation -> window.hos.quit()
// The main process calls us (via Alt+F4) through window.hos.onShutdownRequest.
// (Ctrl+Alt+Shift+Q is the emergency exit and is handled entirely in main.js.)

import { createTulip } from './tulip.js';

let dialogOpen = false;
let shuttingDown = false;

// Call once at startup: listens for Alt+F4 / window-close requests from main.js.
export function initPower() {
  if (window.hos) window.hos.onShutdownRequest(() => showShutdownDialog());
}

// Small helper: create an element with a class and text.
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
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

  dialog.append(
    icon,
    el('h2', '', 'Shut down H-os?'),
    el('p', '', "Your tulips will be tucked in for the night. Anything unsaved will be lost."),
    Object.assign(el('div', 'dialog-actions'), {}),
  );
  dialog.lastElementChild.append(stay, shutdown);
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

// Plays the goodbye animation, then really quits.
export function shutDown() {
  if (shuttingDown) return;
  shuttingDown = true;

  const goodbye = el('div', 'goodbye');
  goodbye.append(createTulip('boot-logo'), el('h2', '', 'Time to rest your tulips'));
  document.body.appendChild(goodbye);

  setTimeout(() => {
    if (window.hos) window.hos.quit();
    else console.log('H-os would quit now (not running inside Electron).');
  }, 2200);
}
