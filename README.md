# H-os 🌷

A cute, tulip-themed, Windows 11-style "operating system" that runs as a fullscreen app.
It is an [Electron](https://www.electronjs.org/) app made with plain HTML, CSS and JavaScript
(no frameworks), built as a gift, so the code is commented to be read and learned from.

It boots with a blooming tulip, has a lock screen, a desktop, a taskbar, a Start menu, a real
window manager and a handful of apps, including a real File Explorer, a real Terminal and a
Chess game you can play against Stockfish, and eight puzzle games.

## What's inside

| | |
|---|---|
| **Shell** | Boot screen, lock screen (optional PIN), desktop icons you can drag, rubber-band selection, right-click menus, taskbar (centre or left), Start menu with search, Sleep / Restart / Shut down, quick settings, notification center with calendar, toasts, system sounds, dark "night garden" theme, 5 accent colours, 3 wallpapers |
| **Window manager** | Drag, resize from every edge and corner, minimize, maximize, snap to left/right/top, focus and stacking, animations, always above the taskbar |
| **File Explorer** | Browses your **real** files: breadcrumbs, details / list / icon views, sort, search, multi-select, rename, new folder, cut / copy / paste, drag and drop, properties, This PC with drives. Delete goes to the **Recycle Bin**, never permanent |
| **Notepad** | Opens and saves real text files (keeps Windows line endings), find, word wrap, zoom |
| **Image Viewer** | Zoom, pan, previous / next picture in the folder |
| **Terminal** | A real PowerShell (or your shell) via xterm.js and a pseudo-terminal: colours, history, Ctrl+C, copy / paste, multiple windows |
| **Sudoku** | Every puzzle has exactly one solution; easy / medium / hard; notes, hints, undo / redo, mistake highlighting, timer, saved progress, petals when you win |
| **Chess** | Full rules (chess.js), click or drag, promotion, draws, move list, take back, play Stockfish at 21 levels, analysis board with evaluation bar, PGN save / load |
| **Number Match** | Clear the board by pairing equal numbers, or numbers that add up to 10, with nothing in between (across a row, wrapping to the next row, or down a column). Hints, "Add numbers" (5 times), bonus for clearing rows, best score. Keys: A = add numbers, H = hint |
| **Tulip Sweep** | A thorn-finding game with three sizes (easy 9x9, medium 16x16, hard 30x16). The first click is always safe. Left-click opens, right-click (or F, or the Flag button) flags, click an opened number to open its neighbours when the flags add up ("chording"). Arrow keys + Space. Best time per size |
| **Tulip Merge** | Slide numbered tiles with the arrow keys (or W A S D, or a swipe); equal tiles join and double. Animated, undo (Ctrl+Z), best score and biggest tile; keep going after 2048 |
| **Snake** | Collect tulips to grow. Arrow keys or W A S D, Space pauses (and it pauses by itself when you leave the window). Slow / Normal / Fast, walls or wrap-around edges, best score |
| **Memory** | Turn over cards and find the pairs (easy 12, medium 16, hard 24 cards) with a clock, move count and best-moves record |
| **Tulip Bloom** | A "lights out" puzzle: pressing a tulip flips it and its four neighbours; make the whole garden bloom (4x4, 5x5, 6x6). Hints come from a real solver that always knows the shortest way. Reset, best presses |
| **Also** | Calculator, Clock (analog clock, timer, stopwatch), Settings, Recycle Bin shortcut, Puzzles hub |

Every game keeps your game in progress and your best scores, so closing the window (or shutting down) never loses them; the game is waiting when you open it again. Finished games are not kept. A game that cannot read its saved game just starts a new one. (Saved games live in `settings.json`; the main process checks each one against that game's own rules, see `mainGameSaves.js`.)

## Run it

You need [Node.js](https://nodejs.org/) 22 or newer.

```bash
npm install        # also copies the browser libraries into renderer/vendor
npm start          # real fullscreen H-os
npm run dev        # windowed, F12 opens developer tools
```

### You can never get trapped
- **`Ctrl+Alt+Shift+Q`** leaves H-os instantly (it works even if the page freezes).
- **`Alt+F4`** (or any "close") opens *Shut down H-os?* instead of killing the app.
- The normal way out: **Start menu → power button → Shut down** (plays the goodbye, then quits).

## Build the Windows `.exe`

On Windows (the `.exe` must be built on Windows):

```bash
npm install
npm run dist
```

You get, in `dist/`:

- `H-os-1.0.0-portable.exe`: one file, just double-click it.
- `H-os-Setup-1.0.0.exe`: a normal installer (per user, no admin needed, with a desktop shortcut).

The build is **unsigned**, so Windows SmartScreen may say "Windows protected your PC" the first
time: click **More info → Run anyway**. (Some antivirus tools are also wary of unsigned Electron
apps; a code-signing certificate fixes both if you ever want to share it widely.)

`npm run dist:dir` builds just the unpacked folder (`dist/win-unpacked`), which is faster.

### GitHub Actions
`.github/workflows/build-windows.yml` builds the `.exe` files on a Windows runner for every push
to `main` and uploads them as a downloadable **artifact** (Actions tab → pick the run → Artifacts).
Push a tag like `v1.0.0` to run it for a release.

## Tests

```bash
npm run test:unit      # path-safety rules, text encodings, sudoku, calculator, the game rules and saved scores (instant)
npm run smoke:fs       # the filesystem bridge against a sandbox folder
npm run smoke          # drives the whole UI with real mouse and keyboard input (takes a few minutes)
npm run smoke:term     # just the terminal (HOS_NO_PTY=1 tests the plain-pipe fallback)
npm run smoke:games    # all eight games, with real mouse and keyboard (Stockfish really runs)
npm run smoke:system   # settings, panels, PIN, calculator, clock
npm run smoke:exit     # Alt+F4 / close / emergency exit
npm run selftest       # health check of the real app (also works on the built .exe)
```

The smoke tests open a window and use a throw-away settings folder and a sandbox folder, never
your real settings. They send a few `h-os-smoke-test-…` files to your real Recycle Bin.

`H-os.exe --selftest --selftest-out=result.txt` runs a health check on the packaged app.

## Your files and safety

H-os works on your **real** files, so it is careful:

- Every path is checked in the main process (`mainFsGuard.js`, `mainFs.js`), not just in the page.
- **Delete = Recycle Bin.** There is no permanent-delete function anywhere. Replacing a file when
  pasting sends the old one to the Recycle Bin first.
- System places (`C:\Windows`, `C:\Program Files`, `ProgramData`, drive roots, `C:\Users`, your home
  folder itself, `/etc`, `/usr`, …, plus H-os's own folders) can be *browsed* but never changed:
  *"H-os protects these tulips"*. Symlinks, junctions, `..` tricks, `Windows.` with a trailing dot,
  alternate data streams and short names like `PROGRA~1` are all handled.
- H-os never launches programs from the File Explorer (`.exe`, `.bat`, `.lnk`…). The Terminal,
  however, is a real shell and can do anything you can do in PowerShell.
- The page has no Node access: `contextIsolation` on, `nodeIntegration` off, sandboxed, a strict
  Content Security Policy, and a small whitelisted API in `preload.js`.

Settings live in `settings.json` inside Electron's user-data folder (`%APPDATA%\H-os` on Windows).

## How the code is organised

```
main.js            Electron main process: fullscreen window, emergency exit, IPC wiring
preload.js         the small, whitelisted bridge between the page and Node (window.hos)
mainFs*.js         filesystem / shell / dialog IPC + the path guard (mainFsGuard.js)
mainTerm.js        terminal sessions (node-pty) and the clipboard
mainSettings.js    settings.json with strict validation
renderer/
  index.html       the page
  css/             theme.css (all colours!), shell.css, windows.css, taskbar.css, apps/*.css
  js/
    main.js        boot -> lock -> shell, and registers every app
    windowManager.js, appRegistry.js, events.js     the core (start reading here)
    desktop.js, taskbar.js, startmenu.js, panels.js, lock.js, boot.js, power.js
    apps/          one file per app (explorer.js, terminal.js, chess.js, …)
    puzzles/       the rules of every game (no DOM, so they can be tested): sudokuEngine.js, sweepEngine.js, mergeEngine.js, …
  assets/          fonts and generated wallpapers
  vendor/          xterm, chess.js, Stockfish (copied from node_modules; not committed)
tools/             generators and unit tests
```

### Re-theme it
Everything visual comes from CSS variables in `renderer/css/theme.css`: change a colour there
and the whole "OS" changes. The wallpapers are generated by `tools/generate-wallpapers.js`.

### Add an app
1. Create `renderer/js/apps/hello.js`:
   ```js
   import { registerApp } from '../appRegistry.js';
   export function registerHello() {
     registerApp({
       id: 'hello', name: 'Hello', icon: 'tulip', desktop: true,
       defaultSize: { w: 400, h: 300 },
       create(container, ctx) { container.textContent = 'Hello, tulips!'; },
     });
   }
   ```
2. Import it in `renderer/js/main.js` and call `registerHello()`.

The window manager and taskbar do the rest. `windowManager.js` explains the optional hooks
(`destroy`, `onFocus`, `canClose`…).

### Add a game
Do the same, plus: register it with `category: 'puzzle'` and a `description` (that is how it
shows up in the Puzzles hub), call its `registerX()` **before** `registerPuzzlesHub()` in
`renderer/js/main.js`, and keep the rules in a DOM-free file in `renderer/js/puzzles/` so
`tools/test-games.js` can test them. Take any random numbers from a `rng` function
(`puzzles/rng.js`) so tests can replay the same board. To remember a personal best, call
`recordBest()` from `puzzles/gameKit.js` and list the game and its records in `GAME_STATS`
in `mainSettings.js` (the main process drops anything not listed there). To keep the game in progress too, add a validator for it in `mainGameSaves.js` and use `loadSave()` / `writeSave()`. Put every colour in
`theme.css`. Stop every timer in `destroy()`.

## Credits and licences
H-os itself is MIT licensed. All icons, wallpapers, chess pieces, mascot and sounds are original
and drawn or synthesised in code. It uses:

- [Electron](https://www.electronjs.org/) (MIT)
- [Nunito](https://github.com/googlefonts/nunito) font (SIL Open Font License)
- [xterm.js](https://xtermjs.org/) and [node-pty](https://github.com/microsoft/node-pty), prebuilt by [@lydell/node-pty](https://github.com/lydell/node-pty) (MIT)
- [chess.js](https://github.com/jhlywa/chess.js) (BSD-2-Clause)
- [Stockfish.js](https://github.com/nmrugg/stockfish.js) by Nathan Rugg, the WASM build of [Stockfish](https://stockfishchess.org/) (**GPL-3.0**; its licence is in `renderer/vendor/stockfish/Copying.txt`, and the source is available from the project above)

See `THIRD-PARTY-NOTICES.md`.
