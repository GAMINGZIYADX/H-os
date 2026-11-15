// pathUtil.js — small helpers for paths (the renderer can't use Node's `path`).
// Call setPlatform('win32' | 'linux' | …) once at startup (File Explorer does it).
// The special "path" 'thispc' means the This PC view (list of drives).

let WIN = navigator.platform ? /win/i.test(navigator.platform) : true;
let SEP = WIN ? '\\' : '/';

export function setPlatform(platform) {
  WIN = platform === 'win32';
  SEP = WIN ? '\\' : '/';
}
export const isWindows = () => WIN;

const isDriveRoot = (p) => /^[A-Za-z]:[\\/]?$/.test(p);

export function baseName(p) {
  if (p === 'thispc') return 'This PC';
  if (isDriveRoot(p)) return p.slice(0, 2) + SEP;
  const parts = p.split(/[\\/]+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : p;
}

// Parent folder; 'thispc' above a drive root; null above the top.
export function parentOf(p) {
  if (p === 'thispc') return null;
  if (WIN) {
    if (isDriveRoot(p)) return 'thispc';
    const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'));
    const parent = p.slice(0, i);
    return /^[A-Za-z]:$/.test(parent) ? parent + '\\' : parent;
  }
  if (p === '/') return 'thispc';
  const i = p.lastIndexOf('/');
  return i <= 0 ? '/' : p.slice(0, i);
}

export function joinPath(dir, name) {
  return dir.endsWith('\\') || dir.endsWith('/') ? dir + name : dir + SEP + name;
}

// "C:\Users\me\Docs" -> [{name:'C:\', path:'C:\'}, {name:'Users', path:'C:\Users'}, …]
export function splitPath(p) {
  const out = [];
  if (p === 'thispc') return out;
  if (WIN) {
    const m = p.match(/^([A-Za-z]:)[\\/]?(.*)$/);
    if (!m) return [{ name: p, path: p }];
    let acc = m[1] + '\\';
    out.push({ name: acc, path: acc });
    for (const part of m[2].split(/[\\/]+/).filter(Boolean)) {
      acc = acc.endsWith('\\') ? acc + part : acc + '\\' + part;
      out.push({ name: part, path: acc });
    }
  } else {
    let acc = '/';
    out.push({ name: '/', path: '/' });
    for (const part of p.split('/').filter(Boolean)) {
      acc = acc === '/' ? '/' + part : acc + '/' + part;
      out.push({ name: part, path: acc });
    }
  }
  return out;
}

const key = (p) => (WIN ? p.toLowerCase().replace(/\//g, '\\') : p);
export function samePath(a, b) {
  const trim = (s) => (s.length > 3 ? s.replace(/[\\/]+$/, '') : s);
  return key(trim(a)) === key(trim(b));
}
export function isInside(child, parent) {
  const c = key(child);
  const p = key(parent).replace(/[\\/]+$/, '');
  return c === p || c.startsWith(p + (WIN ? '\\' : '/'));
}

export function extOf(name) {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
}
