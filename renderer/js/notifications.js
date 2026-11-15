// notifications.js — little pop-up messages ("toasts") in the bottom-right corner.
//
//   toast({ title: 'Saved', message: 'notes.txt is safe', icon: 'notepad' })
//
// Milestone 7 adds an action center that remembers them; for now they just
// appear and fade away after a few seconds (click one to dismiss it).

import { el } from './dom.js';
import { iconEl } from './icons.js';

const MAX_VISIBLE = 4;
let container = null;

export function toast({ title, message = '', icon = 'tulip', duration = 4500 }) {
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
