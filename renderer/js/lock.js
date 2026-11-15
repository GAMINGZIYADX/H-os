// lock.js — the lock screen: big clock, date, greeting, "Click to enter H-os".
// There is no real password. Click (or press Enter / Space) to continue.
// Returns a Promise that resolves once the lock screen has slid away.

import { createTulip } from './tulip.js';
import { formatClock, formatDate, greeting } from './clock.js';

export function showLock() {
  return new Promise((resolve) => {
    const lock = document.getElementById('lock');
    const timeEl = document.getElementById('lock-time');
    const dateEl = document.getElementById('lock-date');
    const greetEl = document.getElementById('lock-greeting');
    const iconSlot = document.getElementById('lock-enter-icon');

    if (!iconSlot.firstElementChild) iconSlot.appendChild(createTulip('tulip-icon'));

    function updateClock() {
      const now = new Date();
      timeEl.textContent = formatClock(now);
      dateEl.textContent = formatDate(now);
      greetEl.textContent = greeting(now);
    }
    updateClock();
    const timer = setInterval(updateClock, 1000);

    lock.classList.remove('is-leaving');
    lock.hidden = false;
    lock.classList.add('is-entering');
    lock.focus();

    let entered = false;
    function enter() {
      if (entered) return;
      entered = true;
      clearInterval(timer);
      lock.removeEventListener('click', enter);
      window.removeEventListener('keydown', onKey, true);
      lock.classList.add('is-leaving');
      setTimeout(() => {
        lock.hidden = true;
        lock.classList.remove('is-entering');
        resolve();
      }, 520);
    }
    function onKey(event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        enter();
      }
    }

    lock.addEventListener('click', enter);
    window.addEventListener('keydown', onKey, true);
  });
}
