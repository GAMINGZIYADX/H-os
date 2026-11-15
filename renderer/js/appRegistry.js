// appRegistry.js — the list of every app H-os knows about.
//
// An app is just a description:
//   {
//     id: 'notepad',                 // unique, lowercase
//     name: 'Notepad',               // shown to the user
//     icon: 'notepad',               // a name from icons.js
//     defaultSize: { w: 640, h: 480 },
//     keywords: 'text edit write',   // extra words Start-menu search matches
//     desktop: true,                 // show an icon on the desktop?
//     create(container, ctx) { … }   // builds the app UI inside a window
//     run(options) { … }             // OR: an action instead of a window (Recycle Bin)
//   }
//
// The registry does NOT know how windows work. When something wants to open an
// app it calls launchApp(id); the window manager (windowManager.js) installs itself
// with setLauncher() and does the real work.

import { toast } from './notifications.js';

const apps = new Map();
let launcher = null;

// Register (or replace) an app. Apps with a create() function will replace the
// placeholder entries from apps/manifest.js once they are built.
export function registerApp(def) {
  apps.set(def.id, { defaultSize: { w: 700, h: 480 }, keywords: '', ...def });
}

export function getApp(id) {
  return apps.get(id);
}

export function listApps() {
  return [...apps.values()];
}

// The window manager calls this once to say "I'll open apps from now on".
export function setLauncher(fn) {
  launcher = fn;
}

export function launchApp(id, options = {}) {
  const app = apps.get(id);
  if (!app) return;
  if (app.run) {
    app.run(options); // apps that aren't windows (e.g. the Recycle Bin shortcut)
  } else if (launcher && app.create) {
    launcher(app, options);
  } else {
    toast({ title: app.name, message: 'This app is not ready yet.', icon: app.icon });
  }
}
