// =============================================================================
// Terminal smoke test (part of `npm run smoke`; alone: `npm run smoke:term`).
// Runs a REAL PowerShell/bash and types harmless commands (echo, sleep). With the environment
// variable HOS_NO_PTY=1 it tests the plain-pipe fallback instead.
// =============================================================================

exports.run = async function runTerminal(t) {
  const { js, check, snap, sleep, key, type, clickOn } = t;
  const pipe = Boolean(process.env.HOS_NO_PTY);
  const tag = pipe ? 'terminal(pipe)' : 'terminal';

  const waitFor = async (expr, ms = 15000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      try { if (await js(expr)) return true; } catch { /* page busy */ }
      await sleep(150);
    }
    return false;
  };
  // All text currently shown in the focused terminal (xterm's DOM renderer).
  const screen = () => js(`(document.querySelector('.win.is-focused .xterm-rows') || { textContent: '' }).textContent`);
  const count = async (needle) => ((await screen()).split(needle).length - 1);
  const closeAll = () => js(`window.__hos.windows().forEach((w) => window.__hos.events.emit('window:close', w.id)); 0`);
  const run = async (command) => { await type(command); await key('Return'); };

  // ---------------------------------------------------------------- start
  await js(`window.__hos.launch('terminal', {}); 0`);
  check(`${tag}: window opens with the greeting`, await waitFor(`(document.querySelector('.win.is-focused .xterm-rows')?.textContent || '').includes('Welcome to H-os')`));
  const prompt = pipe ? 'PS>' : 'PS ';
  check(`${tag}: the shell shows a prompt`, await waitFor(`(document.querySelector('.win.is-focused .xterm-rows')?.textContent || '').includes(${JSON.stringify(prompt)})`));
  const info = await js(`window.__hos.terminals[0].info()`);
  check(`${tag}: mode is ${pipe ? 'pipe' : 'pty'}`, info.mode === (pipe ? 'pipe' : 'pty'), JSON.stringify(info));
  await snap('50-terminal.png');

  // ---------------------------------------------------------------- typing
  await clickOn('.win.is-focused .term');
  await run('echo hello-h-os');
  check(`${tag}: a command runs and prints its output`, await waitFor(`(document.querySelector('.win.is-focused .xterm-rows')?.textContent.split('hello-h-os').length - 1) >= 2`));

  if (!pipe) {
    await run('Get-Location');
    check(`${tag}: starts in the home folder`, await waitFor(`(document.querySelector('.win.is-focused .xterm-rows')?.textContent || '').toLowerCase().includes(${JSON.stringify((process.env.USERPROFILE || process.env.HOME || 'users').split(/[\\/]/).pop().toLowerCase())})`));

    // Ctrl+C interrupts a running command
    await run('Start-Sleep 60');
    await sleep(700);
    await key('c', ['control']);
    await sleep(500);
    await run('echo after-interrupt');
    check(`${tag}: Ctrl+C stops a running command and the shell stays usable`, await waitFor(`(document.querySelector('.win.is-focused .xterm-rows')?.textContent.split('after-interrupt').length - 1) >= 2`, 8000));

    // colours are real ANSI
    await run('Write-Host "RED-TEXT" -ForegroundColor Red');
    check(`${tag}: coloured output arrives`, await waitFor(`(document.querySelector('.win.is-focused .xterm-rows')?.textContent.split('RED-TEXT').length - 1) >= 2`));
    await snap('51-terminal-output.png');

    // resize keeps the pseudo-terminal in step with the window
    const before = await js(`({ cols: window.__hos.terminals[0].term.cols, rows: window.__hos.terminals[0].term.rows })`);
    const win = await js(`window.__hos.windows().find((w) => w.focused)`);
    await t.drag(win.x + win.w - 2, win.y + win.h - 2, win.x + win.w + 120, win.y + win.h + 60);
    await sleep(700);
    const after = await js(`({ cols: window.__hos.terminals[0].term.cols, rows: window.__hos.terminals[0].term.rows })`);
    check(`${tag}: resizing the window changes the terminal size`, after.cols > before.cols && after.rows > before.rows, `${before.cols}x${before.rows} -> ${after.cols}x${after.rows}`);
    await run('$Host.UI.RawUI.WindowSize.Width');
    check(`${tag}: the shell itself sees the new width (${after.cols})`, await waitFor(`(document.querySelector('.win.is-focused .xterm-rows')?.textContent || '').includes(${JSON.stringify(String(after.cols))})`));

    // copy / paste through the real clipboard
    await js(`window.__hos.terminals[0].term.select(0, 0, 7); 0`);
    const sel = await js(`window.__hos.terminals[0].term.getSelection()`);
    await key('c', ['control', 'shift']);
    await sleep(400);
    const copied = await js(`hos.clipboard.readText()`);
    check(`${tag}: Ctrl+Shift+C copies the selection`, sel.length === 7 && copied.ok && copied.data === sel, JSON.stringify({ sel, copied }));
    check(`${tag}: copying clears the selection`, (await js(`window.__hos.terminals[0].term.hasSelection()`)) === false);
    await js(`hos.clipboard.writeText('echo pasted-ok').then(() => 0)`);
    await key('v', ['control']);
    await sleep(500);
    await key('Return');
    check(`${tag}: Ctrl+V pastes into the shell`, await waitFor(`(document.querySelector('.win.is-focused .xterm-rows')?.textContent.split('pasted-ok').length - 1) >= 2`));
  }

  // ---------------------------------------------------------------- two terminals are independent
  await js(`window.__hos.launch('terminal', {}); 0`);
  check(`${tag}: a second terminal window opens`, await waitFor(`window.__hos.terminals.length === 2 && window.__hos.windows().length === 2`));
  const sids = await js(`window.__hos.terminals.map((x) => x.info().sid)`);
  check(`${tag}: each terminal has its own shell session`, sids[0] !== sids[1]);
  await waitFor(`(document.querySelector('.win.is-focused .xterm-rows')?.textContent || '').includes(${JSON.stringify(prompt)})`);
  await clickOn('.win.is-focused .term');
  await run('echo only-in-second');
  await waitFor(`(document.querySelector('.win.is-focused .xterm-rows')?.textContent.split('only-in-second').length - 1) >= 2`);
  const firstShows = await js(`window.__hos.terminals[0].term.buffer.active.getLine(0) !== undefined && [...Array(window.__hos.terminals[0].term.buffer.active.length).keys()].map((i) => window.__hos.terminals[0].term.buffer.active.getLine(i)?.translateToString(true)).join('\\n').includes('only-in-second')`);
  check(`${tag}: typing in one terminal does not leak into the other`, firstShows === false);
  await snap('52-two-terminals.png');

  // ---------------------------------------------------------------- exit closes the window
  await run('exit');
  check(`${tag}: "exit" ends the shell and says so`, await waitFor(`(document.querySelector('.win.is-focused .xterm-rows')?.textContent || '').includes('Process exited')`));
  await key('Return');
  check(`${tag}: pressing a key closes the finished terminal's window`, await waitFor(`window.__hos.windows().length === 1`));

  // closing a window kills its shell (no orphan processes)
  const keepSid = await js(`window.__hos.terminals[0].info().sid`);
  await closeAll();
  await sleep(800);
  const gone = await js(`hos.term.write(${keepSid}, 'x').then((r) => (r.ok ? 'STILL ALIVE' : r.error.code))`);
  check(`${tag}: closing the window ends its shell`, gone === 'GONE', gone);
  await js(`window.__hos.terminals.length = 0; 0`);

  // closing a terminal WHILE it is still starting must not leave an invisible shell behind
  await js(`window.__hos.launch('terminal'); 0`);
  await sleep(20);
  await closeAll();
  await sleep(3500);
  const leftovers = await js(`(async () => { const out = []; for (const t of window.__hos.terminals) { const r = await hos.term.write(t.info().sid, 'x'); out.push(r.ok); } return out; })()`);
  check(`${tag}: closing a terminal while it is still starting leaves no shell running`, leftovers.length >= 1 && leftovers.every((alive) => alive === false), JSON.stringify(leftovers));
  await js(`window.__hos.terminals.length = 0; 0`);
};
