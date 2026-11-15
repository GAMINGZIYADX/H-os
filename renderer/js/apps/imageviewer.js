// =============================================================================
// apps/imageviewer.js — Image Viewer
// =============================================================================
// Shows a picture from disk. The main process reads the file and sends the bytes; we turn
// them into a temporary "blob:" address for an <img> (no direct file access from the page).
//
//   Mouse wheel zooms around the pointer · drag to pan · double-click toggles fit / 100%
//   ← → previous / next picture in the same folder · + − zoom · 0 fit · 1 actual size

import { el } from '../dom.js';
import { iconEl } from '../icons.js';
import { registerApp } from '../appRegistry.js';
import { fsApi } from '../fsClient.js';
import { toast } from '../notifications.js';
import { addRecent } from '../settingsStore.js';
import { baseName, parentOf, setPlatform, joinPath } from '../pathUtil.js';
import { kindOfName, formatSize } from '../fileTypes.js';

function create(container, ctx) {
  const v = {
    path: null, siblings: [], index: -1,
    url: null, nat: { w: 0, h: 0 }, size: 0,
    mode: 'fit',          // 'fit' or 'free'
    scale: 1, x: 0, y: 0, // image position/scale when free
    destroyed: false,
  };

  const root = el('div', 'iv');
  root.tabIndex = -1;
  const bar = el('div', 'iv-bar');
  const stage = el('div', 'iv-stage');
  const img = el('img', 'iv-img');
  img.draggable = false;
  img.hidden = true;
  const empty = el('div', 'iv-empty');
  empty.append(iconEl('image'), el('div', '', 'Open a picture to see it here.'));
  stage.append(img, empty);
  const status = el('div', 'iv-status');
  const sName = el('span');
  const sInfo = el('span');
  status.append(sName, el('span', 'ex-spacer'), sInfo);
  root.append(bar, stage, status);
  container.append(root);

  const btn = (icon, label, onClick, text = '') => {
    const b = el('button', 'ex-btn iv-btn');
    b.title = label;
    b.setAttribute('aria-label', label);
    b.append(iconEl(icon));
    if (text) b.append(el('span', '', text));
    b.addEventListener('click', onClick);
    return b;
  };
  const bOpen = btn('open', 'Open a picture…', pickFile, 'Open');
  const bPrev = btn('back', 'Previous picture (←)', () => step(-1));
  const bNext = btn('forward', 'Next picture (→)', () => step(1));
  const bOut = btn('zoom-out', 'Zoom out (−)', () => zoomBy(1 / 1.25));
  const zoomLabel = el('span', 'iv-zoom', '');
  const bIn = btn('zoom-in', 'Zoom in (+)', () => zoomBy(1.25));
  const bFit = btn('fit', 'Fit to window (0)', fit);
  const bActual = el('button', 'ex-btn iv-btn');
  bActual.textContent = '100%';
  bActual.title = 'Actual size (1)';
  bActual.addEventListener('click', () => setScale(1));
  bar.append(bOpen, el('span', 'ex-sep'), bPrev, bNext, el('span', 'ex-sep'), bOut, zoomLabel, bIn, bFit, bActual);

  // ---- geometry ----
  const stageSize = () => ({ w: stage.clientWidth, h: stage.clientHeight });

  function fitScale() {
    const s = stageSize();
    if (!v.nat.w || !v.nat.h) return 1;
    return Math.min(1, (s.w - 24) / v.nat.w, (s.h - 24) / v.nat.h); // never blow small pictures up
  }

  function paint() {
    if (!v.url) return;
    if (v.mode === 'fit') {
      v.scale = fitScale();
      const s = stageSize();
      v.x = (s.w - v.nat.w * v.scale) / 2;
      v.y = (s.h - v.nat.h * v.scale) / 2;
    }
    img.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.scale})`;
    img.classList.toggle('is-pixelated', v.scale > 2);
    zoomLabel.textContent = Math.round(v.scale * 100) + '%';
    sInfo.textContent = `${v.nat.w} × ${v.nat.h}   ·   ${formatSize(v.size)}${v.siblings.length > 1 ? `   ·   ${v.index + 1} of ${v.siblings.length}` : ''}`;
  }

  function fit() { v.mode = 'fit'; paint(); }

  // Zoom keeping the point (cx, cy) of the stage fixed.
  function setScale(next, cx, cy) {
    if (!v.url) return;
    const s = stageSize();
    cx = cx ?? s.w / 2;
    cy = cy ?? s.h / 2;
    next = Math.max(0.05, Math.min(16, next));
    const ratio = next / v.scale;
    v.x = cx - (cx - v.x) * ratio;
    v.y = cy - (cy - v.y) * ratio;
    v.scale = next;
    v.mode = 'free';
    paint();
  }
  const zoomBy = (factor, cx, cy) => setScale(v.scale * factor, cx, cy);

  // ---- loading ----
  async function loadSiblings(path) {
    try {
      const dir = parentOf(path);
      const data = await fsApi.readdir(dir, { showHidden: false });
      v.siblings = data.entries
        .filter((e) => !e.isDir && kindOfName(e.name) === 'image')
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
        .map((e) => e.path);
      v.index = v.siblings.findIndex((p) => p.toLowerCase() === path.toLowerCase());
    } catch {
      v.siblings = [path];
      v.index = 0;
    }
    updateNav();
    paint();
  }

  function updateNav() {
    bPrev.disabled = v.siblings.length < 2;
    bNext.disabled = v.siblings.length < 2;
  }

  async function show(path, { keepSiblings = false } = {}) {
    try {
      const file = await fsApi.readImage(path);
      if (v.destroyed) return;
      const blob = new Blob([file.data], { type: file.mime });
      const url = URL.createObjectURL(blob);
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error("That picture is damaged or isn't supported."));
        img.src = url;
      });
      if (v.url) URL.revokeObjectURL(v.url);
      v.url = url;
      v.path = file.path;
      v.size = file.size;
      v.nat = { w: img.naturalWidth || 300, h: img.naturalHeight || 300 };
      img.style.width = v.nat.w + 'px';
      img.style.height = v.nat.h + 'px';
      img.hidden = false;
      empty.hidden = true;
      v.mode = 'fit';
      ctx.setTitle(`${file.name} - Image Viewer`);
      sName.textContent = file.path;
      addRecent({ name: file.name, path: file.path });
      if (!keepSiblings) await loadSiblings(file.path);
      paint();
    } catch (err) {
      toast({ title: `Couldn't open ${baseName(path)}`, message: err.message, icon: 'image', duration: 6000 });
    }
  }

  async function pickFile() {
    try {
      const path = await fsApi.pickOpenFile('image');
      if (path) show(path);
    } catch (err) {
      toast({ title: "Couldn't show the Open dialog", message: err.message, icon: 'image' });
    }
  }

  function step(delta) {
    if (v.siblings.length < 2) return;
    v.index = (v.index + delta + v.siblings.length) % v.siblings.length;
    show(v.siblings[v.index], { keepSiblings: true });
  }

  // ---- mouse & keyboard ----
  stage.addEventListener('wheel', (e) => {
    if (!v.url) return;
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  stage.addEventListener('pointerdown', (e) => {
    if (!v.url || e.button !== 0) return;
    root.focus({ preventScroll: true });
    const startX = e.clientX, startY = e.clientY, ox = v.x, oy = v.y;
    stage.setPointerCapture(e.pointerId);
    stage.classList.add('is-panning');
    const move = (m) => {
      v.mode = 'free';
      v.x = ox + (m.clientX - startX);
      v.y = oy + (m.clientY - startY);
      paint();
    };
    const up = () => {
      stage.removeEventListener('pointermove', move);
      stage.removeEventListener('pointerup', up);
      stage.classList.remove('is-panning');
    };
    stage.addEventListener('pointermove', move);
    stage.addEventListener('pointerup', up);
  });
  stage.addEventListener('dblclick', (e) => {
    if (!v.url) return;
    if (v.mode === 'fit' && fitScale() < 1) {
      const r = stage.getBoundingClientRect();
      setScale(1, e.clientX - r.left, e.clientY - r.top);
    } else fit();
  });

  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (e.key === '+' || e.key === '=') zoomBy(1.25);
    else if (e.key === '-') zoomBy(1 / 1.25);
    else if (e.key === '0') fit();
    else if (e.key === '1') setScale(1);
  });

  const resizeObserver = new ResizeObserver(() => paint());
  resizeObserver.observe(stage);

  updateNav();
  ctx.setTitle('Image Viewer');
  (async () => {
    try { setPlatform((await window.hos.getInfo()).platform); } catch { /* ignore */ }
    if (ctx.options.path) show(ctx.options.path);
  })();

  return {
    onFocus() { if (!v.destroyed && document.activeElement === document.body) root.focus({ preventScroll: true }); },
    destroy() {
      v.destroyed = true;
      resizeObserver.disconnect();
      if (v.url) URL.revokeObjectURL(v.url);
    },
    _view: v,
  };
}

export function registerImageViewer() {
  registerApp({
    id: 'imageviewer',
    name: 'Image Viewer',
    icon: 'image',
    keywords: 'photos pictures png jpg gif',
    defaultSize: { w: 860, h: 620 },
    minSize: { w: 420, h: 320 },
    create,
  });
}
