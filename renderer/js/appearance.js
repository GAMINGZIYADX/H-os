// appearance.js — applies theme / accent / wallpaper / taskbar alignment.
//
// All of these are just attributes on the <html> element. The CSS in theme.css,
// shell.css and taskbar.css reacts to them, e.g. :root[data-theme='dark'] { … }.
// settingsStore.js calls applyAppearance() whenever one of them changes.

export function applyAppearance(settings) {
  const root = document.documentElement;
  if (settings.theme) root.dataset.theme = settings.theme;               // 'light' | 'dark'
  if (settings.accent) root.dataset.accent = settings.accent;             // 'pink' | 'red' | 'yellow' | 'purple' | 'white'
  if (settings.wallpaper) root.dataset.wallpaper = settings.wallpaper;    // 'day' | 'dusk' | 'pastel'
  if (settings.taskbarAlign) root.dataset.taskbarAlign = settings.taskbarAlign; // 'center' | 'left'
  if (Number.isFinite(settings.brightness)) root.style.setProperty('--dim', String(((100 - settings.brightness) / 100) * 0.75)); // 100 = bright, 40 = dim
}
