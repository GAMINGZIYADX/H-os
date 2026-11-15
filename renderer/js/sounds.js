// =============================================================================
// sounds.js — cute system sounds, synthesised on the fly (no audio files at all)
// =============================================================================
// Everything is built from simple tones and little bursts of noise with the Web Audio API, so
// there is nothing to license. Anyone can ask for a sound with  emit('sound:play', 'win').
// Sounds respect the Settings: "Sounds" on/off and the master volume.
//
// Names: startup shutdown notify error tick place hint move capture check gameover win open close

import { getSetting } from './settingsStore.js';
import { on } from './events.js';

let audio = null;
let master = null;

function ensure() {
  try {
    if (!audio) {
      audio = new AudioContext();
      master = audio.createGain();
      master.connect(audio.destination);
    }
    if (audio.state === 'suspended') audio.resume();
    // volume curve: gentle at the bottom, never painfully loud at the top
    master.gain.value = Math.pow((getSetting('volume') ?? 70) / 100, 2) * 0.5;
    return true;
  } catch {
    return false; // no audio device: stay silent
  }
}

// One soft tone. `at` = seconds from now, `len` = seconds long, `to` = glide to this pitch.
function tone({ f, to = null, type = 'sine', at = 0, len = 0.15, gain = 0.3 }) {
  const t0 = audio.currentTime + at;
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + len);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
  osc.connect(amp).connect(master);
  osc.start(t0);
  osc.stop(t0 + len + 0.05);
}

// A short burst of filtered noise (a soft "thock" or "swish").
function noise({ at = 0, len = 0.08, gain = 0.25, freq = 900 }) {
  const t0 = audio.currentTime + at;
  const buffer = audio.createBuffer(1, Math.max(1, Math.floor(audio.sampleRate * len)), audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = audio.createBufferSource();
  src.buffer = buffer;
  const filter = audio.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = freq;
  const amp = audio.createGain();
  amp.gain.value = gain;
  src.connect(filter).connect(amp).connect(master);
  src.start(t0);
}

const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5, A5 = 880;

const SOUNDS = {
  startup: () => [C5, E5, G5, C6].forEach((f, i) => tone({ f, at: i * 0.13, len: 0.55, gain: 0.22 })),
  shutdown: () => [C6, G5, E5, C5].forEach((f, i) => tone({ f, at: i * 0.15, len: 0.6, gain: 0.2 })),
  notify: () => { tone({ f: A5, len: 0.18, gain: 0.2 }); tone({ f: C6 * 1.25, at: 0.11, len: 0.3, gain: 0.2 }); },
  error: () => { tone({ f: 220, type: 'triangle', len: 0.14, gain: 0.25 }); tone({ f: 165, type: 'triangle', at: 0.14, len: 0.22, gain: 0.25 }); },
  tick: () => tone({ f: 880, len: 0.04, gain: 0.15 }),
  place: () => tone({ f: 520, to: 600, len: 0.07, gain: 0.22 }),
  hint: () => [C6, E5 * 2, G5 * 2].forEach((f, i) => tone({ f, at: i * 0.07, len: 0.2, gain: 0.14 })),
  move: () => { noise({ len: 0.06, gain: 0.35, freq: 700 }); tone({ f: 260, to: 170, len: 0.07, gain: 0.2 }); },
  capture: () => { noise({ len: 0.11, gain: 0.5, freq: 1400 }); tone({ f: 200, to: 110, len: 0.12, gain: 0.3 }); },
  check: () => { tone({ f: 740, len: 0.09, gain: 0.22 }); tone({ f: 740, at: 0.12, len: 0.12, gain: 0.22 }); },
  gameover: () => [G5, E5, C5].forEach((f, i) => tone({ f, at: i * 0.18, len: 0.4, gain: 0.2 })),
  win: () => [C5, E5, G5, C6, G5, C6].forEach((f, i) => tone({ f, at: i * 0.12, len: 0.4, gain: 0.2 })),
  open: () => tone({ f: 420, to: 640, len: 0.1, gain: 0.08 }),
  close: () => tone({ f: 600, to: 380, len: 0.1, gain: 0.08 }),
};

export function playSound(name) {
  if (!getSetting('sounds') || !SOUNDS[name]) return;
  if (!ensure()) return;
  SOUNDS[name]();
}

export function initSounds() {
  on('sound:play', (name) => playSound(name));
}
