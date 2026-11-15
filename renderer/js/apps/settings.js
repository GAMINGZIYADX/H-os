// =============================================================================
// apps/settings.js — Settings
// =============================================================================
// Pages: Personalization (wallpaper, theme, accent colour, taskbar), System (sounds, volume,
// brightness, quiet mode), Account (your name, lock-screen PIN), About H-os.
// Every control reads and writes settingsStore.js, which saves to settings.json and updates the
// screen at once. The quick-settings panel changes the same values, so each page "refreshes"
// whenever any setting changes.

import { el } from '../dom.js';
import { iconEl } from '../icons.js';
import { registerApp } from '../appRegistry.js';
import { createTulip } from '../tulip.js';
import { getSetting, setSetting, onSettingChange, DEFAULTS } from '../settingsStore.js';
import { isDoNotDisturb, setDoNotDisturb } from '../notifications.js';
import { on, emit } from '../events.js';
import { showDialog, confirmDialog } from '../ui/dialogs.js';
import { hasPin, setPin, clearPin, verifyPin, validPinFormat } from '../pin.js';
import { toast } from '../notifications.js';

const WALLPAPERS = [['day', 'Tulip field'], ['dusk', 'Tulip dusk'], ['pastel', 'Pastel gradient']];
const ACCENTS = [['pink', 'Pink', '#c2306b'], ['red', 'Red', '#d6313f'], ['yellow', 'Yellow', '#d99a00'], ['purple', 'Purple', '#7e5bd0'], ['white', 'White', '#8a7384']];

const CREDITS = [
  ['Electron', 'MIT'],
  ['Nunito font', 'SIL Open Font License'],
  ['xterm.js and node-pty', 'MIT'],
  ['chess.js', 'BSD-2-Clause'],
  ['Stockfish.js (the chess engine)', 'GPL-3.0 (source: github.com/nmrugg/stockfish.js)'],
];

