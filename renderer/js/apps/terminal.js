// =============================================================================
// apps/terminal.js — Terminal: a REAL shell (PowerShell on Windows) shown with xterm.js
// =============================================================================
// The shell runs in the main process (mainTerm.js) inside a pseudo-terminal, so colours,
// arrow-key history, tab completion, Ctrl+C and full-screen programs all work. This file
// just draws the screen (xterm.js) and passes keystrokes along.
//
//   Copy:  select text, then Ctrl+Shift+C (or Ctrl+C while text is selected) · right-click menu
//   Paste: Ctrl+V or Ctrl+Shift+V · right-click menu
//   Ctrl+C with nothing selected is the usual "stop this program".
// If a pseudo-terminal isn't available we fall back to plain pipes with simple line editing
// (the greeting says so).

import { el } from '../dom.js';
import { registerApp } from '../appRegistry.js';
import { onSettingChange } from '../settingsStore.js';
import { showContextMenu } from '../contextMenu.js';
import { toast } from '../notifications.js';

// xterm needs real colour values, so we read the --term-* variables from theme.css (light and
// dark versions live there). Called when the window opens and again when the theme changes.
function currentTheme() {
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  return {
    background: v('--term-bg'), foreground: v('--term-fg'), cursor: v('--term-cursor'), cursorAccent: v('--term-bg'),
    selectionBackground: v('--term-selection'),
    black: v('--term-black'), red: v('--term-red'), green: v('--term-green'), yellow: v('--term-yellow'),
    blue: v('--term-blue'), magenta: v('--term-magenta'), cyan: v('--term-cyan'), white: v('--term-white'),
    brightBlack: v('--term-bright-black'), brightRed: v('--term-bright-red'), brightGreen: v('--term-bright-green'),
    brightYellow: v('--term-bright-yellow'), brightBlue: v('--term-bright-blue'), brightMagenta: v('--term-bright-magenta'),
    brightCyan: v('--term-bright-cyan'), brightWhite: v('--term-bright-white'),
  };
}

