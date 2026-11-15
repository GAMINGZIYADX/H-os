// fileOpen.js — "open this file with the best app".
//   pictures  -> H-os Image Viewer
//   text/code -> H-os Notepad
//   anything else -> the operating system's default app (programs are refused by the main process)

import { fsApi } from './fsClient.js';
import { kindOfName } from './fileTypes.js';
import { launchApp } from './appRegistry.js';
import { addRecent } from './settingsStore.js';
import { baseName } from './pathUtil.js';
import { reportError } from './fileOps.js';

export async function openFileSmart(path, { forceApp = null } = {}) {
  const name = baseName(path);
  const kind = kindOfName(name);
  try {
    if (forceApp === 'notepad' || (!forceApp && kind === 'text')) {
      launchApp('notepad', { path });
    } else if (forceApp === 'imageviewer' || (!forceApp && kind === 'image')) {
      launchApp('imageviewer', { path });
    } else {
      await fsApi.openPath(path);
    }
    addRecent({ name, path });
  } catch (err) {
    reportError(err, `Couldn't open ${name}`);
  }
}
