// boot.js — the startup screen: tulip blooms while a progress bar fills (~2.2s).
// Press any key (or click) to skip. Returns a Promise that resolves when done,
// so callers can simply write:  await runBoot();

import { createTulip } from './tulip.js';
import { emit } from './events.js';

const BOOT_MS = 2200;
const MESSAGES = ['Waking up the tulips…', 'Watering the desktop…', 'Almost in bloom…'];

export function runBoot() {
  return new Promise((resolve) => {
    const boot = document.getElementById('boot');
    const fill = document.getElementById('boot-bar-fill');
    const status = document.getElementById('boot-status');
    const slot = document.getElementById('boot-logo-slot');

    // Create the logo once; it is reused on every restart.
    if (!slot.firstElementChild) slot.appendChild(createTulip('boot-logo'));

    // Reset to the starting state. Removing and re-adding "is-running"
    // (with a forced reflow in between) restarts all the CSS animations.
    boot.hidden = false;
    boot.classList.remove('is-running', 'is-leaving');
    fill.style.transform = 'scaleX(0)';
    void boot.offsetWidth;
    boot.classList.add('is-running');
    emit('sound:play', 'startup');

    const startTime = performance.now();
    let frame = 0;
    let finished = false;

    // Called every animation frame (~60 times a second).
    function tick(now) {
      const t = Math.min((now - startTime) / BOOT_MS, 1);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // ease-in-out
      fill.style.transform = `scaleX(${eased})`;
      status.textContent = MESSAGES[Math.min(MESSAGES.length - 1, Math.floor(t * MESSAGES.length))];
      if (t < 1) frame = requestAnimationFrame(tick);
      else finish();
    }

    function finish() {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onSkip, true);
      window.removeEventListener('pointerdown', onSkip, true);
      fill.style.transform = 'scaleX(1)';
      boot.classList.add('is-leaving'); // fade out...
      setTimeout(() => {
        boot.hidden = true;             // ...then remove from layout
        resolve();
      }, 450);
    }

    function onSkip(event) {
      if (event.repeat) return; // ignore a key that is being held down
      finish();
    }

    window.addEventListener('keydown', onSkip, true);
    window.addEventListener('pointerdown', onSkip, true);
    frame = requestAnimationFrame(tick);
  });
}
