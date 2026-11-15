// mascot.js — "Tully", the little tulip sticker who lives in the corner of the desktop.
// Click her for a friendly message. She is original artwork (inline SVG).

import { el } from './dom.js';

const MASCOT_SVG = `
<svg viewBox="0 0 80 100" aria-hidden="true">
  <path d="M22 74 H58 L54 96 H26 Z" fill="#F4A6C0"/>
  <rect x="18" y="68" width="44" height="9" rx="4.5" fill="#EE82A8"/>
  <rect x="38.5" y="50" width="3" height="20" fill="#3F8A5A"/>
  <path d="M40 66 C30 64 24 56 24 48 C32 52 38 58 40 66Z" fill="#6BB57C"/>
  <path d="M40 66 C50 64 56 56 56 48 C48 52 42 58 40 66Z" fill="#82C792"/>
  <path d="M40 56 C22 54 18 34 22 16 C30 22 38 36 40 56Z" fill="#E0709E"/>
  <path d="M40 56 C58 54 62 34 58 16 C50 22 42 36 40 56Z" fill="#E0709E"/>
  <path d="M40 58 C28 52 28 30 40 8 C52 30 52 52 40 58Z" fill="#F4A6C0"/>
  <circle cx="35" cy="35" r="2.4" fill="#4A2F5E"/>
  <circle cx="45" cy="35" r="2.4" fill="#4A2F5E"/>
  <circle cx="35.8" cy="34.2" r=".8" fill="#fff"/>
  <circle cx="45.8" cy="34.2" r=".8" fill="#fff"/>
  <ellipse cx="31.5" cy="41" rx="3" ry="2" fill="#F58A8A" opacity=".6"/>
  <ellipse cx="48.5" cy="41" rx="3" ry="2" fill="#F58A8A" opacity=".6"/>
  <path d="M36.5 41.5 Q40 45.5 43.5 41.5" stroke="#4A2F5E" stroke-width="1.8" stroke-linecap="round" fill="none"/>
</svg>`;

function lines() {
  const h = new Date().getHours();
  const timeLine = h < 12 ? 'Good morning! Ready for a lovely day?' : h < 18 ? 'Hope your afternoon is blooming!' : 'Good evening! Time to unwind a little.';
  return [
    timeLine,
    "Hi, I'm Tully! Nice to meet you.",
    'Remember to sip some water.',
    "You're doing great. Truly.",
    'Tulips love sunshine and snacks.',
    'Psst: Ctrl+Alt+Shift+Q is the emergency exit.',
  ];
}

export function createMascot() {
  const wrap = el('div', 'mascot');
  wrap.innerHTML = MASCOT_SVG;
  const bubble = el('div', 'mascot-bubble');
  wrap.append(bubble);

  let hideTimer = null;
  wrap.addEventListener('pointerdown', (e) => e.stopPropagation()); // don't deselect desktop icons
  wrap.addEventListener('click', () => {
    const all = lines();
    bubble.textContent = all[Math.floor(Math.random() * all.length)];
    bubble.classList.add('is-visible');
    wrap.classList.remove('is-wiggling');
    void wrap.offsetWidth;
    wrap.classList.add('is-wiggling');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => bubble.classList.remove('is-visible'), 4000);
  });
  return wrap;
}
