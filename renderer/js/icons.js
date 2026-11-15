// icons.js — every icon in H-os is an original inline SVG defined right here.
//
//   iconEl('explorer')             -> <span class="icon"><svg>…</svg></span>
//   iconEl('power', 'my-class')    -> same, with an extra CSS class
//
// There are two kinds:
//   APP icons  — colourful, 48x48, used for apps (desktop, taskbar, Start menu)
//   UI icons   — simple outline icons that take the surrounding text colour
// The SVG strings below are our own constants (never user input), so using
// innerHTML to turn them into elements is safe.

import { createTulip } from './tulip.js';

const APP_ICONS = {
  folder: null, // (alias of 'explorer', set below)
  explorer: `<svg viewBox="0 0 48 48"><path d="M5 13a3 3 0 0 1 3-3h10.5a3 3 0 0 1 2.1.9L24 14h16a3 3 0 0 1 3 3v22a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3Z" fill="#EE82A8"/><path d="M5 20a3 3 0 0 1 3-3h32a3 3 0 0 1 3 3v19a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3Z" fill="#FBD3E1"/><path d="M8 21h32" stroke="#fff" stroke-opacity=".7" stroke-width="2" stroke-linecap="round"/><path d="M20 35.5c1.5-2.6 6.5-2.6 8 0" stroke="#EE82A8" stroke-width="2.4" stroke-linecap="round" fill="none"/></svg>`,

  recycle: `<svg viewBox="0 0 48 48"><path d="M12 16h24l-2 25a3 3 0 0 1-3 2.7H17a3 3 0 0 1-3-2.7Z" fill="#C9B8F0"/><rect x="9" y="11" width="30" height="5" rx="2.5" fill="#8F77D6"/><rect x="19" y="7" width="10" height="5" rx="2" fill="#8F77D6"/><path d="M19 21v16M24 21v16M29 21v16" stroke="#fff" stroke-opacity=".65" stroke-width="2" stroke-linecap="round"/></svg>`,

  terminal: `<svg viewBox="0 0 48 48"><rect x="4" y="8" width="40" height="32" rx="6" fill="#4A2F5E"/><path d="M4 14a6 6 0 0 1 6-6h28a6 6 0 0 1 6 6v1H4Z" fill="#6B4585"/><circle cx="9.5" cy="11.5" r="1.3" fill="#F4A6C0"/><circle cx="14" cy="11.5" r="1.3" fill="#FFE08A"/><circle cx="18.5" cy="11.5" r="1.3" fill="#9BD6A8"/><path d="M12 22l7 5-7 5" stroke="#F4A6C0" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M23 33h11" stroke="#FFF1C9" stroke-width="3" stroke-linecap="round"/></svg>`,

  puzzles: `<svg viewBox="0 0 48 48"><g transform="translate(-2 -3)"><path d="M10 17h8a5 5 0 1 1 10 0h8a2 2 0 0 1 2 2v7a5 5 0 1 1 0 10v7a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V19a2 2 0 0 1 2-2Z" fill="#C9B8F0"/><path d="M12 22h6" stroke="#fff" stroke-opacity=".7" stroke-width="2.4" stroke-linecap="round"/></g></svg>`,

  sudoku: `<svg viewBox="0 0 48 48"><rect x="6" y="6" width="36" height="36" rx="6" fill="#FFF8EC" stroke="#F4A6C0" stroke-width="2"/><path d="M18 6v36M30 6v36M6 18h36M6 30h36" stroke="#F4A6C0" stroke-width="1.6"/><g font-family="Nunito, sans-serif" font-size="10" font-weight="800" fill="#C2306B" text-anchor="middle"><text x="12" y="15.5">5</text><text x="24" y="27.5">3</text><text x="36" y="39.5">8</text></g></svg>`,

  chess: `<svg viewBox="0 0 48 48"><rect x="4" y="4" width="40" height="40" rx="10" fill="#FBD3E1"/><g transform="translate(6.7 5.3) scale(.72)" fill="#4A2F5E"><circle cx="24" cy="14" r="6.5"/><path d="M18 26c0-3 2.5-5 6-5s6 2 6 5c0 3-2 5-3 8h-6c-1-3-3-5-3-8Z"/><rect x="14" y="34" width="20" height="5" rx="2.5"/><rect x="11" y="39" width="26" height="5" rx="2.5" fill="#C2306B"/></g></svg>`,

  notepad: `<svg viewBox="0 0 48 48"><rect x="9" y="6" width="30" height="37" rx="5" fill="#FFF8EC" stroke="#F4A6C0" stroke-width="2"/><path d="M9 11a5 5 0 0 1 5-5h20a5 5 0 0 1 5 5v4H9Z" fill="#F4A6C0"/><circle cx="16" cy="8.5" r="2" fill="#8F1F4F"/><circle cx="24" cy="8.5" r="2" fill="#8F1F4F"/><circle cx="32" cy="8.5" r="2" fill="#8F1F4F"/><path d="M15 23h18M15 29h18M15 35h11" stroke="#C9B8F0" stroke-width="2.4" stroke-linecap="round"/></svg>`,

  calculator: `<svg viewBox="0 0 48 48"><rect x="9" y="5" width="30" height="38" rx="6" fill="#C9B8F0"/><rect x="13" y="9" width="22" height="9" rx="3" fill="#FFF8EC"/><g fill="#FFF8EC"><circle cx="16.5" cy="25" r="2.6"/><circle cx="24" cy="25" r="2.6"/><circle cx="16.5" cy="32" r="2.6"/><circle cx="24" cy="32" r="2.6"/><circle cx="16.5" cy="39" r="2.6"/><circle cx="24" cy="39" r="2.6"/></g><g fill="#EE82A8"><circle cx="31.5" cy="25" r="2.6"/><circle cx="31.5" cy="32" r="2.6"/><circle cx="31.5" cy="39" r="2.6"/></g></svg>`,

  settings: `<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="16" fill="none" stroke="#8F77D6" stroke-width="7" stroke-dasharray="6.28 6.28"/><circle cx="24" cy="24" r="13" fill="#C9B8F0"/><circle cx="24" cy="24" r="5.5" fill="#FFF8EC"/></svg>`,

  clock: `<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="19" fill="#FFF8EC" stroke="#F4A6C0" stroke-width="4"/><path d="M24 13v11l7 4" stroke="#C2306B" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="24" cy="24" r="2" fill="#C2306B"/></svg>`,

  image: `<svg viewBox="0 0 48 48"><rect x="5" y="9" width="38" height="30" rx="5" fill="#FFF8EC" stroke="#C9B8F0" stroke-width="2.5"/><circle cx="17" cy="19" r="4" fill="#FFE08A"/><path d="M7.5 37 18 26.5 26 34.5 32 28.5 40.5 37V37.5H7.5Z" fill="#6BB57C"/></svg>`,
};


