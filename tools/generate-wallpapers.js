// =============================================================================
// H-os wallpaper generator
// -----------------------------------------------------------------------------
// Run with:  node tools/generate-wallpapers.js
//
// Writes three original SVG wallpapers into renderer/assets/wallpapers/.
// Why a script? A tulip field has ~300 tulips. Typing those by hand would be
// silly, so we describe ONE tulip (a <symbol>) and place copies with <use>.
// The random numbers are "seeded", so every run produces the exact same field.
//
// Want different colours or denser rows? Edit the PALETTES / ROWS below and
// run the script again.
// =============================================================================

const fs = require('fs');
const path = require('path');

const W = 1920;
const H = 1080;
const OUT_DIR = path.join(__dirname, '..', 'renderer', 'assets', 'wallpapers');

// A tiny seeded random number generator (same seed -> same numbers).
function makeRandom(seed) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- One tulip, drawn in a 40 x 110 box. Stem bottom is at y=110. ------------
// `color` is whatever CSS `color` the <use> sets, so one drawing -> any colour.
const TULIP_SYMBOL = `
  <symbol id="tulip" viewBox="0 0 40 110" overflow="visible">
    <path class="stem" d="M20 112 V50" stroke-width="3" stroke-linecap="round" fill="none"/>
    <path class="leaf-a" d="M20 108 C7 98 3 80 9 64 C16 76 20 90 20 108Z"/>
    <path class="leaf-b" d="M20 108 C33 100 38 84 33 70 C26 80 20 92 20 108Z"/>
    <path d="M20 54 C7 51 4 32 7 17 C13 21 18 32 20 54Z" fill="currentColor"/>
    <path d="M20 54 C7 51 4 32 7 17 C13 21 18 32 20 54Z" fill="#000" opacity=".12"/>
    <path d="M20 54 C33 51 36 32 33 17 C27 21 22 32 20 54Z" fill="currentColor"/>
    <path d="M20 54 C33 51 36 32 33 17 C27 21 22 32 20 54Z" fill="#000" opacity=".16"/>
    <path d="M20 56 C11 49 11 27 20 8 C29 27 29 49 20 56Z" fill="currentColor"/>
    <path d="M17 42 C15 33 16 25 19 17 C17 26 17 34 17 42Z" fill="#fff" opacity=".35"/>
  </symbol>`;

// Back row -> front row. Each row is bigger and lower than the one behind it.
const ROWS = [
  { scale: 0.42, baseY: 650 },
  { scale: 0.58, baseY: 705 },
  { scale: 0.78, baseY: 775 },
  { scale: 1.05, baseY: 865 },
  { scale: 1.4, baseY: 975 },
  { scale: 1.85, baseY: 1092 },
];

// A wavy green hill band whose top edge sits at height y.
function groundPath(y, fill) {
  let d = `M0 ${y} Q80 ${y - 12} 160 ${y}`;
  for (let x = 320; x <= W + 160; x += 160) d += ` T${x} ${y}`;
  return `<path d="${d} V${H} H0 Z" fill="${fill}"/>`;
}

// Build the rows of tulips. Returns SVG text.
function buildField(theme, random) {
  let svg = '';
  ROWS.forEach((row, i) => {
    const s = row.scale;
    svg += groundPath(row.baseY - 6, theme.grounds[i]);
    // Two groups per row (a and b) sway out of step with each other.
    const groups = { a: '', b: '' };
    const spacing = 40 * s * 1.2;
    let n = 0;
    for (let x = -20; x < W + 40; x += spacing * (0.8 + random() * 0.4)) {
      const color = theme.petals[Math.floor(random() * theme.petals.length)];
      const jitterY = (random() - 0.5) * 10 * s;
      const sizeJitter = 0.9 + random() * 0.25;
      const w = 40 * s * sizeJitter;
      const h = 110 * s * sizeJitter;
      const ux = (x - w / 2).toFixed(1);
      const uy = (row.baseY - h + jitterY).toFixed(1);
      groups[n++ % 2 === 0 ? 'a' : 'b'] +=
        `<use href="#tulip" x="${ux}" y="${uy}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" color="${color}"/>`;
    }
    svg += `<g class="sway a r${i}">${groups.a}</g><g class="sway b r${i}">${groups.b}</g>`;
    // A soft haze over the back rows makes the field feel far away.
    if (i < 4) svg += `<rect x="0" y="${row.baseY - 150 * s}" width="${W}" height="${H}" fill="${theme.haze}" opacity="${0.1 + i * 0.01}"/>`;
  });
  return svg;
}

