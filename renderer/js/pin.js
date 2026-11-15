// pin.js — the optional lock-screen PIN.
//
// This is a "tuck the tulips in" feature, not real security (H-os is not a real operating
// system, and anyone with access to the computer can close it). The PIN itself is never saved:
// we store a random salt and a PBKDF2 hash of the PIN, and compare hashes when you type it.

import { getSetting, setSetting } from './settingsStore.js';

const toHex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => Uint8Array.from(hex.match(/../g).map((h) => parseInt(h, 16)));

async function hash(pin, saltHex) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: fromHex(saltHex), iterations: 100000, hash: 'SHA-256' }, key, 256);
  return toHex(bits);
}

export const hasPin = () => Boolean(getSetting('pin'));
export const validPinFormat = (pin) => /^[0-9]{4,8}$/.test(pin);

export async function setPin(pin) {
  if (!validPinFormat(pin)) throw new Error('A PIN is 4 to 8 digits.');
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  setSetting('pin', { salt, hash: await hash(pin, salt) });
}

export function clearPin() {
  setSetting('pin', null);
}

export async function verifyPin(pin) {
  const saved = getSetting('pin');
  if (!saved) return true;
  if (typeof pin !== 'string' || !validPinFormat(pin)) return false;
  return (await hash(pin, saved.salt)) === saved.hash;
}
