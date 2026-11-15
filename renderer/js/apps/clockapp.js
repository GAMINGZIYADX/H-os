// =============================================================================
// apps/clockapp.js — Clock: a clock face, a Timer and a Stopwatch
// =============================================================================
// The timer and stopwatch live at the top level of this file, not inside the window, so they
// keep counting if you close the Clock window. When the timer finishes you get a notification
// (and a little chime) even if the window is closed.

import { el } from '../dom.js';
import { registerApp } from '../appRegistry.js';
import { toast } from '../notifications.js';
import { emit } from '../events.js';

// ---------------------------------------------------------------------------
// Timer state (shared, survives closing the window)
// ---------------------------------------------------------------------------
const timer = { total: 5 * 60 * 1000, remaining: 5 * 60 * 1000, endAt: null, running: false, finishedAt: null };
const stopwatch = { startedAt: null, elapsed: 0, running: false, laps: [] };
let watcher = null;

function timerLeft() {
  return timer.running ? Math.max(0, timer.endAt - Date.now()) : timer.remaining;
}

function ensureWatcher() {
  if (watcher) return;
  watcher = setInterval(() => {
    if (timer.running && Date.now() >= timer.endAt) {
      timer.running = false;
      timer.remaining = 0;
      timer.finishedAt = Date.now();
      toast({ title: 'Timer finished!', message: 'Your tulips are ready. 🌷', icon: 'clock', duration: 12000 });
      [0, 700, 1400].forEach((ms) => setTimeout(() => emit('sound:play', 'win'), ms));
      emit('clock:timer-finished');
    }
  }, 250);
}

const pad = (n, w = 2) => String(n).padStart(w, '0');
function hms(ms) {
  const total = Math.ceil(ms / 1000);
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}
function stopwatchText(ms) {
  const cs = Math.floor(ms / 10) % 100;
  const s = Math.floor(ms / 1000) % 60;
  const m = Math.floor(ms / 60000);
  return `${pad(m)}:${pad(s)}.${pad(cs)}`;
}
const stopwatchMs = () => (stopwatch.running ? stopwatch.elapsed + (performance.now() - stopwatch.startedAt) : stopwatch.elapsed);

