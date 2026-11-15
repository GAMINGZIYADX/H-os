// dom.js — one tiny helper used all over H-os.
//
//   el('div', 'card', 'Hello')  ->  <div class="card">Hello</div>
//
// We build elements with createElement + textContent (never innerHTML with
// user text), which keeps file names and other text safe.

export function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
