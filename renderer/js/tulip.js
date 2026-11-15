// tulip.js — makes copies of the tulip logo.
//
// The logo is written once in index.html inside <template id="tulip-template">.
// A <template> is "inert" HTML: the browser keeps it but doesn't show it.
// `createTulip('boot-logo')` clones it so each place gets its own copy.
//
//   'boot-logo'  -> the big animated version (bloom plays via .boot.is-running)
//   'tulip-icon' -> a small static version, fully bloomed

export function createTulip(className) {
  const template = document.getElementById('tulip-template');
  const svg = template.content.firstElementChild.cloneNode(true);
  svg.classList.add(className);
  return svg;
}
