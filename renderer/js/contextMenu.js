// contextMenu.js — the right-click menu used everywhere (desktop, taskbar, power button…).
//
//   showContextMenu(x, y, [
//     { label: 'Open', icon: 'open', onSelect: () => … },
//     { separator: true },
//     { label: 'Change wallpaper', icon: 'wallpaper', submenu: [ {label:'Day', checked:true, onSelect}, … ] },
//     { label: 'Greyed out', disabled: true },
//   ]);
//
// Only one menu is open at a time. It closes on: choosing an item, clicking
// anywhere else, pressing Escape, or the window losing focus.

import { el } from './dom.js';
import { iconEl } from './icons.js';

let openMenus = []; // openMenus[0] = main menu, [1] = its submenu, …
let listenersOn = false;

export function closeContextMenu() {
  for (const m of openMenus) m.remove();
  openMenus = [];
  if (listenersOn) {
    document.removeEventListener('pointerdown', onOutsidePointerDown, true);
    document.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('blur', closeContextMenu);
    listenersOn = false;
  }
}

export function isContextMenuOpen() {
  return openMenus.length > 0;
}

export function showContextMenu(x, y, items) {
  closeContextMenu();
  const menu = buildMenu(items, 0);
  document.body.appendChild(menu);
  openMenus = [menu];
  placeMenu(menu, x, y);

  document.addEventListener('pointerdown', onOutsidePointerDown, true);
  document.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('blur', closeContextMenu);
  listenersOn = true;
}

function onOutsidePointerDown(event) {
  if (!event.target.closest('.ctx-menu')) closeContextMenu();
}

function onKeyDown(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeContextMenu();
  }
}

// Build one menu panel (used for the main menu and for each submenu).
function buildMenu(items, depth) {
  const menu = el('div', 'ctx-menu');
  menu.setAttribute('role', 'menu');

  for (const item of items) {
    if (item.separator) {
      menu.append(el('div', 'ctx-sep'));
      continue;
    }
    const row = el('div', 'ctx-item');
    row.setAttribute('role', 'menuitem');
    if (item.disabled) row.classList.add('is-disabled');

    const lead = el('span', 'ctx-lead');
    if (item.checked) lead.append(iconEl('check'));
    else if (item.icon) lead.append(iconEl(item.icon));
    row.append(lead, el('span', 'ctx-label', item.label));
    if (item.submenu) row.append(iconEl('chevron', 'ctx-arrow'));

    // Hovering a row closes any submenu from a sibling and opens its own.
    row.addEventListener('pointerenter', () => {
      closeSubmenusFrom(depth + 1);
      if (item.submenu && !item.disabled) openSubmenu(row, item.submenu, depth + 1);
    });
    row.addEventListener('click', (event) => {
      event.stopPropagation();
      if (item.disabled || item.submenu) return;
      closeContextMenu();
      if (item.onSelect) item.onSelect();
    });
    menu.append(row);
  }
  return menu;
}

function openSubmenu(row, items, depth) {
  const sub = buildMenu(items, depth);
  document.body.appendChild(sub);
  openMenus[depth] = sub;
  row.classList.add('is-open');
  const r = row.getBoundingClientRect();
  placeMenu(sub, r.right - 4, r.top - 6, r.left + 4); // flips to the left side if no room
}

function closeSubmenusFrom(depth) {
  while (openMenus.length > depth) openMenus.pop().remove();
  for (const m of openMenus) m.querySelectorAll('.ctx-item.is-open').forEach((r) => r.classList.remove('is-open'));
}

// Put a menu at (x, y) but keep it fully on screen.
// `flipX` is the x to use instead when the menu would run off the right edge.
function placeMenu(menu, x, y, flipX = null) {
  const margin = 8;
  const w = menu.offsetWidth;
  const h = menu.offsetHeight;
  let left = x;
  if (left + w > window.innerWidth - margin) left = flipX !== null ? flipX - w : window.innerWidth - w - margin;
  let top = y;
  if (top + h > window.innerHeight - margin) top = Math.max(margin, y - h);
  menu.style.left = Math.max(margin, left) + 'px';
  menu.style.top = Math.max(margin, top) + 'px';
}
