// startmenu.js — the Start menu: search, pinned apps, recent files, user + power.
//
// It slides up from the taskbar. It closes when you pick something, click
// elsewhere, or press Escape. Typing while it is open searches apps AND your
// recent files; Enter opens the first result.

import { el } from './dom.js';
import { iconEl } from './icons.js';
import { listApps, launchApp } from './appRegistry.js';
import { getSetting, onSettingChange } from './settingsStore.js';
import { showContextMenu } from './contextMenu.js';
import { toast } from './notifications.js';
import { emit, on } from './events.js';
import { shutDown, restart, sleep } from './power.js';

let menu = null;
let searchInput = null;
let defaultView = null;   // pinned + recommended
let resultsView = null;   // search results
let pinnedGrid = null;
let recentList = null;
let userNameEl = null;
let open = false;
let firstResult = null;   // what Enter will do

export async function initStartMenu() {
  menu = document.getElementById('start-menu');
  menu.classList.add('is-closed');
  menu.inert = true;

  // ---- Search box ----
  const search = el('label', 'start-search');
  searchInput = el('input');
  searchInput.type = 'text';
  searchInput.placeholder = 'Search apps and files';
  searchInput.spellcheck = false;
  search.append(iconEl('search'), searchInput);
  searchInput.addEventListener('input', () => runSearch(searchInput.value));
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && firstResult) {
      e.preventDefault();
      firstResult();
    }
  });

  // ---- Default view: Pinned + Recommended ----
  defaultView = el('div', 'start-body');
  pinnedGrid = el('div', 'start-grid');
  recentList = el('div', 'start-recent');
  defaultView.append(el('h3', 'start-heading', 'Pinned'), pinnedGrid, el('h3', 'start-heading', 'Recommended'), recentList);

  // ---- Search results view ----
  resultsView = el('div', 'start-body start-results');
  resultsView.hidden = true;

  // ---- Footer: user + power ----
  const footer = el('div', 'start-footer');
  const user = el('div', 'start-user');
  const avatar = el('span', 'start-avatar');
  avatar.append(iconEl('tulip'));
  userNameEl = el('span', 'start-username', 'Friend');
  user.append(avatar, userNameEl);
  const powerBtn = el('button', 'start-power');
  powerBtn.title = 'Power';
  powerBtn.setAttribute('aria-label', 'Power');
  powerBtn.append(iconEl('power'));
  powerBtn.addEventListener('click', () => {
    const r = powerBtn.getBoundingClientRect();
    showContextMenu(r.right - 200, r.top - 6, [
      { label: 'Sleep', icon: 'sleep', onSelect: () => { closeStartMenu(); sleep(); } },
      { label: 'Restart', icon: 'restart', onSelect: () => { closeStartMenu(); restart(); } },
      { label: 'Shut down', icon: 'power', onSelect: () => { closeStartMenu(); shutDown(); } },
    ]);
  });
  footer.append(user, powerBtn);

  menu.append(search, defaultView, resultsView, footer);

  renderPinned();
  renderRecent();
  onSettingChange((k) => { if (k === 'recent') renderRecent(); });

  // Close when clicking outside (but not on the Start button, which toggles, or a menu).
  document.addEventListener('pointerdown', (e) => {
    if (!open) return;
    if (e.target.closest('#start-menu, [data-start-button], .ctx-menu')) return;
    closeStartMenu();
  }, true);
  document.addEventListener('keydown', (e) => {
    if (open && e.key === 'Escape') closeStartMenu();
  });

  // The name shown: the one chosen in Settings, else your computer's user name (first letter capitalised).
  let osName = 'Friend';
  try {
    const info = await window.hos.getInfo();
    if (info.username) osName = info.username.charAt(0).toUpperCase() + info.username.slice(1);
  } catch { /* running outside Electron: keep "Friend" */ }
  const showName = () => { userNameEl.textContent = getSetting('userName') || osName; };
  showName();
  onSettingChange((k) => { if (k === 'userName') showName(); });
  on('panels:opening', closeStartMenu);
}

