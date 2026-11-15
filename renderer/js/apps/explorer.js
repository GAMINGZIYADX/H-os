// =============================================================================
// apps/explorer.js — File Explorer (browses the REAL filesystem)
// =============================================================================
//
// All disk access goes through fsClient.js -> the main process, which checks every path.
// Deleting only ever moves things to the Recycle Bin. This file is just the interface:
//
//   [ ◀ ▶ ▲ ⟳ | address bar (breadcrumbs, click to type) | search ]
//   [ New folder | Cut Copy Paste Rename Delete | Sort ▾ View ▾ | Properties ]
//   [ sidebar | files (details / list / grid views) ]
//   [ status bar ]
//
// Selection: click, Ctrl+click, Shift+click, Ctrl+A.  Keyboard: Enter open, F2 rename, Delete,
// Ctrl+C/X/V, Backspace or Alt+Up = up folder, Alt+Left/Right = history, F5 refresh, Ctrl+L address.
// Drag files onto a folder, a sidebar place or a breadcrumb to move them (hold Ctrl to copy).

import { el } from '../dom.js';
import { iconEl } from '../icons.js';
import { registerApp } from '../appRegistry.js';
import { fsApi } from '../fsClient.js';
import { setPlatform, baseName, parentOf, joinPath, splitPath, samePath, isInside, isWindows } from '../pathUtil.js';
import { describe, formatSize, formatDate } from '../fileTypes.js';
import { getSetting, setSetting } from '../settingsStore.js';
import { showContextMenu } from '../contextMenu.js';
import { showDialog } from '../ui/dialogs.js';
import { on } from '../events.js';
import { openFileSmart } from '../fileOpen.js';
import {
  getClipboard, setClipboard, clipboardHasItems, setDrag, getDrag,
  pasteInto, trashPaths, notifyChanged, reportError,
} from '../fileOps.js';

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function create(container, ctx) {
  // ---- per-window state ----
  const st = {
    path: null,          // current folder, or 'thispc'
    history: [], idx: -1,
    entries: [],         // raw entries from the main process
    truncated: false,
    selection: new Set(),
    anchor: null,        // for Shift+click ranges
    search: '',
    token: 0,            // used to ignore out-of-date folder loads
    places: null,
    drives: [],
    destroyed: false,
  };
  let prefs = { view: 'details', sortKey: 'name', sortDir: 'asc', showHidden: false, ...getSetting('explorer') };
  const savePrefs = () => setSetting('explorer', { ...prefs });

  // ---------------------------------------------------------------------------
  // Build the layout
  // ---------------------------------------------------------------------------
  const root = el('div', 'ex');
  root.tabIndex = -1;

  const toolbar = el('div', 'ex-toolbar');
  const iconBtn = (icon, title, onClick) => {
    const b = el('button', 'ex-btn');
    b.title = title;
    b.setAttribute('aria-label', title);
    b.append(iconEl(icon));
    b.addEventListener('click', onClick);
    return b;
  };
  const btnBack = iconBtn('back', 'Back (Alt+Left)', () => goHistory(-1));
  const btnForward = iconBtn('forward', 'Forward (Alt+Right)', () => goHistory(1));
  const btnUp = iconBtn('up', 'Up one folder (Alt+Up)', goUp);
  const btnRefresh = iconBtn('refresh', 'Refresh (F5)', () => refresh());

  const address = el('div', 'ex-address');
  const crumbs = el('div', 'ex-crumbs');
  const addressInput = el('input', 'ex-address-input');
  addressInput.spellcheck = false;
  addressInput.hidden = true;
  address.append(crumbs, addressInput);

  const search = el('label', 'ex-search');
  const searchInput = el('input');
  searchInput.placeholder = 'Search this folder';
  searchInput.spellcheck = false;
  search.append(iconEl('search'), searchInput);

  toolbar.append(btnBack, btnForward, btnUp, btnRefresh, address, search);

  // command bar
  const commands = el('div', 'ex-commands');
  const cmd = (icon, label, onClick, extra = '') => {
    const b = el('button', 'ex-cmd ' + extra);
    b.title = label;
    b.append(iconEl(icon), el('span', '', label));
    b.addEventListener('click', onClick);
    return b;
  };
  const cmdNew = cmd('folder-plus', 'New folder', () => newFolder());
  const cmdCut = cmd('cut', 'Cut', () => doClipboard('cut'));
  const cmdCopy = cmd('copy', 'Copy', () => doClipboard('copy'));
  const cmdPaste = cmd('paste', 'Paste', () => doPaste());
  const cmdRename = cmd('rename', 'Rename', () => startRename());
  const cmdDelete = cmd('trash', 'Delete', () => doDelete());
  const cmdSort = cmd('sort', 'Sort', (e) => openSortMenu(e.currentTarget));
  const cmdView = cmd('view', 'View', (e) => openViewMenu(e.currentTarget));
  const cmdProps = cmd('info', 'Properties', () => showProperties());
  commands.append(cmdNew, el('span', 'ex-sep'), cmdCut, cmdCopy, cmdPaste, cmdRename, cmdDelete, el('span', 'ex-sep'), cmdSort, cmdView, el('span', 'ex-spacer'), cmdProps);

  const main = el('div', 'ex-main');
  const sidebar = el('nav', 'ex-sidebar');
  const content = el('div', 'ex-content');
  content.tabIndex = 0;
  main.append(sidebar, content);

  const status = el('div', 'ex-status');
  const statusLeft = el('span');
  const statusRight = el('span');
  status.append(statusLeft, statusRight);

  root.append(toolbar, commands, main, status);
  container.append(root);

  // ---------------------------------------------------------------------------
  // Data helpers
  // ---------------------------------------------------------------------------
  const isThisPc = () => st.path === 'thispc';

  function visibleEntries() {
    let list = st.entries;
    if (st.search) {
      const q = st.search.toLowerCase();
      list = list.filter((e) => e.name.toLowerCase().includes(q));
    }
    const dir = prefs.sortDir === 'asc' ? 1 : -1;
    const key = prefs.sortKey;
    return [...list].sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1; // folders first, always
      let r = 0;
      if (key === 'date') r = (a.mtime || 0) - (b.mtime || 0);
      else if (key === 'size') r = (a.size || 0) - (b.size || 0);
      else if (key === 'type') r = collator.compare(describe(a).label, describe(b).label);
      if (r === 0) r = collator.compare(a.name, b.name);
      return r * dir;
    });
  }
  const entryByPath = (p) => st.entries.find((e) => e.path === p);
  const selectedEntries = () => [...st.selection].map(entryByPath).filter(Boolean);
  const canChange = () => !isThisPc() && Boolean(st.path);

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------
  async function load(target) {
    const token = ++st.token;
    if (target === 'thispc') {
      const [drives] = await Promise.all([fsApi.drives().catch(() => [])]);
      if (token !== st.token) return false;
      st.drives = drives;
      st.entries = [];
      st.truncated = false;
      st.path = 'thispc';
      return true;
    }
    const data = await fsApi.readdir(target, { showHidden: prefs.showHidden });
    if (token !== st.token) return false; // a newer navigation started meanwhile
    st.entries = data.entries;
    st.truncated = data.truncated;
    st.path = data.path;
    return true;
  }

  async function navigate(target, { push = true, select = [] } = {}) {
    try {
      if (!(await load(target))) return;
    } catch (err) {
      reportError(err, `Can't open ${baseName(target)}`);
      return false;
    }
    if (push) {
      st.history = st.history.slice(0, st.idx + 1);
      if (!st.history.length || !samePath(st.history[st.history.length - 1], st.path)) st.history.push(st.path);
      st.idx = st.history.length - 1;
    }
    st.selection = new Set(select);
    st.anchor = null;
    st.search = '';
    searchInput.value = '';
    ctx.setTitle(baseName(st.path));
    renderAll();
    content.scrollTop = 0;
    return true;
  }

  async function goHistory(delta) {
    const next = st.idx + delta;
    if (next < 0 || next >= st.history.length) return;
    st.idx = next;
    try {
      if (await load(st.history[st.idx])) {
        st.selection.clear();
        st.search = '';
        searchInput.value = '';
        ctx.setTitle(baseName(st.path));
        renderAll();
      }
    } catch (err) {
      reportError(err);
    }
  }

  function goUp() {
    const parent = st.path && parentOf(st.path);
    if (parent) navigate(parent, { select: [st.path] });
  }

  // Reload the current folder, keeping the selection.
  async function refresh(keep = true) {
    if (!st.path) return;
    const keepSel = keep ? [...st.selection] : [];
    try {
      if (await load(st.path)) {
        st.selection = new Set(keepSel.filter((p) => entryByPath(p)));
        renderAll();
      }
    } catch (err) {
      // The folder may have been deleted or become unreadable: step back out.
      reportError(err, 'Folder changed');
      const parent = parentOf(st.path);
      if (parent) navigate(parent);
    }
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  function renderAll() {
    renderCrumbs();
    renderSidebar();
    renderContent();
    renderStatus();
    updateButtons();
  }

  // --- breadcrumbs ---
  function crumbButton(name, path) {
    const b = el('button', 'ex-crumb', name);
    b.dataset.path = path;
    b.addEventListener('click', (e) => { e.stopPropagation(); navigate(path); });
    attachDropTarget(b, () => (path === 'thispc' ? null : path));
    return b;
  }
  function renderCrumbs() {
    const parts = [crumbButton('This PC', 'thispc')];
    for (const seg of splitPath(st.path || 'thispc')) parts.push(crumbButton(seg.name, seg.path));
    const nodes = [];
    parts.forEach((p, i) => {
      if (i) nodes.push(iconEl('chevron', 'ex-crumb-sep'));
      nodes.push(p);
    });
    crumbs.replaceChildren(...nodes);
    crumbs.scrollLeft = crumbs.scrollWidth; // long paths: keep the END (where you are) visible
  }
  address.addEventListener('click', (e) => {
    if (e.target.closest('.ex-crumb') || !st.path) return;
    editAddress();
  });
  function editAddress() {
    addressInput.value = isThisPc() ? '' : st.path;
    crumbs.hidden = true;
    addressInput.hidden = false;
    addressInput.focus();
    addressInput.select();
  }
  function endEditAddress() {
    addressInput.hidden = true;
    crumbs.hidden = false;
  }
  addressInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); endEditAddress(); content.focus(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const typed = addressInput.value.trim().replace(/^"(.*)"$/, '$1');
      endEditAddress();
      if (!typed) return;
      if (/^this pc$/i.test(typed)) { navigate('thispc'); return; }
      try {
        const info = await fsApi.stat(typed);
        if (info.isDir) await navigate(info.path);
        else await navigate(parentOf(info.path), { select: [info.path] });
      } catch (err) {
        reportError(err, "Can't go there");
      }
      content.focus();
    }
  });
  addressInput.addEventListener('blur', endEditAddress);

  // --- sidebar ---
  function placeItem(icon, label, path, extraClass = '') {
    const b = el('button', 'ex-place ' + extraClass);
    b.dataset.path = path;
    b.append(iconEl(icon), el('span', '', label));
    b.addEventListener('click', () => navigate(path));
    attachDropTarget(b, () => (path === 'thispc' ? null : path));
    return b;
  }
  function renderSidebar() {
    if (!st.places) return;
    const p = st.places;
    const items = [
      ['home', 'Home', p.home], ['desktop', 'Desktop', p.desktop], ['document', 'Documents', p.documents],
      ['download', 'Downloads', p.downloads], ['picture', 'Pictures', p.pictures], ['music', 'Music', p.music], ['video', 'Videos', p.videos],
    ].map(([icon, label, path]) => placeItem(icon, label, path));
    const nodes = [...items, el('div', 'ex-side-sep'), placeItem('pc', 'This PC', 'thispc')];
    for (const d of st.drives) nodes.push(placeItem('drive', d.name.replace('Local Disk ', ''), d.path, 'is-drive'));
    sidebar.replaceChildren(...nodes);

    // highlight the place that contains the current folder (the most specific one wins)
    let best = null;
    for (const node of sidebar.querySelectorAll('.ex-place')) {
      const path = node.dataset.path;
      const hit = path === 'thispc' ? isThisPc() : !isThisPc() && isInside(st.path, path);
      if (hit && (!best || path.length > best.dataset.path.length)) best = node;
    }
    if (best) best.classList.add('is-active');
  }

  // --- the file list ---
  const nodeByPath = new Map();

  function renderContent() {
    nodeByPath.clear();
    content.dataset.view = prefs.view;
    content.classList.remove('is-empty');
    if (isThisPc()) { renderThisPc(); return; }

    const list = visibleEntries();
    const frag = document.createDocumentFragment();

    if (prefs.view === 'details') {
      const head = el('div', 'ex-row ex-head');
      for (const [key, label] of [['name', 'Name'], ['date', 'Date modified'], ['type', 'Type'], ['size', 'Size']]) {
        const cell = el('button', 'ex-cell ex-cell-' + key);
        cell.append(el('span', '', label));
        if (prefs.sortKey === key) cell.append(el('span', 'ex-sort-arrow', prefs.sortDir === 'asc' ? '▲' : '▼'));
        cell.addEventListener('click', () => {
          prefs = { ...prefs, sortDir: prefs.sortKey === key && prefs.sortDir === 'asc' ? 'desc' : 'asc', sortKey: key };
          savePrefs();
          renderContent();
          renderStatus();
        });
        head.append(cell);
      }
      frag.append(head);
    }

    for (const entry of list) frag.append(itemNode(entry));
    content.replaceChildren(frag);

    if (list.length === 0) {
      const msg = el('div', 'ex-empty');
      msg.append(iconEl('tulip'), el('div', '', st.search ? `No matches for “${st.search}”.` : 'This folder is empty.'));
      content.append(msg);
    }
    if (st.truncated) content.append(el('div', 'ex-note', 'This folder is huge, so only the first 5000 items are shown.'));
    paintSelection();
  }

  function itemNode(entry) {
    const d = describe(entry);
    const node = el('div', 'ex-item ex-row');
    node.dataset.path = entry.path;
    node.draggable = true;
    node.title = entry.name;
    const name = el('div', 'ex-cell ex-cell-name');
    name.append(iconEl(d.icon, 'ex-icon'), el('span', 'ex-name', entry.name));
    node.append(name);
    if (prefs.view === 'details') {
      node.append(el('div', 'ex-cell ex-cell-date', formatDate(entry.mtime)), el('div', 'ex-cell ex-cell-type', d.label), el('div', 'ex-cell ex-cell-size', entry.isDir ? '' : formatSize(entry.size)));
    }
    if (entry.isDir) attachDropTarget(node, () => entry.path);
    nodeByPath.set(entry.path, node);
    return node;
  }

  function renderThisPc() {
    const frag = document.createDocumentFragment();
    const group = (title) => frag.append(el('h3', 'ex-group', title));
    const tile = (icon, name, sub, path, bar) => {
      const t = el('button', 'ex-tile');
      t.dataset.path = path;
      t.append(iconEl(icon, 'ex-tile-icon'));
      const text = el('div', 'ex-tile-text');
      text.append(el('div', 'ex-tile-name', name));
      if (bar !== undefined) {
        const meter = el('div', 'ex-meter');
        const fill = el('div', 'ex-meter-fill');
        fill.style.width = Math.round(bar * 100) + '%';
        if (bar > 0.9) fill.classList.add('is-full');
        meter.append(fill);
        text.append(meter);
      }
      if (sub) text.append(el('div', 'ex-tile-sub', sub));
      t.append(text);
      t.addEventListener('dblclick', () => navigate(path));
      t.addEventListener('keydown', (e) => { if (e.key === 'Enter') navigate(path); });
      return t;
    };
    group('Folders');
    const grid1 = el('div', 'ex-tiles');
    const p = st.places;
    for (const [icon, label, path] of [['folder', 'Desktop', p.desktop], ['folder', 'Documents', p.documents], ['folder', 'Downloads', p.downloads], ['folder', 'Pictures', p.pictures], ['folder', 'Music', p.music], ['folder', 'Videos', p.videos]]) {
      grid1.append(tile(icon, label, '', path));
    }
    frag.append(grid1);
    group('Devices and drives');
    const grid2 = el('div', 'ex-tiles');
    for (const d of st.drives) {
      const used = d.total ? (d.total - d.free) / d.total : 0;
      grid2.append(tile('drive', d.name, `${formatSize(d.free)} free of ${formatSize(d.total)}`, d.path, used));
    }
    if (!st.drives.length) grid2.append(el('div', 'ex-note', 'No drives found.'));
    frag.append(grid2);
    content.replaceChildren(frag);
  }

  function renderStatus() {
    if (isThisPc()) {
      statusLeft.textContent = `${st.drives.length} drive${st.drives.length === 1 ? '' : 's'}`;
      statusRight.textContent = '';
      return;
    }
    const list = visibleEntries();
    const total = st.search ? `${list.length} of ${st.entries.length} items` : `${list.length} item${list.length === 1 ? '' : 's'}`;
    const sel = selectedEntries();
    let text = total;
    if (sel.length) {
      const bytes = sel.reduce((n, e) => n + (e.isDir ? 0 : e.size || 0), 0);
      text += `   ·   ${sel.length} selected${bytes ? ` (${formatSize(bytes)})` : ''}`;
    }
    statusLeft.textContent = text;
    statusRight.textContent = prefs.showHidden ? 'Hidden items shown' : '';
  }

  function updateButtons() {
    btnBack.disabled = st.idx <= 0;
    btnForward.disabled = st.idx >= st.history.length - 1;
    btnUp.disabled = !st.path || !parentOf(st.path);
    const change = canChange();
    const has = st.selection.size > 0;
    cmdNew.disabled = !change;
    cmdCut.disabled = !change || !has;
    cmdCopy.disabled = !change || !has;
    cmdPaste.disabled = !change || !clipboardHasItems();
    cmdRename.disabled = !change || st.selection.size !== 1;
    cmdDelete.disabled = !change || !has;
    cmdProps.disabled = !st.path;
  }

  function paintSelection() {
    const clip = getClipboard();
    for (const [path, node] of nodeByPath) {
      node.classList.toggle('is-selected', st.selection.has(path));
      node.classList.toggle('is-cut', clip.mode === 'cut' && clip.paths.includes(path));
    }
    renderStatus();
    updateButtons();
  }

  // ---------------------------------------------------------------------------
  // Selection (mouse)
  // ---------------------------------------------------------------------------
  function selectOnly(path) {
    st.selection = new Set(path ? [path] : []);
    st.anchor = path;
    paintSelection();
  }

  content.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.ex-rename')) return;
    const node = e.target.closest('.ex-item');
    if (e.button === 0 || e.button === 2) content.focus({ preventScroll: true });
    if (!node) {
      if (e.button === 0 && !e.ctrlKey && !e.shiftKey && !e.target.closest('.ex-head, .ex-tile')) { st.selection.clear(); st.anchor = null; paintSelection(); }
      return;
    }
    const path = node.dataset.path;
    if (e.button === 2) { if (!st.selection.has(path)) selectOnly(path); return; }
    if (e.button !== 0) return;
    if (e.ctrlKey || e.metaKey) {
      if (st.selection.has(path)) st.selection.delete(path); else st.selection.add(path);
      st.anchor = path;
      paintSelection();
    } else if (e.shiftKey && st.anchor) {
      const order = visibleEntries().map((x) => x.path);
      const a = order.indexOf(st.anchor);
      const b = order.indexOf(path);
      if (a >= 0 && b >= 0) st.selection = new Set(order.slice(Math.min(a, b), Math.max(a, b) + 1));
      paintSelection();
    } else if (!st.selection.has(path)) {
      selectOnly(path);
    }
  });
  // A plain click on one item of a multi-selection collapses to that item (but a drag does not).
  content.addEventListener('click', (e) => {
    const node = e.target.closest('.ex-item');
    if (!node || e.ctrlKey || e.shiftKey || e.metaKey || e.target.closest('.ex-rename')) return;
    if (st.selection.size > 1 && st.selection.has(node.dataset.path)) selectOnly(node.dataset.path);
  });
  content.addEventListener('dblclick', (e) => {
    const node = e.target.closest('.ex-item');
    if (!node) return;
    const entry = entryByPath(node.dataset.path);
    if (entry) openEntry(entry);
  });

  function openEntry(entry) {
    if (entry.isDir) navigate(entry.path);
    else openFileSmart(entry.path);
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  function doClipboard(mode) {
    if (!canChange() || !st.selection.size) return;
    setClipboard(mode, [...st.selection]);
  }
  async function doPaste(into = st.path) {
    if (!canChange() || !clipboardHasItems()) return;
    const { mode, paths } = getClipboard();
    await pasteInto(into, mode === 'cut' ? 'move' : 'copy', paths);
  }
  async function doDelete() {
    if (!canChange() || !st.selection.size) return;
    await trashPaths([...st.selection]);
  }

  function uniqueFolderName() {
    const taken = new Set(st.entries.map((e) => e.name.toLowerCase()));
    let name = 'New folder';
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `New folder (${n})`;
    return name;
  }
  async function newFolder() {
    if (!canChange()) return;
    try {
      const made = await fsApi.mkdir(st.path, uniqueFolderName());
      notifyChanged([st.path]);
      await load(st.path);
      st.selection = new Set([made.path]);
      renderAll();
      startRename(made.path);
    } catch (err) {
      reportError(err, "Couldn't create the folder");
    }
  }

  // --- rename in place ---
  function startRename(path = [...st.selection][0]) {
    const entry = path && entryByPath(path);
    const node = path && nodeByPath.get(path);
    if (!entry || !node || !canChange()) return;
    const label = node.querySelector('.ex-name');
    const input = el('input', 'ex-rename');
    input.value = entry.name;
    input.spellcheck = false;
    label.replaceWith(input);
    node.draggable = false;
    node.scrollIntoView({ block: 'nearest' });
    input.focus();
    const dot = entry.isDir ? -1 : entry.name.lastIndexOf('.');
    input.setSelectionRange(0, dot > 0 ? dot : entry.name.length);

    let finished = false;
    async function finish(commit) {
      if (finished) return;
      finished = true;
      const newName = input.value.trim();
      if (!commit || !newName || newName === entry.name) { renderContent(); return; }
      try {
        const res = await fsApi.rename(entry.path, newName);
        notifyChanged([st.path]);
        await load(st.path);
        st.selection = new Set([res.path]);
        renderAll();
        nodeByPath.get(res.path)?.scrollIntoView({ block: 'nearest' });
      } catch (err) {
        reportError(err, "Couldn't rename");
        renderContent();
      }
      content.focus();
    }
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); content.focus(); }
    });
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('pointerdown', (e) => e.stopPropagation());
    input.addEventListener('dblclick', (e) => e.stopPropagation());
  }

  // ---------------------------------------------------------------------------
  // Menus
  // ---------------------------------------------------------------------------
  function viewItems() {
    const v = (id, label) => ({ label, checked: prefs.view === id, onSelect: () => { prefs = { ...prefs, view: id }; savePrefs(); renderContent(); } });
    return [v('details', 'Details'), v('list', 'List'), v('grid', 'Large icons'), { separator: true },
      { label: 'Show hidden items', checked: prefs.showHidden, onSelect: () => { prefs = { ...prefs, showHidden: !prefs.showHidden }; savePrefs(); refresh(); } }];
  }
  function sortItems() {
    const k = (id, label) => ({ label, checked: prefs.sortKey === id, onSelect: () => { prefs = { ...prefs, sortKey: id }; savePrefs(); renderContent(); renderStatus(); } });
    const d = (id, label) => ({ label, checked: prefs.sortDir === id, onSelect: () => { prefs = { ...prefs, sortDir: id }; savePrefs(); renderContent(); renderStatus(); } });
    return [k('name', 'Name'), k('date', 'Date modified'), k('type', 'Type'), k('size', 'Size'), { separator: true }, d('asc', 'Ascending'), d('desc', 'Descending')];
  }
  function openUnder(button, items) {
    const r = button.getBoundingClientRect();
    showContextMenu(r.left, r.bottom + 4, items);
  }
  const openSortMenu = (b) => openUnder(b, sortItems());
  const openViewMenu = (b) => openUnder(b, viewItems());

  content.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const node = e.target.closest('.ex-item');
    const change = canChange();
    if (node) {
      const entry = entryByPath(node.dataset.path);
      if (!entry) return;
      const multi = st.selection.size > 1;
      const items = [{ label: 'Open', icon: 'open', onSelect: () => (multi ? selectedEntries().forEach(openEntry) : openEntry(entry)) }];
      if (!entry.isDir && !multi) items.push({ label: 'Open with Notepad', icon: 'rename', onSelect: () => openFileSmart(entry.path, { forceApp: 'notepad' }) });
      items.push({ separator: true },
        { label: 'Cut', icon: 'cut', onSelect: () => doClipboard('cut') },
        { label: 'Copy', icon: 'copy', onSelect: () => doClipboard('copy') });
      if (entry.isDir && !multi && clipboardHasItems()) items.push({ label: 'Paste into folder', icon: 'paste', onSelect: () => doPaste(entry.path) });
      items.push({ separator: true },
        { label: 'Rename', icon: 'rename', disabled: multi, onSelect: () => startRename(entry.path) },
        { label: 'Delete', icon: 'trash', onSelect: () => doDelete() },
        { separator: true },
        { label: 'Properties', icon: 'info', onSelect: () => showProperties() });
      showContextMenu(e.clientX, e.clientY, items);
      return;
    }
    if (e.target.closest('.ex-head, .ex-tile')) return;
    if (!isThisPc()) { st.selection.clear(); paintSelection(); }
    showContextMenu(e.clientX, e.clientY, [
      { label: 'View', icon: 'view', submenu: viewItems() },
      { label: 'Sort by', icon: 'sort', submenu: sortItems() },
      { separator: true },
      { label: 'New folder', icon: 'folder-plus', disabled: !change, onSelect: () => newFolder() },
      { label: 'Paste', icon: 'paste', disabled: !change || !clipboardHasItems(), onSelect: () => doPaste() },
      { separator: true },
      { label: 'Refresh', icon: 'refresh', onSelect: () => refresh() },
      { label: 'Properties', icon: 'info', onSelect: () => showProperties() },
    ]);
  });

  // ---------------------------------------------------------------------------
  // Properties dialog
  // ---------------------------------------------------------------------------
  async function showProperties() {
    const target = st.selection.size === 1 ? [...st.selection][0] : st.path;
    if (!target) return;
    let info;
    try {
      info = target === 'thispc' ? null : await fsApi.stat(target);
    } catch (err) { reportError(err); return; }
    if (!info) return;
    const entry = { name: info.name, isDir: info.isDir };
    const table = el('div', 'ex-props');
    const row = (k, v) => {
      const r = el('div', 'ex-props-row');
      r.append(el('span', '', k), el('b', '', v));
      table.append(r);
      return r.lastChild;
    };
    row('Name', info.name);
    row('Type', describe(entry).label);
    row('Location', parentOf(info.path) === 'thispc' ? 'This PC' : parentOf(info.path) || info.path);
    const sizeCell = row('Size', info.isDir ? 'Calculating…' : `${formatSize(info.size)} (${info.size.toLocaleString()} bytes)`);
    if (info.isDir) {
      fsApi.folderInfo(info.path).then((fi) => {
        sizeCell.textContent = `${formatSize(fi.size)}${fi.truncated ? '+' : ''}  ·  ${fi.files.toLocaleString()} files, ${fi.folders.toLocaleString()} folders`;
      }).catch(() => { sizeCell.textContent = 'Unknown'; });
    }
    row('Created', formatDate(info.created));
    row('Modified', formatDate(info.modified));
    row('Accessed', formatDate(info.accessed));
    row('Attributes', [info.readOnly ? 'Read-only' : 'Writable', info.protected ? 'System-protected' : '', info.isSymlink ? 'Link' : ''].filter(Boolean).join(', '));
    await showDialog({ title: 'Properties', icon: describe(entry).icon, content: table, width: 480, buttons: [{ label: 'Close', value: true, primary: true }], cancelValue: true });
  }

  // ---------------------------------------------------------------------------
  // Drag & drop (move; hold Ctrl to copy)
  // ---------------------------------------------------------------------------
  content.addEventListener('dragstart', (e) => {
    const node = e.target.closest('.ex-item');
    if (!node || !canChange()) { e.preventDefault(); return; }
    if (!st.selection.has(node.dataset.path)) selectOnly(node.dataset.path);
    const paths = [...st.selection];
    setDrag(paths);
    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setData('text/plain', paths.map(baseName).join('\n'));
  });
  content.addEventListener('dragend', () => { setDrag([]); clearDropHighlights(); });

  function clearDropHighlights() {
    root.querySelectorAll('.is-drop-target').forEach((n) => n.classList.remove('is-drop-target'));
  }

  // Make `node` accept dropped files; `getDest()` says which folder (or null = not a valid target).
  function attachDropTarget(node, getDest) {
    const valid = (e) => {
      const dest = getDest();
      const dragged = getDrag();
      if (!dest || !dragged.length) return null;
      if (dragged.some((p) => samePath(p, dest) || isInside(dest, p))) return null; // not into itself
      return dest;
    };
    node.addEventListener('dragover', (e) => {
      const dest = valid(e);
      if (!dest) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move';
      node.classList.add('is-drop-target');
    });
    node.addEventListener('dragleave', () => node.classList.remove('is-drop-target'));
    node.addEventListener('drop', (e) => {
      const dest = valid(e);
      node.classList.remove('is-drop-target');
      if (!dest) return;
      e.preventDefault();
      e.stopPropagation();
      pasteInto(dest, e.ctrlKey ? 'copy' : 'move', getDrag());
    });
  }
  // Dropping on the empty part of the list = into the folder being shown.
  attachDropTarget(content, () => (canChange() ? st.path : null));

  // ---------------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------------
  function moveSelection(delta, extend) {
    const order = visibleEntries().map((x) => x.path);
    if (!order.length) return;
    const current = st.anchor && order.includes(st.anchor) ? order.indexOf([...st.selection].pop()) : -1;
    const from = current < 0 ? (delta > 0 ? -1 : order.length) : current;
    const to = Math.max(0, Math.min(order.length - 1, from + delta));
    if (extend && st.anchor) {
      const a = order.indexOf(st.anchor);
      st.selection = new Set(order.slice(Math.min(a, to), Math.max(a, to) + 1));
    } else {
      st.selection = new Set([order[to]]);
      st.anchor = order[to];
    }
    paintSelection();
    nodeByPath.get(order[to])?.scrollIntoView({ block: 'nearest' });
  }
  function gridColumns() {
    const nodes = [...nodeByPath.values()];
    if (!nodes.length) return 1;
    const top = nodes[0].offsetTop;
    return Math.max(1, nodes.filter((n) => n.offsetTop === top).length);
  }

  root.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key;
    if (ctrl && k.toLowerCase() === 'a') { e.preventDefault(); st.selection = new Set(visibleEntries().map((x) => x.path)); paintSelection(); }
    else if (ctrl && k.toLowerCase() === 'c') { e.preventDefault(); doClipboard('copy'); }
    else if (ctrl && k.toLowerCase() === 'x') { e.preventDefault(); doClipboard('cut'); }
    else if (ctrl && k.toLowerCase() === 'v') { e.preventDefault(); doPaste(); }
    else if (ctrl && k.toLowerCase() === 'l') { e.preventDefault(); editAddress(); }
    else if (ctrl && e.shiftKey && k.toLowerCase() === 'n') { e.preventDefault(); newFolder(); }
    else if (k === 'F5') { e.preventDefault(); refresh(); }
    else if (k === 'F2') { e.preventDefault(); startRename(); }
    else if (k === 'Delete') { e.preventDefault(); doDelete(); }
    else if (k === 'Enter') { e.preventDefault(); selectedEntries().forEach(openEntry); }
    else if (k === 'Backspace' || (e.altKey && k === 'ArrowUp')) { e.preventDefault(); goUp(); }
    else if (e.altKey && k === 'ArrowLeft') { e.preventDefault(); goHistory(-1); }
    else if (e.altKey && k === 'ArrowRight') { e.preventDefault(); goHistory(1); }
    else if (k === 'Escape') { if (st.search) { searchInput.value = ''; st.search = ''; renderContent(); renderStatus(); } else { st.selection.clear(); paintSelection(); } }
    else if (k === 'ArrowDown') { e.preventDefault(); moveSelection(prefs.view === 'grid' ? gridColumns() : 1, e.shiftKey); }
    else if (k === 'ArrowUp') { e.preventDefault(); moveSelection(prefs.view === 'grid' ? -gridColumns() : -1, e.shiftKey); }
    else if (k === 'ArrowRight') { e.preventDefault(); moveSelection(1, e.shiftKey); }
    else if (k === 'ArrowLeft') { e.preventDefault(); moveSelection(-1, e.shiftKey); }
    else if (k === 'Home') { e.preventDefault(); moveSelection(-1e9, e.shiftKey); }
    else if (k === 'End') { e.preventDefault(); moveSelection(1e9, e.shiftKey); }
  });

  searchInput.addEventListener('input', () => {
    st.search = searchInput.value.trim();
    renderContent();
    renderStatus();
  });
  searchInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { searchInput.value = ''; st.search = ''; renderContent(); renderStatus(); content.focus(); }
  });

  // ---------------------------------------------------------------------------
  // Live updates from other windows / operations
  // ---------------------------------------------------------------------------
  const unsubscribe = [
    on('fs:changed', (dirs) => { if (!st.destroyed && st.path && dirs.some((d) => samePath(d, st.path))) refresh(); }),
    on('clipboard:changed', () => { if (!st.destroyed) paintSelection(); }),
  ];

  // ---------------------------------------------------------------------------
  // Start up
  // ---------------------------------------------------------------------------
  (async function init() {
    try {
      const places = await fsApi.places();
      setPlatform(places.platform);
      st.places = places;
      st.drives = await fsApi.drives().catch(() => []);
      const start = ctx.options.path || places.home;
      const ok = await navigate(start);
      if (!ok) await navigate(places.home);
      renderSidebar();
      if (ctx.options.newFolder) newFolder();
    } catch (err) {
      reportError(err, "File Explorer couldn't start");
    }
  })();

  return {
    onFocus() { if (!st.destroyed && document.activeElement === document.body) content.focus({ preventScroll: true }); },
    destroy() { st.destroyed = true; unsubscribe.forEach((u) => u()); },
    // For tests
    _state: st,
  };
}

export function registerExplorer() {
  registerApp({
    id: 'explorer',
    name: 'File Explorer',
    icon: 'explorer',
    desktop: true,
    keywords: 'files folders this pc documents downloads',
    defaultSize: { w: 940, h: 620 },
    minSize: { w: 560, h: 380 },
    create,
  });
}
