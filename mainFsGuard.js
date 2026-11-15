// =============================================================================
// H-os — path guard (main process, pure logic, no Electron imports)
// -----------------------------------------------------------------------------
// H-os edits the REAL filesystem, so every path that arrives from the page is
// treated as untrusted. This module answers three questions:
//
//   1. Is this a sane, absolute, well-formed path?           -> normalize()
//   2. May H-os CHANGE this place (rename/delete/write…)?     -> assertMutable()
//   3. May H-os put NEW things inside this folder?            -> assertContainer()
//
// Looking at things (listing a folder, reading a file) is always allowed; changing system
// locations is not. "Protected" places (C:\Windows, C:\Program Files, /, /etc, /usr, drive roots,
// the home folder itself, Documents/Desktop themselves, H-os's own folders…) refuse every change
// with the friendly message "H-os protects these tulips".
//
// Two kinds of protection:
//   * TREES   are protected together with everything inside them (C:\Windows, /usr, …).
//   * EXACT   places are protected themselves, but things INSIDE are fine (your home folder,
//             Documents, drive roots …): you can't delete "Documents", but you can put files in it.
//
// Because it takes the platform as a parameter, tools/test-guard.js can test BOTH the
// Windows and Linux rules from any computer:  node tools/test-guard.js
// =============================================================================

const nodePath = require('path');
const os = require('os');

class GuardError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // 'INVALID' | 'PROTECTED' | 'BADNAME'
  }
}

