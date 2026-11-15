// =============================================================================
// H-os self-test:  H-os.exe --selftest      (or: npm run selftest)
// -----------------------------------------------------------------------------
// A quick health check that runs INSIDE the real app (also the packaged .exe) and proves the
// parts that packaging can break: bundled files, the real terminal (node-pty), the Stockfish
// worker + WASM, chess.js, xterm, the bundled font, the filesystem bridge and settings.
// It uses a temporary settings folder, prints a result line and exits (0 = all good).
// Add  --selftest-out=FILE  to also save the result to a file (handy for the portable .exe).
// =============================================================================

const PAGE_CHECKS = `
(async () => {
  const results = {};
  const check = async (name, fn) => {
    try { const detail = await fn(); results[name] = detail === undefined ? true : detail; }
    catch (err) { results[name] = 'FAILED: ' + (err && err.message ? err.message : err); }
  };

  await check('apps registered', async () => {
    const { listApps } = await import('./js/appRegistry.js');
    const apps = listApps();
    const missing = apps.filter((a) => !a.create && !a.run).map((a) => a.id);
    if (missing.length) throw new Error('apps without code: ' + missing.join(', '));
    return apps.length + ' apps';
  });
  await check('font bundled', async () => { await document.fonts.load('700 16px Nunito'); if (!document.fonts.check('700 16px Nunito')) throw new Error('Nunito missing'); });
  await check('settings load', async () => { const s = await hos.settings.load(); if (!s || !s.theme) throw new Error('no settings'); });
  await check('filesystem bridge', async () => {
    const places = await hos.fs.places();
    const list = await hos.fs.readdir(places.data.home, { showHidden: false });
    if (!list.ok) throw new Error(list.error.message);
    return list.data.entries.length + ' items in home';
  });
  await check('reserved names are refused by the filesystem bridge', async () => {
    const r = await hos.fs.mkdir((await hos.fs.places()).data.home, 'NUL');
    if (r.ok || r.error.code !== 'BADNAME') throw new Error('reserved name accepted');
  });
  await check('terminal (real pseudo-terminal)', async () => {
    const s = await hos.term.spawn({ cols: 80, rows: 24 });
    if (!s.ok) throw new Error(s.error.message);
    let text = '';
    const off = hos.term.onData((id, d) => { if (id === s.data.id) text += d; });
    await new Promise((r) => setTimeout(r, 1800));
    await hos.term.write(s.data.id, 'echo selftest-ok\\r');
    await new Promise((r) => setTimeout(r, 1500));
    off();
    await hos.term.kill(s.data.id);
    if (!text.includes('selftest-ok')) throw new Error('shell did not answer');
    return s.data.mode + ' mode, ' + s.data.shell;
  });
  await check('xterm library', async () => { const m = await import('./vendor/xterm/xterm.mjs'); if (!m.Terminal) throw new Error('no Terminal'); });
  await check('chess.js', async () => {
    const { Chess } = await import('./vendor/chess/chess.js');
    const g = new Chess(); g.move('e4'); g.move('e5');
    if (g.fen().split(' ')[0] !== 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR') throw new Error('wrong position');
  });
  await check('Stockfish (WASM worker)', async () => {
    const { StockfishEngine } = await import('./js/puzzles/stockfish.js');
    const engine = new StockfishEngine();
    try {
      await engine.ready;
      const move = await engine.think('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'movetime 150');
      if (!/^[a-h][1-8][a-h][1-8]/.test(move || '')) throw new Error('no move: ' + move);
      return 'played ' + move;
    } finally { engine.destroy(); }
  });
  return results;
})()
`;

exports.run = function run({ win, app, exit, errors }) {
  const t0 = Date.now();
  win.webContents.once('did-finish-load', () => {
    // give the page a moment to start up, then run the checks inside it
    setTimeout(async () => {
      let results;
      try {
        results = await win.webContents.executeJavaScript(PAGE_CHECKS);
      } catch (err) {
        results = { 'page checks': 'FAILED: ' + err.message };
      }
      const failures = Object.entries(results).filter(([, v]) => typeof v === 'string' && v.startsWith('FAILED'));
      if (errors.length) failures.push(['console errors', errors.slice(0, 3).join(' | ')]);
      const lines = Object.entries(results).map(([name, value]) => `[selftest] ${typeof value === 'string' && value.startsWith('FAILED') ? 'FAIL' : 'ok  '} ${name}${value === true ? '' : ' : ' + value}`);
      lines.push(`[selftest] packaged=${app.isPackaged} version=${app.getVersion()} electron=${process.versions.electron} took=${Date.now() - t0}ms`);
      lines.push(`[selftest] ${failures.length ? 'FAILED: ' + failures.map((f) => f[0]).join(', ') : 'ALL GOOD'}`);
      lines.forEach((l) => console.log(l));
      // The portable .exe doesn't show console output, so the result can also be written to a file:
      //   H-os-portable.exe --selftest --selftest-out=C:\\temp\\result.txt
      const out = process.argv.find((a) => a.startsWith('--selftest-out='));
      if (out) { try { require('fs').writeFileSync(out.slice('--selftest-out='.length), lines.join('\n') + '\n'); } catch (e) { console.log('[selftest] could not write the result file:', e.message); } }
      exit(failures.length ? 1 : 0);
    }, 1500);
  });
};
