// =============================================================================
// H-os smoke test (development helper, run with: npm run smoke)
// -----------------------------------------------------------------------------
// Drives the real app with REAL mouse and keyboard events (webContents.sendInputEvent),
// saves screenshots, and prints "[smoke] CHECK <name>: PASS/FAIL" lines.
//
//   run 1:  electron . --windowed --smoke=DIR                 plays through everything
//   run 2:  electron . --windowed --smoke=DIR --smoke-verify  checks settings survived a restart
// =============================================================================

const fs = require('fs');
const path = require('path');

exports.run = function run({ win, dir, verify, settingsPath, sandbox, fsapi, termOnly }) {
  const wc = win.webContents;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => wc.executeJavaScript(code);
  let failures = 0;

  function check(name, ok, extra = '') {
    if (!ok) failures++;
    console.log(`[smoke] CHECK ${name}: ${ok ? 'PASS' : 'FAIL'} ${extra}`);
  }

  // capturePage can return the PREVIOUS frame when the window is behind other windows,
  // so grab one, wait a moment, and keep the second.
  async function snap(name) {
    await wc.capturePage();
    await sleep(250);
    const image = await wc.capturePage();
    fs.writeFileSync(path.join(dir, name), image.toPNG());
    console.log('[smoke] saved', name);
  }

  // ---- real input helpers ----
  const mouse = (type, x, y, extra = {}) =>
    wc.sendInputEvent({ type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1, ...extra });
  async function click(x, y, button = 'left', clickCount = 1) {
    mouse('mouseMove', x, y);
    await sleep(40);
    wc.sendInputEvent({ type: 'mouseDown', x: Math.round(x), y: Math.round(y), button, clickCount });
    wc.sendInputEvent({ type: 'mouseUp', x: Math.round(x), y: Math.round(y), button, clickCount });
    await sleep(120);
  }
  async function drag(x1, y1, x2, y2, { release = true } = {}) {
    mouse('mouseMove', x1, y1);
    mouse('mouseDown', x1, y1);
    const steps = 12;
    for (let i = 1; i <= steps; i++) {
      mouse('mouseMove', x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps, { modifiers: ['leftButtonDown'] });
      await sleep(16);
    }
    if (release) mouse('mouseUp', x2, y2);
    await sleep(250);
  }
  async function key(keyCode, modifiers = []) {
    wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    await sleep(120);
  }
  async function type(text) {
    for (const ch of text) {
      const code = ch === ' ' ? 'Space' : ch;
      const modifiers = /[A-Z]/.test(ch) ? ['shift'] : []; // capitals need Shift (terminals read key events, not text)
      wc.sendInputEvent({ type: 'keyDown', keyCode: code, modifiers });
      wc.sendInputEvent({ type: 'char', keyCode: ch, modifiers });
      wc.sendInputEvent({ type: 'keyUp', keyCode: code, modifiers });
      await sleep(25);
    }
  }
  // press + release at a point (clickCount 2 = a proper double-click), optionally with Ctrl/Shift held
  function mouseDownUp(x, y, modifiers = [], clickCount = 1) {
    for (let c = 1; c <= clickCount; c++) {
      wc.sendInputEvent({ type: 'mouseDown', x: Math.round(x), y: Math.round(y), button: 'left', clickCount: c, modifiers });
      wc.sendInputEvent({ type: 'mouseUp', x: Math.round(x), y: Math.round(y), button: 'left', clickCount: c, modifiers });
    }
  }

  // centre of the first element matching a CSS selector (optionally containing some text)
  async function center(selector, text = '') {
    const r = await js(`(() => {
      const els = [...document.querySelectorAll(${JSON.stringify(selector)})];
      const e = els.find((n) => n.textContent.includes(${JSON.stringify(text)}));
      if (!e) return null;
      const b = e.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    })()`);
    return r;
  }
  async function clickOn(selector, text = '', button = 'left') {
    const c = await center(selector, text);
    if (!c) { check(`found ${selector} ${text}`, false); return null; }
    await click(c.x, c.y, button);
    return c;
  }
  const iconRects = () =>
    js(`Object.fromEntries([...document.querySelectorAll('.desk-icon')].map((e) => { const b = e.getBoundingClientRect(); return [e.dataset.appId, { x: Math.round(b.left), y: Math.round(b.top) }]; }))`);

  // If the normal shutdown path is broken we must not hang forever.
  setTimeout(() => {
    console.log('[smoke] FAILED: timed out (app did not quit by itself)');
    require('electron').app.exit(1);
  }, 180000);

  async function enterShell() {
    await sleep(900);
    await key('Space');                       // skip boot (any key)
    await sleep(900);
    check('lock screen visible', await js(`!document.getElementById('lock').hidden`));
    await click(640, 400);                    // click to enter
    await sleep(1400);
    check('shell visible', await js(`!document.getElementById('shell').hidden`));
  }

  wc.once('did-finish-load', async () => {
    try {
      if (fsapi) { // filesystem API only (no UI): fast and safe
        await sleep(500);
        await require('./smokeFsApi').run({ js, check, sandbox });
        console.log(`[smoke] ${failures ? 'FAILURES: ' + failures : 'ALL FS CHECKS PASSED'}`);
        require('electron').app.exit(failures ? 1 : 0);
        return;
      }
      await enterShell();

      if (termOnly) { // just the Terminal (run with HOS_NO_PTY=1 to test the pipe fallback)
        await require('./smokeTerminal').run({ js, check, snap, sleep, click, clickOn, center, key, type, mouse, drag });
        console.log(`[smoke] ${failures ? 'FAILURES: ' + failures : 'ALL TERMINAL CHECKS PASSED'}`);
        require('electron').app.exit(failures ? 1 : 0);
        return;
      }

      // ---------------------------------------------------------------- verify run
      if (verify) {
        const s = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
        console.log('[smoke] settings.json:', JSON.stringify(s));
        const dom = await js(`({ wallpaper: document.documentElement.dataset.wallpaper, theme: document.documentElement.dataset.theme, align: document.documentElement.dataset.taskbarAlign, accent: document.documentElement.dataset.accent })`);
        check('wallpaper persisted (dusk)', dom.wallpaper === 'dusk', JSON.stringify(dom));
        check('theme persisted (dark)', dom.theme === 'dark');
        check('taskbar align persisted (left)', dom.align === 'left');
        check('accent persisted (purple)', dom.accent === 'purple');
        check('explorer view preference persisted (grid)', s.explorer && s.explorer.view === 'grid', JSON.stringify(s.explorer));
        const pos = await iconRects();
        console.log('[smoke] icon positions after restart:', JSON.stringify(pos));
        const saved = s.desktopIcons.terminal;
        check('terminal icon kept its moved cell', !!saved && (saved.col !== 0 || saved.row !== 2));
        await snap('v1-after-restart.png');
        console.log(`[smoke] ${failures ? 'FAILURES: ' + failures : 'ALL CHECKS PASSED'}`);
        require('electron').app.exit(failures ? 1 : 0);
        return;
      }

      // ---------------------------------------------------------------- 1. desktop
      await snap('01-desktop.png');
      const before = await iconRects();
      console.log('[smoke] icons at start:', JSON.stringify(before));
      check('7 desktop icons', Object.keys(before).length === 7);

      // ---------------------------------------------------------------- 2. drag an icon
      const t = await center('.desk-icon[data-app-id="terminal"]');
      await drag(t.x, t.y, t.x + 260, t.y + 150);
      const after = await iconRects();
      console.log('[smoke] terminal moved:', JSON.stringify(before.terminal), '->', JSON.stringify(after.terminal));
      check('terminal icon dragged to a new cell', after.terminal.x !== before.terminal.x && after.terminal.y !== before.terminal.y);
      check('terminal snapped to grid', (after.terminal.x - before.terminal.x) % 92 === 0 && (after.terminal.y - before.terminal.y) % 104 === 0);
      await snap('02-after-drag.png');

      // ---------------------------------------------------------------- 3. rubber band
      await drag(330, 60, 4, 420, { release: false });
      await snap('03-rubberband.png');
      const selCount = await js(`document.querySelectorAll('.desk-icon.is-selected').length`);
      mouse('mouseUp', 4, 420);
      await sleep(200);
      check('rubber band selected icons', selCount >= 2, `(selected ${selCount})`);
      await click(700, 350);                                 // click empty desktop clears selection
      check('click on empty desktop deselects', (await js(`document.querySelectorAll('.desk-icon.is-selected').length`)) === 0);

      // ---------------------------------------------------------------- 4. double click -> toast
      const n = await center('.desk-icon[data-app-id="puzzles"]'); // (still a placeholder app)
      await click(n.x, n.y);
      await click(n.x, n.y);
      await sleep(500);
      check('double-click opens app (toast shown)', (await js(`document.querySelectorAll('.toast').length`)) >= 1);
      await snap('04-toast.png');

      // ---------------------------------------------------------------- 5. desktop context menu
      await click(700, 330, 'right');
      check('desktop menu opens', (await js(`document.querySelectorAll('.ctx-menu').length`)) === 1);
      await snap('05-desktop-menu.png');
      const cw = await center('.ctx-item', 'Change wallpaper');
      mouse('mouseMove', cw.x, cw.y);
      await sleep(250);
      check('wallpaper submenu opens', (await js(`document.querySelectorAll('.ctx-menu').length`)) === 2);
      await snap('06-wallpaper-submenu.png');
      await clickOn('.ctx-item', 'Tulip dusk');
      await sleep(500);
      check('wallpaper changed to dusk', (await js(`document.documentElement.dataset.wallpaper`)) === 'dusk');
      check('menu closed after choosing', (await js(`document.querySelectorAll('.ctx-menu').length`)) === 0);

      // ---------------------------------------------------------------- 6. Start menu
      await clickOn('.start-btn');
      await sleep(600);
      check('start menu opens', (await js(`!document.getElementById('start-menu').classList.contains('is-closed')`)));
      await snap('07-start-menu.png');
      await type('cal');
      await sleep(300);
      check('search finds Calculator', (await js(`document.querySelector('.start-result-name')?.textContent`)) === 'Calculator');
      await snap('08-start-search.png');
      await key('Escape');
      await sleep(500);
      check('Escape closes start menu', await js(`document.getElementById('start-menu').classList.contains('is-closed')`));

      // clicking outside closes it too
      await clickOn('.start-btn');
      await sleep(500);
      await click(1200, 40);
      await sleep(500);
      check('click outside closes start menu', await js(`document.getElementById('start-menu').classList.contains('is-closed')`));

      // ---------------------------------------------------------------- 7. power menu
      await clickOn('.start-btn');
      await sleep(500);
      await clickOn('.start-power');
      await sleep(300);
      check('power menu has Sleep/Restart/Shut down', (await js(`[...document.querySelectorAll('.ctx-item')].map((e) => e.textContent).join('|')`)) === 'Sleep|Restart|Shut down');
      await snap('09-power-menu.png');
      await key('Escape');
      await key('Escape');
      await sleep(400);

      // ---------------------------------------------------------------- 8. running apps on the taskbar
      await js(`window.__hos.events.emit('windows:changed', [
        { id: 1, appId: 'terminal', title: 'Terminal', focused: true, minimized: false },
        { id: 2, appId: 'calculator', title: 'Calculator', focused: false, minimized: false } ])`);
      await sleep(300);
      check('running (unpinned) app gets a taskbar button', await js(`!!document.querySelector('.tb-btn[data-app-id="calculator"].is-running')`));
      check('focused app is marked active', await js(`!!document.querySelector('.tb-btn[data-app-id="terminal"].is-active')`));
      await snap('10-taskbar-running.png');
      await clickOn('.tb-btn[data-app-id="terminal"]', '', 'right');
      await sleep(300);
      check('taskbar menu offers Close window', (await js(`[...document.querySelectorAll('.ctx-item')].some((e) => e.textContent.includes('Close window'))`)));
      await snap('11-taskbar-menu.png');
      await key('Escape');
      // clicking a running app asks the window manager to toggle it
      await js(`window.__hos.events.on('window:toggle', (id) => { window.__toggled = id; }); 0`);
      await clickOn('.tb-btn[data-app-id="terminal"]');
      check('click running app emits window:toggle', (await js(`window.__toggled`)) === 1);
      await js(`window.__hos.events.emit('windows:changed', [])`);

      // ---------------------------------------------------------------- 8b. WINDOW MANAGER (milestone 3)
      const W = () => js(`window.__hos.windows()`);
      const winOf = async (id) => (await W()).find((w) => w.id === id);
      const LW = 1280, LH = 800 - 48; // layer = screen above the taskbar (windowed 1280x800)

      // open from the desktop icon (double-click)
      const wtIcon = await center('.desk-icon[data-app-id="wintest"]');
      await click(wtIcon.x, wtIcon.y);
      await click(wtIcon.x, wtIcon.y);
      await sleep(600);
      let list = await W();
      check('double-click opens a real window', list.length === 1 && list[0].focused, JSON.stringify(list));
      check('taskbar shows it running + active', await js(`!!document.querySelector('.tb-btn[data-app-id="wintest"].is-running.is-active')`));
      await snap('20-first-window.png');

      // second window: z-order + focus
      await clickOn('.wt-buttons .btn', 'Open another');
      await sleep(500);
      list = await W();
      check('second window opens on top', list.length === 2 && list[1].focused && list[1].z > list[0].z, JSON.stringify(list));
      await click(200, 55);                                   // first window's visible titlebar
      list = await W();
      check('clicking a window brings it to front', list[0].focused && list[0].z > list[1].z);
      await snap('21-two-windows.png');

      // drag by titlebar (also records frame timing for smoothness)
      await js(`window.__f = []; window.__run = true; (function loop() { if (!window.__run) return; window.__f.push(performance.now()); requestAnimationFrame(loop); })(); 0`);
      let w1 = await winOf(list[0].id);
      await drag(200, 55, 200 + 150, 55 + 100);
      let w1b = await winOf(w1.id);
      check('drag moves window by the mouse delta', w1b.x === w1.x + 150 && w1b.y === w1.y + 100, `${w1.x},${w1.y} -> ${w1b.x},${w1b.y}`);
      const frames = await js(`window.__run = false; (() => { const f = window.__f; const d = f.slice(1).map((t, i) => t - f[i]); return { n: d.length, mean: d.reduce((a, b) => a + b, 0) / d.length, max: Math.max(...d), slow: d.filter((x) => x > 25).length }; })()`);
      console.log('[smoke] frame timing during drag:', JSON.stringify(frames));
      check('dragging keeps ~60fps (mean frame < 20ms)', frames.mean < 20, JSON.stringify(frames));

      // resize: SE corner, W edge, NW corner down to min size
      w1 = await winOf(w1.id);
      await drag(w1.x + w1.w - 2, w1.y + w1.h - 2, w1.x + w1.w + 78, w1.y + w1.h + 48);
      w1b = await winOf(w1.id);
      check('SE corner grows the window', w1b.w === w1.w + 80 && w1b.h === w1.h + 50 && w1b.x === w1.x, `${w1.w}x${w1.h} -> ${w1b.w}x${w1b.h}`);
      w1 = w1b;
      await drag(w1.x + 1, w1.y + 150, w1.x - 59, w1.y + 150);
      w1b = await winOf(w1.id);
      check('W edge grows left (x moves, right edge fixed)', w1b.w === w1.w + 60 && w1b.x === w1.x - 60 && w1b.y === w1.y, `${w1.x}/${w1.w} -> ${w1b.x}/${w1b.w}`);
      w1 = w1b;
      await drag(w1.x + 1, w1.y + 1, w1.x + 900, w1.y + 700);
      w1b = await winOf(w1.id);
      check('NW corner stops at the minimum size (360x260)', w1b.w === 360 && w1b.h === 260 && w1b.x + w1b.w === w1.x + w1.w && w1b.y + w1b.h === w1.y + w1.h, JSON.stringify(w1b));
      await snap('22-resized-min.png');

      // maximize / restore by double-clicking the titlebar
      w1 = await winOf(w1.id);
      await click(w1.x + 150, w1.y + 15, 'left', 2);
      await sleep(80);
      await click(w1.x + 150, w1.y + 15, 'left', 2);
      await sleep(450);
      w1b = await winOf(w1.id);
      check('double-click titlebar maximizes', w1b.state === 'maximized' && w1b.w === LW && w1b.h === LH && w1b.x === 0 && w1b.y === 0, JSON.stringify(w1b));
      await snap('23-maximized.png');
      await click(400, 15, 'left', 2);
      await sleep(80);
      await click(400, 15, 'left', 2);
      await sleep(450);
      w1b = await winOf(w1.id);
      check('double-click again restores the old bounds', w1b.state === 'normal' && w1b.x === w1.x && w1b.y === w1.y && w1b.w === w1.w && w1b.h === w1.h, JSON.stringify(w1b));

      // snap left / right / maximize by dragging to the edges
      w1 = w1b;
      await drag(w1.x + 100, w1.y + 15, 2, 300, { release: false });
      check('snap preview appears near the left edge', await js(`document.querySelector('.snap-preview').classList.contains('is-visible')`));
      await snap('24-snap-preview.png');
      mouse('mouseUp', 2, 300);
      await sleep(450);
      w1b = await winOf(w1.id);
      check('snapped to left half', w1b.state === 'snapped' && w1b.x === 0 && w1b.w === LW / 2 && w1b.h === LH, JSON.stringify(w1b));
      await snap('25-snapped-left.png');
      await drag(200, 15, LW - 2, 300);
      await sleep(400);
      w1b = await winOf(w1.id);
      check('snapped to right half', w1b.state === 'snapped' && w1b.x === LW / 2 && w1b.w === LW / 2, JSON.stringify(w1b));
      await drag(LW - 200, 15, 600, 1);
      await sleep(400);
      w1b = await winOf(w1.id);
      check('dragging to the top maximizes', w1b.state === 'maximized', JSON.stringify(w1b));
      await drag(600, 15, 600, 215);
      await sleep(300);
      w1b = await winOf(w1.id);
      check('dragging a maximized window restores its old size', w1b.state === 'normal' && w1b.w === w1.w && w1b.h === w1.h, JSON.stringify(w1b));

      // can't go under the taskbar / off the top
      w1 = w1b;
      await drag(w1.x + 100, w1.y + 15, w1.x + 100, 790, { release: false });
      w1b = await winOf(w1.id);
      check('window cannot be dragged under the taskbar', w1b.y + 38 <= LH, `y=${w1b.y}`);
      mouse('mouseMove', w1.x + 100, 300, { modifiers: ['leftButtonDown'] });
      await sleep(100);
      mouse('mouseUp', w1.x + 100, 300);
      await sleep(200);

      // minimize / restore via buttons and taskbar
      await clickOn('.win.is-focused .win-ctrl[title="Minimize"]');
      await sleep(500);
      list = await W();
      check('minimize hides the window and focus moves on', list.filter((w) => w.minimized).length === 1 && list.some((w) => w.focused && !w.minimized), JSON.stringify(list));
      check('minimized window is display:none', await js(`!!document.querySelector('.win.is-hidden')`));
      await snap('26-one-minimized.png');
      await clickOn('.tb-btn[data-app-id="wintest"]');            // focused window -> minimize it too
      await sleep(500);
      check('taskbar click on focused app minimizes it', (await W()).every((w) => w.minimized));
      await clickOn('.tb-btn[data-app-id="wintest"]');            // nothing focused -> restore
      await sleep(500);
      list = await W();
      check('taskbar click restores a minimized window', list.some((w) => !w.minimized && w.focused));
      await clickOn('.tb-show-desktop');
      await sleep(500);
      check('show desktop minimizes everything', (await W()).every((w) => w.minimized));
      await snap('27-show-desktop.png');
      await clickOn('.tb-show-desktop');
      await sleep(500);
      check('show desktop again restores what it hid', (await W()).some((w) => !w.minimized && w.focused));

      // close
      await clickOn('.win.is-focused .win-ctrl.is-close');
      await sleep(400);
      check('close button removes the window', (await W()).length === 1);
      await clickOn('.tb-btn[data-app-id="wintest"]', '', 'right');
      await clickOn('.ctx-item', 'Close window');
      await sleep(400);
      check('taskbar menu closes the last window', (await W()).length === 0 && (await js(`document.querySelectorAll('.win').length`)) === 0);
      check('unpinned app leaves the taskbar when closed', await js(`!document.querySelector('.tb-btn[data-app-id="wintest"]')`));

      // ---------------------------------------------------------------- 8c. FILE EXPLORER / NOTEPAD / IMAGE VIEWER (milestone 4)
      await require('./smokeExplorer').run({ js, check, snap, sleep, click, clickOn, center, key, type, sandbox, mouse, mouseDownUp });

      // ---------------------------------------------------------------- 8d. TERMINAL (milestone 5)
      await require('./smokeTerminal').run({ js, check, snap, sleep, click, clickOn, center, key, type, mouse, drag });

      // ---------------------------------------------------------------- 9. settings: dark + left + purple
      await js(`window.__hos.settings.setSetting('theme', 'dark'); window.__hos.settings.setSetting('accent', 'purple'); window.__hos.settings.setSetting('taskbarAlign', 'left')`);
      await sleep(700);
      await clickOn('.start-btn');
      await sleep(700);
      await snap('12-dark-left-start.png');
      await key('Escape');
      await sleep(500);
      await snap('13-dark-left-desktop.png');

      // ---------------------------------------------------------------- 10. restart (boot replays, app stays alive)
      await clickOn('.start-btn');
      await sleep(500);
      await clickOn('.start-power');
      await sleep(250);
      await clickOn('.ctx-item', 'Restart');
      await sleep(700);
      check('Restart replays boot', await js(`!document.getElementById('boot').hidden && document.getElementById('shell').hidden`));
      await snap('14-restart-boot.png');
      await enterShell();

      // ---------------------------------------------------------------- 11. sleep -> wake -> lock
      await clickOn('.start-btn');
      await sleep(500);
      await clickOn('.start-power');
      await sleep(250);
      await clickOn('.ctx-item', 'Sleep');
      await sleep(1400);
      check('Sleep shows dark screen', await js(`!!document.querySelector('.sleep-screen')`));
      await snap('15-sleep.png');
      await key('Space');
      await sleep(1000);
      check('waking shows lock screen', await js(`!document.getElementById('lock').hidden`));
      await click(640, 400);
      await sleep(1400);
      check('shell back after wake', await js(`!document.getElementById('shell').hidden`));

      // ---------------------------------------------------------------- 12. shut down from the Start menu
      await clickOn('.start-btn');
      await sleep(500);
      await clickOn('.start-power');
      await sleep(250);
      await clickOn('.ctx-item', 'Shut down');
      await sleep(900);
      check('goodbye screen shown', await js(`!!document.querySelector('.goodbye')`));
      await snap('16-goodbye.png');
      console.log(`[smoke] ${failures ? 'FAILURES so far: ' + failures : 'no failures so far'}; waiting for the app to quit by itself…`);
      // From here the app must quit on its own (os:quit); the global timeout catches a hang.
      setTimeout(() => {
        try { console.log('[smoke] settings.json at quit:', fs.readFileSync(settingsPath(), 'utf8').replace(/\s+/g, ' ')); } catch (e) { console.log('[smoke] no settings file!', e.message); }
      }, 3500);
    } catch (err) {
      console.log('[smoke] ERROR', err);
      require('electron').app.exit(1);
    }
  });
};
