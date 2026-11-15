// =============================================================================
// H-os — filesystem, shell and dialog IPC (main process)
// -----------------------------------------------------------------------------
// Everything the File Explorer / Notepad / Image Viewer do to the real disk happens
// HERE, never in the page. Every handler:
//   * checks the message really came from H-os's own page (trustedSender),
//   * validates every argument and every path (mainFsGuard.js),
//   * checks the REAL path too (symlinks, junctions, 8.3 short names like PROGRA~1),
//   * never throws: it answers { ok: true, data } or { ok: false, error: { code, message } },
//   * NEVER deletes permanently: removal always goes to the Recycle Bin (shell.trashItem).
// =============================================================================

const { app, shell, dialog } = require('electron');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { spawn } = require('child_process');
const { createGuard, GuardError } = require('./mainFsGuard');
const { makeHandle } = require('./mainIpc');

// ---- Limits (keep the app responsive and memory-safe) ----
const MAX_ENTRIES = 5000;            // entries returned for one folder
const MAX_PATHS = 500;               // items in one copy / move / delete
const MAX_TEXT_BYTES = 5 * 1024 * 1024;
const MAX_WRITE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_BYTES = 40 * 1024 * 1024;
const STAT_BATCH = 64;

const IMAGE_MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.bmp': 'image/bmp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.avif': 'image/avif',
};

// H-os will not launch programs. Double-clicking these shows a friendly refusal instead.
const BLOCKED_OPEN_EXT = new Set([
  '.exe', '.com', '.bat', '.cmd', '.ps1', '.psm1', '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh', '.msi', '.msp',
  '.scr', '.lnk', '.hta', '.jar', '.reg', '.cpl', '.dll', '.sys', '.pif', '.url', '.scf', '.inf', '.appx',
  '.msix', '.appref-ms', '.gadget', '.application', '.sh', '.run', '.appimage', '.desktop', '.bin',
]);

