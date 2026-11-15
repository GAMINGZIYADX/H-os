// =============================================================================
// H-os — Electron main process
// -----------------------------------------------------------------------------
// The main process is the "backend" of the app. It:
//   1. creates the (fullscreen, frameless) window,
//   2. owns the dangerous stuff (quitting, later: the filesystem),
//   3. answers requests from the renderer (the "frontend" web page) via IPC.
//
// The renderer can NOT touch Node or the OS directly. It can only call the
// small whitelisted functions exposed by preload.js, which end up here.
// =============================================================================

const { app, BrowserWindow, Menu, globalShortcut, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const mainSettings = require('./mainSettings');
const mainFs = require('./mainFs');
const mainTerm = require('./mainTerm');
const { trusted } = require('./mainIpc');

// ---- Command-line flags (for development / testing) -------------------------
//   npm start                      -> real fullscreen H-os
//   npm run dev                    -> windowed + resizable, with F12 devtools
//   electron . --windowed --smoke=DIR -> windowed, runs smoke.js (plays with the UI using real
//                                     mouse/keyboard events, saves screenshots into DIR, exits)
const SELFTEST = process.argv.includes('--selftest'); // health check of the real app (selftest.js), then exit
const WINDOWED = process.argv.includes('--windowed') || SELFTEST;
const smokeArg = process.argv.find((a) => a === '--smoke' || a.startsWith('--smoke='));
const SMOKE = Boolean(smokeArg);
const SMOKE_DIR = smokeArg && smokeArg.includes('=') ? smokeArg.split('=')[1] : path.join(__dirname, 'smoke-output');

// The emergency exit keys. Works even if the renderer is frozen or crashed,
// because it is handled here in the main process. You can never be trapped.
const EMERGENCY_ACCELERATOR = 'CommandOrControl+Alt+Shift+Q';

// Smoke tests work on a throw-away sandbox folder next to the screenshots (NOT inside user-data, which is protected).
const SMOKE_SANDBOX = SMOKE_DIR + '-sandbox';
// Smoke tests use their own throw-away user-data folder, never your real settings.
if (SMOKE) app.setPath('userData', path.join(SMOKE_DIR, 'userdata'));
if (SELFTEST) app.setPath('userData', path.join(os.tmpdir(), 'h-os-selftest-' + process.pid)); // never touches your real settings
const rendererErrors = []; // collected for the self-test

let mainWindow = null;

// Becomes true only when we REALLY want to close (shutdown finished).
// Until then every attempt to close the window (Alt+F4, taskbar, etc.) is
// turned into a "Shut down?" question in the renderer instead.
let allowQuit = false;

// Only one H-os at a time (two fullscreen windows would be confusing).
if (!app.requestSingleInstanceLock()) {
  app.exit(0);
}

// ---- Window creation --------------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    fullscreen: !WINDOWED,
    frame: false, // no title bar / borders: H-os draws its own
    width: 1280, // only used in --windowed mode
    height: 800,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: '#fbe7ef', // matches the boot screen so there's no white flash
    show: false, // shown once the page is ready (see 'ready-to-show')
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // renderer JS lives in its own world
      nodeIntegration: false, // renderer has no `require`
      sandbox: true, // renderer is OS-sandboxed
      webSecurity: true,
      spellcheck: false,
      autoplayPolicy: 'no-user-gesture-required', // system sounds (the startup chime) may play without a click
    },
  });

  // No menu bar means no hidden Ctrl+R / Ctrl+W / devtools shortcuts.
  Menu.setApplicationMenu(null);

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // ---- Lockdown: H-os only ever shows its own local page -------------------
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // ---- Close handling: turn "close" into "ask to shut down" -----------------
  mainWindow.on('close', (event) => {
    if (!allowQuit) {
      event.preventDefault();
      requestShutdownDialog();
    }
  });

  // ---- Keyboard handling at the Electron level -----------------------------
  // `before-input-event` fires before the page sees the key, so the renderer
  // can't accidentally swallow these.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;

    // Backup for the emergency exit (in case the global shortcut failed to register).
    if (input.control && input.alt && input.shift && input.key.toLowerCase() === 'q') {
      event.preventDefault();
      emergencyExit();
      return;
    }

    // Alt+F4 -> open the shutdown dialog instead of killing the app.
    if (input.alt && input.key === 'F4') {
      event.preventDefault();
      requestShutdownDialog();
      return;
    }

    // Developer conveniences, only in --windowed mode.
    if (WINDOWED && input.key === 'F12') {
      mainWindow.webContents.toggleDevTools();
    }
  });

  forwardRendererLogs(mainWindow);
}

// Ask the renderer to show its "Shut down H-os?" dialog.
function requestShutdownDialog() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('os:shutdown-request');
  }
}

