// apps/windowTest.js — a TEMPORARY demo app that proves the window manager works.
//
// It is also the best example of how to write an app. An app is just:
//   registerApp({ id, name, icon, defaultSize, create(container, ctx) { … } })
// `container` is an empty <div> inside the window frame; build your UI in it.
// `ctx` lets you set the window title, close the window, or launch other apps.
// create() may return { destroy(), onFocus(), onChange(info), canClose() }.
//
// (Removed once the real apps are in, milestone 7.)

import { registerApp } from '../appRegistry.js';
import { el } from '../dom.js';

let counter = 0;

function create(container, ctx) {
  counter += 1;
  const number = counter;
  ctx.setTitle(`Window Test #${number}`);

  const page = el('div', 'wt');
  page.append(el('h2', 'wt-title', 'Hello from a window!'));
  page.append(
    el('p', 'wt-text', 'Drag my titlebar, resize me from any edge or corner, double-click the titlebar to maximize, or drag me to a screen edge to snap.'),
  );

  // Live info, updated by onChange() below.
  const info = el('div', 'wt-info');
  const rows = {};
  for (const name of ['Window id', 'Position', 'Size', 'State', 'Focused']) {
    const row = el('div', 'wt-row');
    const value = el('b', '', '–');
    row.append(el('span', '', name), value);
    info.append(row);
    rows[name] = value;
  }
  rows['Window id'].textContent = String(ctx.windowId);
  page.append(info);

  const buttons = el('div', 'wt-buttons');
  const another = el('button', 'btn', 'Open another');
  another.addEventListener('click', () => ctx.launch('wintest'));
  const rename = el('button', 'btn', 'Rename me');
  rename.addEventListener('click', () => ctx.setTitle(`Renamed at ${new Date().toLocaleTimeString()}`));
  const close = el('button', 'btn btn-primary', 'Close me');
  close.addEventListener('click', () => ctx.close());
  buttons.append(another, rename, close);
  page.append(buttons);

  const input = el('input', 'wt-input');
  input.placeholder = 'Type here: keyboard focus follows the window';
  page.append(input);

  // A long list to prove content inside a window can scroll.
  const list = el('div', 'wt-list');
  for (let i = 1; i <= 30; i++) list.append(el('div', 'wt-item', `Scrollable line ${i} 🌷`));
  page.append(list);

  container.append(page);

  return {
    onChange(i) {
      rows['Position'].textContent = `${i.x}, ${i.y}`;
      rows['Size'].textContent = `${i.w} × ${i.h}`;
      rows['State'].textContent = i.state;
      rows['Focused'].textContent = i.focused ? 'yes' : 'no';
    },
    destroy() {
      console.log(`[wintest] window #${number} destroyed`);
    },
  };
}

export function registerWindowTest() {
  registerApp({
    id: 'wintest',
    name: 'Window Test',
    icon: 'tulip',
    desktop: true,
    keywords: 'demo window manager test',
    defaultSize: { w: 560, h: 420 },
    minSize: { w: 360, h: 260 },
    create,
  });
}
