// =============================================================================
// panels.js — the two flyout panels above the taskbar's right side
// =============================================================================
//   Quick settings (click the wifi/volume/battery icons): dark mode, sounds, taskbar side,
//     do-not-disturb, volume + brightness sliders, battery.
//   Notification center (click the clock): your recent notifications and a calendar.
// Only one panel (or the Start menu) is open at a time. Click elsewhere or press Esc to close.

import { el } from './dom.js';
import { iconEl } from './icons.js';
import { on, emit } from './events.js';
import { getSetting, setSetting, onSettingChange } from './settingsStore.js';
import { launchApp } from './appRegistry.js';
import {
  getHistory, unreadCount, markAllRead, clearHistory, removeNotification, isDoNotDisturb, setDoNotDisturb,
} from './notifications.js';

let quick = null;
let center = null;
let openPanel = null; // 'quick' | 'center' | null

const timeAgo = (ms) => {
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
};

export function initPanels() {
  quick = buildQuickSettings();
  center = buildNotificationCenter();
  document.getElementById('shell').append(quick.root, center.root);

  on('quicksettings:toggle', () => toggle('quick'));
  on('notifications:toggle', () => toggle('center'));
  on('panels:close', closePanels);
  on('start:opened', closePanels);
  on('notifications:changed', () => { center.render(); updateBadge(); });
  onSettingChange(() => quick.sync());

  // click outside / Escape closes
  document.addEventListener('pointerdown', (e) => {
    if (!openPanel) return;
    if (e.target.closest('.panel, .tb-tray, .tb-clock, .ctx-menu')) return;
    closePanels();
  }, true);
  document.addEventListener('keydown', (e) => { if (openPanel && e.key === 'Escape') closePanels(); });
  updateBadge();
}

export function closePanels() {
  openPanel = null;
  for (const p of [quick, center]) {
    if (!p) continue;
    p.root.classList.add('is-closed');
    p.root.inert = true;
  }
}

function toggle(which) {
  if (openPanel === which) { closePanels(); return; }
  closePanels();
  emit('panels:opening'); // the Start menu closes itself
  openPanel = which;
  const p = which === 'quick' ? quick : center;
  p.sync();
  p.root.inert = false;
  p.root.classList.remove('is-closed');
  if (which === 'center') markAllRead();
}

// A little dot on the clock when there are unread notifications.
function updateBadge() {
  const clock = document.querySelector('.tb-clock');
  if (clock) clock.classList.toggle('has-unread', unreadCount() > 0);
}

