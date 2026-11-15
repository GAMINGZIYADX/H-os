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

// ---- Command-line flags (for development / testing) -------------------------
//   npm start                      -> real fullscreen H-os
//   npm run dev                    -> windowed + resizable, with F12 devtools
//   electron . --windowed --smoke=DIR -> windowed, takes screenshots into DIR, exits
const WINDOWED = process.argv.includes('--windowed');
const smokeArg = process.argv.find((a) => a.startsWith('--smoke'));
const SMOKE = Boolean(smokeArg);
const SMOKE_DIR = smokeArg && smokeArg.includes('=') ? smokeArg.split('=')[1] : path.join(__dirname, 'smoke-output');

// The emergency exit keys. Works even if the renderer is frozen or crashed,
// because it is handled here in the main process. You can never be trapped.
const EMERGENCY_ACCELERATOR = 'CommandOrControl+Alt+Shift+Q';

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
    } else {
      console.log(`[renderer:${levels[level] || level}] ${message} (${sourceId}:${line})`);
    }
  });
  win.webContents.on('render-process-gone', (e, details) => console.log('[main] RENDERER GONE:', details.reason));
  win.webContents.on('preload-error', (e, file, err) => console.log('[main] PRELOAD ERROR:', file, err));
  win.webContents.on('did-fail-load', (e, code, desc, url) => console.log('[main] LOAD FAILED:', code, desc, url));
}

// ---- IPC (requests from the renderer) --------------------------------------
// Channel names are namespaced ("os:..."), later "fs:...", "shell:...", "term:...".
function registerIpc() {
  // Renderer says: "the goodbye animation is done, really quit now".
  ipcMain.on('os:quit', () => {
    if (SMOKE) console.log('[smoke] OK: quit through the normal shutdown path');
    allowQuit = true;
    app.quit();
  });

  ipcMain.handle('os:get-info', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    platform: process.platform,
    windowed: WINDOWED,
  }));
}

// ---- Smoke test: screenshots + auto-exit (development helper) ---------------
// Plays the whole flow by itself and saves screenshots so we can SEE the result
// without sitting in front of the screen:
//   boot -> lock (3 wallpapers) -> desktop -> Alt+F4 dialog (dark theme) -> goodbye -> quit.
// The final quit must happen through the NORMAL shutdown path; if it doesn't,
// the failsafe fires and the run is reported as failed.
let quitViaShutdown = false;
function runSmokeTest() {
  fs.mkdirSync(SMOKE_DIR, { recursive: true });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => mainWindow.webContents.executeJavaScript(code);
  const snap = async (name) => {
    // capturePage can hand back the PREVIOUS frame when the window is behind
    // other windows, so grab one, wait a moment, and keep the second.
    await mainWindow.webContents.capturePage();
    await sleep(250);
    const image = await mainWindow.webContents.capturePage();
    fs.writeFileSync(path.join(SMOKE_DIR, name), image.toPNG());
    console.log('[smoke] saved', name);
  };

  // If the normal shutdown path is broken we must not hang forever.
  setTimeout(() => {
    console.log('[smoke] FAILED: app did not quit by itself (shutdown path broken)');
    emergencyExit();
  }, 25000);

  mainWindow.webContents.once('did-finish-load', async () => {
    try {
      await sleep(1300); await snap('1-boot.png');
      await sleep(3300); await snap('2-lock-day.png');
      await js("document.documentElement.dataset.wallpaper='dusk'");
      await sleep(900);  await snap('3-lock-dusk.png');
      await js("document.documentElement.dataset.wallpaper='pastel'");
      await sleep(900);  await snap('4-lock-pastel.png');
      await js("document.documentElement.dataset.wallpaper='day'");
      await js("document.getElementById('lock').click()");
      await sleep(1200); await snap('5-desktop.png');
      await js("document.documentElement.dataset.theme='dark'; document.documentElement.dataset.wallpaper='dusk'");
      requestShutdownDialog(); // same path Alt+F4 takes
      await sleep(700);  await snap('6-shutdown-dialog-dark.png');
      const fontOk = await js("document.fonts.check('700 16px Nunito')");
      console.log('[smoke] Nunito font loaded:', fontOk);
      await js("document.querySelector('[data-action=shutdown]').click()");
      await sleep(1300); await snap('7-goodbye.png');
      quitViaShutdown = true; // from here the app must quit on its own
    } catch (err) {
      console.log('[smoke] ERROR', err);
    }
  });
}

// ---- App lifecycle ----------------------------------------------------------
app.whenReady().then(() => {
  registerIpc();
  createWindow();

  // Global emergency exit (works even if the window lost focus).
  const ok = globalShortcut.register(EMERGENCY_ACCELERATOR, emergencyExit);
  if (!ok) console.log('[main] could not register emergency shortcut (the in-window backup still works)');

  if (SMOKE) runSmokeTest();
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
