// rng.js — random numbers for the games.
//
// Every game engine takes a "rng" function (returns a number from 0 up to, but not including, 1).
// Normal play passes Math.random. Tests pass makeRng(seed), which gives the SAME sequence every
// time, so a test can build exactly the same board again and again.

// A small, well-known seeded generator ("mulberry32"). Not for security, only for repeatable games.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A whole number from 0 to n-1.
export const randomInt = (rng, n) => Math.floor(rng() * n);

// Shuffle a copy of the list (Fisher-Yates).
export function shuffled(list, rng) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