function create(container, ctx) {
  ctx.setTitle('Clock');
  ensureWatcher();
  const root = el('div', 'ck');
  const tabs = el('div', 'ck-tabs');
  const body = el('div', 'ck-body');
  root.append(tabs, body);
  container.append(root);

  let tab = ctx.options.tab || 'clock';
  let raf = 0;
  let destroyed = false;
  let tickers = [];

  const TABS = [['clock', 'Clock'], ['timer', 'Timer'], ['stopwatch', 'Stopwatch']];
  const tabButtons = TABS.map(([id, label]) => {
    const b = el('button', 'ck-tab', label);
    b.dataset.tab = id;
    b.addEventListener('click', () => show(id));
    tabs.append(b);
    return b;
  });

  function show(id) {
    tab = id;
    tickers = [];
    tabButtons.forEach((b) => b.classList.toggle('is-active', b.dataset.tab === id));
    body.replaceChildren(id === 'clock' ? clockTab() : id === 'timer' ? timerTab() : stopwatchTab());
    paint();
  }

  // Run the registered painters every animation frame while this window exists.
  function paint() {
    tickers.forEach((fn) => fn());
  }
  function loop() {
    if (destroyed) return;
    paint();
    raf = requestAnimationFrame(loop);
  }

  // ---- Clock tab ----
  function clockTab() {
    const page = el('div', 'ck-page');
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 200 200');
    svg.setAttribute('class', 'ck-face');
    const add = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); svg.append(n); return n; };
    add('circle', { cx: 100, cy: 100, r: 94, class: 'ck-rim' });
    for (let i = 0; i < 60; i++) {
      const a = (i * 6 * Math.PI) / 180;
      const big = i % 5 === 0;
      add('line', {
        x1: 100 + Math.sin(a) * (big ? 78 : 84), y1: 100 - Math.cos(a) * (big ? 78 : 84),
        x2: 100 + Math.sin(a) * 90, y2: 100 - Math.cos(a) * 90, class: big ? 'ck-tick big' : 'ck-tick',
      });
    }
    const hour = add('line', { x1: 100, y1: 100, x2: 100, y2: 52, class: 'ck-hand hour' });
    const minute = add('line', { x1: 100, y1: 100, x2: 100, y2: 32, class: 'ck-hand minute' });
    const second = add('line', { x1: 100, y1: 112, x2: 100, y2: 24, class: 'ck-hand second' });
    add('circle', { cx: 100, cy: 100, r: 5, class: 'ck-pin' });
    const digital = el('div', 'ck-digital');
    const date = el('div', 'ck-date');
    const zone = el('div', 'ck-zone', Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, ' '));
    page.append(svg, digital, date, zone);
    tickers.push(() => {
      const now = new Date();
      const s = now.getSeconds() + now.getMilliseconds() / 1000;
      const m = now.getMinutes() + s / 60;
      const h = (now.getHours() % 12) + m / 60;
      second.setAttribute('transform', `rotate(${s * 6} 100 100)`);
      minute.setAttribute('transform', `rotate(${m * 6} 100 100)`);
      hour.setAttribute('transform', `rotate(${h * 30} 100 100)`);
      const text = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
      if (digital.textContent !== text) digital.textContent = text;
      const d = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
      if (date.textContent !== d) date.textContent = d;
    });
    return page;
  }

  // ---- Timer tab ----
  function timerTab() {
    const page = el('div', 'ck-page');
    const NS = 'http://www.w3.org/2000/svg';
    const ring = document.createElementNS(NS, 'svg');
    ring.setAttribute('viewBox', '0 0 200 200');
    ring.setAttribute('class', 'ck-ring');
    const track = document.createElementNS(NS, 'circle');
    const bar = document.createElementNS(NS, 'circle');
    for (const c of [track, bar]) { c.setAttribute('cx', '100'); c.setAttribute('cy', '100'); c.setAttribute('r', '86'); c.setAttribute('fill', 'none'); c.setAttribute('stroke-width', '10'); }
    track.setAttribute('class', 'ck-ring-track');
    bar.setAttribute('class', 'ck-ring-bar');
    bar.setAttribute('stroke-linecap', 'round');
    bar.setAttribute('transform', 'rotate(-90 100 100)');
    const circumference = 2 * Math.PI * 86;
    bar.setAttribute('stroke-dasharray', String(circumference));
    ring.append(track, bar);
    const readout = el('div', 'ck-readout');
    const ringWrap = el('div', 'ck-ring-wrap');
    ringWrap.append(ring, readout);

    // presets and a custom time
    const presets = el('div', 'ck-presets');
    for (const minutes of [1, 5, 10, 25, 45]) {
      const b = el('button', 'ck-chip', `${minutes} min`);
      b.addEventListener('click', () => setTotal(minutes * 60000));
      presets.append(b);
    }
    const custom = el('div', 'ck-custom');
    const field = (label, max) => {
      const w = el('label', 'ck-field');
      const i = el('input');
      i.type = 'number';
      i.min = '0';
      i.max = String(max);
      i.value = '0';
      i.addEventListener('keydown', (e) => e.stopPropagation());
      i.addEventListener('change', apply);
      w.append(i, el('span', '', label));
      custom.append(w);
      return i;
    };
    const hIn = field('h', 99);
    const mIn = field('min', 59);
    const sIn = field('sec', 59);
    function apply() {
      const ms = ((Number(hIn.value) || 0) * 3600 + (Number(mIn.value) || 0) * 60 + (Number(sIn.value) || 0)) * 1000;
      if (ms > 0) setTotal(ms);
    }
    function setTotal(ms) {
      if (timer.running) return;
      timer.total = ms;
      timer.remaining = ms;
      timer.finishedAt = null;
      syncInputs();
    }
    function syncInputs() {
      const t = Math.round(timer.total / 1000);
      if (document.activeElement !== hIn) hIn.value = String(Math.floor(t / 3600));
      if (document.activeElement !== mIn) mIn.value = String(Math.floor((t % 3600) / 60));
      if (document.activeElement !== sIn) sIn.value = String(t % 60);
    }

    const buttons = el('div', 'ck-buttons');
    const startBtn = el('button', 'btn btn-primary ck-big');
    const resetBtn = el('button', 'btn ck-big', 'Reset');
    startBtn.addEventListener('click', () => {
      if (timer.running) { timer.remaining = timerLeft(); timer.running = false; }
      else {
        if (timer.remaining <= 0) timer.remaining = timer.total;
        timer.endAt = Date.now() + timer.remaining;
        timer.running = true;
        timer.finishedAt = null;
      }
    });
    resetBtn.addEventListener('click', () => { timer.running = false; timer.remaining = timer.total; timer.finishedAt = null; });
    buttons.append(startBtn, resetBtn);
    page.append(ringWrap, presets, custom, buttons);

    tickers.push(() => {
      const left = timerLeft();
      readout.textContent = hms(left);
      readout.classList.toggle('is-done', timer.finishedAt !== null);
      bar.setAttribute('stroke-dashoffset', String(circumference * (1 - (timer.total ? left / timer.total : 0))));
      startBtn.textContent = timer.running ? 'Pause' : timer.remaining > 0 && timer.remaining < timer.total ? 'Resume' : 'Start';
      const editable = !timer.running;
      presets.classList.toggle('is-disabled', !editable);
      [hIn, mIn, sIn].forEach((i) => { i.disabled = !editable; });
      syncInputs();
    });
    return page;
  }

  // ---- Stopwatch tab ----
  function stopwatchTab() {
    const page = el('div', 'ck-page');
    const readout = el('div', 'ck-readout big');
    const buttons = el('div', 'ck-buttons');
    const startBtn = el('button', 'btn btn-primary ck-big');
    const lapBtn = el('button', 'btn ck-big', 'Lap');
    const resetBtn = el('button', 'btn ck-big', 'Reset');
    const lapList = el('div', 'ck-laps');
    buttons.append(startBtn, lapBtn, resetBtn);
    page.append(readout, buttons, lapList);

    startBtn.addEventListener('click', () => {
      if (stopwatch.running) { stopwatch.elapsed = stopwatchMs(); stopwatch.running = false; }
      else { stopwatch.startedAt = performance.now(); stopwatch.running = true; }
    });
    lapBtn.addEventListener('click', () => {
      if (!stopwatch.running) return;
      stopwatch.laps.unshift(stopwatchMs());
      renderLaps();
    });
    resetBtn.addEventListener('click', () => { stopwatch.running = false; stopwatch.elapsed = 0; stopwatch.laps = []; renderLaps(); });

    function renderLaps() {
      lapList.replaceChildren(...stopwatch.laps.map((t, i) => {
        const r = el('div', 'ck-lap');
        const previous = stopwatch.laps[i + 1] || 0;
        r.append(el('span', '', `Lap ${stopwatch.laps.length - i}`), el('b', '', stopwatchText(t - previous)), el('span', 'ck-lap-total', stopwatchText(t)));
        return r;
      }));
    }
    renderLaps();
    tickers.push(() => {
      readout.textContent = stopwatchText(stopwatchMs());
      startBtn.textContent = stopwatch.running ? 'Pause' : stopwatch.elapsed > 0 ? 'Resume' : 'Start';
      lapBtn.disabled = !stopwatch.running;
    });
    return page;
  }

  show(TABS.some((t) => t[0] === tab) ? tab : 'clock');
  raf = requestAnimationFrame(loop);

  return {
    destroy() { destroyed = true; cancelAnimationFrame(raf); },
    _show: show,
  };
}

export function registerClock() {
  registerApp({
    id: 'clock',
    name: 'Clock',
    icon: 'clock',
    keywords: 'timer alarm stopwatch time countdown',
    defaultSize: { w: 460, h: 600 },
    minSize: { w: 380, h: 520 },
    singleInstance: true,
    create,
  });
}

