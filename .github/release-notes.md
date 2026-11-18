A cute, tulip-themed, Windows 11-style desktop that runs fullscreen as its own little "OS": a real File Explorer, a real Terminal, Notepad, Image Viewer, Chess against Stockfish, Sudoku, eight puzzle games, Calculator, Clock, Settings, a lock screen with an optional PIN, and more.

## Which file?

- **`H-os-*-portable.exe`**: nothing to install. Double-click it and H-os starts.
- **`H-os-Setup-*.exe`**: a normal installer (per user, no admin needed) with a Start menu and desktop shortcut.

## Good to know

- **Windows 10/11, 64-bit.**
- The files are **not code-signed**, so Windows SmartScreen may say "Windows protected your PC" the first time. Click **More info**, then **Run anyway**. You can read all of the source code in this repository and build the exe yourself (see the README).
- **You can always get out:** `Alt+F4` asks "Shut down H-os?", and `Ctrl+Alt+Shift+Q` is the emergency exit that works even if something freezes.
- Deleting a file in the File Explorer always sends it to the Recycle Bin, and Windows' own folders are protected.
- Games keep your game in progress and your best scores.
