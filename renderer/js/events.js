// events.js — a tiny "message board" so parts of H-os can talk without knowing
// about each other (this is what keeps the window manager separate from the taskbar).
//
//   on('windows:changed', (list) => ...)   // "I want to hear about this"
//   emit('windows:changed', list)          // "this just happened"
//
// Event names used so far:
//   windows:changed  [{id, appId, title, focused, minimized}]  (window manager -> taskbar)
//   window:toggle    windowId   focus / minimize that window   (taskbar -> window manager)
//   window:close     windowId                                  (taskbar -> window manager)
//   desktop:show     minimize everything                       (taskbar -> window manager)
//   power:restart / power:wake                                  (power.js -> main.js)
//   file:open        {name, path}                              (start menu -> file apps)

const handlers = new Map(); // event name -> Set of functions

export function on(name, fn) {
  if (!handlers.has(name)) handlers.set(name, new Set());
  handlers.get(name).add(fn);
  return () => handlers.get(name).delete(fn); // call this to stop listening
}

// Returns how many listeners heard it (so callers can react to "nobody is listening").
export function emit(name, data) {
  const set = handlers.get(name);
  if (!set) return 0;
  for (const fn of [...set]) {
    try {
      fn(data);
    } catch (err) {
      console.error(`Error in "${name}" listener:`, err);
    }
  }
  return set.size;
}