// ---------------------------------------------------------------------------
// Quick settings
// ---------------------------------------------------------------------------
function buildQuickSettings() {
  const root = el('div', 'panel panel-quick is-closed');
  root.inert = true;

  const tiles = el('div', 'qs-tiles');
  const tileDefs = [
    { id: 'theme', icon: 'moon', label: 'Night garden', get: () => getSetting('theme') === 'dark', set: (v) => setSetting('theme', v ? 'dark' : 'light') },
    { id: 'sounds', icon: 'volume', label: 'Sounds', get: () => getSetting('sounds'), set: (v) => setSetting('sounds', v) },
    { id: 'left', icon: 'taskbar', label: 'Taskbar left', get: () => getSetting('taskbarAlign') === 'left', set: (v) => setSetting('taskbarAlign', v ? 'left' : 'center') },
    { id: 'dnd', icon: 'bell-off', label: 'Quiet mode', get: () => isDoNotDisturb(), set: (v) => setDoNotDisturb(v) },
  ];
  const tileNodes = tileDefs.map((def) => {
    const b = el('button', 'qs-tile');
    b.dataset.tile = def.id;
    b.append(iconEl(def.icon), el('span', '', def.label));
    b.addEventListener('click', () => { def.set(!def.get()); sync(); });
    tiles.append(b);
    return [def, b];
  });

  const slider = (icon, label, key, min, max) => {
    const row = el('label', 'qs-slider');
    const input = el('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.setAttribute('aria-label', label);
    input.addEventListener('input', () => setSetting(key, Number(input.value)));
    // a tiny preview chime when you let go of the volume slider
    if (key === 'volume') input.addEventListener('change', () => emit('sound:play', 'tick'));
    row.append(iconEl(icon), input);
    return { row, input, key };
  };
  const volume = slider('volume', 'Volume', 'volume', 0, 100);
  const brightness = slider('sun', 'Brightness', 'brightness', 40, 100);

  const footer = el('div', 'qs-footer');
  const battery = el('span', 'qs-battery');
  battery.append(iconEl('battery'), el('span', '', 'Plugged in'));
  const settingsBtn = el('button', 'ex-btn');
  settingsBtn.title = 'All settings';
  settingsBtn.setAttribute('aria-label', 'All settings');
  settingsBtn.append(iconEl('gear'));
  settingsBtn.addEventListener('click', () => { closePanels(); launchApp('settings'); });
  footer.append(battery, el('span', 'ex-spacer'), settingsBtn);

  root.append(tiles, volume.row, brightness.row, footer);

  function sync() {
    for (const [def, node] of tileNodes) node.classList.toggle('is-on', Boolean(def.get()));
    volume.input.value = String(getSetting('volume') ?? 70);
    brightness.input.value = String(getSetting('brightness') ?? 100);
  }

  // Battery info (laptops). Desktop computers just say "Plugged in".
  if (navigator.getBattery) {
    navigator.getBattery().then((b) => {
      const update = () => {
        const pct = Math.round(b.level * 100);
        battery.lastChild.textContent = b.charging ? `${pct}% · charging` : `${pct}%`;
        if (b.charging && pct >= 99) battery.lastChild.textContent = 'Plugged in';
      };
      update();
      b.addEventListener('levelchange', update);
      b.addEventListener('chargingchange', update);
    }).catch(() => {});
  }
  sync();
  return { root, sync };
}

// ---------------------------------------------------------------------------
// Notification center
// ---------------------------------------------------------------------------
function buildNotificationCenter() {
  const root = el('div', 'panel panel-center is-closed');
  root.inert = true;

  const head = el('div', 'nc-head');
  const clear = el('button', 'nc-clear', 'Clear all');
  clear.addEventListener('click', clearHistory);
  head.append(el('h3', '', 'Notifications'), clear);
  const list = el('div', 'nc-list');
  const calendarBox = el('div', 'nc-calendar');
  root.append(head, list, calendarBox);

  function render() {
    const items = getHistory();
    clear.hidden = items.length === 0;
    if (!items.length) {
      const empty = el('div', 'nc-empty');
      empty.append(iconEl('tulip'), el('span', '', 'All quiet. No new notifications.'));
      list.replaceChildren(empty);
      return;
    }
    list.replaceChildren(...items.map((n) => {
      const row = el('div', 'nc-item');
      const text = el('div', 'nc-text');
      text.append(el('div', 'nc-title', n.title));
      if (n.message) text.append(el('div', 'nc-message', n.message));
      text.append(el('div', 'nc-time', timeAgo(n.time)));
      const x = el('button', 'nc-x');
      x.title = 'Dismiss';
      x.setAttribute('aria-label', 'Dismiss');
      x.append(iconEl('close'));
      x.addEventListener('click', () => removeNotification(n.id));
      row.append(iconEl(n.icon, 'nc-icon'), text, x);
      return row;
    }));
  }

  // ---- calendar ----
  let shown = new Date();
  shown.setDate(1);
  function renderCalendar() {
    const today = new Date();
    const title = el('div', 'cal-title', shown.toLocaleDateString([], { month: 'long', year: 'numeric' }));
    const prev = el('button', 'ex-btn');
    prev.append(iconEl('back'));
    prev.title = 'Previous month';
    prev.addEventListener('click', () => { shown = new Date(shown.getFullYear(), shown.getMonth() - 1, 1); renderCalendar(); });
    const next = el('button', 'ex-btn');
    next.append(iconEl('forward'));
    next.title = 'Next month';
    next.addEventListener('click', () => { shown = new Date(shown.getFullYear(), shown.getMonth() + 1, 1); renderCalendar(); });
    const top = el('div', 'cal-top');
    top.append(title, prev, next);

    const grid = el('div', 'cal-grid');
    const first = new Date(shown.getFullYear(), shown.getMonth(), 1);
    const startOffset = (first.getDay() + 6) % 7; // weeks start on Monday
    for (const d of ['M', 'T', 'W', 'T', 'F', 'S', 'S']) grid.append(el('span', 'cal-dow', d));
    for (let i = 0; i < startOffset; i++) grid.append(el('span', 'cal-day is-pad'));
    const days = new Date(shown.getFullYear(), shown.getMonth() + 1, 0).getDate();
    for (let d = 1; d <= days; d++) {
      const cell = el('span', 'cal-day', String(d));
      if (d === today.getDate() && shown.getMonth() === today.getMonth() && shown.getFullYear() === today.getFullYear()) cell.classList.add('is-today');
      grid.append(cell);
    }
    calendarBox.replaceChildren(top, grid);
  }
  renderCalendar();
  render();

  return {
    root,
    render,
    sync() { shown = new Date(); shown.setDate(1); renderCalendar(); render(); },
  };
}
