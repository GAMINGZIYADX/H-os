// apps/manifest.js — the built-in apps as plain descriptions, in Start-menu order.
//
// These entries only say which apps exist and in what order the Start menu lists them.
// Each app's own file (apps/explorer.js, …) calls registerApp() again with the same id and adds
// its create() function, which replaces the entry here. (To add an app, see the README.)

import { registerApp } from '../appRegistry.js';

const APPS = [
  { id: 'explorer', name: 'File Explorer', icon: 'explorer', desktop: true, keywords: 'files folders this pc documents', defaultSize: { w: 920, h: 600 } },
  { id: 'recycle', name: 'Recycle Bin', icon: 'recycle', desktop: true, keywords: 'trash deleted bin' },
  { id: 'terminal', name: 'Terminal', icon: 'terminal', desktop: true, keywords: 'shell powershell bash command line', defaultSize: { w: 760, h: 460 } },
  { id: 'puzzles', name: 'Puzzles', icon: 'puzzles', desktop: true, keywords: 'games sudoku chess play' },
  { id: 'sudoku', name: 'Sudoku', icon: 'sudoku', keywords: 'puzzle numbers grid game' },
  { id: 'chess', name: 'Chess', icon: 'chess', keywords: 'puzzle stockfish board game' },
  { id: 'nummatch', name: 'Number Match', icon: 'nummatch', keywords: 'puzzle numbers pairs ten sum game' },
  { id: 'sweep', name: 'Tulip Sweep', icon: 'sweep', keywords: 'puzzle mines minesweeper thorns flags game' },
  { id: 'merge', name: 'Tulip Merge', icon: 'merge', keywords: 'puzzle numbers tiles slide 2048 game' },
  { id: 'snake', name: 'Snake', icon: 'snake', keywords: 'arcade tulips grow game' },
  { id: 'memory', name: 'Memory', icon: 'memory', keywords: 'puzzle cards pairs flip game' },
  { id: 'bloom', name: 'Tulip Bloom', icon: 'bloom', keywords: 'puzzle lights out flip flowers grid game' },
  { id: 'notepad', name: 'Notepad', icon: 'notepad', desktop: true, keywords: 'text edit write notes' },
  { id: 'calculator', name: 'Calculator', icon: 'calculator', keywords: 'math numbers', defaultSize: { w: 340, h: 520 } },
  { id: 'clock', name: 'Clock', icon: 'clock', keywords: 'timer alarm stopwatch time' },
  { id: 'imageviewer', name: 'Image Viewer', icon: 'image', keywords: 'photos pictures png jpg' },
  { id: 'settings', name: 'Settings', icon: 'settings', desktop: true, keywords: 'personalize theme wallpaper accent taskbar about' },
];

export function registerBuiltinApps() {
  APPS.forEach(registerApp);
}
