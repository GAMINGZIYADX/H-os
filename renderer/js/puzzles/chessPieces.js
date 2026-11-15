// puzzles/chessPieces.js — the chess pieces. Original artwork (simple shapes drawn for H-os).
//
// Each piece is an SVG drawn on a 100x100 grid. Colours come from CSS variables so the same
// drawing serves both sides:  --pf (fill)  --ps (outline)  --pd (little details).

const BASE = '<path d="M24 82 H76 a3 3 0 0 1 3 3 V88 a3 3 0 0 1 -3 3 H24 a3 3 0 0 1 -3 -3 V85 a3 3 0 0 1 3 -3 Z"/>';

const SHAPES = {
  // Pawn: a round head on a little skirt
  p: `<circle cx="50" cy="30" r="13"/>
      <path d="M40 46 H60 L57 54 H43 Z"/>
      <path d="M43 54 H57 L67 82 H33 Z"/>
      <path class="d" d="M43 27 C44 22 48 20 52 20" fill="none"/>${BASE}`,
  // Rook: a tower with battlements
  r: `<path d="M27 82 L31 42 H69 L73 82 Z"/>
      <path d="M27 42 V22 H39 V29 H45 V22 H55 V29 H61 V22 H73 V42 Z"/>
      <path class="d" d="M38 54 H62" fill="none"/>${BASE}`,
  // Knight: a horse's head
  n: `<path d="M30 82 C29 68 35 58 43 51 C36 52 29 56 23 61 L21 52 C27 42 36 31 46 25 L47 14 L55 22 C70 24 79 38 77 54 C76 64 71 73 71 82 Z"/>
      <circle class="dot" cx="55" cy="35" r="3.4"/>
      <path class="d" d="M60 28 C66 33 68 40 67 47 M43 51 C47 50 50 47 51 43" fill="none"/>${BASE}`,
  // Bishop: a pointed hat with a slit
  b: `<path d="M35 82 C39 70 42 61 42 54 C35 48 33 39 37 31 C41 24 46 19 50 13 C54 19 59 24 63 31 C67 39 65 48 58 54 C58 61 61 70 65 82 Z"/>
      <circle cx="50" cy="12" r="5"/>
      <path class="d" d="M55 27 L46 41" fill="none"/>${BASE}`,
  // Queen: a crown with five points
  q: `<path d="M29 82 L35 46 L26 27 L40 40 L44 20 L50 38 L56 20 L60 40 L74 27 L65 46 L71 82 Z"/>
      <circle cx="26" cy="24" r="4.5"/><circle cx="44" cy="17" r="4.5"/><circle cx="56" cy="17" r="4.5"/><circle cx="74" cy="24" r="4.5"/>
      <path class="d" d="M38 62 H62" fill="none"/>${BASE}`,
  // King: a cross on a crown
  k: `<path d="M31 82 C33 66 38 56 38 47 C38 38 44 33 50 33 C56 33 62 38 62 47 C62 56 67 66 69 82 Z"/>
      <path d="M50 8 V30 M41 17 H59" fill="none" stroke-width="5.5" stroke-linecap="round"/>
      <path class="d" d="M40 58 H60" fill="none"/>${BASE}`,
};

// Returns an <svg> element for a piece: color 'w' | 'b', type 'p' 'n' 'b' 'r' 'q' 'k'.
export function pieceSvg(color, type) {
  const wrap = document.createElement('span');
  wrap.className = `piece piece-${color}`;
  wrap.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true"><g class="shape">${SHAPES[type]}</g></svg>`;
  return wrap;
}

export const PIECE_NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