async function create(container, ctx) {
  ctx.setTitle('Terminal');
  const holder = el('div', 'term');
  container.append(holder);

  // Load xterm lazily so a missing file shows a message instead of breaking all of H-os.
  let Terminal, FitAddon;
  try {
    ({ Terminal } = await import('../../vendor/xterm/xterm.mjs'));
    ({ FitAddon } = await import('../../vendor/xterm/addon-fit.mjs'));
  } catch (err) {
    console.error(err);
    holder.append(el('div', 'win-error', 'The terminal library is missing. Run "npm install" and restart H-os.'));
    return {};
  }

  const term = new Terminal({
    fontFamily: "'Cascadia Mono', 'Cascadia Code', Consolas, 'DejaVu Sans Mono', monospace",
    fontSize: 14,
    lineHeight: 1.15,
    cursorBlink: true,
    cursorStyle: 'bar',
    scrollback: 5000,
    theme: currentTheme(),
    allowProposedApi: true,
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.open(holder);
  holder.style.background = currentTheme().background;
  safeFit();

  let sid = null;
  let mode = 'pty';
  let exited = false;
  let destroyed = false;
  const subscriptions = [];

  function safeFit() {
    try { fit.fit(); } catch { /* not visible yet */ }
  }


  // ---- start the shell ----
  const info = await window.hos.term.spawn({ cols: term.cols, rows: term.rows, cwd: ctx.options.path });
  if (!info.ok) {
    term.write(`\r\n\x1b[31m${info.error.message}\x1b[0m\r\n`);
    return { destroy: () => term.dispose() };
  }
  sid = info.data.id;
  mode = info.data.mode;
  if (!info.data.greeted) term.write(String.fromCharCode(27) + '[38;5;205mWelcome to H-os 🌷' + String.fromCharCode(27) + '[0m\r\n'); // (PowerShell prints its own)
  if (mode === 'pipe') {
    term.write('\x1b[33m(Basic mode: no pseudo-terminal is available, so line editing is simple.)\x1b[0m\r\n');
  }
  if (destroyed) { window.hos.term.kill(sid); return {}; }

  subscriptions.push(window.hos.term.onData((id, data) => { if (id === sid) { term.write(data); notePipeOutput(); } }));
  subscriptions.push(window.hos.term.onExit((id, code) => {
    if (id !== sid) return;
    exited = true;
    term.write(`\r\n\x1b[2m[Process exited with code ${code}. Press any key to close this window.]\x1b[0m`);
  }));

  // ---- keyboard in -> shell ----
  let line = '';            // pipe mode only: the line being typed
  const history = [];
  let historyIndex = -1;
  let promptTimer = null;
  let atPrompt = false;

  function showPrompt() {
    atPrompt = true;
    term.write('\x1b[35mPS>\x1b[0m ');
  }
  function notePipeOutput() {
    if (mode !== 'pipe') return;
    atPrompt = false;
    clearTimeout(promptTimer);
    promptTimer = setTimeout(showPrompt, 250);
  }

  function pipeInput(data) {
    for (const ch of data) {
      if (ch === '\r') {
        term.write('\r\n');
        if (line.trim()) history.unshift(line);
        historyIndex = -1;
        window.hos.term.write(sid, line + '\n');
        line = '';
        atPrompt = false;
        notePipeOutput();
      } else if (ch === '\x7f' || ch === '\b') {
        if (line.length) { line = line.slice(0, -1); term.write('\b \b'); }
      } else if (ch === '\x03') {
        line = '';
        term.write('^C\r\n');
        showPrompt();
      } else if (ch >= ' ' && ch !== '\x1b') {
        line += ch;
        term.write(ch);
      }
    }
    // Up / down arrows: walk through history.
    if (data === '\x1b[A' || data === '\x1b[B') {
      historyIndex = Math.max(-1, Math.min(history.length - 1, historyIndex + (data === '\x1b[A' ? 1 : -1)));
      term.write('\b \b'.repeat(line.length));
      line = historyIndex >= 0 ? history[historyIndex] : '';
      term.write(line);
    }
  }

  term.onData((data) => {
    if (exited) { ctx.close(); return; }
    if (mode === 'pty') window.hos.term.write(sid, data);
    else pipeInput(data);
  });
  term.onResize(({ cols, rows }) => { if (sid && !exited) window.hos.term.resize(sid, cols, rows); });
  if (mode === 'pipe') notePipeOutput();

  // ---- copy / paste ----
  async function copySelection() {
    const text = term.getSelection();
    if (!text) return false;
    await window.hos.clipboard.writeText(text);
    term.clearSelection();
    return true;
  }
  async function pasteClipboard() {
    const r = await window.hos.clipboard.readText();
    if (r.ok && r.data) term.paste(r.data);
    else if (!r.ok) toast({ title: 'Paste', message: r.error.message, icon: 'terminal' });
  }

  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown') return true;
    const key = e.key.toLowerCase();
    if (e.ctrlKey && key === 'c' && (e.shiftKey || term.hasSelection())) { e.preventDefault(); copySelection(); return false; }
    if (e.ctrlKey && key === 'v') { e.preventDefault(); pasteClipboard(); return false; }
    return true;
  });

  holder.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY, [
      { label: 'Copy', icon: 'copy', disabled: !term.hasSelection(), onSelect: copySelection },
      { label: 'Paste', icon: 'paste', onSelect: pasteClipboard },
      { separator: true },
      { label: 'Select all', onSelect: () => term.selectAll() },
      { label: 'Clear', icon: 'trash', onSelect: () => term.clear() },
    ]);
  });

  // ---- keep the shell the same size as the window ----
  let fitFrame = 0;
  const observer = new ResizeObserver(() => {
    if (fitFrame) return;
    fitFrame = requestAnimationFrame(() => { fitFrame = 0; safeFit(); });
  });
  observer.observe(holder);

  // ---- follow the light / dark theme ----
  subscriptions.push(onSettingChange((key) => {
    if (key !== 'theme') return;
    term.options.theme = currentTheme();
    holder.style.background = currentTheme().background;
  }));

  term.focus();
  // Development only (npm run dev / smoke tests): let tests look inside terminals.
  if (window.__hos) (window.__hos.terminals ||= []).push({ term, info: () => ({ sid, mode, exited }) });

  return {
    onFocus() { if (!destroyed) term.focus(); },
    destroy() {
      destroyed = true;
      observer.disconnect();
      clearTimeout(promptTimer);
      subscriptions.forEach((off) => off());
      if (sid !== null && !exited) window.hos.term.kill(sid);
      term.dispose();
    },
    // for tests
    _term: term,
    _info: () => ({ sid, mode, exited }),
  };
}

export function registerTerminal() {
  registerApp({
    id: 'terminal',
    name: 'Terminal',
    icon: 'terminal',
    desktop: true,
    keywords: 'shell powershell bash command line cmd console',
    defaultSize: { w: 780, h: 480 },
    minSize: { w: 360, h: 220 },
    create,
  });
}
