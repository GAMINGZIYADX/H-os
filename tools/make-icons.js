// =============================================================================
// Builds the app icon (build/icon.ico for Windows, build/icon.png for everything else).
// Run with:   npx electron tools/make-icons.js
// The icon is the H-os tulip on a soft pink tile, drawn as SVG and rendered by Electron itself,
// so no image tools are needed. An .ico file may hold PNG pictures, so we just pack them.
// =============================================================================

const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'build');
const SIZES = [16, 24, 32, 48, 64, 128, 256];

// The same tulip as the boot screen (renderer/index.html <template id="tulip-template">).
const TULIP = `
  <path d="M50 128 V68" stroke="#3f8a5a" stroke-width="5" stroke-linecap="round" fill="none"/>
  <path d="M50 124 C28 118 20 98 24 80 C38 90 48 104 50 124Z" fill="#6bb57c"/>
  <path d="M50 124 C72 118 80 98 76 80 C62 90 52 104 50 124Z" fill="#82c792"/>
  <path d="M50 72 C30 68 26 44 32 24 C42 32 48 50 50 72Z" fill="#e0709e" transform="rotate(-9 50 72)"/>
  <path d="M50 72 C70 68 74 44 68 24 C58 32 52 50 50 72Z" fill="#e0709e" transform="rotate(9 50 72)"/>
  <path d="M50 74 C36 66 36 38 50 14 C64 38 64 66 50 74Z" fill="#f4a6c0"/>
  <path d="M45 56 C42 44 44 32 49 24 C46 35 46 46 45 56Z" fill="#fff" opacity=".5"/>`;

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bg" cx="50%" cy="38%" r="75%">
      <stop offset="0" stop-color="#fff5f8"/><stop offset=".6" stop-color="#fbd3e1"/><stop offset="1" stop-color="#f4a6c0"/>
    </radialGradient>
  </defs>
  <rect x="16" y="16" width="480" height="480" rx="112" fill="url(#bg)"/>
  <g transform="translate(106 62) scale(3.0)">${TULIP}</g>
</svg>`;

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({ width: 512, height: 512, show: false, transparent: true, frame: false, webPreferences: { offscreen: false } });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<html><body style="margin:0;background:transparent;overflow:hidden">${SVG}</body></html>`));
  await new Promise((r) => setTimeout(r, 400));
  win.setContentSize(512, 512);
  const big = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  fs.writeFileSync(path.join(OUT, 'icon.png'), big.toPNG());

  // pack the sizes into one .ico (each entry is a PNG)
  const pngs = SIZES.map((size) => ({ size, data: big.resize({ width: size, height: size, quality: 'best' }).toPNG() }));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let offset = 6 + dir.length;
  pngs.forEach((p, i) => {
    const o = i * 16;
    dir.writeUInt8(p.size >= 256 ? 0 : p.size, o);
    dir.writeUInt8(p.size >= 256 ? 0 : p.size, o + 1);
    dir.writeUInt8(0, o + 2); dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(p.data.length, o + 8); dir.writeUInt32LE(offset, o + 12);
    offset += p.data.length;
  });
  fs.writeFileSync(path.join(OUT, 'icon.ico'), Buffer.concat([header, dir, ...pngs.map((p) => p.data)]));
  console.log('wrote build/icon.png and build/icon.ico (' + SIZES.join(', ') + ' px)');
  app.exit(0);
});
