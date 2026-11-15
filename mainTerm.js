// =============================================================================
// H-os — terminal sessions + clipboard (main process)
// -----------------------------------------------------------------------------
// The Terminal app shows a REAL shell (PowerShell on Windows, your $SHELL on Linux).
// Preferred: a real pseudo-terminal (node-pty / ConPTY) so colours, line editing, Ctrl+C,
// vim, etc. all work. If node-pty can't load, we fall back to plain pipes (mode 'pipe'):
// the page then does simple line editing itself.
//
// This is deliberately a full shell: it can do anything YOU can do in PowerShell.
// Sessions belong to the window that opened them and are killed when it goes away.
// =============================================================================

const { clipboard } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { makeHandle } = require('./mainIpc');

const MAX_SESSIONS = 8;
const MAX_WRITE = 64 * 1024;
const MAX_CLIPBOARD = 1024 * 1024;

let pty = null;
try {
  if (!process.env.HOS_NO_PTY) pty = require('@lydell/node-pty');
} catch (err) {
  console.log('[main] node-pty unavailable, terminals will use plain pipes:', err.message);
}

const sessions = new Map(); // id -> { proc, mode, sender, flushTimer, buffer }
let nextId = 1;

const clampInt = (v, lo, hi, dflt) => (Number.isInteger(v) ? Math.min(hi, Math.max(lo, v)) : dflt);

function toError(err) {
  return { code: err.code || 'TERMINAL', message: err.message || 'The terminal had a problem.' };
}

// Which shell to start. With a real pseudo-terminal, PowerShell prints our greeting itself:
// Windows clears the screen while a terminal starts, so a greeting the page wrote earlier
// would be wiped. (In pipe mode the page prints it instead.)
const GREETING = "Write-Host ('Welcome to H-os ' + [char]::ConvertFromUtf32(0x1F337)) -ForegroundColor Magenta";
function shellCommand(usePty) {
  if (process.platform === 'win32') {
    const root = process.env.SystemRoot || 'C:\\Windows';
    const ps = path.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    if (fs.existsSync(ps)) {
      return usePty ? { file: ps, args: ['-NoLogo', '-NoExit', '-Command', GREETING], greeted: true } : { file: ps, args: ['-NoLogo'] };
    }
    return { file: process.env.ComSpec || path.join(root, 'System32', 'cmd.exe'), args: [] };
  }
  return { file: process.env.SHELL || '/bin/bash', args: [] };
}

function cleanEnv() {
  const env = { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', TERM_PROGRAM: 'H-os' };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

function startingFolder(cwd) {
  try {
    if (typeof cwd === 'string' && path.isAbsolute(cwd) && !cwd.includes('\0') && fs.statSync(cwd).isDirectory()) return cwd;
  } catch { /* fall through */ }
  return os.homedir();
}

function register() {
  const handle = makeHandle(toError);

  handle('term:spawn', async (opts, event) => {
    if (sessions.size >= MAX_SESSIONS) throw Object.assign(new Error('That is a lot of terminals. Close one first.'), { code: 'TOOMANY' });
    const cols = clampInt(opts && opts.cols, 2, 500, 80);
    const rows = clampInt(opts && opts.rows, 2, 200, 24);
    const cwd = startingFolder(opts && opts.cwd);
    const { file, args, greeted } = shellCommand(Boolean(pty));
    const id = nextId++;
    const sender = event.sender;

    const session = { id, sender, mode: pty ? 'pty' : 'pipe', buffer: '', flushTimer: null, proc: null };

    // Output is batched (every ~8ms) so a flood of text can't clog the message channel.
    const push = (data) => {
      session.buffer += data;
      if (session.flushTimer) return;
      session.flushTimer = setTimeout(() => {
        session.flushTimer = null;
        const chunk = session.buffer;
        session.buffer = '';
        if (chunk && !sender.isDestroyed()) sender.send('term:data', id, chunk);
      }, 8);
    };
    const finish = (code) => {
      if (!sessions.has(id)) return;
      if (session.flushTimer) clearTimeout(session.flushTimer);
      if (session.buffer && !sender.isDestroyed()) sender.send('term:data', id, session.buffer);
      sessions.delete(id);
      if (!sender.isDestroyed()) sender.send('term:exit', id, code);
    };

    if (pty) {
      const proc = pty.spawn(file, args, { name: 'xterm-256color', cols, rows, cwd, env: cleanEnv() });
      proc.onData(push);
      proc.onExit((e) => finish(e.exitCode));
      session.proc = proc;
    } else {
      const proc = spawn(file, args, { cwd, env: cleanEnv(), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
      proc.stdout.on('data', (d) => push(d.toString('utf8')));
      proc.stderr.on('data', (d) => push(d.toString('utf8')));
      proc.on('error', (e) => { push(`\r\n${e.message}\r\n`); finish(1); });
      proc.on('exit', (code) => finish(code === null ? 1 : code));
      session.proc = proc;
    }

    sessions.set(id, session);
    // If the window that owns this terminal goes away, end the shell.
    const onDestroyed = () => kill(id);
    session.onDestroyed = onDestroyed;
    session.sender = sender;
    sender.once('destroyed', onDestroyed);
    return { id, mode: session.mode, shell: path.basename(file), cwd, greeted: Boolean(greeted) };
  });

  const need = (id) => {
    const s = sessions.get(id);
    if (!s) throw Object.assign(new Error('That terminal has already ended.'), { code: 'GONE' });
    return s;
  };

  handle('term:write', async (id, data) => {
    if (typeof data !== 'string' || data.length > MAX_WRITE) throw Object.assign(new Error('Too much text at once.'), { code: 'INVALID' });
    const s = need(id);
    if (s.mode === 'pty') s.proc.write(data);
    else s.proc.stdin.write(data);
    return true;
  });

  handle('term:resize', async (id, cols, rows) => {
    const s = need(id);
    if (s.mode === 'pty') s.proc.resize(clampInt(cols, 2, 500, 80), clampInt(rows, 2, 200, 24));
    return true;
  });

  handle('term:kill', async (id) => {
    kill(id);
    return true;
  });

  // The text clipboard (the page can't touch it directly).
  handle('clipboard:read-text', async () => String(await clipboard.readText()).slice(0, MAX_CLIPBOARD));
  handle('clipboard:write-text', async (text) => {
    if (typeof text !== 'string' || text.length > MAX_CLIPBOARD) throw Object.assign(new Error('Too much text to copy.'), { code: 'INVALID' });
    await clipboard.writeText(text);
    return true;
  });

}

function kill(id) {
  const s = sessions.get(id);
  if (!s) return;
  sessions.delete(id);
  if (s.flushTimer) clearTimeout(s.flushTimer);
  if (s.onDestroyed && s.sender && !s.sender.isDestroyed()) s.sender.removeListener('destroyed', s.onDestroyed);
  try {
    s.proc.kill();
  } catch { /* already gone */ }
}

function killAll() {
  for (const id of [...sessions.keys()]) kill(id);
}

module.exports = { register, killAll, hasPty: () => Boolean(pty) };
