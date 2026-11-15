// ui/dialogs.js — modal dialogs that return a Promise.
//
//   const answer = await showDialog({
//     title: 'Delete?', message: 'Are you sure?', icon: 'trash',
//     buttons: [{ label: 'Cancel', value: 'no' }, { label: 'Delete', value: 'yes', primary: true, danger: true }],
//     cancelValue: 'no',          // what Esc / clicking outside answers
//   });
//
// Helpers: confirmDialog() -> true/false, alertDialog() -> waits for OK.
// Enter presses the focused button (the primary one starts focused), Esc cancels,
// Tab stays inside the dialog.

import { el } from '../dom.js';
import { iconEl } from '../icons.js';

export function showDialog({ title, message = '', content = null, icon = 'tulip', buttons, cancelValue = null, width = 400 }) {
  return new Promise((resolve) => {
    const previouslyFocused = document.activeElement;
    const backdrop = el('div', 'dialog-backdrop');
    const dialog = el('div', 'dialog');
    dialog.style.width = `min(${width}px, 92vw)`;
    dialog.setAttribute('role', 'alertdialog');
    dialog.setAttribute('aria-label', title);

    const iconNode = iconEl(icon, 'dialog-icon');
    dialog.append(iconNode, el('h2', '', title));
    if (message) dialog.append(el('p', 'dialog-message', message));
    if (content) dialog.append(content);

    const actions = el('div', 'dialog-actions');
    const nodes = buttons.map((b) => {
      const btn = el('button', 'btn' + (b.primary ? ' btn-primary' : '') + (b.danger ? ' btn-danger' : ''), b.label);
      btn.addEventListener('click', () => finish(b.value));
      actions.append(btn);
      return btn;
    });
    dialog.append(actions);
    backdrop.append(dialog);
    document.body.append(backdrop);
    (nodes[buttons.findIndex((b) => b.primary)] || nodes[nodes.length - 1]).focus();

    function finish(value) {
      window.removeEventListener('keydown', onKey, true);
      backdrop.remove();
      if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus({ preventScroll: true });
      resolve(value);
    }

    function onKey(event) {
      // Only the top-most dialog reacts.
      const all = document.querySelectorAll('.dialog-backdrop');
      if (all[all.length - 1] !== backdrop) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        finish(cancelValue);
      } else if (event.key === 'Tab') {
        const focusable = [...dialog.querySelectorAll('button, input, [tabindex]')];
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    window.addEventListener('keydown', onKey, true);
    backdrop.addEventListener('pointerdown', (e) => { if (e.target === backdrop) finish(cancelValue); });
  });
}

export function confirmDialog({ title, message, confirmLabel = 'OK', cancelLabel = 'Cancel', danger = false, icon = 'tulip' }) {
  return showDialog({
    title, message, icon, cancelValue: false,
    buttons: [{ label: cancelLabel, value: false }, { label: confirmLabel, value: true, primary: true, danger }],
  });
}

export function alertDialog(title, message, icon = 'tulip') {
  return showDialog({ title, message, icon, buttons: [{ label: 'OK', value: true, primary: true }], cancelValue: true });
}
