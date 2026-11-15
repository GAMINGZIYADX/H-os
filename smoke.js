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

exports.run = function run({ win, dir, verify, settingsPath }) {
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
  async function key(keyCode) {
    wc.sendInputEvent({ type: 'keyDown', keyCode });
    wc.sendInputEvent({ type: 'keyUp', keyCode });
    await sleep(120);
  }
  async function type(text) {
    for (const ch of text) {
      wc.sendInputEvent({ type: 'keyDown', keyCode: ch });
      wc.sendInputEvent({ type: 'char', keyCode: ch });
      wc.sendInputEvent({ type: 'keyUp', keyCode: ch });
      await sleep(40);
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
  }, 90000);

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
      await enterShell();

      // ---------------------------------------------------------------- verify run
      if (verify) {
        const s = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
        console.log('[smoke] settings.json:', JSON.stringify(s));
        const dom = await js(`({ wallpaper: document.documentElement.dataset.wallpaper, theme: document.documentElement.dataset.theme, align: document.documentElement.dataset.taskbarAlign, accent: document.documentElement.dataset.accent })`);
        check('wallpaper persisted (dusk)', dom.wallpaper === 'dusk', JSON.stringify(dom));
        check('theme persisted (dark)', dom.theme === 'dark');
        check('taskbar align persisted (left)', dom.align === 'left');
        check('accent persisted (purple)', dom.accent === 'purple');
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
      check('6 desktop icons', Object.keys(before).length === 6);

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
      const n = await center('.desk-icon[data-app-id="notepad"]');
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
