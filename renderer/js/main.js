// main.js — the renderer's entry point. Runs the "session": boot -> lock -> desktop.
//
// Each screen lives in its own small module and returns a Promise, so the whole
// startup reads top-to-bottom like a story (see startSession below).

import { applyAppearance } from './appearance.js';
import { runBoot } from './boot.js';
import { showLock } from './lock.js';
import { initPower, showShutdownDialog } from './power.js';
import { createTulip } from './tulip.js';

const desktop = document.getElementById('desktop');

// Boot, then lock, then reveal the desktop.
async function startSession() {
  desktop.hidden = true;
  await runBoot();
  await showLock();
  desktop.hidden = false;
}

async function init() {
  applyAppearance({}); // defaults for now; milestone 2 loads saved settings here
  initPower();

  document.getElementById('desktop-icon').appendChild(createTulip('tulip-icon'));
  document.querySelector('#desktop-icon svg').style.width = '56px';

  // Temporary buttons on the welcome card (they move into the Start menu in milestone 2).
  document.getElementById('btn-shutdown').addEventListener('click', showShutdownDialog);
  document.getElementById('btn-restart').addEventListener('click', startSession);

  await startSession();
}

init().catch((err) => console.error('H-os failed to start:', err));
