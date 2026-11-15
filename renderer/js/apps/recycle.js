// apps/recycle.js — the Recycle Bin shortcut.
// It is not a window: it opens the REAL Windows Recycle Bin (so restoring/emptying uses
// the system's own tools). The Windows window appears on top of H-os; Alt+Tab brings H-os back.

import { registerApp } from '../appRegistry.js';
import { fsApi } from '../fsClient.js';
import { toast } from '../notifications.js';

export function registerRecycleBin() {
  registerApp({
    id: 'recycle',
    name: 'Recycle Bin',
    icon: 'recycle',
    desktop: true,
    keywords: 'trash deleted bin restore',
    async run() {
      try {
        await fsApi.openRecycleBin();
        toast({ title: 'Recycle Bin', message: 'Opening it in its own window. Press Alt+Tab to come back to H-os.', icon: 'recycle', duration: 5000 });
      } catch (err) {
        toast({ title: "Couldn't open the Recycle Bin", message: err.message, icon: 'recycle', duration: 6000 });
      }
    },
  });
}