// CSS that lives INSIDE the svg file (animations run even when used as a CSS background).
function svgStyle(theme) {
  return `
    .stem{stroke:${theme.stem}} .leaf-a{fill:${theme.leafA}} .leaf-b{fill:${theme.leafB}}
    .sway{transform-box:fill-box;transform-origin:50% 100%;animation:sway 6s ease-in-out infinite alternate;--amp:1.5deg}
    .sway.b{animation-duration:7.4s;animation-delay:-2.2s}
    .r0{--amp:.8deg;animation-delay:-.3s} .r1{--amp:.9deg;animation-delay:-1.1s}
    .r2{--amp:1.1deg;animation-delay:-.7s} .r3{--amp:1.3deg;animation-delay:-1.9s}
    .r4{--amp:1.5deg;animation-delay:-.2s} .r5{--amp:1.7deg;animation-delay:-1.4s}
    .sway.b.r0,.sway.b.r1,.sway.b.r2,.sway.b.r3,.sway.b.r4,.sway.b.r5{animation-delay:-3.4s}
    @keyframes sway{from{transform:skewX(calc(var(--amp) * -1))}to{transform:skewX(var(--amp))}}
    .drift{animation:drift 90s linear infinite alternate}
    @keyframes drift{from{transform:translateX(-60px)}to{transform:translateX(80px)}}
    .twinkle{animation:twinkle 4s ease-in-out infinite alternate}
    @keyframes twinkle{from{opacity:.25}to{opacity:.9}}
    @media (prefers-reduced-motion: reduce){.sway,.drift,.twinkle{animation:none}}`;
}

function cloud(cx, cy, scale, opacity) {
  const e = (dx, dy, rx, ry) => `<ellipse cx="${cx + dx * scale}" cy="${cy + dy * scale}" rx="${rx * scale}" ry="${ry * scale}"/>`;
  return `<g fill="#fff" opacity="${opacity}">${e(0, 0, 120, 34)}${e(-70, 8, 70, 26)}${e(75, 10, 80, 28)}${e(10, -22, 60, 30)}</g>`;
}

function wrap(body, theme) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Original H-os wallpaper, generated by tools/generate-wallpapers.js -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">
  <style>${svgStyle(theme)}</style>
  <defs>${TULIP_SYMBOL}${theme.defs || ''}</defs>
  ${body}
