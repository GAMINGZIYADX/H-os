// Unit tests for mainFsGuard.js.   Run:  node tools/test-guard.js
// They only call pure functions, so they NEVER touch the disk.

const { createGuard } = require('../mainFsGuard');

let failed = 0;
function expect(name, condition) {
  if (!condition) failed++;
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}`);
}
const throwsCode = (fn, code) => { try { fn(); return false; } catch (e) { return e.code === code; } };

// ---------------------------------------------------------------- Windows rules
const win = createGuard({
  platform: 'win32',
  homedir: 'C:\\Users\\Tess',
  env: { SystemDrive: 'C:', SystemRoot: 'C:\\Windows', windir: 'C:\\Windows', ProgramFiles: 'C:\\Program Files',
    'ProgramFiles(x86)': 'C:\\Program Files (x86)', ProgramW6432: 'C:\\Program Files', ProgramData: 'C:\\ProgramData' },
  extraProtectedTrees: ['C:\\Users\\Tess\\AppData\\Roaming\\H-os', 'C:\\Games\\H-os-install'],
});
const protectedWin = (p) => throwsCode(() => win.assertMutable(p), 'PROTECTED');
const invalidWin = (p) => throwsCode(() => win.normalize(p), 'INVALID');
const okWin = (p) => { try { win.assertMutable(p); return true; } catch { return false; } };

expect('win: C:\\Windows protected', protectedWin('C:\\Windows'));
expect('win: C:\\Windows\\System32\\x.dll protected', protectedWin('C:\\Windows\\System32\\x.dll'));
expect('win: different case c:\\WINDOWS protected', protectedWin('c:\\WINDOWS'));
expect('win: forward slashes C:/Windows/System32', protectedWin('C:/Windows/System32'));
expect('win: C:\\Program Files protected', protectedWin('C:\\Program Files'));
expect('win: C:\\Program Files (x86)\\App protected', protectedWin('C:\\Program Files (x86)\\App'));
expect('win: C:\\ProgramData protected', protectedWin('C:\\ProgramData\\x'));
expect('win: drive root C:\\ protected', protectedWin('C:\\'));
expect('win: drive root D:\\ protected', protectedWin('D:\\'));
expect('win: C:\\Users itself protected', protectedWin('C:\\Users'));
expect('win: the home folder itself protected', protectedWin('C:\\Users\\Tess'));
expect('win: $Recycle.Bin on any drive protected', protectedWin('D:\\$Recycle.Bin\\S-1-5\\x'));
expect('win: System Volume Information protected', protectedWin('E:\\System Volume Information'));
expect('win: H-os user-data folder protected', protectedWin('C:\\Users\\Tess\\AppData\\Roaming\\H-os\\settings.json'));
expect('win: H-os install folder protected', protectedWin('C:\\Games\\H-os-install\\H-os.exe'));
expect('win: Documents file is allowed', okWin('C:\\Users\\Tess\\Documents\\notes.txt'));
expect('win: folder in home is allowed', okWin('C:\\Users\\Tess\\Desktop\\New folder'));
expect('win: other drive folder is allowed', okWin('D:\\Photos\\2026'));
expect('win: similarly named C:\\WindowsApps-mine is allowed (prefix is not a match)', okWin('C:\\Windows-backup\\a.txt'));
expect('win: C:\\Program Files Stuff is allowed (prefix only)', okWin('C:\\Program Files Stuff\\a.txt'));

expect("win: '..' escape is rejected", invalidWin('C:\\Users\\Tess\\Documents\\..\\..\\..\\Windows'));
expect('win: trailing dot "C:\\Windows.\\System32" rejected', invalidWin('C:\\Windows.\\System32'));
expect('win: trailing space "C:\\Windows \\x" rejected', invalidWin('C:\\Windows \\x'));
expect('win: alternate data stream a.txt:x rejected', invalidWin('C:\\Users\\Tess\\a.txt:secret'));
expect('win: \\\\?\\ prefix rejected', invalidWin('\\\\?\\C:\\Windows'));
expect('win: \\\\.\\ device prefix rejected', invalidWin('\\\\.\\PhysicalDrive0'));
expect('win: UNC path rejected', invalidWin('\\\\server\\share\\file.txt'));
expect('win: rooted-without-drive \\Windows rejected', invalidWin('\\Windows\\System32'));
expect('win: reserved name NUL rejected', invalidWin('C:\\Users\\Tess\\NUL'));
expect('win: reserved name CON.txt rejected', invalidWin('C:\\Users\\Tess\\con.txt'));
expect('win: relative path rejected', invalidWin('Documents\\a.txt'));
expect('win: empty string rejected', invalidWin(''));
expect('win: non-string rejected', invalidWin(42) && invalidWin(null) && invalidWin({}));
expect('win: NUL byte rejected', invalidWin('C:\\Users\\Tess\\a\0.txt'));
expect('win: wildcard rejected', invalidWin('C:\\Users\\Tess\\*.txt'));

expect('win: name "report.txt" ok', win.validateName('report.txt') === null);
expect('win: name with slash rejected', win.validateName('a/b') !== null);
expect('win: name with colon rejected', win.validateName('a:b') !== null);
expect('win: name ending in dot rejected', win.validateName('abc.') !== null);
expect('win: name "NUL" rejected', win.validateName('NUL') !== null);
expect('win: name ".." rejected', win.validateName('..') !== null);
expect('win: empty / blank names rejected', win.validateName('') !== null && win.validateName('   ') !== null);
expect('win: 256-char name rejected', win.validateName('a'.repeat(256)) !== null);
expect('win: isInside works and ignores case', win.isInside('C:\\A\\b\\c', 'c:\\a\\B') && !win.isInside('C:\\AB', 'C:\\A') && win.isInside('C:\\A', 'C:\\A'));
expect('win: hidden names', win.isHiddenName('Application Data') && win.isHiddenName('.git') && win.isHiddenName('NTUSER.DAT.LOG1') && !win.isHiddenName('Documents'));

// ---------------------------------------------------------------- Linux rules
const lin = createGuard({ platform: 'linux', homedir: '/home/tess', extraProtectedTrees: ['/home/tess/.config/H-os'] });
const protectedLin = (p) => throwsCode(() => lin.assertMutable(p), 'PROTECTED');
const okLin = (p) => { try { lin.assertMutable(p); return true; } catch { return false; } };

expect('linux: / protected', protectedLin('/'));
expect('linux: /etc/passwd protected', protectedLin('/etc/passwd'));
expect('linux: /usr/bin/x protected', protectedLin('/usr/bin/x'));
expect('linux: /var/log protected', protectedLin('/var/log/syslog'));
expect('linux: /home protected', protectedLin('/home'));
expect('linux: home folder itself protected', protectedLin('/home/tess'));
expect('linux: H-os config protected', protectedLin('/home/tess/.config/H-os/settings.json'));
expect('linux: file in home allowed', okLin('/home/tess/Documents/a.txt'));
expect('linux: /usrlocal-ish prefix allowed', okLin('/usrdata/a.txt'));
expect('linux: /tmp allowed', okLin('/tmp/x'));
expect("linux: '..' rejected", throwsCode(() => lin.normalize('/home/tess/../../etc'), 'INVALID'));
expect('linux: relative rejected', throwsCode(() => lin.normalize('a/b'), 'INVALID'));
expect('linux: NUL byte rejected', throwsCode(() => lin.normalize('/tmp/a\0b'), 'INVALID'));
expect('linux: name with colon is fine, with slash is not', lin.validateName('a:b') === null && lin.validateName('a/b') !== null);
expect('linux: case matters (/ETC is not /etc)', okLin('/ETC/x'));

console.log(failed ? `\n${failed} FAILED` : '\nall guard tests passed');
process.exit(failed ? 1 : 0);
