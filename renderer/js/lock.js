// lock.js — the lock screen: big clock, date, greeting, "Click to enter H-os".
// Click (or press Enter / Space) to continue. If you set a PIN in Settings, you are asked for
// it first (see pin.js; it is a cosy "tuck the tulips in", not real security).
// Returns a Promise that resolves once the lock screen has slid away.

import { el } from './dom.js';
import { createTulip } from './tulip.js';
import { formatClock, formatDate, greeting } from './clock.js';
import { hasPin, verifyPin } from './pin.js';
import { emit } from './events.js';

const HINT_AFTER_FAILS = 5;

export function showLock() {
  return new Promise((resolve) => {
    const lock = document.getElementById('lock');
    const timeEl = document.getElementById('lock-time');
    const dateEl = document.getElementById('lock-date');
    const greetEl = document.getElementById('lock-greeting');
    const iconSlot = document.getElementById('lock-enter-icon');
    const enterPill = lock.querySelector('.lock-enter');

    if (!iconSlot.firstElementChild) iconSlot.appendChild(createTulip('tulip-icon'));

    function updateClock() {
      const now = new Date();
      timeEl.textContent = formatClock(now);
      dateEl.textContent = formatDate(now);
      greetEl.textContent = greeting(now);
    }
    updateClock();
    const timer = setInterval(updateClock, 1000);

    // Remove a PIN box left over from an earlier visit.
    lock.querySelector('.lock-pin')?.remove();
    enterPill.hidden = false;
    lock.classList.remove('is-leaving');
    lock.hidden = false;
    lock.classList.add('is-entering');
    lock.focus();

    let finished = false;
    let askingPin = false;

    function finish() {
      if (finished) return;
      finished = true;
      clearInterval(timer);
      lock.removeEventListener('click', onClick);
      window.removeEventListener('keydown', onKey, true);
      lock.classList.add('is-leaving');
      setTimeout(() => {
        lock.hidden = true;
        lock.classList.remove('is-entering');
        lock.querySelector('.lock-pin')?.remove();
        resolve();
      }, 520);
    }

    // The PIN box: a field, a message, and a shake when you get it wrong.
    function askForPin() {
      if (askingPin) return;
      askingPin = true;
      enterPill.hidden = true;
      const box = el('div', 'lock-pin');
      const avatar = el('div', 'lock-pin-avatar');
      avatar.append(createTulip('tulip-icon'));
      const input = el('input', 'lock-pin-input');
      input.type = 'password';
      input.inputMode = 'numeric';
      input.maxLength = 8;
      input.placeholder = 'PIN';
      input.autocomplete = 'off';
      input.setAttribute('aria-label', 'PIN');
      const message = el('div', 'lock-pin-message', 'Enter your PIN');
      box.append(avatar, input, message);
      lock.append(box);
      input.focus();

      let fails = 0;
      let busy = false;
      input.addEventListener('keydown', async (e) => {
        e.stopPropagation();
        if (e.key !== 'Enter' || busy) return;
        e.preventDefault();
        busy = true;
        const ok = await verifyPin(input.value);
        busy = false;
        if (ok) { emit('sound:play', 'tick'); finish(); return; }
        fails++;
        input.value = '';
        box.classList.remove('is-shaking');
        void box.offsetWidth;
        box.classList.add('is-shaking');
        emit('sound:play', 'error');
        message.textContent = fails >= HINT_AFTER_FAILS
          ? 'Still locked out? Press Ctrl+Alt+Shift+Q to leave, then delete settings.json in your H-os data folder to reset the PIN.'
          : 'That is not the PIN. Try again.';
      });
      input.addEventListener('input', () => { input.value = input.value.replace(/[^0-9]/g, ''); });
    }

    function enter() {
      if (finished) return;
      if (hasPin()) askForPin();
      else finish();
    }

    function onClick(e) {
      if (e.target.closest('.lock-pin')) return; // clicking inside the PIN box does nothing
      enter();
    }
    function onKey(event) {
      if (askingPin) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        enter();
      }
    }

    lock.addEventListener('click', onClick);
    window.addEventListener('keydown', onKey, true);
  });
}
