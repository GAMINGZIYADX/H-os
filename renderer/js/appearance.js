// appearance.js — applies theme / accent / wallpaper.
//
// All of these are just attributes on the <html> element. The CSS in theme.css
// and shell.css reacts to them, e.g. :root[data-theme='dark'] { ... }.
// In milestone 2 the settings store will call applyAppearance() with saved values.

export const DEFAULT_APPEARANCE = {
  theme: 'light',      // 'light' | 'dark'
  accent: 'pink',      // 'pink' | 'red' | 'yellow' | 'purple' | 'white'
  wallpaper: 'day',    // 'day' | 'dusk' | 'pastel'
};

export function applyAppearance(settings) {
  const root = document.documentElement;
  const merged = { ...DEFAULT_APPEARANCE, ...settings };
  root.dataset.theme = merged.theme;
  root.dataset.accent = merged.accent;
  root.dataset.wallpaper = merged.wallpaper;
}
