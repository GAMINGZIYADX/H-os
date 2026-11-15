// Copies the few third-party browser libraries we use from node_modules into renderer/vendor/,
// so the page can load them from its own folder (no CDN, no node_modules paths at runtime).
// Runs automatically after `npm install` and before `npm start` / `npm run dist`.

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'renderer', 'vendor');

// [package, file inside the package, destination folder name, destination file name]
const FILES = [
  ['@xterm/xterm', 'lib/xterm.mjs', 'xterm', 'xterm.mjs'],
  ['@xterm/xterm', 'css/xterm.css', 'xterm', 'xterm.css'],
  ['@xterm/xterm', 'LICENSE', 'xterm', 'LICENSE'],
  ['@xterm/addon-fit', 'lib/addon-fit.mjs', 'xterm', 'addon-fit.mjs'],
  ['chess.js', 'dist/esm/chess.js', 'chess', 'chess.js'],
  ['chess.js', 'LICENSE', 'chess', 'LICENSE'],
  // Stockfish (GPL-3.0): the "lite, single-threaded" engine = small, and needs no special browser setup.
  ['stockfish', 'bin/stockfish-19-lite-single.js', 'stockfish', 'stockfish.js'],
  ['stockfish', 'bin/stockfish-19-lite-single.wasm', 'stockfish', 'stockfish.wasm'],
  ['stockfish', 'Copying.txt', 'stockfish', 'Copying.txt'],
];

let copied = 0;
for (const [pkg, file, folder, name] of FILES) {
  const from = path.join(root, 'node_modules', pkg, file);
  if (!fs.existsSync(from)) {
    console.warn(`[vendor] missing ${pkg}/${file} (run npm install)`);
    process.exitCode = 1; // fail `npm run dist` instead of packaging an app without xterm / chess.js / Stockfish
    continue;
  }
  fs.mkdirSync(path.join(out, folder), { recursive: true });
  fs.copyFileSync(from, path.join(out, folder, name));
  copied++;
}
console.log(`[vendor] copied ${copied} file(s) into renderer/vendor`);