// Immediately leave, no questions asked. app.exit() skips all close handlers.
function emergencyExit() {
  allowQuit = true;
  mainTerm.killAll(); // app.exit() skips 'will-quit', so end any shells ourselves
  app.exit(0);
}

// Print renderer console output + load errors in the terminal that launched
// us. That's how we check for console errors without opening devtools.
function forwardRendererLogs(win) {
  const levels = ['LOG', 'WARN', 'ERROR', 'DEBUG'];
  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    // Newer Electron passes one details object, older passes separate args.
    if (typeof level === 'object' && level !== null) {
      const d = level;
      console.log(`[renderer:${String(d.level).toUpperCase()}] ${d.message} (${d.sourceId}:${d.lineNumber})`);
      if (String(d.level).toLowerCase() === 'error') rendererErrors.push(String(d.message).slice(0, 200));
    } else {
      console.log(`[renderer:${levels[level] || level}] ${message} (${sourceId}:${line})`);
    }
  });
  // If the page itself crashes the screen would stay blank (and closing is blocked): start the page again.
  let reloads = 0;
  win.webContents.on('render-process-gone', (e, details) => {
    console.log('[main] RENDERER GONE:', details.reason);
    if (details.reason !== 'clean-exit' && reloads++ < 3 && !win.isDestroyed()) setTimeout(() => win.webContents.reload(), 400);
  });
  win.webContents.on('preload-error', (e, file, err) => console.log('[main] PRELOAD ERROR:', file, err));
  win.webContents.on('did-fail-load', (e, code, desc, url) => console.log('[main] LOAD FAILED:', code, desc, url));
}

function safeUsername() {
  try { return os.userInfo().username; } catch { return 'friend'; }
}

// ---- IPC (requests from the renderer) --------------------------------------
// Channel names are namespaced ("os:..."), later "fs:...", "shell:...", "term:...".
function registerIpc() {
  // Renderer says: "the goodbye animation is done, really quit now".
  ipcMain.on('os:quit', (event) => {
    if (!trusted(event)) return;
    if (SMOKE) console.log('[smoke] OK: quit through the normal shutdown path');
    allowQuit = true;
    app.quit();
  });

  // Filesystem / shell / dialogs (mainFs.js). In smoke tests a folder inside the sandbox is declared
  // protected, so the guard can be tested for real without ever touching actual system folders.
  mainFs.register({ extraProtectedTrees: SMOKE ? [path.join(SMOKE_SANDBOX, 'protected-zone')] : [] });

  // Terminal sessions + clipboard (mainTerm.js).
  mainTerm.register();

  // Settings: load everything / save a partial update (validated in mainSettings.js).
  // (Like every other channel, these answer only to H-os's own page.)
  ipcMain.handle('settings:load', (event) => (trusted(event) ? mainSettings.load() : {}));
  ipcMain.handle('settings:save', (event, patch) => (trusted(event) ? mainSettings.save(patch) : {}));

  ipcMain.handle('os:get-info', (event) => !trusted(event) ? {} : ({
    version: app.getVersion(),
    username: safeUsername(),
    electron: process.versions.electron,
    platform: process.platform,
    windowed: WINDOWED,
  }));
}

// ---- App lifecycle ----------------------------------------------------------
app.whenReady().then(() => {
  registerIpc();
  createWindow();

  // Global emergency exit (works even if the window lost focus).
  const ok = globalShortcut.register(EMERGENCY_ACCELERATOR, emergencyExit);
  if (!ok) console.log('[main] could not register emergency shortcut (the in-window backup still works)');

  if (SELFTEST) require('./selftest').run({ win: mainWindow, app, exit: (code) => { allowQuit = true; app.exit(code); }, errors: rendererErrors });
  if (SMOKE) {
    require('./smoke').run({
      win: mainWindow,
      dir: SMOKE_DIR,
      sandbox: SMOKE_SANDBOX,
      fsapi: process.argv.includes('--smoke-fsapi'), // only test the filesystem API, then exit
      gamesOnly: process.argv.includes('--smoke-games'), // only the puzzle games
      exitOnly: process.argv.includes('--smoke-exit'), // test Alt+F4 / close / the emergency exit
      systemOnly: process.argv.includes('--smoke-system'), // only settings / panels / PIN / calculator / clock
      termOnly: process.argv.includes('--smoke-term'), // only test the Terminal (HOS_NO_PTY=1 = pipe mode)
      verify: process.argv.includes('--smoke-verify'), // 2nd run: check that settings survived
      requestShutdownDialog,
      emergencyExit,
      settingsPath: () => path.join(app.getPath('userData'), 'settings.json'),
    });
  }
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  mainTerm.killAll(); // never leave shells running after H-os closes
});
app.on('window-all-closed', () => app.quit());