function create(container, ctx) {
  ctx.setTitle('Settings');
  const refreshers = []; // functions that re-read the settings and update their control

  const root = el('div', 'st');
  const nav = el('nav', 'st-nav');
  const page = el('div', 'st-page');
  root.append(nav, page);
  container.append(root);

  // ---------------------------------------------------------------------------
  // Small building blocks
  // ---------------------------------------------------------------------------
  const section = (title, hint) => {
    const s = el('section', 'st-section');
    s.append(el('h3', '', title));
    if (hint) s.append(el('p', 'st-hint', hint));
    return s;
  };
  const row = (label, control, sub) => {
    const r = el('div', 'st-row');
    const text = el('div', 'st-row-text');
    text.append(el('div', 'st-row-label', label));
    if (sub) text.append(el('div', 'st-row-sub', sub));
    r.append(text, control);
    return r;
  };

  function choiceCards(options, key, previewClass) {
    const wrap = el('div', 'st-cards');
    const buttons = options.map(([value, label]) => {
      const b = el('button', 'st-card');
      b.dataset.value = value;
      const preview = el('div', `st-preview ${previewClass} preview-${value}`);
      b.append(preview, el('span', '', label));
      b.addEventListener('click', () => setSetting(key, value));
      wrap.append(b);
      return b;
    });
    refreshers.push(() => buttons.forEach((b) => b.classList.toggle('is-selected', getSetting(key) === b.dataset.value)));
    return wrap;
  }

  function swatches() {
    const wrap = el('div', 'st-swatches');
    const buttons = ACCENTS.map(([value, label, color]) => {
      const b = el('button', 'st-swatch');
      b.dataset.value = value;
      b.title = label;
      b.setAttribute('aria-label', label);
      b.style.setProperty('--swatch', color);
      b.append(iconEl('check'));
      b.addEventListener('click', () => setSetting('accent', value));
      wrap.append(b);
      return b;
    });
    refreshers.push(() => buttons.forEach((b) => b.classList.toggle('is-selected', getSetting('accent') === b.dataset.value)));
    return wrap;
  }

  function segmented(options, key) {
    const wrap = el('div', 'st-segmented');
    const buttons = options.map(([value, label]) => {
      const b = el('button', '', label);
      b.dataset.value = value;
      b.addEventListener('click', () => setSetting(key, value));
      wrap.append(b);
      return b;
    });
    refreshers.push(() => buttons.forEach((b) => b.classList.toggle('is-selected', getSetting(key) === b.dataset.value)));
    return wrap;
  }

  function toggle(get, set, label) {
    const b = el('button', 'st-switch');
    b.setAttribute('role', 'switch');
    b.setAttribute('aria-label', label);
    b.append(el('span', 'st-knob'));
    b.addEventListener('click', () => set(!get()));
    refreshers.push(() => { b.classList.toggle('is-on', Boolean(get())); b.setAttribute('aria-checked', String(Boolean(get()))); });
    return b;
  }

  function slider(key, min, max, label) {
    const wrap = el('div', 'st-slider');
    const input = el('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.setAttribute('aria-label', label);
    const value = el('span', 'st-slider-value');
    input.addEventListener('input', () => { setSetting(key, Number(input.value)); value.textContent = input.value + '%'; });
    if (key === 'volume') input.addEventListener('change', () => emit('sound:play', 'tick'));
    wrap.append(input, value);
    refreshers.push(() => { input.value = String(getSetting(key)); value.textContent = getSetting(key) + '%'; });
    return wrap;
  }

  // ---------------------------------------------------------------------------
  // Pages
  // ---------------------------------------------------------------------------
  const pages = {};

  pages.personalization = () => {
    const frag = document.createDocumentFragment();
    const wallpaper = section('Wallpaper', 'Pick the picture behind your desktop.');
    wallpaper.append(choiceCards(WALLPAPERS, 'wallpaper', 'st-wall'));
    const theme = section('Theme', 'Light is cheerful; Night garden is easy on the eyes after dark.');
    theme.append(choiceCards([['light', 'Light'], ['dark', 'Night garden']], 'theme', 'st-theme'));
    const accent = section('Accent colour', 'Choose your favourite tulip.');
    accent.append(swatches());
    const taskbar = section('Taskbar');
    taskbar.append(row('Taskbar alignment', segmented([['center', 'Centre'], ['left', 'Left']], 'taskbarAlign'), 'Where the Start button and apps sit.'));
    frag.append(wallpaper, theme, accent, taskbar);
    return frag;
  };

  pages.system = () => {
    const frag = document.createDocumentFragment();
    const sound = section('Sound');
    sound.append(
      row('System sounds', toggle(() => getSetting('sounds'), (v) => setSetting('sounds', v), 'System sounds'), 'Little chimes for startup, notifications and games.'),
      row('Volume', slider('volume', 0, 100, 'Volume')),
    );
    const display = section('Display');
    display.append(row('Brightness', slider('brightness', 40, 100, 'Brightness'), 'Dims the whole screen softly.'));
    const notify = section('Notifications');
    notify.append(row('Quiet mode', toggle(() => isDoNotDisturb(), (v) => { setDoNotDisturb(v); refreshAll(); }, 'Quiet mode'), 'Hides pop-ups and chimes (they still collect in the notification center).'));
    frag.append(sound, display, notify);
    return frag;
  };

  pages.account = () => {
    const frag = document.createDocumentFragment();
    const who = section('Your name', 'Shown in the Start menu. Leave it empty to use your computer\'s user name.');
    const input = el('input', 'st-input');
    input.placeholder = 'Your name';
    input.maxLength = 30;
    input.setAttribute('aria-label', 'Your name');
    input.addEventListener('change', () => setSetting('userName', input.value.trim().slice(0, 30)));
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') input.blur(); });
    refreshers.push(() => { if (document.activeElement !== input) input.value = getSetting('userName') || ''; });
    who.append(row('Name', input));

    const lock = section('Lock screen PIN', 'A cosy way to tuck your tulips in. (Not real security: anyone at this computer can still close H-os.)');
    const status = el('span', 'st-status');
    const buttons = el('div', 'st-btns');
    const setBtn = el('button', 'btn', 'Set PIN');
    const removeBtn = el('button', 'btn', 'Remove PIN');
    setBtn.addEventListener('click', changePin);
    removeBtn.addEventListener('click', removePin);
    buttons.append(setBtn, removeBtn);
    refreshers.push(() => {
      status.textContent = hasPin() ? 'PIN is on' : 'PIN is off';
      setBtn.textContent = hasPin() ? 'Change PIN' : 'Set PIN';
      removeBtn.hidden = !hasPin();
    });
    lock.append(row('Status', status), row('', buttons));
    frag.append(who, lock);
    return frag;
  };

  pages.about = () => {
    const frag = document.createDocumentFragment();
    const hero = el('div', 'st-about');
    hero.append(createTulip('tulip-icon'));
    const heroText = el('div');
    const versionLine = el('div', 'st-about-version', 'Loading…');
    heroText.append(el('h2', '', 'H-os'), versionLine, el('p', '', 'A cute little tulip-themed desktop, made with love.'));
    hero.append(heroText);
    (async () => {
      try {
        const info = await window.hos.getInfo();
        versionLine.textContent = `Version ${info.version} · Electron ${info.electron} · ${info.platform}`;
      } catch { versionLine.textContent = 'Version unknown'; }
    })();

    const credits = section('Credits and licences', 'All icons, wallpapers, chess pieces and sounds in H-os are original. It stands on the shoulders of:');
    const list = el('div', 'st-credits');
    for (const [name, license] of CREDITS) {
      const r = el('div', 'st-credit');
      r.append(el('b', '', name), el('span', '', license));
      list.append(r);
    }
    credits.append(list);

    const reset = section('Reset');
    const resetBtn = el('button', 'btn', 'Restore default look and sounds');
    resetBtn.addEventListener('click', restoreDefaults);
    reset.append(row('Start over', resetBtn, 'Puts theme, wallpaper, sounds and taskbar back. Your files and games are untouched.'));
    frag.append(hero, credits, reset);
    return frag;
  };

  // ---------------------------------------------------------------------------
  // PIN dialogs, reset
  // ---------------------------------------------------------------------------
  const pinField = (label) => {
    const wrap = el('label', 'dialog-field');
    const input = el('input');
    input.type = 'password';
    input.inputMode = 'numeric';
    input.maxLength = 8;
    input.autocomplete = 'off';
    input.addEventListener('input', () => { input.value = input.value.replace(/[^0-9]/g, ''); });
    input.addEventListener('keydown', (e) => e.stopPropagation());
    wrap.append(el('span', '', label), input);
    return { wrap, input };
  };

  async function changePin() {
    const fields = [];
    const content = el('div');
    if (hasPin()) fields.push(pinField('Current PIN'));
    const first = pinField('New PIN (4 to 8 digits)');
    const again = pinField('Type it again');
    fields.push(first, again);
    fields.forEach((f) => content.append(f.wrap));
    const current = hasPin() ? fields[0] : null;
    const result = await showDialog({
      title: hasPin() ? 'Change PIN' : 'Set a PIN',
      icon: 'lock',
      content,
      cancelValue: 'cancel',
      buttons: [
        { label: 'Cancel', value: 'cancel' },
        {
          label: 'Save', value: 'save', primary: true,
          validate: () => {
            if (!validPinFormat(first.input.value)) return 'A PIN is 4 to 8 digits.';
            if (first.input.value !== again.input.value) return "The two PINs don't match.";
            return null;
          },
        },
      ],
    });
    if (result !== 'save') return;
    if (current && !(await verifyPin(current.input.value))) {
      toast({ title: 'PIN not changed', message: 'The current PIN was not right.', icon: 'tulip' });
      return;
    }
    await setPin(first.input.value);
    toast({ title: 'PIN saved', message: 'H-os will ask for it on the lock screen.', icon: 'tulip', duration: 3000 });
    refreshAll();
  }

  async function removePin() {
    const field = pinField('Current PIN');
    const content = el('div');
    content.append(field.wrap);
    const result = await showDialog({
      title: 'Remove the PIN?', icon: 'lock', content, cancelValue: 'cancel',
      buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'Remove', value: 'remove', primary: true, danger: true }],
    });
    if (result !== 'remove') return;
    if (!(await verifyPin(field.input.value))) {
      toast({ title: 'PIN not removed', message: 'That was not the right PIN.', icon: 'tulip' });
      return;
    }
    clearPin();
    toast({ title: 'PIN removed', message: 'The lock screen is just a click again.', icon: 'tulip', duration: 3000 });
    refreshAll();
  }

  async function restoreDefaults() {
    const ok = await confirmDialog({
      title: 'Restore defaults?', message: 'Theme, wallpaper, accent, sounds, brightness and taskbar go back to how they started.',
      icon: 'settings', confirmLabel: 'Restore',
    });
    if (!ok) return;
    for (const key of ['theme', 'accent', 'wallpaper', 'taskbarAlign', 'sounds', 'volume', 'brightness', 'userName']) setSetting(key, DEFAULTS[key]);
    setDoNotDisturb(false);
    refreshAll();
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------
  const NAV = [['personalization', 'wallpaper', 'Personalization'], ['system', 'gear', 'System'], ['account', 'user', 'Account'], ['about', 'info', 'About']];
  const navButtons = {};
  let current = null;

  function show(id) {
    current = id;
    refreshers.length = 0;
    page.replaceChildren(el('h2', 'st-title', NAV.find((n) => n[0] === id)[2]), pages[id]());
    for (const [key, b] of Object.entries(navButtons)) b.classList.toggle('is-active', key === id);
    refreshAll();
    page.scrollTop = 0;
  }
  function refreshAll() { refreshers.forEach((fn) => fn()); }

  for (const [id, icon, label] of NAV) {
    const b = el('button', 'st-nav-item');
    b.append(iconEl(icon), el('span', '', label));
    b.addEventListener('click', () => show(id));
    nav.append(b);
    navButtons[id] = b;
  }

  const unsubscribe = [onSettingChange(() => refreshAll()), on('notifications:changed', () => refreshAll())];
  show(ctx.options.page && pages[ctx.options.page] ? ctx.options.page : 'personalization');

  return {
    destroy() { unsubscribe.forEach((u) => u()); },
    _show: show,
    _current: () => current,
  };
}

export function registerSettings() {
  registerApp({
    id: 'settings',
    name: 'Settings',
    icon: 'settings',
    desktop: true,
    keywords: 'personalize theme wallpaper accent taskbar sound volume brightness pin about',
    defaultSize: { w: 820, h: 580 },
    minSize: { w: 560, h: 420 },
    singleInstance: true,
    create,
  });
}