// A paper page with a folded corner; `accent` colours the outline and `glyph` is drawn on it.
const page = (accent, glyph) =>
  `<svg viewBox="0 0 48 48"><path d="M11 4h18l10 10v28a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z" fill="#FFF8EC" stroke="${accent}" stroke-width="2"/><path d="M29 4v7a3 3 0 0 0 3 3h7z" fill="${accent}" opacity=".35"/>${glyph}</svg>`;

const FILE_ICONS = {
  file: page('#C9B8F0', '<path d="M15 26h18M15 31h18M15 36h11" stroke="#C9B8F0" stroke-width="2.4" stroke-linecap="round"/>'),
  'file-text': page('#F4A6C0', '<path d="M15 22h12M15 27h18M15 32h18M15 37h10" stroke="#EE82A8" stroke-width="2.4" stroke-linecap="round"/>'),
  'file-code': page('#8F77D6', '<path d="M20 25l-5 5 5 5M28 25l5 5-5 5" stroke="#8F77D6" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'),
  'file-image': page('#6BB57C', '<circle cx="19" cy="27" r="3" fill="#FFE08A"/><path d="M12 40l8-8 5 5 4-4 7 7z" fill="#6BB57C"/>'),
  'file-audio': page('#EE82A8', '<path d="M27 23v11" stroke="#C2306B" stroke-width="2.6" stroke-linecap="round"/><circle cx="23.5" cy="35" r="3.5" fill="#C2306B"/><path d="M27 23c3 0 5 2 5 5" stroke="#C2306B" stroke-width="2.4" stroke-linecap="round" fill="none"/>'),
  'file-video': page('#7E5BD0', '<path d="M19 25v12l11-6z" fill="#7E5BD0"/>'),
  'file-zip': page('#D99A00', '<path d="M24 4v6M24 14v3M24 21v3" stroke="#D99A00" stroke-width="2.6"/><rect x="20" y="27" width="8" height="9" rx="2" fill="#FFE08A" stroke="#D99A00" stroke-width="2"/>'),
  'file-pdf': page('#D6313F', '<text x="24" y="37" font-family="Nunito, sans-serif" font-size="10" font-weight="800" fill="#D6313F" text-anchor="middle">PDF</text>'),
  drive: `<svg viewBox="0 0 48 48"><rect x="5" y="14" width="38" height="22" rx="6" fill="#C9B8F0"/><rect x="5" y="14" width="38" height="9" rx="6" fill="#DCCFF7"/><circle cx="36" cy="30" r="2.4" fill="#8F77D6"/><path d="M11 30h14" stroke="#8F77D6" stroke-width="2.4" stroke-linecap="round"/></svg>`,
};

