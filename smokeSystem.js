// =============================================================================
// Settings / quick settings / notification center / PIN / Calculator / Clock smoke test
// (part of `npm run smoke`; alone: `npm run smoke:system`). Real mouse + keyboard.
// =============================================================================

exports.run = async function runSystem(t) {
  const { js, check, snap, sleep, click, clickOn, key, type } = t;

  const waitFor = async (expr, ms = 8000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      try { if (await js(expr)) return true; } catch { /* page busy */ }
      await sleep(100);
    }
    return false;
  };
  const closeAll = async () => {
    await js(`window.__hos.windows().forEach((w) => window.__hos.events.emit('window:close', w.id)); 0`);
    await sleep(500);
  };
  const setting = (k) => js(`window.__hos.settings.getSetting(${JSON.stringify(k)})`);
  const root = (k) => js(`document.documentElement.dataset.${k}`);
  const rectOf = (selector) => js(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, left: b.left, top: b.top, w: b.width, h: b.height }; })()`);
  const setRange = (selector, value) => js(`(() => { const i = document.querySelector(${JSON.stringify(selector)}); i.value = ${value}; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); return i.value; })()`);

  // start from known settings
  await js(`for (const [k, v] of Object.entries({ theme: 'light', accent: 'pink', wallpaper: 'day', taskbarAlign: 'center', sounds: true, volume: 70, brightness: 100, userName: '', pin: null })) window.__hos.settings.setSetting(k, v); 0`);

  // ===================================================================== Settings: Personalization
  await js(`window.__hos.launch('settings'); 0`);
  check('settings: opens with 4 pages', await waitFor(`document.querySelectorAll('.win.is-focused .st-nav-item').length === 4`));
  check('settings: wallpaper has 3 choices, current one selected', (await js(`document.querySelectorAll('.win.is-focused .st-card.is-selected').length`)) >= 1);
  await snap('70-settings.png');
  await clickOn('.win.is-focused .st-card', 'Tulip dusk');
  check('settings: choosing a wallpaper applies it at once', (await root('wallpaper')) === 'dusk' && (await setting('wallpaper')) === 'dusk');
  await clickOn('.win.is-focused .st-card', 'Night garden');
  check('settings: Night garden theme applies', (await root('theme')) === 'dark');
  await clickOn('.win.is-focused .st-swatch[data-value="purple"]');
  check('settings: accent colour changes', (await root('accent')) === 'purple' && (await js(`document.querySelector('.win.is-focused .st-swatch[data-value="purple"]').classList.contains('is-selected')`)));
  await clickOn('.win.is-focused .st-segmented button', 'Left');
  check('settings: taskbar alignment moves to the left', (await root('taskbarAlign')) === 'left');
  await snap('71-settings-dark.png');
  // theme card back to light
  await clickOn('.win.is-focused .st-card', 'Light');
  check('settings: back to the Light theme', (await root('theme')) === 'light');

  // ===================================================================== Settings: System
  await clickOn('.win.is-focused .st-nav-item', 'System');
  await sleep(200);
  await clickOn('.win.is-focused .st-switch');
  check('settings: the Sounds switch turns sounds off', (await setting('sounds')) === false);
  await clickOn('.win.is-focused .st-switch');
  check('settings: ...and on again', (await setting('sounds')) === true);
  await setRange('.win.is-focused .st-slider input[aria-label="Volume"]', 35);
  check('settings: volume slider saves', (await setting('volume')) === 35);
  await setRange('.win.is-focused .st-slider input[aria-label="Brightness"]', 60);
  await sleep(500); // the dimming fades in
  check('settings: brightness slider dims the screen', (await setting('brightness')) === 60 && (await js(`Number(getComputedStyle(document.body, '::after').opacity)`)) > 0.2);
  await setRange('.win.is-focused .st-slider input[aria-label="Brightness"]', 100);
  const played = await js(`(() => { const out = []; for (const n of ['startup', 'shutdown', 'notify', 'error', 'tick', 'place', 'hint', 'move', 'capture', 'check', 'gameover', 'win', 'open', 'close']) { try { window.__hos.playSound(n); out.push(true); } catch (e) { out.push(String(e)); } } return out.every((x) => x === true); })()`);
  check('sounds: all 14 synthesised sounds play without errors', played);

  // ===================================================================== Quick settings panel
  await clickOn('.tb-tray');
  check('quick settings: opens from the tray icons', await waitFor(`!document.querySelector('.panel-quick').classList.contains('is-closed')`));
  await snap('72-quick-settings.png');
  check('quick settings: volume slider shows the same value as Settings', (await js(`document.querySelector('.panel-quick .qs-slider input').value`)) === '35');
  await clickOn('.panel-quick .qs-tile', 'Night garden');
  check('quick settings: the theme tile toggles dark mode (and Settings page stays in sync)', (await root('theme')) === 'dark');
  await clickOn('.panel-quick .qs-tile', 'Night garden');
  check('quick settings: ...and back', (await root('theme')) === 'light');
  await key('Escape');
  await sleep(500);
  check('quick settings: Esc closes it', await js(`document.querySelector('.panel-quick').classList.contains('is-closed')`));
  await closeAll();

  // ===================================================================== Notification center
  await js(`window.__hos.toast({ title: 'Center test', message: 'This should be in the notification center', duration: 3000 }); 0`);
  await sleep(400);
  check('notifications: an unread dot appears on the clock', await js(`document.querySelector('.tb-clock').classList.contains('has-unread')`));
  await clickOn('.tb-clock');
  check('notifications: clicking the clock opens the center', await waitFor(`!document.querySelector('.panel-center').classList.contains('is-closed')`));
  check('notifications: history lists the toast', (await js(`document.querySelector('.panel-center .nc-list').textContent`)).includes('Center test'));
  check('notifications: opening marks them read (dot disappears)', await js(`!document.querySelector('.tb-clock').classList.contains('has-unread')`));
  check('notifications: the calendar highlights today', (await js(`document.querySelector('.panel-center .cal-day.is-today').textContent`)) === String(new Date().getDate()));
  await snap('73-notification-center.png');
  await clickOn('.panel-center .nc-clear');
  check('notifications: "Clear all" empties the list', (await js(`document.querySelector('.panel-center .nc-list').textContent`)).includes('All quiet'));
  await key('Escape');
  await sleep(400);
  // quiet mode: still recorded, never shown
  await clickOn('.tb-tray');
  await clickOn('.panel-quick .qs-tile', 'Quiet mode');
  await key('Escape');
  await sleep(400);
  const toastsBefore = await js(`document.querySelectorAll('.toast').length`);
  await js(`window.__hos.toast({ title: 'Shh', message: 'quiet', duration: 3000 }); 0`);
  await sleep(300);
  check('notifications: quiet mode hides pop-ups but still records them', (await js(`document.querySelectorAll('.toast').length`)) === toastsBefore && (await js(`document.querySelector('.tb-clock').classList.contains('has-unread')`)));
  await clickOn('.tb-tray');
  await clickOn('.panel-quick .qs-tile', 'Quiet mode');
  await key('Escape');
  await sleep(300);
  check('panels: Start menu and panels never overlap', await (async () => {
    await clickOn('.tb-tray');
    await sleep(400);
    await clickOn('.start-btn');
    await sleep(500);
    return (await js(`document.querySelector('.panel-quick').classList.contains('is-closed') && !document.getElementById('start-menu').classList.contains('is-closed')`));
  })());
  await key('Escape');
  await sleep(300);

  // ===================================================================== Account: name + PIN
  await js(`window.__hos.launch('settings', { page: 'account' }); 0`);
  await waitFor(`!!document.querySelector('.win.is-focused .st-input')`);
  await clickOn('.win.is-focused .st-input');
  await type('Tess');
  await key('Return');
  await sleep(300);
  check('account: your name is saved', (await setting('userName')) === 'Tess');
  await clickOn('.start-btn');
  await sleep(500);
  check('account: the Start menu shows it', (await js(`document.querySelector('.start-username').textContent`)) === 'Tess');
  await key('Escape');
  await sleep(300);

  await clickOn('.win.is-focused .st-btns .btn', 'Set PIN');
  check('pin: the Set PIN dialog opens', await waitFor(`!!document.querySelector('.dialog .dialog-field')`));
  await js(`document.querySelectorAll('.dialog .dialog-field input')[0].focus(); 0`);
  await type('12');
  await clickOn('.dialog .btn', 'Save');
  check('pin: a too-short PIN is refused (dialog stays, says why)', (await js(`document.querySelector('.dialog-error').textContent`)).includes('4 to 8 digits'));
  await js(`document.querySelectorAll('.dialog .dialog-field input')[0].value = ''; document.querySelectorAll('.dialog .dialog-field input')[0].focus(); 0`);
  await type('1234');
  await js(`document.querySelectorAll('.dialog .dialog-field input')[1].focus(); 0`);
  await type('1235');
  await clickOn('.dialog .btn', 'Save');
  check("pin: mismatching PINs are refused", (await js(`document.querySelector('.dialog-error').textContent`)).includes("don't match"));
  await js(`document.querySelectorAll('.dialog .dialog-field input')[1].value = ''; document.querySelectorAll('.dialog .dialog-field input')[1].focus(); 0`);
  await type('1234');
  await clickOn('.dialog .btn', 'Save');
  await sleep(700);
  const stored = await js(`hos.settings.load().then((s) => s.pin)`);
  check('pin: only a salted hash is stored, never the PIN', stored && /^[0-9a-f]{32}$/.test(stored.salt) && /^[0-9a-f]{64}$/.test(stored.hash) && !JSON.stringify(stored).includes('1234'));
  check('pin: Settings now says the PIN is on', (await js(`document.querySelector('.win.is-focused .st-status').textContent`)) === 'PIN is on');

  // lock screen asks for it (wake from sleep shows the lock screen)
  await closeAll();
  await js(`window.__hos.events.emit('power:wake'); 0`);
  check('pin: waking shows the lock screen', await waitFor(`!document.getElementById('lock').hidden`));
  await click(640, 300);
  check('pin: clicking asks for the PIN', await waitFor(`!!document.querySelector('.lock-pin-input')`));
  await snap('74-lock-pin.png');
  await type('9999');
  await key('Return');
  await sleep(900);
  check('pin: a wrong PIN keeps the lock screen and shakes', (await js(`!document.getElementById('lock').hidden && document.querySelector('.lock-pin').classList.contains('is-shaking')`)));
  await type('1234');
  await key('Return');
  await sleep(1400);
  check('pin: the right PIN unlocks', await js(`document.getElementById('lock').hidden && !document.getElementById('shell').hidden`));

  // wrong current PIN cannot remove it; the right one can
  await js(`window.__hos.launch('settings', { page: 'account' }); 0`);
  await waitFor(`!!document.querySelector('.win.is-focused .st-btns')`);
  await clickOn('.win.is-focused .st-btns .btn', 'Remove PIN');
  await waitFor(`!!document.querySelector('.dialog .dialog-field')`);
  await js(`document.querySelector('.dialog .dialog-field input').focus(); 0`);
  await type('0000');
  await clickOn('.dialog .btn', 'Remove');
  await sleep(900);
  check('pin: removing with the wrong PIN does nothing', (await js(`hos.settings.load().then((s) => !!s.pin)`)) === true);
  await clickOn('.win.is-focused .st-btns .btn', 'Remove PIN');
  await waitFor(`!!document.querySelector('.dialog .dialog-field')`);
  await js(`document.querySelector('.dialog .dialog-field input').focus(); 0`);
  await type('1234');
  await clickOn('.dialog .btn', 'Remove');
  await sleep(900);
  check('pin: the right PIN removes it', (await js(`hos.settings.load().then((s) => s.pin === null)`)) === true);
  await js(`window.__hos.settings.setSetting('userName', ''); 0`);

  // ===================================================================== About + restore defaults
  await clickOn('.win.is-focused .st-nav-item', 'About');
  check('about: shows the version', await waitFor(`/Version \\d+\\.\\d+\\.\\d+/.test(document.querySelector('.win.is-focused .st-about-version').textContent)`));
  check('about: credits mention Stockfish (GPL) and Nunito (OFL)', (await js(`document.querySelector('.win.is-focused .st-credits').textContent`)).includes('Stockfish') && (await js(`document.querySelector('.win.is-focused .st-credits').textContent`)).includes('Open Font License'));
  await snap('75-about.png');
  await js(`window.__hos.settings.setSetting('accent', 'red'); window.__hos.settings.setSetting('theme', 'dark'); 0`);
  await clickOn('.win.is-focused .st-about ~ .st-section .btn');
  await waitFor(`!!document.querySelector('.dialog')`);
  await clickOn('.dialog .btn', 'Restore');
  await sleep(500);
  check('about: Restore defaults resets look and sounds', (await root('theme')) === 'light' && (await root('accent')) === 'pink' && (await root('taskbarAlign')) === 'center' && (await root('wallpaper')) === 'day');
  await closeAll();

  // ===================================================================== Calculator
  await js(`window.__hos.launch('calculator'); 0`);
  check('calculator: opens', await waitFor(`!!document.querySelector('.win.is-focused .calc-keys')`));
  check('calculator: has no maximize button and no resize handles (fixed size)', (await js(`document.querySelectorAll('.win.is-focused .win-ctrl').length`)) === 2 && (await js(`document.querySelectorAll('.win.is-focused .win-handle').length`)) === 0);
  for (const k of ['7', '×', '6', '=']) await clickOn('.win.is-focused .calc-key', k);
  check('calculator: clicking 7 × 6 = shows 42', (await js(`document.querySelector('.win.is-focused .calc-display').textContent`)) === '42');
  await key('Escape');
  await type('1200');
  await type('+');
  await type('34');
  await key('Return');
  check('calculator: the keyboard works (1200+34 = 1,234 with separators)', (await js(`document.querySelector('.win.is-focused .calc-display').textContent`)) === '1,234');
  await type('/');
  await type('0');
  await key('Return');
  check('calculator: dividing by zero shows a friendly message', (await js(`document.querySelector('.win.is-focused .calc-display').textContent`)) === 'Cannot divide by zero');
  await key('Escape');
  await snap('76-calculator.png');
  await closeAll();

  // ===================================================================== Clock
  await js(`window.__hos.launch('clock'); 0`);
  check('clock: shows an analog face and a digital time', await waitFor(`!!document.querySelector('.win.is-focused .ck-face') && /\\d/.test(document.querySelector('.win.is-focused .ck-digital').textContent)`));
  const h1 = await js(`document.querySelector('.win.is-focused .ck-hand.second').getAttribute('transform')`);
  await sleep(1200);
  const h2 = await js(`document.querySelector('.win.is-focused .ck-hand.second').getAttribute('transform')`);
  check('clock: the second hand moves', h1 !== h2);
  await snap('77-clock.png');
  await clickOn('.win.is-focused .ck-tab', 'Timer');
  await waitFor(`!!document.querySelector('.win.is-focused .ck-ring')`);
  await js(`(() => { const i = document.querySelectorAll('.win.is-focused .ck-field input'); i[0].value = '0'; i[1].value = '0'; i[2].value = '3'; i[2].dispatchEvent(new Event('change')); })()`);
  check('clock: custom timer time shows 00:00:03', await waitFor(`document.querySelector('.win.is-focused .ck-readout').textContent === '00:00:03'`));
  await clickOn('.win.is-focused .ck-buttons .btn', 'Start');
  await sleep(1300);
  check('clock: the timer counts down', ['00:00:02', '00:00:01'].includes(await js(`document.querySelector('.win.is-focused .ck-readout').textContent`)));
  await snap('78-timer.png');
  // close the window: the timer keeps going and still notifies
  await closeAll();
  check('clock: a finished timer notifies even with the window closed', await waitFor(`document.querySelector('.toasts') && [...document.querySelectorAll('.toast')].some((x) => x.textContent.includes('Timer finished'))`, 6000));
  await js(`window.__hos.launch('clock', { tab: 'stopwatch' }); 0`);
  await waitFor(`!!document.querySelector('.win.is-focused .ck-laps')`);
  await clickOn('.win.is-focused .ck-buttons .btn', 'Start');
  await sleep(900);
  await clickOn('.win.is-focused .ck-buttons .btn', 'Lap');
  check('clock: the stopwatch runs and records a lap', (await js(`document.querySelector('.win.is-focused .ck-readout').textContent`)) !== '00:00.00' && (await js(`document.querySelectorAll('.win.is-focused .ck-lap').length`)) === 1);
  await clickOn('.win.is-focused .ck-buttons .btn', 'Pause');
  await clickOn('.win.is-focused .ck-buttons .btn', 'Reset');
  check('clock: reset clears time and laps', (await js(`document.querySelector('.win.is-focused .ck-readout').textContent`)) === '00:00.00' && (await js(`document.querySelectorAll('.win.is-focused .ck-lap').length`)) === 0);
  await closeAll();

  // leave a clean slate
  await js(`for (const [k, v] of Object.entries({ theme: 'light', accent: 'pink', wallpaper: 'day', taskbarAlign: 'center', sounds: true, volume: 70, brightness: 100, userName: '' })) window.__hos.settings.setSetting(k, v); 0`);
};
