// fileTypes.js — what kind of thing is this file? (icon, label, which app opens it)
// plus nicely formatted sizes and dates.

import { extOf } from './pathUtil.js';

const T = (icon, label, kind) => ({ icon, label, kind });

const TYPES = {
  // text & code (opened by Notepad)
  txt: T('file-text', 'Text Document', 'text'), md: T('file-text', 'Markdown File', 'text'), log: T('file-text', 'Log File', 'text'),
  csv: T('file-text', 'CSV File', 'text'), ini: T('file-text', 'Settings File', 'text'), cfg: T('file-text', 'Config File', 'text'),
  json: T('file-code', 'JSON File', 'text'), js: T('file-code', 'JavaScript File', 'text'), mjs: T('file-code', 'JavaScript Module', 'text'),
  ts: T('file-code', 'TypeScript File', 'text'), py: T('file-code', 'Python File', 'text'), html: T('file-code', 'HTML File', 'text'),
  htm: T('file-code', 'HTML File', 'text'), css: T('file-code', 'Stylesheet', 'text'), xml: T('file-code', 'XML File', 'text'),
  yml: T('file-code', 'YAML File', 'text'), yaml: T('file-code', 'YAML File', 'text'), c: T('file-code', 'C Source', 'text'),
  h: T('file-code', 'C Header', 'text'), cpp: T('file-code', 'C++ Source', 'text'), java: T('file-code', 'Java File', 'text'),
  rs: T('file-code', 'Rust File', 'text'), go: T('file-code', 'Go File', 'text'), sh: T('file-code', 'Shell Script', 'text'),
  bat: T('file-code', 'Batch File', 'text'), ps1: T('file-code', 'PowerShell Script', 'text'),
  // pictures (opened by Image Viewer)
  png: T('file-image', 'PNG Image', 'image'), jpg: T('file-image', 'JPEG Image', 'image'), jpeg: T('file-image', 'JPEG Image', 'image'),
  gif: T('file-image', 'GIF Image', 'image'), webp: T('file-image', 'WebP Image', 'image'), bmp: T('file-image', 'Bitmap Image', 'image'),
  svg: T('file-image', 'SVG Image', 'image'), ico: T('file-image', 'Icon', 'image'), avif: T('file-image', 'AVIF Image', 'image'),
  // other (opened by the operating system)
  mp3: T('file-audio', 'MP3 Audio', 'other'), wav: T('file-audio', 'WAV Audio', 'other'), flac: T('file-audio', 'FLAC Audio', 'other'),
  ogg: T('file-audio', 'OGG Audio', 'other'), m4a: T('file-audio', 'M4A Audio', 'other'),
  mp4: T('file-video', 'MP4 Video', 'other'), mkv: T('file-video', 'MKV Video', 'other'), mov: T('file-video', 'QuickTime Video', 'other'),
  avi: T('file-video', 'AVI Video', 'other'), webm: T('file-video', 'WebM Video', 'other'),
  zip: T('file-zip', 'Compressed Folder', 'other'), '7z': T('file-zip', '7-Zip Archive', 'other'), rar: T('file-zip', 'RAR Archive', 'other'),
  tar: T('file-zip', 'TAR Archive', 'other'), gz: T('file-zip', 'GZ Archive', 'other'),
  pdf: T('file-pdf', 'PDF Document', 'other'),
  exe: T('file', 'Application', 'program'), msi: T('file', 'Installer', 'program'), lnk: T('file', 'Shortcut', 'program'),
};

export function describe(entry) {
  if (entry.isDir) return { icon: 'folder', label: 'File folder', kind: 'folder' };
  const ext = extOf(entry.name);
  return TYPES[ext] || T('file', ext ? `${ext.toUpperCase()} File` : 'File', 'other');
}

export const kindOfName = (name) => (TYPES[extOf(name)] || { kind: 'other' }).kind;

export function formatSize(bytes) {
  if (bytes === null || bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let u = 0;
  while (value >= 1024 && u < units.length - 1) { value /= 1024; u++; }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[u]}`;
}

export function formatDate(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleString([], { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
