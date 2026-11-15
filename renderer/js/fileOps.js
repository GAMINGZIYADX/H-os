// fileOps.js — the "do something to files" flows shared by every File Explorer window:
// the cut/copy clipboard, paste (with the replace/keep-both question) and delete (to the
// Recycle Bin, after asking). The actual disk work happens in the main process.

import { fsApi } from './fsClient.js';
import { confirmDialog, showDialog } from './ui/dialogs.js';
import { toast } from './notifications.js';
import { emit } from './events.js';
import { baseName, parentOf, samePath } from './pathUtil.js';

// ---- Cut / copy clipboard (shared by all Explorer windows; separate from the text clipboard) ----
let clipboard = { mode: null, paths: [] };
export const getClipboard = () => clipboard;
export function setClipboard(mode, paths) {
  clipboard = { mode, paths: [...paths] };
  emit('clipboard:changed');
}
export const clipboardHasItems = () => clipboard.mode !== null && clipboard.paths.length > 0;

// ---- Drag & drop (set on dragstart, read on drop; works across Explorer windows) ----
let dragPaths = [];
export const setDrag = (paths) => { dragPaths = [...paths]; };
export const getDrag = () => dragPaths;

// Tell every open Explorer that these folders changed (so they refresh).
export function notifyChanged(dirs) {
  emit('fs:changed', [...new Set(dirs.filter(Boolean))]);
}

export function reportError(err, title = 'Hmm…') {
  toast({ title, message: err && err.message ? err.message : 'Something went wrong.', icon: 'tulip', duration: 6000 });
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Copy or move `sources` into `destDir`, asking what to do about name clashes first.
// Returns true if something was changed.
export async function pasteInto(destDir, mode, sources) {
  if (!sources.length) return false;
  try {
    // A name clash only counts if the item comes from ANOTHER folder
    // (copying within one folder simply makes "name - Copy").
    const fromOtherFolder = sources.filter((s) => !samePath(parentOf(s) || '', destDir));
    if (mode === 'move' && fromOtherFolder.length === 0) return false; // already here

    let onConflict;
    const clashes = fromOtherFolder.length ? await fsApi.conflicts(fromOtherFolder, destDir) : [];
    if (clashes.length) {
      const what = clashes.length === 1 ? `"${clashes[0]}" already exists here.` : `${plural(clashes.length, 'item')} already exist here.`;
      onConflict = await showDialog({
        title: 'Replace or keep both?',
        message: `${what} Replacing sends the old ${clashes.length === 1 ? 'one' : 'ones'} to the Recycle Bin, so nothing is lost for good.`,
        icon: 'copy',
        width: 440,
        cancelValue: 'cancel',
        buttons: [
          { label: 'Cancel', value: 'cancel' },
          { label: 'Skip', value: 'skip' },
          { label: 'Keep both', value: 'keepBoth' },
          { label: 'Replace', value: 'replace', primary: true, danger: true },
        ],
      });
      if (onConflict === 'cancel') return false;
    }

    const result = await fsApi.paste(mode, sources, destDir, onConflict);
    const dirs = [destDir];
    if (mode === 'move') sources.forEach((s) => dirs.push(parentOf(s)));
    notifyChanged(dirs);
    if (mode === 'move' && result.done.length) setClipboard(null, []); // a "cut" can only be pasted once

    if (result.failed.length) {
      const first = result.failed[0];
      reportError({ message: `${plural(result.failed.length, 'item')} couldn't be ${mode === 'copy' ? 'copied' : 'moved'}. ${first.name}: ${first.message}` }, 'Not everything went through');
    } else if (result.done.length) {
      toast({ title: mode === 'copy' ? 'Copied' : 'Moved', message: result.done.length === 1 ? result.done[0] : plural(result.done.length, 'item'), icon: 'explorer', duration: 2500 });
    }
    return result.done.length > 0;
  } catch (err) {
    reportError(err);
    return false;
  }
}

// Delete = move to the Recycle Bin, after asking. There is no permanent delete anywhere in H-os.
export async function trashPaths(paths) {
  if (!paths.length) return false;
  const name = paths.length === 1 ? `"${baseName(paths[0])}"` : plural(paths.length, 'item');
  const ok = await confirmDialog({
    title: 'Move to the Recycle Bin?',
    message: `${name} will be moved to the Recycle Bin. You can restore it from there.`,
    icon: 'trash',
    confirmLabel: 'Move to Recycle Bin',
    danger: true,
  });
  if (!ok) return false;
  try {
    const result = await fsApi.trash(paths);
    notifyChanged(paths.map(parentOf));
    if (result.failed.length) {
      reportError({ message: `${result.failed[0].name}: ${result.failed[0].message}` }, `${plural(result.failed.length, 'item')} couldn't be removed`);
    }
    if (result.done.length) {
      toast({ title: 'Moved to the Recycle Bin', message: result.done.length === 1 ? result.done[0] : plural(result.done.length, 'item'), icon: 'recycle', duration: 2500 });
    }
    return result.done.length > 0;
  } catch (err) {
    reportError(err);
    return false;
  }
}