// ---------------------------------------------------------------------------
// Errors -> friendly messages
// ---------------------------------------------------------------------------
class FsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function toError(err) {
  if (err instanceof GuardError || err instanceof FsError) return { code: err.code, message: err.message };
  const messages = {
    ENOENT: 'That item no longer exists.',
    EPERM: "Windows won't let H-os do that (permission denied).",
    EACCES: "Windows won't let H-os do that (permission denied).",
    EEXIST: 'Something with that name already exists.',
    ENOTEMPTY: 'That folder is not empty.',
    EBUSY: 'That item is in use by another program.',
    ENOSPC: 'There is no space left on that drive.',
    EISDIR: 'That is a folder, not a file.',
    ENOTDIR: 'That is not a folder.',
    EMFILE: 'Too many files are open right now. Try again in a moment.',
    ENAMETOOLONG: 'That path is too long.',
    EROFS: 'That drive is read-only.',
    EXDEV: 'That item cannot be moved between drives this way.',
  };
  const code = err && err.code;
  if (code && messages[code]) return { code, message: messages[code] };
  console.log('[main] unexpected filesystem error:', err);
  return { code: 'UNKNOWN', message: 'Something unexpected happened. The item was not changed.' };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
function register({ extraProtectedTrees = [] } = {}) {
  const guard = createGuard({
    extraProtectedTrees: [
      app.getPath('userData'), // H-os's own settings
      app.getAppPath(),        // H-os's own program files
      path.dirname(process.execPath),
      ...extraProtectedTrees,
    ],
  });
  const P = guard.path;
  const win32 = process.platform === 'win32';

  // handle(channel, fn): only our own page may call it; answers { ok, data } or { ok:false, error }.
  const handle = makeHandle(toError);

  // ---- argument checking helpers ----
  const bad = (msg = 'Invalid request.') => new FsError('INVALID', msg);
  function pathList(value) {
    if (!Array.isArray(value) || value.length === 0 || value.length > MAX_PATHS) throw bad();
    return value;
  }

  // The REAL location of a path (follows symlinks/junctions, expands 8.3 names).
  // For something that doesn't exist yet, resolve its parent and add the name.
  async function realOf(normalized) {
    try {
      let r = await fsp.realpath(normalized);
      if (win32) r = r.replace(/^\\\\\?\\/, '');
      return P.resolve(r);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      const parent = P.dirname(normalized);
      if (parent === normalized) return normalized;
      return P.join(await realOf(parent), P.basename(normalized));
    }
  }

  // Both the path as typed AND its real location must be allowed to change.
  async function mutable(input) {
    const typed = guard.assertMutable(input);
    const real = await realOf(typed);
    guard.assertMutable(real);
    return { typed, real };
  }

  const exists = async (p) => { try { await fsp.lstat(p); return true; } catch { return false; } };

  // "name (2).ext", "name (3).ext" … until the name is free.
  async function uniqueName(dir, name, suffix = '') {
    const ext = P.extname(name);
    const stem = ext ? name.slice(0, -ext.length) : name;
    let candidate = suffix ? `${stem} - ${suffix}${ext}` : name;
    for (let n = 2; await exists(P.join(dir, candidate)); n++) {
      candidate = `${stem}${suffix ? ' - ' + suffix : ''} (${n})${ext}`;
      if (n > 999) throw bad('Could not find a free name.');
    }
    return candidate;
  }

  // ------------------------------------------------------------------------
  // Places & drives
  // ------------------------------------------------------------------------
  handle('fs:places', async () => {
    const home = app.getPath('home');
    const get = (name) => { try { return app.getPath(name); } catch { return home; } };
    return {
      platform: process.platform,
      sep: P.sep,
      home,
      desktop: get('desktop'),
      documents: get('documents'),
      downloads: get('downloads'),
      pictures: get('pictures'),
      music: get('music'),
      videos: get('videos'),
    };
  });

  // Drives, checked in parallel with a timeout so an empty DVD/network drive can't freeze us.
  handle('fs:drives', async () => {
    const candidates = [];
    if (win32) {
      for (let c = 67; c <= 90; c++) candidates.push(String.fromCharCode(c) + ':\\'); // C..Z (skip A:, B:)
    } else {
      candidates.push('/');
      for (const base of ['/mnt', '/media', `/media/${process.env.USER || ''}`, '/run/media/' + (process.env.USER || '')]) {
        try {
          for (const d of await fsp.readdir(base, { withFileTypes: true })) if (d.isDirectory()) candidates.push(P.join(base, d.name));
        } catch { /* not there */ }
      }
    }
    const probe = (root) => Promise.race([
      fsp.statfs(root).then((s) => ({
        path: root,
        name: win32 ? `Local Disk (${root.slice(0, 2)})` : root === '/' ? 'File System' : P.basename(root),
        total: Number(s.blocks) * Number(s.bsize),
        free: Number(s.bavail) * Number(s.bsize),
      })),
      new Promise((resolve) => setTimeout(() => resolve(null), 1500)),
    ]).catch(() => null);
    return (await Promise.all(candidates.map(probe))).filter(Boolean);
  });

  // ------------------------------------------------------------------------
  // Reading folders & info
  // ------------------------------------------------------------------------
  handle('fs:readdir', async (dir, opts) => {
    const showHidden = Boolean(opts && opts.showHidden);
    const n = guard.normalize(dir);
    const dirents = await fsp.readdir(n, { withFileTypes: true });
    const visible = dirents.filter((d) => showHidden || !guard.isHiddenName(d.name));
    const truncated = visible.length > MAX_ENTRIES;
    const slice = truncated ? visible.slice(0, MAX_ENTRIES) : visible;

    const entries = [];
    for (let i = 0; i < slice.length; i += STAT_BATCH) {
      const batch = slice.slice(i, i + STAT_BATCH);
      const results = await Promise.all(batch.map(async (d) => {
        const full = P.join(n, d.name);
        const entry = { name: d.name, path: full, isDir: d.isDirectory(), isSymlink: d.isSymbolicLink(), size: null, mtime: null };
        try {
          const st = await fsp.lstat(full);
          entry.size = st.isFile() ? st.size : null;
          entry.mtime = st.mtimeMs;
          if (entry.isSymlink) {
            try { entry.isDir = (await fsp.stat(full)).isDirectory(); } catch { /* broken link */ }
          }
        } catch { /* no permission to stat: still list it */ }
        return entry;
      }));
      entries.push(...results);
    }
    return { path: n, entries, truncated, total: visible.length };
  });

  handle('fs:stat', async (p) => {
    const n = guard.normalize(p);
    const st = await fsp.lstat(n);
    return {
      path: n, name: P.basename(n) || n, isDir: st.isDirectory(), isSymlink: st.isSymbolicLink(),
      size: st.isFile() ? st.size : null, created: st.birthtimeMs, modified: st.mtimeMs, accessed: st.atimeMs,
      readOnly: (st.mode & 0o200) === 0,
      protected: guard.isProtected(n),
    };
  });

  // Folder size/contents for the Properties dialog (capped so it can never run away).
  handle('fs:folder-info', async (p) => {
    const root = guard.normalize(p);
    const deadline = Date.now() + 3000;
    let files = 0, folders = 0, size = 0, truncated = false;
    const stack = [root];
    while (stack.length) {
      if (Date.now() > deadline || files + folders > 30000) { truncated = true; break; }
      const dir = stack.pop();
      let items;
      try { items = await fsp.readdir(dir, { withFileTypes: true }); } catch { continue; }
      for (const d of items) {
        if (d.isSymbolicLink()) continue; // never follow links
        const full = P.join(dir, d.name);
        if (d.isDirectory()) { folders++; stack.push(full); }
        else { files++; try { size += (await fsp.lstat(full)).size; } catch { /* ignore */ } }
      }
    }
    return { files, folders, size, truncated };
  });

  // ------------------------------------------------------------------------
  // Changing things: new folder, rename, copy/move, trash
  // ------------------------------------------------------------------------
  handle('fs:mkdir', async (parent, name) => {
    const nameError = guard.validateName(name);
    if (nameError) throw new GuardError('BADNAME', nameError);
    const { typed } = await mutable(parent);
    const target = P.join(typed, name);
    const { typed: t2 } = await mutable(target);
    if (await exists(t2)) throw new FsError('EEXIST', 'Something with that name already exists.');
    await fsp.mkdir(t2);
    return { path: t2 };
  });

  handle('fs:rename', async (p, newName) => {
    const nameError = guard.validateName(newName);
    if (nameError) throw new GuardError('BADNAME', nameError);
    const { typed: from } = await mutable(p);
    const { typed: to } = await mutable(P.join(P.dirname(from), newName));
    if (guard.key(from) !== guard.key(to) && (await exists(to))) {
      throw new FsError('EEXIST', `"${newName}" already exists in this folder.`);
    }
    await fsp.rename(from, to);
    return { path: to };
  });

  // Which of these would collide with something already in destDir?
  handle('fs:conflicts', async (sources, destDir) => {
    pathList(sources);
    const dest = guard.normalize(destDir);
    const names = [];
    for (const s of sources) {
      const name = P.basename(guard.normalize(s));
      if (await exists(P.join(dest, name))) names.push(name);
    }
    return names;
  });

  // Copy or move items into destDir. onConflict: 'replace' | 'keepBoth' | 'skip' | undefined (= fail).
  handle('fs:paste', async (mode, sources, destDir, onConflict) => {
    if (mode !== 'copy' && mode !== 'move') throw bad();
    pathList(sources);
    if (!['replace', 'keepBoth', 'skip', undefined, null].includes(onConflict)) throw bad();

    const dest = await mutable(destDir);
    const destStat = await fsp.stat(dest.real);
    if (!destStat.isDirectory()) throw new FsError('ENOTDIR', 'That is not a folder.');

    const result = { done: [], skipped: [], failed: [] };
    for (const source of sources) {
      let label = typeof source === 'string' ? P.basename(source) : String(source);
      try {
        const src = await mutable(source);           // strict: sources must not be system places either
        label = P.basename(src.typed);
        const srcStat = await fsp.lstat(src.typed);

        // A folder can't go inside itself (compare REAL paths).
        if (srcStat.isDirectory() && guard.isInside(dest.real, src.real)) {
          throw new FsError('INVALID', `"${label}" can't be put inside itself.`);
        }
        const sameFolder = guard.key(P.dirname(src.typed)) === guard.key(dest.typed);
        if (mode === 'move' && sameFolder) { result.skipped.push(label); continue; } // already there

        let targetName = label;
        let target = P.join(dest.typed, targetName);
        if (await exists(target)) {
          if (mode === 'copy' && sameFolder) {
            targetName = await uniqueName(dest.typed, label, 'Copy'); // like Windows: "name - Copy"
          } else if (onConflict === 'keepBoth') {
            targetName = await uniqueName(dest.typed, label);
          } else if (onConflict === 'skip') {
            result.skipped.push(label); continue;
          } else if (onConflict === 'replace') {
            await mutable(target);
            await shell.trashItem(target);               // the old item goes to the Recycle Bin, never lost
          } else {
            throw new FsError('EEXIST', `"${label}" already exists in the destination.`);
          }
          target = P.join(dest.typed, targetName);
        }
        guard.assertMutable(target);

        if (mode === 'copy') {
          await fsp.cp(src.typed, target, { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true });
        } else {
          try {
            await fsp.rename(src.typed, target);
          } catch (err) {
            if (err.code !== 'EXDEV') throw err;
            // Different drive: copy, then send the original to the Recycle Bin.
            await fsp.cp(src.typed, target, { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true });
            await shell.trashItem(src.typed);
          }
        }
        result.done.push(targetName);
      } catch (err) {
        result.failed.push({ name: label, message: toError(err).message });
      }
    }
    return result;
  });

  // Delete = Recycle Bin. There is deliberately NO permanent-delete channel at all.
  handle('shell:trash', async (paths) => {
    pathList(paths);
    const result = { done: [], failed: [] };
    for (const p of paths) {
      let label = typeof p === 'string' ? P.basename(p) : String(p);
      try {
        const { typed } = await mutable(p);
        label = P.basename(typed);
        await fsp.lstat(typed);           // must exist
        await shell.trashItem(typed);      // for a symlink this moves the link, not its target
        result.done.push(label);
      } catch (err) {
        result.failed.push({ name: label, message: toError(err).message });
      }
    }
    return result;
  });

  // ------------------------------------------------------------------------
  // Reading & writing file contents (Notepad, Image Viewer)
  // ------------------------------------------------------------------------
  handle('fs:read-text', async (p) => {
    const n = guard.normalize(p);
    const st = await fsp.stat(n);
    if (!st.isFile()) throw new FsError('EISDIR', 'That is not a file.');
    if (st.size > MAX_TEXT_BYTES) throw new FsError('TOOBIG', 'That file is too big for Notepad (5 MB limit).');
    const buf = await fsp.readFile(n);
    if (buf.subarray(0, 8000).includes(0)) throw new FsError('NOTTEXT', "That doesn't look like a text file.");
    let text = buf.toString('utf8');
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip a UTF-8 byte-order mark
    const crlf = (text.match(/\r\n/g) || []).length;
    const lf = (text.match(/(?<!\r)\n/g) || []).length;
    const eol = crlf > lf ? 'crlf' : 'lf';
    return { path: n, name: P.basename(n), text: text.replace(/\r\n/g, '\n'), eol, size: st.size, mtime: st.mtimeMs };
  });

  handle('fs:write-text', async (p, text, eol) => {
    if (typeof text !== 'string') throw bad();
    if (Buffer.byteLength(text) > MAX_WRITE_BYTES) throw new FsError('TOOBIG', 'That text is too big to save (10 MB limit).');
    const { typed } = await mutable(p);
    const nameError = guard.validateName(P.basename(typed));
    if (nameError) throw new GuardError('BADNAME', nameError);
    try {
      if ((await fsp.stat(typed)).isDirectory()) throw new FsError('EISDIR', 'That is a folder, not a file.');
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    const out = eol === 'crlf' ? text.replace(/\n/g, '\r\n') : text;
    const tmp = P.join(P.dirname(typed), `.${P.basename(typed)}.h-os-saving`);
    await mutable(tmp);
    await fsp.writeFile(tmp, out, 'utf8');
    try {
      await fsp.rename(tmp, typed);       // atomic replace: a crash can't leave a half-written file
    } catch (err) {
      await fsp.unlink(tmp).catch(() => {});
      throw err;
    }
    const st = await fsp.stat(typed);
    return { path: typed, name: P.basename(typed), size: st.size, mtime: st.mtimeMs };
  });

  handle('fs:read-image', async (p) => {
    const n = guard.normalize(p);
    const mime = IMAGE_MIME[P.extname(n).toLowerCase()];
    if (!mime) throw new FsError('NOTIMAGE', "That doesn't look like a picture H-os can show.");
    const st = await fsp.stat(n);
    if (!st.isFile()) throw new FsError('EISDIR', 'That is not a file.');
    if (st.size > MAX_IMAGE_BYTES) throw new FsError('TOOBIG', 'That picture is too big (40 MB limit).');
    return { path: n, name: P.basename(n), mime, size: st.size, data: await fsp.readFile(n) };
  });

  // ------------------------------------------------------------------------
  // Shell: open with the OS default app, Recycle Bin
  // ------------------------------------------------------------------------
  handle('shell:open-path', async (p) => {
    const n = guard.normalize(p);
    const st = await fsp.stat(n);
    const ext = P.extname(n).toLowerCase();
    const executable = !win32 && st.isFile() && (st.mode & 0o111) !== 0;
    if (st.isFile() && (BLOCKED_OPEN_EXT.has(ext) || executable)) {
      throw new FsError('BLOCKED', `H-os won't launch programs ("${P.basename(n)}"). Open it from Windows itself if you trust it.`);
    }
    const problem = await shell.openPath(n);
    if (problem) throw new FsError('OPENFAIL', "The system couldn't open that file.");
    return true;
  });

  // The real Recycle Bin window (it opens on top of H-os).
  handle('shell:open-recycle-bin', async () => {
    if (win32) {
      spawn('explorer.exe', ['shell:RecycleBinFolder'], { detached: true, stdio: 'ignore' }).unref();
    } else {
      await shell.openExternal('trash:///');
    }
    return true;
  });

  // ------------------------------------------------------------------------
  // Native open / save dialogs (used by Notepad and Image Viewer)
  // ------------------------------------------------------------------------
  const FILTERS = {
    text: [{ name: 'Text files', extensions: ['txt', 'md', 'json', 'js', 'py', 'html', 'css', 'csv', 'log', 'xml', 'yml', 'yaml', 'ini'] }, { name: 'All files', extensions: ['*'] }],
    image: [{ name: 'Pictures', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'avif'] }],
  };
  const parentWindow = () => require('electron').BrowserWindow.getAllWindows()[0];

  handle('dialog:open-file', async (kind) => {
    const r = await dialog.showOpenDialog(parentWindow(), {
      properties: ['openFile'],
      defaultPath: app.getPath('documents'),
      filters: FILTERS[kind] || [{ name: 'All files', extensions: ['*'] }],
    });
    return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
  });

  handle('dialog:save-file', async (defaultName) => {
    const safe = typeof defaultName === 'string' && !guard.validateName(defaultName) ? defaultName : 'Untitled.txt';
    const r = await dialog.showSaveDialog(parentWindow(), {
      defaultPath: P.join(app.getPath('documents'), safe),
      filters: FILTERS.text,
    });
    return r.canceled || !r.filePath ? null : r.filePath;
  });
}

module.exports = { register };
