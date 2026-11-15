// notifications.js — pop-up messages ("toasts") plus the history shown in the notification center.
//
//   toast({ title: 'Saved', message: 'notes.txt is safe', icon: 'notepad' })
//
// Every toast pops up in the bottom-right corner for a few seconds (click to dismiss) AND is
// remembered in the notification center (click the clock). "Do not disturb" (quick settings)
// keeps the pop-ups and the chime away but still records them.

import { el } from './dom.js';
import { iconEl } from './icons.js';
import { emit } from './events.js';

const MAX_VISIBLE = 4;
const MAX_HISTORY = 40;
let container = null;
let history = [];       // newest first: { id, title, message, icon, time, read }
let nextId = 1;
let doNotDisturb = false;

export const getHistory = () => history;
export const unreadCount = () => history.filter((n) => !n.read).length;
export const isDoNotDisturb = () => doNotDisturb;

export function setDoNotDisturb(on) {
  doNotDisturb = Boolean(on);
  emit('notifications:changed');
}
export function markAllRead() {
  history.forEach((n) => { n.read = true; });
  emit('notifications:changed');
}
export function clearHistory() {
  history = [];
  emit('notifications:changed');
}
export function removeNotification(id) {
  history = history.filter((n) => n.id !== id);
  emit('notifications:changed');
}

// `sound`: play the notification chime? By default only for longer-lived messages (errors, info), not for
// quick confirmations like "Copied".
export function toast({ title, message = '', icon = 'tulip', duration = 4500, sound = duration > 3500 }) {
  history.unshift({ id: nextId++, title, message, icon, time: Date.now(), read: false });
  history = history.slice(0, MAX_HISTORY);
  emit('notifications:changed');
  if (doNotDisturb) return () => {};
  if (sound) emit('sound:play', 'notify');

  if (!container) {
    container = el('div', 'toasts');
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }
  // Too many at once? Drop the oldest.
  while (container.children.length >= MAX_VISIBLE) container.firstElementChild.remove();

  const node = el('div', 'toast');
  const text = el('div', 'toast-text');
  text.append(el('div', 'toast-title', title));
  if (message) text.append(el('div', 'toast-message', message));
  node.append(iconEl(icon, 'toast-icon'), text);
  container.appendChild(node);

  let timer = null;
  function dismiss() {
    clearTimeout(timer);
    if (!node.isConnected) return;
    node.classList.add('is-leaving');
    setTimeout(() => node.remove(), 260);
  }
  node.addEventListener('click', dismiss);
  timer = setTimeout(dismiss, duration);
  return dismiss;
}
