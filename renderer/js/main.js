// main.js — the renderer's entry point.
//
// A "session" is: boot -> lock screen -> the shell (desktop + taskbar + Start menu).
// Restart replays it without quitting; Sleep replays just the lock screen.

import { loadSettings } from './settingsStore.js';
import * as settingsStore from './settingsStore.js';
import { registerBuiltinApps } from './apps/manifest.js';
import { runBoot } from './boot.js';
import { showLock } from './lock.js';
import { initPower } from './power.js';
import { initDesktop, layoutIcons } from './desktop.js';
import { initTaskbar } from './taskbar.js';
import { initWindowManager, debugWindows } from './windowManager.js';
import { registerWindowTest } from './apps/windowTest.js';
import { initStartMenu, closeStartMenu } from './startmenu.js';
import { closeContextMenu } from './contextMenu.js';
import * as events from './events.js';

const shell = document.getElementById('shell');

function showShell() {
  shell.hidden = false;
  shell.classList.remove('is-entering');
  void shell.offsetWidth; // restart the slide-in animation
  shell.classList.add('is-entering');
  layoutIcons(); // icons can only be measured once the shell is visible
}

function hideShell() {
  closeStartMenu();
  closeContextMenu();
  shell.hidden = true;
}

async function startSession() {
  hideShell();
  await runBoot();
  await showLock();
  showShell();
}

async function wakeFromSleep() {
  hideShell();
  await showLock();
  showShell();
}

async function init() {
  await loadSettings();           // theme, wallpaper, icon positions… from settings.json
  registerBuiltinApps();          // must come before the pieces that list apps
  registerWindowTest();           // temporary demo app for the window manager (removed later)
  initWindowManager();            // from now on launchApp() opens real windows
  initPower();
  initDesktop();
  initTaskbar();
  await initStartMenu();

  events.on('power:restart', startSession);
  events.on('power:wake', wakeFromSleep);

  // Development only (npm run dev): expose a few things so tests can poke at the shell.
  const info = window.hos ? await window.hos.getInfo() : { windowed: true };
  if (info.windowed) window.__hos = { events, settings: settingsStore, windows: debugWindows };

  await startSession();
}

init().catch((err) => console.error('H-os failed to start:', err));
