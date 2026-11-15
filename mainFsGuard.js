// =============================================================================
// H-os — path guard (main process, pure logic, no Electron imports)
// -----------------------------------------------------------------------------
// H-os edits the REAL filesystem, so every path that arrives from the page is
// treated as untrusted. This module answers two questions:
//
//   1. Is this a sane, absolute, well-formed path?          -> normalize()
//   2. May H-os CHANGE (rename/delete/write/…) this place?   -> assertMutable()
//
// Looking at things (listing a folder, reading a file) is always allowed; changing
// system locations is not. "Protected" places (C:\Windows, C:\Program Files, /, /etc, /usr,
// drive roots, the home folder itself, H-os's own folders…) refuse every change with
// the friendly message "H-os protects these tulips".
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
const WIN_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;
const WIN_BAD_CHARS = /[<>:"/\\|?*\x00-\x1f]/;

// Names we hide unless "Show hidden items" is on (Windows legacy junctions, system files…).
const HIDDEN_NAMES = new Set([
  'desktop.ini', 'thumbs.db', '$recycle.bin', 'system volume information', 'pagefile.sys', 'hiberfil.sys',
  'swapfile.sys', 'dumpstack.log.tmp', 'config.msi', 'recovery', '$winreagent', 'documents and settings',
  'programdata', 'appdata', 'application data', 'cookies', 'local settings', 'my documents', 'nethood',
  'printhood', 'recent', 'sendto', 'start menu', 'templates',
]);

function createGuard(options = {}) {
  const platform = options.platform || process.platform;
  const win = platform === 'win32';
  const P = win ? nodePath.win32 : nodePath.posix;
  const env = options.env || process.env;
  const home = options.homedir || os.homedir();
  const key = (p) => (win ? p.toLowerCase() : p); // Windows paths ignore case

  const exact = new Set(); // protected themselves, but things INSIDE them are fine (drive roots, home…)
  const trees = [];        // protected along with everything inside them

  const clean = (p) => {
    const r = P.resolve(p);
    return r.length > P.parse(r).root.length ? r.replace(/[\\/]+$/, '') : r;
  };
  const addExact = (p) => { if (p) exact.add(key(clean(p))); };
  const addTree = (p) => { if (p) trees.push(key(clean(p))); };

  if (win) {
    const drive = env.SystemDrive || 'C:';
    addExact(home);
    addExact(P.join(drive + '\\', 'Users'));
    [env.SystemRoot, env.windir, env.ProgramFiles, env['ProgramFiles(x86)'], env.ProgramW6432, env.ProgramData]
      .forEach(addTree);
    for (const sub of ['Windows', 'Program Files', 'Program Files (x86)', 'ProgramData', 'Recovery', 'Boot', '$WinREAgent']) {
      addTree(P.join(drive + '\\', sub));
    }
  } else {
    ['/', '/home', '/Users', '/mnt', '/media', '/Volumes', home].forEach(addExact);
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
      if (!/^[a-zA-Z]:[\\/]/.test(input) && !/^[a-zA-Z]:$/.test(input)) {
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
  function isProtected(normalized) {
    const k = key(normalized);
    if (exact.has(k)) return true;
    if (P.parse(normalized).root === normalized) return true; // any drive root / "/"
    for (const t of trees) {
      if (k === t || k.startsWith(t.endsWith(P.sep) ? t : t + P.sep)) return true;
    }
    if (win) {
      // On every drive: the system's hidden folders.
      const first = P.relative(P.parse(normalized).root, normalized).split(/[\\/]/)[0].toLowerCase();
      if (first === '$recycle.bin' || first === 'system volume information') return true;
    }
    return false;
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

  return { normalize, isProtected, assertMutable, validateName, isInside, isHiddenName, path: P, GuardError, key };
}

module.exports = { createGuard, GuardError };
