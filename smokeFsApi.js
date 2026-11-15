// =============================================================================
// Filesystem API smoke test (run with: npm run smoke:fs)
// -----------------------------------------------------------------------------
// Calls the real IPC handlers through window.hos.fs against a throw-away SANDBOX folder.
// "Protected" behaviour is tested against sandbox/protected-zone, which main.js registers
// as a protected folder only in smoke mode, so we never poke at real system folders.
// NOTE: the Recycle-Bin test sends a few sandbox files to your REAL Recycle Bin
// (they are named h-os-smoke-test-…; feel free to empty them).
// =============================================================================

const fs = require('fs');
const path = require('path');

exports.run = async function runFsApi({ js, check, sandbox }) {
  // ---- build the sandbox ----
  fs.rmSync(sandbox, { recursive: true, force: true });
  const zone = path.join(sandbox, 'protected-zone');
  fs.mkdirSync(path.join(sandbox, 'docs'), { recursive: true });
  fs.mkdirSync(zone, { recursive: true });
  fs.writeFileSync(path.join(sandbox, 'a.txt'), 'hello\r\nworld\r\n');
  fs.writeFileSync(path.join(sandbox, 'b.txt'), 'bee');
  fs.writeFileSync(path.join(sandbox, '.hidden.txt'), 'shh');
  fs.writeFileSync(path.join(sandbox, 'docs', 'inner.txt'), 'inner');
  fs.writeFileSync(path.join(sandbox, 'binary.dat'), Buffer.from([1, 2, 0, 3, 4]));
  fs.writeFileSync(path.join(sandbox, 'big.txt'), 'x'.repeat(5 * 1024 * 1024 + 10));
  fs.writeFileSync(path.join(sandbox, 'fake.exe'), 'not really a program');
  fs.writeFileSync(path.join(sandbox, 'h-os-smoke-test-trash-me.txt'), 'to the bin');
  fs.writeFileSync(path.join(sandbox, 'h-os-smoke-test-trash-me-2.txt'), 'to the bin 2');
  fs.writeFileSync(path.join(zone, 'secret.txt'), 'do not touch');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  fs.writeFileSync(path.join(sandbox, 'pic.png'), png);
  let junction = null;
  try { junction = path.join(sandbox, 'link-to-zone'); fs.symlinkSync(zone, junction, 'junction'); } catch (e) { junction = null; console.log('[fs] no junction support:', e.message); }

  const S = (p) => JSON.stringify(path.join(sandbox, p));
  const Z = (p) => JSON.stringify(path.join(zone, p));
  const SB = JSON.stringify(sandbox);
  // call an API function in the page and return the {ok, data|error} envelope as plain JSON
  const api = (expr) => js(`(async () => { const r = await ${expr}; return JSON.parse(JSON.stringify(r, (k, v) => (v && v.type === 'Buffer') ? '[buffer]' : v)); })()`);
  const code = (r) => (r.ok ? 'OK' : r.error.code);
  const names = (r) => r.data.entries.map((e) => e.name).sort();
  const gone = (p) => !fs.existsSync(path.join(sandbox, p));

  // ---- reading ----
  let r = await api('hos.fs.places()');
  check('fs: places has home + documents', r.ok && r.data.home && r.data.documents && r.data.sep);
  r = await api('hos.fs.drives()');
  check('fs: drives lists at least one drive with sizes', r.ok && r.data.length > 0 && r.data[0].total > 0, JSON.stringify(r.data && r.data.slice(0, 2)));
  r = await api(`hos.fs.readdir(${SB})`);
  check('fs: readdir lists the sandbox, hides dot-files', r.ok && names(r).includes('a.txt') && names(r).includes('docs') && !names(r).includes('.hidden.txt'), names(r).join(','));
  r = await api(`hos.fs.readdir(${SB}, { showHidden: true })`);
  check('fs: readdir with showHidden shows dot-files', r.ok && names(r).includes('.hidden.txt'));
  r = await api(`hos.fs.readdir('C:\\\\Windows')`);
  check('fs: browsing a system folder is allowed (read-only)', r.ok && r.data.entries.length > 5);
  check('fs: relative path refused', code(await api(`hos.fs.readdir('docs')`)) === 'INVALID');
  check("fs: '..' refused", code(await api(`hos.fs.readdir(${SB} + '\\\\..\\\\..')`)) === 'INVALID');
  check('fs: UNC path refused', code(await api(`hos.fs.readdir('\\\\\\\\server\\\\share')`)) === 'INVALID');
  check('fs: non-string refused', code(await api(`hos.fs.readdir(42)`)) === 'INVALID');
  check('fs: missing folder -> ENOENT', code(await api(`hos.fs.readdir(${S('nope')})`)) === 'ENOENT');
  r = await api(`hos.fs.stat(${S('a.txt')})`);
  check('fs: stat', r.ok && r.data.size === 14 && !r.data.isDir);
  r = await api(`hos.fs.folderInfo(${S('docs')})`);
  check('fs: folderInfo', r.ok && r.data.files === 1 && r.data.size === 5);

  // ---- new folder / rename ----
  check('fs: mkdir works', code(await api(`hos.fs.mkdir(${SB}, 'newdir')`)) === 'OK' && fs.existsSync(path.join(sandbox, 'newdir')));
  check('fs: mkdir again -> EEXIST', code(await api(`hos.fs.mkdir(${SB}, 'newdir')`)) === 'EEXIST');
  check('fs: mkdir with slash in name refused', code(await api(`hos.fs.mkdir(${SB}, 'a/b')`)) === 'BADNAME');
  check('fs: mkdir "NUL" refused', code(await api(`hos.fs.mkdir(${SB}, 'NUL')`)) === 'BADNAME');
  check('fs: mkdir inside protected zone refused', code(await api(`hos.fs.mkdir(${JSON.stringify(zone)}, 'x')`)) === 'PROTECTED' && !fs.existsSync(path.join(zone, 'x')));
  check('fs: rename works', code(await api(`hos.fs.rename(${S('b.txt')}, 'bee.txt')`)) === 'OK' && fs.existsSync(path.join(sandbox, 'bee.txt')));
  check('fs: rename onto existing -> EEXIST', code(await api(`hos.fs.rename(${S('bee.txt')}, 'a.txt')`)) === 'EEXIST');
  check('fs: rename with colon refused', code(await api(`hos.fs.rename(${S('bee.txt')}, 'x:y')`)) === 'BADNAME');
  check('fs: rename case-only works', code(await api(`hos.fs.rename(${S('bee.txt')}, 'BEE.txt')`)) === 'OK');
  check('fs: rename inside protected zone refused', code(await api(`hos.fs.rename(${Z('secret.txt')}, 'renamed.txt')`)) === 'PROTECTED' && fs.existsSync(path.join(zone, 'secret.txt')));
  check('fs: rename the protected zone itself refused', code(await api(`hos.fs.rename(${JSON.stringify(zone)}, 'zone2')`)) === 'PROTECTED');
  if (junction) {
    check('fs: mkdir THROUGH a junction into the protected zone refused (real-path check)', code(await api(`hos.fs.mkdir(${S('link-to-zone')}, 'sneaky')`)) === 'PROTECTED' && !fs.existsSync(path.join(zone, 'sneaky')));
    check('fs: rename THROUGH a junction refused', code(await api(`hos.fs.rename(${S('link-to-zone/secret.txt')}, 'oops.txt')`)) === 'PROTECTED' && fs.existsSync(path.join(zone, 'secret.txt')));
    r = await api(`hos.shell.trash([${S('link-to-zone/secret.txt')}])`);
    check('fs: trash THROUGH a junction refused', r.ok && r.data.failed.length === 1 && /protects/.test(r.data.failed[0].message) && fs.existsSync(path.join(zone, 'secret.txt')));
  }
  if (process.platform === 'win32') {
    if (fs.existsSync('C:\\PROGRA~1')) check('fs: 8.3 short name C:\\PROGRA~1 is still protected', code(await api(`hos.fs.mkdir('C:\\\\PROGRA~1', 'h-os-zz')`)) === 'PROTECTED');
    if (fs.existsSync('C:\\Documents and Settings')) check('fs: junction C:\\Documents and Settings -> C:\\Users is still protected', code(await api(`hos.fs.mkdir('C:\\\\Documents and Settings', 'h-os-zz')`)) === 'PROTECTED');
  }

  // ---- copy / move ----
  r = await api(`hos.fs.paste('copy', [${S('a.txt')}], ${S('docs')})`);
  check('fs: copy into another folder', r.ok && r.data.done.length === 1 && fs.existsSync(path.join(sandbox, 'docs', 'a.txt')) && fs.existsSync(path.join(sandbox, 'a.txt')));
  r = await api(`hos.fs.conflicts([${S('a.txt')}], ${S('docs')})`);
  check('fs: conflicts detects existing names', r.ok && r.data.length === 1 && r.data[0] === 'a.txt');
  r = await api(`hos.fs.paste('copy', [${S('a.txt')}], ${S('docs')})`);
  check('fs: paste onto existing without a decision fails (EEXIST)', r.ok && r.data.failed.length === 1 && r.data.done.length === 0);
  r = await api(`hos.fs.paste('copy', [${S('a.txt')}], ${S('docs')}, 'keepBoth')`);
  check('fs: keepBoth makes "a (2).txt"', r.ok && r.data.done[0] === 'a (2).txt' && fs.existsSync(path.join(sandbox, 'docs', 'a (2).txt')));
  fs.writeFileSync(path.join(sandbox, 'a.txt'), 'NEW CONTENT');
  r = await api(`hos.fs.paste('copy', [${S('a.txt')}], ${S('docs')}, 'replace')`);
  check('fs: replace overwrites with the new content (old one goes to the Recycle Bin)', r.ok && r.data.done.length === 1 && fs.readFileSync(path.join(sandbox, 'docs', 'a.txt'), 'utf8') === 'NEW CONTENT');
  r = await api(`hos.fs.paste('copy', [${S('a.txt')}], ${S('docs')}, 'skip')`);
  check('fs: skip leaves things alone', r.ok && r.data.skipped.length === 1);
  r = await api(`hos.fs.paste('copy', [${S('a.txt')}], ${SB})`);
  check('fs: copy in the same folder makes "a - Copy.txt"', r.ok && r.data.done[0] === 'a - Copy.txt');
  r = await api(`hos.fs.paste('move', [${S('a - Copy.txt')}], ${S('newdir')})`);
  check('fs: move works', r.ok && r.data.done.length === 1 && gone('a - Copy.txt') && fs.existsSync(path.join(sandbox, 'newdir', 'a - Copy.txt')));
  fs.mkdirSync(path.join(sandbox, 'docs', 'deeper'));
  r = await api(`hos.fs.paste('move', [${S('docs')}], ${S('docs/deeper')})`);
  check('fs: folder into its own subfolder refused', r.ok && r.data.failed.length === 1 && fs.existsSync(path.join(sandbox, 'docs', 'inner.txt')), JSON.stringify(r.data));
  r = await api(`hos.fs.paste('copy', [${S('a.txt')}], ${JSON.stringify(zone)})`);
  check('fs: paste INTO protected zone refused', !r.ok && r.error.code === 'PROTECTED' && !fs.existsSync(path.join(zone, 'a.txt')));
  r = await api(`hos.fs.paste('copy', [${Z('secret.txt')}], ${SB})`);
  check('fs: paste FROM protected zone refused', r.ok && r.data.failed.length === 1 && !fs.existsSync(path.join(sandbox, 'secret.txt')));
  r = await api(`hos.fs.paste('move', [${Z('secret.txt')}], ${SB})`);
  check('fs: moving OUT of protected zone refused', r.ok && r.data.failed.length === 1 && fs.existsSync(path.join(zone, 'secret.txt')));

  // ---- Recycle Bin ----
  r = await api(`hos.shell.trash([${S('h-os-smoke-test-trash-me.txt')}, ${S('h-os-smoke-test-trash-me-2.txt')}])`);
  check('fs: trash sends files to the Recycle Bin (gone from the folder)', r.ok && r.data.done.length === 2 && gone('h-os-smoke-test-trash-me.txt') && gone('h-os-smoke-test-trash-me-2.txt'), JSON.stringify(r));
  r = await api(`hos.shell.trash([${Z('secret.txt')}])`);
  check('fs: trash inside protected zone refused (file still there)', r.ok && r.data.failed.length === 1 && /protects/.test(r.data.failed[0].message) && fs.existsSync(path.join(zone, 'secret.txt')));
  r = await api(`hos.shell.trash([${S('does-not-exist.txt')}])`);
  check('fs: trash of a missing file fails gently', r.ok && r.data.failed.length === 1);
  check('fs: trash with empty list refused', code(await api(`hos.shell.trash([])`)) === 'INVALID');
  check('fs: there is no permanent-delete API', await js(`!('delete' in hos.fs) && !('remove' in hos.fs) && !('rm' in hos.fs) && !('unlink' in hos.fs) && !('delete' in hos.shell)`));

  // ---- text files ----
  r = await api(`hos.fs.readText(${S('docs/inner.txt')})`);
  check('fs: readText', r.ok && r.data.text === 'inner' && r.data.eol === 'lf');
  r = await api(`hos.fs.readText(${S('docs/a (2).txt')})`);
  check('fs: readText detects CRLF and normalizes to \\n', r.ok && r.data.eol === 'crlf' && r.data.text === 'hello\nworld\n', JSON.stringify(r.data));
  check('fs: binary file is not text', code(await api(`hos.fs.readText(${S('binary.dat')})`)) === 'NOTTEXT');
  check('fs: 5MB+ file refused', code(await api(`hos.fs.readText(${S('big.txt')})`)) === 'TOOBIG');
  check('fs: folder is not a file', code(await api(`hos.fs.readText(${S('docs')})`)) === 'EISDIR');
  r = await api(`hos.fs.writeText(${S('written.txt')}, 'line1\\nline2', 'crlf')`);
  check('fs: writeText creates a file with CRLF', r.ok && fs.readFileSync(path.join(sandbox, 'written.txt'), 'utf8') === 'line1\r\nline2');
  r = await api(`hos.fs.writeText(${S('written.txt')}, 'again', 'lf')`);
  check('fs: writeText overwrites', r.ok && fs.readFileSync(path.join(sandbox, 'written.txt'), 'utf8') === 'again');
  check('fs: no leftover temp file', fs.readdirSync(sandbox).every((n) => !n.includes('h-os-saving')));
  check('fs: writeText into protected zone refused', code(await api(`hos.fs.writeText(${Z('new.txt')}, 'x', 'lf')`)) === 'PROTECTED' && !fs.existsSync(path.join(zone, 'new.txt')));
  check('fs: writeText overwriting a protected file refused', code(await api(`hos.fs.writeText(${Z('secret.txt')}, 'x', 'lf')`)) === 'PROTECTED' && fs.readFileSync(path.join(zone, 'secret.txt'), 'utf8') === 'do not touch');
  check('fs: writeText to a folder path refused', !(await api(`hos.fs.writeText(${S('docs')}, 'x', 'lf')`)).ok);
  check('fs: writeText with alternate stream refused', code(await api(`hos.fs.writeText(${S('a.txt')} + ':evil', 'x', 'lf')`)) === 'INVALID');
  check('fs: writeText non-string refused', code(await api(`hos.fs.writeText(${S('w2.txt')}, 42, 'lf')`)) === 'INVALID');

  // ---- images & opening ----
  r = await api(`(async () => { const x = await hos.fs.readImage(${S('pic.png')}); return x.ok ? { ok: true, data: { mime: x.data.mime, bytes: x.data.data.length } } : x; })()`);
  check('fs: readImage returns mime + bytes', r.ok && r.data.mime === 'image/png' && r.data.bytes > 20, JSON.stringify(r));
  check('fs: non-image refused by readImage', code(await api(`hos.fs.readImage(${S('a.txt')})`)) === 'NOTIMAGE');
  check('fs: opening a .exe is blocked (nothing is launched)', code(await api(`hos.shell.openPath(${S('fake.exe')})`)) === 'BLOCKED');

  // ---- text encodings: Notepad must never damage a file ----
  fs.writeFileSync(path.join(sandbox, 'ansi.txt'), Buffer.from([0x63, 0x61, 0x66, 0xe9]));            // "café" with é as the single byte E9
  r = await api(`hos.fs.readText(${S('ansi.txt')})`);
  check('fs: an old ANSI (Windows-1252) file is read correctly, not as garbage', r.ok && r.data.text === 'café' && r.data.encoding === 'windows-1252', JSON.stringify(r.data));
  r = await api(`hos.fs.writeText(${S('ansi.txt')}, 'café!', 'lf', 'windows-1252')`);
  check('fs: ...and saved back as ANSI (the é stays one byte)', r.ok && fs.readFileSync(path.join(sandbox, 'ansi.txt')).equals(Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x21])));
  r = await api(`hos.fs.writeText(${S('ansi.txt')}, 'tulip 🌷', 'lf', 'windows-1252')`);
  check("fs: a character ANSI can't hold is refused, the file is untouched", !r.ok && r.error.code === 'ENCODING' && fs.readFileSync(path.join(sandbox, 'ansi.txt')).equals(Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x21])));
  const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Grüße\r\nzwei', 'utf16le')]);
  fs.writeFileSync(path.join(sandbox, 'utf16.txt'), utf16);
  r = await api(`hos.fs.readText(${S('utf16.txt')})`);
  check('fs: a UTF-16 file opens as text (not "binary")', r.ok && r.data.text === 'Grüße\nzwei' && r.data.encoding === 'utf16le' && r.data.eol === 'crlf', JSON.stringify(r.data));
  r = await api(`hos.fs.writeText(${S('utf16.txt')}, 'Grüße\\nzwei', 'crlf', 'utf16le')`);
  check('fs: ...and saves back byte-for-byte identical', r.ok && fs.readFileSync(path.join(sandbox, 'utf16.txt')).equals(utf16));
  fs.writeFileSync(path.join(sandbox, 'bom.txt'), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('hi', 'utf8')]));
  r = await api(`hos.fs.readText(${S('bom.txt')})`);
  await api(`hos.fs.writeText(${S('bom.txt')}, ${JSON.stringify('hi')}, 'lf', ${JSON.stringify(r.data && r.data.encoding)})`);
  check('fs: a UTF-8 file with a BOM keeps its BOM when saved', r.data.encoding === 'utf8-bom' && fs.readFileSync(path.join(sandbox, 'bom.txt'))[0] === 0xef);
  check('fs: unknown encoding names are refused', code(await api(`hos.fs.writeText(${S('w3.txt')}, 'x', 'lf', 'rot13')`)) === 'INVALID');

  // ---- Replace must never bin the item being moved (or its own parent) ----
  fs.mkdirSync(path.join(sandbox, 'rep', 'Photos', 'Photos'), { recursive: true });
  fs.writeFileSync(path.join(sandbox, 'rep', 'Photos', 'Photos', 'inner.txt'), 'precious');
  r = await api(`hos.fs.paste('move', [${S('rep/Photos/Photos')}], ${S('rep')}, 'replace')`);
  check('fs: Replace refuses when the item it would replace CONTAINS the source (nothing is binned)', r.ok && r.data.failed.length === 1 && fs.readFileSync(path.join(sandbox, 'rep', 'Photos', 'Photos', 'inner.txt'), 'utf8') === 'precious', JSON.stringify(r.data));
  if (junction) {
    r = await api(`hos.fs.stat(${S('link-to-zone')})`);
    check('fs: stat on a junction describes it as a folder (so Properties works)', r.ok && r.data.isDir === true && r.data.isSymlink === true, JSON.stringify(r.data));
  }

  // ---- settings schema survives the new "explorer" key ----
  r = await js(`(async () => { await hos.settings.save({ explorer: { view: 'grid', sortKey: 'size', sortDir: 'desc', showHidden: true, evil: 1 } }); const s = await hos.settings.load(); return s.explorer; })()`);
  check('settings: explorer prefs saved, unknown keys dropped', r.view === 'grid' && r.sortKey === 'size' && r.sortDir === 'desc' && r.showHidden === true && !('evil' in r), JSON.stringify(r));
  await js(`hos.settings.save({ explorer: { view: 'details', sortKey: 'name', sortDir: 'asc', showHidden: false } })`);
};