function appButton(app, className) {
  const btn = el('button', className);
  btn.append(iconEl(app.icon), el('span', 'start-app-name', app.name));
  btn.title = app.name;
  btn.addEventListener('click', () => {
    closeStartMenu();
    launchApp(app.id);
  });
  return btn;
}

function renderPinned() {
  pinnedGrid.replaceChildren(...listApps().map((app) => appButton(app, 'start-app')));
}

function timeAgo(ms) {
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

function openRecent(entry) {
  closeStartMenu();
  // File apps (milestone 4) listen for this. If nobody does yet, say so nicely.
  if (emit('file:open', entry) === 0) {
    toast({ title: entry.name, message: 'Opening files arrives with File Explorer in milestone 4.', icon: 'explorer' });
  }
}

function recentRow(entry) {
  const row = el('button', 'start-recent-item');
  const text = el('span', 'start-recent-text');
  text.append(el('span', 'start-recent-name', entry.name), el('span', 'start-recent-time', timeAgo(entry.time)));
  row.append(iconEl('file'), text);
  row.title = entry.path;
  row.addEventListener('click', () => openRecent(entry));
  return row;
}

function renderRecent() {
  const recent = (getSetting('recent') || []).slice(0, 6);
  if (recent.length === 0) {
    const empty = el('div', 'start-empty');
    empty.append(iconEl('tulip'), el('span', '', 'Nothing here yet. Files you open will bloom here.'));
    recentList.replaceChildren(empty);
  } else {
    recentList.replaceChildren(...recent.map(recentRow));
  }
}

// ---- Search ----
function runSearch(raw) {
  const q = raw.trim().toLowerCase();
  firstResult = null;
  if (!q) {
    defaultView.hidden = false;
    resultsView.hidden = true;
    return;
  }
  defaultView.hidden = true;
  resultsView.hidden = false;

  const matches = listApps()
    .filter((a) => a.name.toLowerCase().includes(q) || a.keywords.toLowerCase().includes(q))
    .sort((a, b) => Number(b.name.toLowerCase().startsWith(q)) - Number(a.name.toLowerCase().startsWith(q)));
  const files = (getSetting('recent') || []).filter((f) => f.name.toLowerCase().includes(q));

  const rows = [el('h3', 'start-heading', 'Best match')];
  for (const app of matches) {
    const row = el('button', 'start-result');
    row.append(iconEl(app.icon), el('span', 'start-result-name', app.name), el('span', 'start-result-type', 'App'));
    row.addEventListener('click', () => { closeStartMenu(); launchApp(app.id); });
    rows.push(row);
  }
  for (const f of files) {
    const row = el('button', 'start-result');
    row.append(iconEl('file'), el('span', 'start-result-name', f.name), el('span', 'start-result-type', 'Recent file'));
    row.addEventListener('click', () => openRecent(f));
    rows.push(row);
  }
  if (matches.length + files.length === 0) {
    rows.length = 0;
    const empty = el('div', 'start-empty');
    empty.append(iconEl('tulip'), el('span', '', `No tulips found for “${raw.trim()}”.`));
    rows.push(empty);
  } else {
    firstResult = matches.length ? () => { closeStartMenu(); launchApp(matches[0].id); } : () => openRecent(files[0]);
  }
  resultsView.replaceChildren(...rows);
}

// ---- Open / close ----
export function isStartMenuOpen() {
  return open;
}

export function openStartMenu() {
  if (open) return;
  open = true;
  searchInput.value = '';
  runSearch('');
  emit('start:opened'); // flyout panels close themselves
  menu.inert = false;
  menu.classList.remove('is-closed');
  searchInput.focus();
}

export function closeStartMenu() {
  if (!open) return;
  open = false;
  menu.classList.add('is-closed');
  menu.inert = true;
  if (document.activeElement) document.activeElement.blur();
}

export function toggleStartMenu() {
  if (open) closeStartMenu();
  else openStartMenu();
}