// Outline icons: drawn on a 24x24 grid, colour comes from `currentColor`.
const UI_PATHS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  power: '<path d="M12 3v9"/><path d="M6.3 6.8a8 8 0 1 0 11.4 0"/>',
  sleep: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"/>',
  restart: '<path d="M20 12a8 8 0 1 1-2.5-5.8"/><path d="M20 4v5h-5"/>',
  wifi: '<path d="M2.5 9a14 14 0 0 1 19 0"/><path d="M5.5 12.5a9.5 9.5 0 0 1 13 0"/><path d="M8.7 16a5 5 0 0 1 6.6 0"/><circle cx="12" cy="19.2" r="1" fill="currentColor"/>',
  volume: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4Z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6"/><path d="M18 6.5a8 8 0 0 1 0 11"/>',
  battery: '<rect x="2.5" y="7" width="16" height="10" rx="2.5"/><path d="M21 10.5v3"/><rect x="5" y="9.5" width="9" height="5" rx="1" fill="currentColor" stroke="none"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  'folder-plus': '<path d="M3 6h6l2 2h10v11H3Z"/><path d="M12 11.5v5M9.5 14h5"/>',
  wallpaper: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M4 18l5-5 4 4 3-3 4 4"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.5-5.8"/><path d="M20 4v5h-5"/>',
  pin: '<path d="M9 4h6l-1 6 3 3H7l3-3Z"/><path d="M12 13v7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  forward: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  cut: '<circle cx="6" cy="7" r="2.6"/><circle cx="6" cy="17" r="2.6"/><path d="M8.2 8.4L20 18M8.2 15.6L20 6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8"/>',
  paste: '<rect x="5" y="5" width="14" height="16" rx="2.5"/><path d="M9 5V4h6v1M9 11h6M9 15h6"/>',
  trash: '<path d="M4 7h16M10 7V4.5h4V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/>',
  rename: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16Z"/><path d="M13.5 6.5l4 4"/>',
  sort: '<path d="M7 4v16M3.5 16.5L7 20l3.5-3.5M17 20V4M13.5 7.5L17 4l3.5 3.5"/>',
  view: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  home: '<path d="M4 11l8-7 8 7M6 10v10h12V10"/>',
  desktop: '<rect x="3" y="4" width="18" height="12" rx="2.5"/><path d="M9 20h6M12 16v4"/>',
  document: '<path d="M6 3h8l5 5v13H6Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  picture: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M4 18l5-5 4 4 3-3 4 4"/>',
  music: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  video: '<rect x="3" y="6" width="18" height="12" rx="3"/><path d="M10.5 9.5v5l4.5-2.5Z"/>',
  pc: '<rect x="3" y="4" width="18" height="12" rx="2.5"/><path d="M8 20h8M12 16v4"/>',
  'zoom-in': '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4M11 8v6M8 11h6"/>',
  'zoom-out': '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4M8 11h6"/>',
  fit: '<path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4"/>',
  open: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  'win-min': '<path d="M5 12h14"/>',
  'win-max': '<rect x="5" y="5" width="14" height="14" rx="2.5"/>',
  'win-restore': '<rect x="4" y="9" width="11" height="11" rx="2.5"/><path d="M9 9V7.5A2.5 2.5 0 0 1 11.5 5h5A2.5 2.5 0 0 1 19 7.5v5a2.5 2.5 0 0 1-2.5 2.5H15"/>',
};

const UI_WRAP = (inner) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

// 'folder' is the same pink folder as File Explorer.
APP_ICONS.folder = APP_ICONS.explorer;

// Returns <span class="icon [className]"><svg/></span>. Unknown names give an empty span.
export function iconEl(name, className = '') {
  const span = document.createElement('span');
  span.className = ('icon ' + className).trim();
  if (name === 'tulip') {
    span.appendChild(createTulip('tulip-icon'));
  } else if (APP_ICONS[name]) {
    span.innerHTML = APP_ICONS[name];
  } else if (FILE_ICONS[name]) {
    span.innerHTML = FILE_ICONS[name];
  } else if (UI_PATHS[name]) {
    span.innerHTML = UI_WRAP(UI_PATHS[name]);
  }
  return span;
}
