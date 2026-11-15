# Third-party notices

H-os bundles the following open-source components. Each keeps its own licence.
Everything else in H-os (icons, wallpapers, chess pieces, the mascot, the sounds and all code) is original.

| Component | Used for | Licence |
|---|---|---|
| [Electron](https://www.electronjs.org/) | the app shell (Chromium + Node.js; their licences are in `LICENSES.chromium.html` and `LICENSE.electron.txt` next to the .exe) | MIT |
| [Nunito](https://github.com/googlefonts/nunito) | the font (`renderer/assets/fonts/`, licence file included) | SIL Open Font License 1.1 |
| [xterm.js](https://github.com/xtermjs/xterm.js) | the Terminal screen (`renderer/vendor/xterm/`) | MIT |
| [node-pty](https://github.com/microsoft/node-pty) via [@lydell/node-pty](https://github.com/lydell/node-pty) | real pseudo-terminals (and Microsoft's OpenConsole/ConPTY on Windows) | MIT |
| [chess.js](https://github.com/jhlywa/chess.js) | chess rules (`renderer/vendor/chess/`) | BSD-2-Clause |
| [Stockfish.js](https://github.com/nmrugg/stockfish.js) / [Stockfish](https://stockfishchess.org/) | the chess engine (`renderer/vendor/stockfish/`) | GPL-3.0 |

## About Stockfish and the GPL
Stockfish is licensed under the GNU General Public License v3. H-os runs it as a separate engine
inside a Web Worker and talks to it only through the UCI text protocol. The full licence text is in
`renderer/vendor/stockfish/Copying.txt`. The complete source of the engine build used here is
available at <https://github.com/nmrugg/stockfish.js> (package `stockfish` on npm, version 19), and
H-os's own source code is in this repository. If you redistribute H-os, keep this notice and the
licence files, and make the source available as the GPL requires.
