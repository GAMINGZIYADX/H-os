// =============================================================================
// apps/notepad.js — Notepad: edit real text files
// =============================================================================
// Opens/saves through the main process (fsClient.js), which refuses to write into system
// folders. Open and Save As use the system's file dialogs.
//
//   File:   New · Open… · Save · Save as… · Close          (Ctrl+N / O / S / Shift+S)
//   Edit:   Undo · Redo · Cut · Copy · Paste · Find · Select all · Time/Date (F5)
//   Format: Word wrap · Font size
// Closing with unsaved changes asks "Save changes?" first.

import { el } from '../dom.js';
import { registerApp } from '../appRegistry.js';
import { fsApi } from '../fsClient.js';
import { showContextMenu } from '../contextMenu.js';
import { showDialog } from '../ui/dialogs.js';
import { toast } from '../notifications.js';
import { addRecent } from '../settingsStore.js';
import { baseName } from '../pathUtil.js';

function create(container, ctx) {
  // `encoding` is how the file is stored on disk (detected when opening, written back the same way).
  const doc = { path: null, name: 'Untitled', saved: '', eol: 'lf', encoding: 'utf8', encodingChanged: false };
  const ENCODING_LABELS = { utf8: 'UTF-8', 'utf8-bom': 'UTF-8 with BOM', utf16le: 'UTF-16 LE', utf16be: 'UTF-16 BE', 'windows-1252': 'ANSI (Windows-1252)' };
  let wrap = true;
  let fontSize = 14;
  let destroyed = false;

  // ---- layout ----
  const root = el('div', 'np');
  const menubar = el('div', 'np-menubar');
  const area = el('textarea', 'np-area');
  area.spellcheck = false;
  area.wrap = 'soft';
  const findBar = el('div', 'np-find');
  findBar.hidden = true;
  const findInput = el('input');
  findInput.placeholder = 'Find…';
  const findPrev = el('button', 'btn', 'Previous');
  const findNext = el('button', 'btn', 'Next');
  const findClose = el('button', 'btn', 'Close');
  const findInfo = el('span', 'np-find-info');
  findBar.append(findInput, findPrev, findNext, findInfo, findClose);
  const statusbar = el('div', 'np-status');
  const sPos = el('span');
  const sLen = el('span');
  const sInfo = el('span', '', 'UTF-8');
  statusbar.append(sPos, sLen, el('span', 'ex-spacer'), sInfo);
  root.append(menubar, findBar, area, statusbar);
  container.append(root);

  const isDirty = () => area.value !== doc.saved || doc.encodingChanged;

  function refreshTitle() {
    ctx.setTitle(`${isDirty() ? '*' : ''}${doc.name} - Notepad`);
  }
  function refreshStatus() {
    const before = area.value.slice(0, area.selectionStart).split('\n');
    sPos.textContent = `Ln ${before.length}, Col ${before[before.length - 1].length + 1}`;
    sLen.textContent = `${area.value.length.toLocaleString()} characters`;
    sInfo.textContent = `${doc.eol === 'crlf' ? 'Windows (CRLF)' : 'Unix (LF)'}   ${ENCODING_LABELS[doc.encoding]}   ${Math.round((fontSize / 14) * 100)}%`;
  }
  function applyFormat() {
    area.wrap = wrap ? 'soft' : 'off';
    area.style.whiteSpace = wrap ? 'pre-wrap' : 'pre';
    area.style.fontSize = fontSize + 'px';
    refreshStatus();
  }

  // ---- file actions ----
  // Returns true when it is safe to throw the current text away (saved, or the user said don't save).
  async function confirmDiscard() {
    if (!isDirty()) return true;
    const choice = await showDialog({
      title: 'Save changes?',
      message: `Do you want to save the changes to "${doc.name}"?`,
      icon: 'notepad',
      cancelValue: 'cancel',
      buttons: [
        { label: 'Cancel', value: 'cancel' },
        { label: "Don't save", value: 'discard' },
        { label: 'Save', value: 'save', primary: true },
      ],
    });
    if (choice === 'save') return save();
    return choice === 'discard';
  }

  function setDocument(next, text) {
    Object.assign(doc, { encoding: 'utf8', ...next, encodingChanged: false });
    doc.saved = text;
    area.value = text;
    area.setSelectionRange(0, 0);
    area.scrollTop = 0;
    refreshTitle();
    refreshStatus();
  }

  async function newDoc() {
    if (!(await confirmDiscard())) return;
    setDocument({ path: null, name: 'Untitled', eol: 'lf' }, '');
    area.focus();
  }

  async function loadPath(path) {
    try {
      const file = await fsApi.readText(path);
      setDocument({ path: file.path, name: file.name, eol: file.eol, encoding: file.encoding }, file.text);
      addRecent({ name: file.name, path: file.path });
      area.focus();
      return true;
    } catch (err) {
      toast({ title: `Couldn't open ${baseName(path)}`, message: err.message, icon: 'notepad', duration: 6000 });
      return false;
    }
  }

  async function openFile() {
    if (!(await confirmDiscard())) return;
    try {
      const path = await fsApi.pickOpenFile('text');
      if (path) await loadPath(path);
    } catch (err) {
      toast({ title: "Couldn't show the Open dialog", message: err.message, icon: 'notepad' });
    }
  }

  async function writeTo(path) {
    const res = await fsApi.writeText(path, area.value, doc.eol, doc.encoding);
    doc.path = res.path;
    doc.name = res.name;
    doc.saved = area.value;
    doc.encodingChanged = false;
    refreshTitle();
    refreshStatus();
    addRecent({ name: res.name, path: res.path });
    return true;
  }

  async function save() {
    if (!doc.path) return saveAs();
    try {
      return await writeTo(doc.path);
    } catch (err) {
      toast({ title: "Couldn't save", message: err.message, icon: 'notepad', duration: 7000 });
      return false;
    }
  }

  async function saveAs() {
    try {
      const path = await fsApi.pickSaveFile(doc.path ? doc.name : 'Untitled.txt');
      if (!path) return false;
      return await writeTo(path);
    } catch (err) {
      toast({ title: "Couldn't save", message: err.message, icon: 'notepad', duration: 7000 });
      return false;
    }
  }

  // ---- find ----
  function find(forward = true) {
    const q = findInput.value;
    if (!q) { findInfo.textContent = ''; return; }
    const text = area.value.toLowerCase();
    const needle = q.toLowerCase();
    let at;
    if (forward) {
      at = text.indexOf(needle, area.selectionEnd);
      if (at < 0) at = text.indexOf(needle); // wrap around
    } else {
      at = area.selectionStart > 0 ? text.lastIndexOf(needle, area.selectionStart - 1) : -1;
      if (at < 0) at = text.lastIndexOf(needle);
    }
    if (at < 0) { findInfo.textContent = 'Not found'; return; }
    findInfo.textContent = '';
    area.focus();
    area.setSelectionRange(at, at + q.length);
    // scroll the match into view (textarea has no built-in way, so nudge by line)
    const line = area.value.slice(0, at).split('\n').length - 1;
    const lineHeight = parseFloat(getComputedStyle(area).lineHeight) || fontSize * 1.5;
    if (!wrap) area.scrollTop = Math.max(0, line * lineHeight - area.clientHeight / 2);
    refreshStatus();
  }
  function openFind() {
    findBar.hidden = false;
    const sel = area.value.slice(area.selectionStart, area.selectionEnd);
    if (sel && !sel.includes('\n')) findInput.value = sel;
    findInput.focus();
    findInput.select();
  }
  findNext.addEventListener('click', () => find(true));
  findPrev.addEventListener('click', () => find(false));
  findClose.addEventListener('click', () => { findBar.hidden = true; area.focus(); });
  findInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); find(!e.shiftKey); }
    if (e.key === 'Escape') { findBar.hidden = true; area.focus(); }
  });

  // ---- edit helpers ----
  const exec = (command) => { area.focus(); document.execCommand(command); };
  async function pasteText() {
    area.focus();
    try {
      const text = await navigator.clipboard.readText();
      document.execCommand('insertText', false, text);
    } catch {
      toast({ title: 'Paste', message: 'Press Ctrl+V to paste into Notepad.', icon: 'notepad', duration: 3000 });
    }
  }
  function insertDateTime() {
    area.focus();
    document.execCommand('insertText', false, new Date().toLocaleString());
  }

  // ---- menus ----
  function addMenu(label, buildItems) {
    const b = el('button', 'np-menu', label);
    b.addEventListener('click', () => {
      const r = b.getBoundingClientRect();
      showContextMenu(r.left, r.bottom + 2, buildItems());
    });
    menubar.append(b);
  }
  addMenu('File', () => [
    { label: 'New', onSelect: newDoc },
    { label: 'Open…', onSelect: openFile },
    { label: 'Save', onSelect: save },
    { label: 'Save as…', onSelect: saveAs },
    { separator: true },
    { label: 'Close', onSelect: () => ctx.close() },
  ]);
  addMenu('Edit', () => [
    { label: 'Undo', onSelect: () => exec('undo') },
    { label: 'Redo', onSelect: () => exec('redo') },
    { separator: true },
    { label: 'Cut', onSelect: () => exec('cut') },
    { label: 'Copy', onSelect: () => exec('copy') },
    { label: 'Paste', onSelect: pasteText },
    { separator: true },
    { label: 'Find…', onSelect: openFind },
    { label: 'Select all', onSelect: () => { area.focus(); area.select(); } },
    { label: 'Time / Date', onSelect: insertDateTime },
  ]);
  addMenu('Format', () => [
    { label: 'Word wrap', checked: wrap, onSelect: () => { wrap = !wrap; applyFormat(); } },
    {
      label: 'Encoding',
      submenu: Object.entries(ENCODING_LABELS).map(([id, label]) => ({
        label, checked: doc.encoding === id,
        onSelect: () => { if (doc.encoding !== id) { doc.encoding = id; doc.encodingChanged = true; refreshTitle(); refreshStatus(); } },
      })),
    },
    { separator: true },
    { label: 'Larger text', onSelect: () => { fontSize = Math.min(40, fontSize + 2); applyFormat(); } },
    { label: 'Smaller text', onSelect: () => { fontSize = Math.max(9, fontSize - 2); applyFormat(); } },
    { label: 'Default size', onSelect: () => { fontSize = 14; applyFormat(); } },
  ]);

  // ---- events ----
  area.addEventListener('input', () => { refreshTitle(); refreshStatus(); });
  for (const type of ['keyup', 'click', 'select']) area.addEventListener(type, refreshStatus);
  area.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    fontSize = Math.max(9, Math.min(40, fontSize + (e.deltaY < 0 ? 1 : -1)));
    applyFormat();
  }, { passive: false });
  root.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (ctrl && k === 's') { e.preventDefault(); e.shiftKey ? saveAs() : save(); }
    else if (ctrl && k === 'o') { e.preventDefault(); openFile(); }
    else if (ctrl && k === 'n') { e.preventDefault(); newDoc(); }
    else if (ctrl && k === 'f') { e.preventDefault(); openFind(); }
    else if (e.key === 'F5') { e.preventDefault(); insertDateTime(); }
  });

  applyFormat();
  refreshTitle();
  if (ctx.options.path) loadPath(ctx.options.path);
  else area.focus();

  return {
    onFocus() { if (!destroyed && !findBar.contains(document.activeElement)) area.focus({ preventScroll: true }); },
    canClose: confirmDiscard,
    destroy() { destroyed = true; },
    _doc: doc, _area: area,
  };
}

export function registerNotepad() {
  registerApp({
    id: 'notepad',
    name: 'Notepad',
    icon: 'notepad',
    desktop: true,
    keywords: 'text edit write notes txt',
    defaultSize: { w: 720, h: 500 },
    minSize: { w: 360, h: 240 },
    create,
  });
}
