// main.js — the renderer's entry point.
//
// A "session" is: boot -> lock screen -> the shell (desktop + taskbar + Start menu).
// Restart replays it without quitting; Sleep replays just the lock screen.
//
// Each app is a module with a registerXxx() function that adds it to the app registry
// (appRegistry.js). To add an app: write apps/myapp.js and call its register function below.

import { loadSettings } from './settingsStore.js';
import * as settingsStore from './settingsStore.js';
import { registerBuiltinApps } from './apps/manifest.js';
import { runBoot } from './boot.js';
import { showLock } from './lock.js';
import { initPower } from './power.js';
import { initSounds, playSound } from './sounds.js';
import { initDesktop, layoutIcons } from './desktop.js';
import { initTaskbar } from './taskbar.js';
import { initPanels, closePanels } from './panels.js';
import { initWindowManager, debugWindows } from './windowManager.js';
import { registerWindowTest } from './apps/windowTest.js';
import { registerExplorer } from './apps/explorer.js';
import { registerNotepad } from './apps/notepad.js';
import { registerImageViewer } from './apps/imageviewer.js';
import { registerRecycleBin } from './apps/recycle.js';
import { registerTerminal } from './apps/terminal.js';
import { registerSudoku } from './apps/sudoku.js';
import { registerChess } from './apps/chess.js';
import { registerNumberMatch } from './apps/numbermatch.js';
import { registerSweep } from './apps/sweep.js';
import { registerMerge } from './apps/merge.js';
import { registerSnake } from './apps/snake.js';
import { registerMemory } from './apps/memory.js';
import { registerBloom } from './apps/bloom.js';
import { registerPuzzlesHub } from './apps/puzzles.js';
import { registerSettings } from './apps/settings.js';
import { registerCalculator } from './apps/calculator.js';
import { registerClock } from './apps/clockapp.js';
import { openFileSmart } from './fileOpen.js';
import { toast } from './notifications.js';
import { launchApp } from './appRegistry.js';
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
  closePanels();
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
  const info = window.hos ? await window.hos.getInfo() : { windowed: true };

  // Apps (the order only matters for the Puzzles hub, which lists the games registered before it)
  registerBuiltinApps();
  registerExplorer();
  registerNotepad();
  registerImageViewer();
  registerRecycleBin();
  registerTerminal();
  registerSudoku();
  registerChess();
  registerNumberMatch();
  registerSweep();
  registerMerge();
  registerSnake();
  registerMemory();
  registerBloom();
  registerPuzzlesHub();
  registerSettings();
  registerCalculator();
  registerClock();
  if (info.windowed) registerWindowTest(); // a demo app for testing the window manager: development only

  // The shell
  initSounds();
  initWindowManager();            // from now on launchApp() opens real windows
  initPower();
  initDesktop();
  initTaskbar();
  initPanels();
  await initStartMenu();

  events.on('file:open', (entry) => openFileSmart(entry.path)); // from the Start menu's Recommended list
  events.on('power:restart', startSession);
  events.on('power:wake', wakeFromSleep);

  // Development only (npm run dev): expose a few things so tests can poke at the shell.
  if (info.windowed) window.__hos = { events, settings: settingsStore, windows: debugWindows, launch: launchApp, toast, playSound };

  await startSession();
}

init().catch((err) => console.error('H-os failed to start:', err));