// Windows treats these as devices, not files (CON, NUL, COM1 …), even with an extension.
const WIN_RESERVED = /^(con|prn|aux|nul|conin\$|conout\$|com[0-9¹²³]|lpt[0-9¹²³])$/i;
const WIN_BAD_CHARS = /[<>:"/\\|?*\x00-\x1f]/;

// Names we hide unless "Show hidden items" is on (Windows legacy junctions, system files…).
const HIDDEN_NAMES = new Set([
  'desktop.ini', 'thumbs.db', '$recycle.bin', 'system volume information', 'pagefile.sys', 'hiberfil.sys',
  'swapfile.sys', 'dumpstack.log.tmp', 'config.msi', 'recovery', '$winreagent', 'documents and settings',
  'programdata', 'appdata', 'application data', 'cookies', 'local settings', 'my documents', 'nethood',
  'printhood', 'recent', 'sendto', 'start menu', 'templates',
]);

// The standard folders inside a home folder: they can't be renamed or deleted themselves.
const KNOWN_FOLDERS = ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Music', 'Videos'];

function createGuard(options = {}) {
  const platform = options.platform || process.platform;
  const win = platform === 'win32';
  const P = win ? nodePath.win32 : nodePath.posix;
  const env = options.env || process.env;
  const home = options.homedir || os.homedir();
  const key = (p) => (win ? p.toLowerCase() : p); // Windows paths ignore case

  const exact = new Set();        // protected themselves; things INSIDE are fine
  const noContainer = new Set();  // exact places that must not receive new items either (C:\Users, /home …)
  const trees = [];               // protected along with everything inside them

  const clean = (p) => {
    const r = P.resolve(p);
    return r.length > P.parse(r).root.length ? r.replace(/[\\/]+$/, '') : r;
  };
  const addExact = (p) => { if (p) exact.add(key(clean(p))); };
  const addExactNoContainer = (p) => { if (p) { addExact(p); noContainer.add(key(clean(p))); } };
  const addTree = (p) => { if (p) trees.push(key(clean(p))); };

  addExact(home);
  KNOWN_FOLDERS.forEach((name) => addExact(P.join(home, name)));
  if (win) {
    const drive = env.SystemDrive || 'C:';
    addExactNoContainer(P.join(drive + '\\', 'Users'));
    [P.join(home, 'AppData'), P.join(home, 'AppData', 'Local'), P.join(home, 'AppData', 'Roaming')].forEach(addExact);
    [env.SystemRoot, env.windir, env.ProgramFiles, env['ProgramFiles(x86)'], env.ProgramW6432, env.ProgramData]
      .forEach(addTree);
    for (const sub of ['Windows', 'Program Files', 'Program Files (x86)', 'ProgramData', 'Recovery', 'Boot', '$WinREAgent']) {
      addTree(P.join(drive + '\\', sub));
    }
  } else {
    ['/', '/home', '/Users', '/mnt', '/media', '/Volumes'].forEach(addExactNoContainer);
    ['/bin', '/boot', '/dev', '/etc', '/lib', '/lib32', '/lib64', '/libx32', '/opt', '/proc', '/root', '/run', '/sbin',
      '/srv', '/sys', '/usr', '/var', '/snap', '/System', '/Library', '/Applications', '/private'].forEach(addTree);
  }
  // H-os's own folders and anything the caller adds (user-data, the app itself…).
  (options.extraProtectedTrees || []).forEach(addTree);

  // ---------------------------------------------------------------------------
  // normalize(): the path must be absolute and well-formed. Returns a clean string.
  // ---------------------------------------------------------------------------
  function normalize(input) {
    if (typeof input !== 'string' || input.length === 0 || input.length > 4000) {
      throw new GuardError('INVALID', "That path doesn't look right.");
    }
    if (input.includes('\0')) throw new GuardError('INVALID', "That path doesn't look right.");
    if (!P.isAbsolute(input)) throw new GuardError('INVALID', 'H-os needs a full path (like C:\\Users\\you\\file.txt).');

    const rawSegments = input.split(/[\\/]+/).filter(Boolean);
    if (rawSegments.includes('..')) throw new GuardError('INVALID', "Paths with '..' aren't allowed.");

    if (win) {
      // Must look like C:\something. Rejects \\server\share, \\?\C:\, \\.\device and \rooted.
      // (A bare "C:" is drive-relative, so isAbsolute() already refused it above.)
      if (!/^[a-zA-Z]:[\\/]/.test(input)) {
        throw new GuardError('INVALID', 'Network and device paths are not supported.');
      }
      if (input.slice(2).includes(':')) throw new GuardError('INVALID', "That path doesn't look right.");
      if (/[<>"|?*\x00-\x1f]/.test(input.slice(2))) throw new GuardError('INVALID', "That path has characters Windows doesn't allow.");
      for (const seg of rawSegments.slice(1)) {
        // Windows silently drops trailing dots/spaces ("Windows." means "Windows"), so refuse them.
        if (seg !== '.' && /[. ]$/.test(seg)) throw new GuardError('INVALID', 'Names cannot end in a dot or a space.');
        if (WIN_RESERVED.test(seg.split('.')[0].trimEnd())) throw new GuardError('INVALID', `"${seg}" is a reserved Windows name.`);
      }
    }
    return clean(input);
  }

  // ---------------------------------------------------------------------------
  // Protection
  // ---------------------------------------------------------------------------
  const isRoot = (n) => P.parse(n).root === n; // a drive root or "/"

  // Inside one of the protected trees (or Windows' hidden per-drive system folders)?
  function inProtectedTree(n) {
    const k = key(n);
    for (const t of trees) {
      if (k === t || k.startsWith(t.endsWith(P.sep) ? t : t + P.sep)) return true;
    }
    if (win) {
      const first = P.relative(P.parse(n).root, n).split(/[\\/]/)[0].toLowerCase();
      if (first === '$recycle.bin' || first === 'system volume information') return true;
    }
    return false;
  }

  // May this place itself NOT be changed (renamed, deleted, overwritten…)?
  function isProtected(normalized) {
    return exact.has(key(normalized)) || isRoot(normalized) || inProtectedTree(normalized);
  }

  // May this folder NOT receive new items (new folder, paste)? Stricter than isProtected for
  // the places people legitimately work in: your home folder, Documents, a USB drive's root.
  function isProtectedContainer(normalized) {
    if (noContainer.has(key(normalized))) return true;
    if (!win && isRoot(normalized)) return true; // "/"
    return inProtectedTree(normalized);
  }

  function protectedMessage(normalized) {
    const name = P.basename(normalized) || normalized;
    return `H-os protects these tulips: "${name}" is part of the system, so it can't be changed here.`;
  }

  // Returns the normalized path, or throws if H-os must not change it.
  function assertMutable(input) {
    const n = normalize(input);
    if (isProtected(n)) throw new GuardError('PROTECTED', protectedMessage(n));
    return n;
  }

  // Returns the normalized path, or throws if H-os must not put new things inside it.
  function assertContainer(input) {
    const n = normalize(input);
    if (isProtectedContainer(n)) throw new GuardError('PROTECTED', protectedMessage(n));
    return n;
  }

  // ---------------------------------------------------------------------------
  // Names (for rename / new folder)
  // ---------------------------------------------------------------------------
  function validateName(name) {
    if (typeof name !== 'string') return 'That name is not valid.';
    if (name.length === 0 || name.trim().length === 0) return 'A name cannot be empty.';
    if (name.length > 255) return 'That name is too long.';
    if (name === '.' || name === '..') return 'That name is not allowed.';
    if (/[/\\\x00]/.test(name)) return "Names cannot contain / or \\.";
    if (win) {
      if (WIN_BAD_CHARS.test(name)) return 'Names cannot contain any of these: < > : " / \\ | ? *';
      if (/[. ]$/.test(name)) return 'Names cannot end in a dot or a space.';
      if (WIN_RESERVED.test(name.split('.')[0].trimEnd())) return `"${name}" is a reserved Windows name.`;
    }
    return null;
  }

  // Is `child` the same as, or inside, `parent`? (both already normalized/real)
  function isInside(child, parent) {
    const c = key(child);
    const p = key(parent);
    return c === p || c.startsWith(p.endsWith(P.sep) ? p : p + P.sep);
  }

  function isHiddenName(name) {
    const n = name.toLowerCase();
    return n.startsWith('.') || HIDDEN_NAMES.has(n) || n.startsWith('ntuser.');
  }

  return {
    normalize, isProtected, isProtectedContainer, assertMutable, assertContainer, validateName, isInside, isHiddenName,
    path: P, GuardError, key,
  };
}

module.exports = { createGuard, GuardError };