</svg>
`;
}

// ---- Wallpaper 1: tulip field, day -------------------------------------------
function tulipDay() {
  const theme = {
    stem: '#4E9A62', leafA: '#6DB77D', leafB: '#82C792', haze: '#FFF3E3',
    grounds: ['#CDE8BF', '#B8DEAA', '#9DD196', '#82C382', '#68B574', '#4FA262'],
    petals: ['#F4A6C0', '#F4A6C0', '#EE82A8', '#E0558B', '#C2306B', '#FFF1F5', '#FFD9E6', '#C9B8F0', '#FFE08A', '#F58A8A'],
    defs: `
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#BDE0F4"/><stop offset=".45" stop-color="#E6E4F7"/>
        <stop offset=".62" stop-color="#FDE6EE"/><stop offset="1" stop-color="#FFF3E3"/>
      </linearGradient>
      <radialGradient id="sun" cx=".5" cy=".5" r=".5">
        <stop offset="0" stop-color="#FFFBEA" stop-opacity="1"/><stop offset=".35" stop-color="#FFF1C9" stop-opacity=".6"/>
        <stop offset="1" stop-color="#FFE8B8" stop-opacity="0"/>
      </radialGradient>`,
  };
  const random = makeRandom(1234);
  const body = `
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <circle cx="1480" cy="210" r="300" fill="url(#sun)"/>
  <g class="drift">${cloud(420, 180, 1.2, 0.85)}${cloud(1100, 120, 0.8, 0.7)}${cloud(1700, 300, 1, 0.75)}</g>
  <path d="M0 600 C300 520 520 560 760 575 C1000 590 1200 500 1500 550 C1700 585 1820 560 1920 540 V700 H0Z" fill="#D5E6E4" opacity=".8"/>
  <path d="M0 625 C260 585 480 610 700 620 C980 632 1280 575 1560 610 C1740 632 1840 620 1920 606 V720 H0Z" fill="#BFDDC9"/>
  ${buildField(theme, random)}`;
  return wrap(body, theme);
}

// ---- Wallpaper 2: tulip field, dusk ------------------------------------------
function tulipDusk() {
  const theme = {
    stem: '#2F6F5E', leafA: '#3C8570', leafB: '#4A987F', haze: '#7A3F7E',
    grounds: ['#5C5A8C', '#4F5586', '#3F5A7E', '#2F5A70', '#245062', '#1B4455'],
    petals: ['#F28DB2', '#F28DB2', '#E0558B', '#C2306B', '#FF9E80', '#FFD08A', '#B79BE8', '#9C7DDA', '#FFE3F0'],
    defs: `
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2B2262"/><stop offset=".35" stop-color="#6B3F8F"/>
        <stop offset=".55" stop-color="#C45B93"/><stop offset=".7" stop-color="#F59A8C"/>
        <stop offset="1" stop-color="#FFD2A1"/>
      </linearGradient>
      <radialGradient id="sun" cx=".5" cy=".5" r=".5">
        <stop offset="0" stop-color="#FFE9B8" stop-opacity="1"/><stop offset=".3" stop-color="#FFC48A" stop-opacity=".55"/>
        <stop offset="1" stop-color="#FF9E80" stop-opacity="0"/>
      </radialGradient>`,
  };
  const random = makeRandom(98765);
  let stars = '';
  const sr = makeRandom(42);
  for (let i = 0; i < 70; i++) {
    const x = sr() * W, y = sr() * 380, r = 0.8 + sr() * 1.8;
    stars += `<circle class="twinkle" cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(1)}" fill="#FFF6E5" style="animation-delay:-${(sr() * 4).toFixed(1)}s"/>`;
  }
  const body = `
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  ${stars}
  <circle cx="1420" cy="600" r="380" fill="url(#sun)"/>
  <circle cx="1420" cy="610" r="70" fill="#FFE9B8" opacity=".95"/>
  <circle cx="330" cy="170" r="46" fill="#FFF6E5" opacity=".92"/>
  <circle cx="352" cy="158" r="42" fill="#3A2A74" opacity=".35"/>
  <g class="drift">${cloud(700, 330, 1.3, 0.28)}${cloud(1500, 250, 0.9, 0.22)}</g>
  <path d="M0 585 C300 520 560 565 800 580 C1040 595 1240 520 1500 560 C1700 590 1820 570 1920 552 V700 H0Z" fill="#6E4C93" opacity=".85"/>
  <path d="M0 620 C260 585 480 610 700 620 C980 632 1280 585 1560 612 C1740 630 1840 620 1920 608 V720 H0Z" fill="#53508C"/>
  ${buildField(theme, random)}`;
  return wrap(body, theme);
}

// ---- Wallpaper 3: minimal pastel gradient (calm, no tulips) -------------------
function pastel() {
  const theme = { stem: '#000', leafA: '#000', leafB: '#000' };
  const body = `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FDD9E6"/><stop offset=".5" stop-color="#FFF5F8"/><stop offset="1" stop-color="#DCCFF7"/>
    </linearGradient>
    <radialGradient id="b1"><stop offset="0" stop-color="#F4A6C0" stop-opacity=".55"/><stop offset="1" stop-color="#F4A6C0" stop-opacity="0"/></radialGradient>
    <radialGradient id="b2"><stop offset="0" stop-color="#C9B8F0" stop-opacity=".6"/><stop offset="1" stop-color="#C9B8F0" stop-opacity="0"/></radialGradient>
    <radialGradient id="b3"><stop offset="0" stop-color="#FFE8B8" stop-opacity=".55"/><stop offset="1" stop-color="#FFE8B8" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <g class="drift"><circle cx="420" cy="330" r="520" fill="url(#b1)"/></g>
  <g class="drift" style="animation-direction:alternate-reverse"><circle cx="1500" cy="780" r="560" fill="url(#b2)"/></g>
  <g class="drift"><circle cx="1250" cy="200" r="380" fill="url(#b3)"/></g>`;
  // `wrap` adds the tulip symbol too; it's unused here but harmless and tiny.
  return wrap(body, theme);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const files = { 'tulip-day.svg': tulipDay(), 'tulip-dusk.svg': tulipDusk(), 'pastel.svg': pastel() };
for (const [name, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(OUT_DIR, name), content);
  console.log('wrote', name, (content.length / 1024).toFixed(0) + ' KB');
}
