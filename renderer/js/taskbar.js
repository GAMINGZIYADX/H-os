// taskbar.js — the bar along the bottom of the screen.
//
//   [ left: empty ]   [ Start · pinned apps · running apps ]   [ tray · clock · show-desktop ]
//
// The centre group is the Start button plus one button per app. An app gets a
// button if it is pinned (setting 'pinned') OR has an open window. The little
// bar under a button means "running"; a longer pink bar means "focused".
//
// Running windows come from the window manager (milestone 3) as an event:
//   emit('windows:changed', [{ id, appId, title, focused, minimized }])
// and clicks go back out as events ('window:toggle', 'window:close', 'desktop:show'),
// so this file never needs to know how windows are implemented.

import { el } from './dom.js';
import { iconEl } from './icons.js';
import { createTulip } from './tulip.js';
import { getApp, launchApp } from './appRegistry.js';
import { getSetting, setSetting, onSettingChange } from './settingsStore.js';
import { on, emit } from './events.js';
import { showContextMenu } from './contextMenu.js';
import { toggleStartMenu } from './startmenu.js';

let windows = [];            // latest list from the window manager
let centerGroup = null;
let startButton = null;
let timeEl = null;
let dateEl = null;

export function initTaskbar() {
  const bar = document.getElementById('taskbar');

  // ---- Centre: Start button + app buttons ----
  centerGroup = el('div', 'taskbar-center');
  startButton = el('button', 'tb-btn start-btn');
  startButton.dataset.startButton = 'true';
  startButton.title = 'Start';
  startButton.setAttribute('aria-label', 'Start');
  startButton.append(createTulip('tulip-icon'));
  startButton.addEventListener('click', toggleStartMenu);

  // ---- Right: tray icons, clock, show-desktop sliver ----
  const right = el('div', 'taskbar-right');
  const tray = el('button', 'tb-tray');
  tray.title = 'Quick settings';
  tray.append(iconEl('wifi'), iconEl('volume'), iconEl('battery'));
  tray.addEventListener('click', () => emit('quicksettings:toggle')); // panel arrives in milestone 7

  const clock = el('button', 'tb-clock');
  timeEl = el('div', 'tb-time');
  dateEl = el('div', 'tb-date');
  clock.append(timeEl, dateEl);
  clock.title = 'Notifications and calendar';
  clock.addEventListener('click', () => emit('notifications:toggle'));

  const showDesktop = el('button', 'tb-show-desktop');
  showDesktop.title = 'Show desktop';
  showDesktop.setAttribute('aria-label', 'Show desktop');
  showDesktop.addEventListener('click', () => emit('desktop:show'));

  right.append(tray, clock, showDesktop);
  bar.append(centerGroup, right);

  renderApps();
  updateClock();
  setInterval(updateClock, 1000);

  on('windows:changed', (list) => {
    windows = list || [];
    renderApps();
  });
  onSettingChange((key) => {
    if (key === 'pinned') renderApps();
  });
}

function updateClock() {
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const date = now.toLocaleDateString([], { month: 'numeric', day: 'numeric', year: 'numeric' });
  if (timeEl.textContent !== time) timeEl.textContent = time;
  if (dateEl.textContent !== date) dateEl.textContent = date;
}

// Rebuild the app buttons (cheap: there are only a handful).
function renderApps() {
  const pinned = getSetting('pinned') || [];
  const ids = [...pinned];
  for (const w of windows) if (!ids.includes(w.appId)) ids.push(w.appId);

  const buttons = [];
  for (const id of ids) {
    const app = getApp(id);
    if (!app) continue;
    const wins = windows.filter((w) => w.appId === id);
    const btn = el('button', 'tb-btn');
    btn.dataset.appId = id;
    btn.title = app.name;
    btn.setAttribute('aria-label', app.name);
    btn.append(iconEl(app.icon));
    if (wins.length) btn.classList.add('is-running');
    if (wins.some((w) => w.focused && !w.minimized)) btn.classList.add('is-active');

    btn.addEventListener('click', () => {
      if (wins.length === 0) return launchApp(id);
      // Click a running app: focus it, or minimize it if it is already in front.
      const target = wins.find((w) => w.focused) || wins[wins.length - 1];
      emit('window:toggle', target.id);
    });
    btn.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      showAppMenu(event.clientX, event.clientY, id, wins);
    });
    buttons.push(btn);
  }
  centerGroup.replaceChildren(startButton, ...buttons);
}

function showAppMenu(x, y, id, wins) {
  const pinned = getSetting('pinned') || [];
  const isPinned = pinned.includes(id);
  const items = [{ label: 'Open new window', icon: 'open', onSelect: () => launchApp(id) }];
  if (wins.length) {
    items.push({
      label: wins.length === 1 ? 'Close window' : `Close all ${wins.length} windows`,
      icon: 'close',
      onSelect: () => wins.forEach((w) => emit('window:close', w.id)),
    });
  }
  items.push({ separator: true });
  items.push({
    label: isPinned ? 'Unpin from taskbar' : 'Pin to taskbar',
    icon: 'pin',
    onSelect: () => setSetting('pinned', isPinned ? pinned.filter((p) => p !== id) : [...pinned, id]),
  });
  showContextMenu(x, y, items);
}
