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
];

let copied = 0;
for (const [pkg, file, folder, name] of FILES) {
  const from = path.join(root, 'node_modules', pkg, file);
  if (!fs.existsSync(from)) {
    console.warn(`[vendor] missing ${pkg}/${file} (run npm install)`);
    continue;
  }
  fs.mkdirSync(path.join(out, folder), { recursive: true });
  fs.copyFileSync(from, path.join(out, folder, name));
  copied++;
}
console.log(`[vendor] copied ${copied} file(s) into renderer/vendor`);
