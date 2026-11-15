// clock.js — small helpers for time, date and friendly greetings.
// (Used by the lock screen now; the taskbar clock and Start menu reuse them later.)

// "9:41" — the hour and minute only, without AM/PM, in the user's locale.
export function formatClock(date = new Date()) {
  const parts = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).formatToParts(date);
  return parts
    .filter((p) => p.type === 'hour' || p.type === 'minute' || p.type === 'literal')
    .map((p) => p.value.trim())
    .join('');
}

// "Saturday, November 15"
export function formatDate(date = new Date()) {
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(date);
}

// A greeting that matches the time of day.
export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h >= 5 && h < 12) return 'Good morning!';
  if (h >= 12 && h < 18) return 'Good afternoon!';
  if (h >= 18 && h < 22) return 'Good evening!';
  return 'Up late? The tulips are keeping you company.';
}
