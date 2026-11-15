# H-os 🌷

A cute tulip-themed, Windows 11-style "OS" that runs as a fullscreen Electron app.

## Run it

```bash
npm install
npm start          # real fullscreen H-os
npm run dev        # windowed, F12 opens devtools
```

**You can never get trapped:**
- `Ctrl+Alt+Shift+Q` leaves instantly (works even if the page freezes).
- `Alt+F4` opens the "Shut down H-os?" dialog.

Full docs (building the .exe, etc.) arrive in milestone 8.

## Credits
- Font: [Nunito](https://github.com/googlefonts/nunito), SIL Open Font License (see `renderer/assets/fonts/`).
- All icons and wallpapers are original (`tools/generate-wallpapers.js` builds the wallpapers).

## Files & safety (File Explorer, Notepad, Image Viewer)
- Everything touches the **real** disk, so the main process checks every path (`mainFsGuard.js`, `mainFs.js`).
- **Delete = Recycle Bin only.** There is no permanent-delete function anywhere.
- System places (`C:\Windows`, `C:\Program Files`, `/etc`, `/usr`, drive roots, your home folder itself, H-os's own folders…) can be *browsed* but never changed: "H-os protects these tulips".
- H-os never launches programs (`.exe`, `.bat`, `.lnk`, …); double-clicking one shows a refusal.
- Run the tests: `npm run test:guard` (pure path rules), `npm run smoke:fs` (real IPC against a sandbox folder), `npm run smoke` (the whole UI with real mouse/keyboard). The smoke tests send a few sandbox files to your real Recycle Bin.
