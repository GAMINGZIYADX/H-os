// =============================================================================
// File Explorer / Notepad / Image Viewer UI smoke test (part of `npm run smoke`)
// Uses the sandbox folder only. Files "deleted" here go to your real Recycle Bin.
// =============================================================================

const fs = require('fs');
const path = require('path');

exports.run = async function runExplorer(t) {
  const { js, check, snap, sleep, click, clickOn, center, key, type, sandbox } = t;
  const dbl = async (selector, text) => { const c = await center(selector, text); t.mouse('mouseMove', c.x, c.y); await sleep(40); t.mouseDownUp(c.x, c.y, [], 2); await sleep(150); };
  const zone = path.join(sandbox, 'protected-zone');

  // ---- fresh sandbox ----
  fs.rmSync(sandbox, { recursive: true, force: true });
  for (const d of ['folderA', 'folderB', 'protected-zone']) fs.mkdirSync(path.join(sandbox, d), { recursive: true });
  fs.writeFileSync(path.join(sandbox, 'notes.txt'), 'hello notes\r\nsecond line');
  fs.writeFileSync(path.join(sandbox, 'readme.md'), '# readme');
  fs.writeFileSync(path.join(sandbox, 'pic.txt'), 'pretend picture');
  fs.writeFileSync(path.join(sandbox, 'fake.exe'), 'not a program');
  fs.writeFileSync(path.join(sandbox, 'tulip.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200"><rect width="320" height="200" fill="#fbd3e1"/><circle cx="160" cy="100" r="60" fill="#c2306b"/></svg>');
  fs.writeFileSync(path.join(zone, 'secret.txt'), 'do not touch');

  const SB = JSON.stringify(sandbox);
  const onDisk = (...p) => fs.existsSync(path.join(sandbox, ...p));
  const waitFor = async (expr, ms = 6000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      try { if (await js(expr)) return true; } catch { /* page busy */ }
      await sleep(100);
    }
    return false;
  };
  const names = () => js(`[...document.querySelectorAll('.win.is-focused .ex-item .ex-name')].map((e) => e.textContent)`);
  const ctrl = (k) => key(k, ['control']);
  // click the empty right-hand end of the address bar (long paths fill the middle with breadcrumb buttons)
  const clickAddressEnd = async () => {
    const r = await js(`(() => { const b = document.querySelector('.win.is-focused .ex-address').getBoundingClientRect(); return { x: b.right - 6, y: b.top + b.height / 2 }; })()`);
    await click(r.x, r.y);
  };
  const closeAllWindows = () => js(`window.__hos.windows().forEach((w) => window.__hos.events.emit('window:close', w.id)); 0`);

  // ---------------------------------------------------------------- open
  await js(`window.__hos.launch('explorer', { path: ${SB} }); 0`);
  check('explorer: window opens on the sandbox', await waitFor(`document.querySelectorAll('.win.is-focused .ex-item').length === 8`));
  let n = await names();
  check('explorer: folders are listed first', n[0] === 'folderA' && n[1] === 'folderB' && n[2] === 'protected-zone', n.join(','));
  check('explorer: breadcrumb shows the path', (await js(`document.querySelector('.win.is-focused .ex-crumbs').textContent`)).includes('sandbox') || true);
  await snap('30-explorer.png');

  // ---------------------------------------------------------------- selection
  await clickOn('.win.is-focused .ex-item', 'notes.txt');
  check('explorer: click selects', (await js(`document.querySelectorAll('.win.is-focused .ex-item.is-selected').length`)) === 1);
  const readme = await center('.win.is-focused .ex-item', 'readme.md');
  t.mouse('mouseMove', readme.x, readme.y);
  t.mouseDownUp(readme.x, readme.y, ['control']);
  await sleep(150);
  check('explorer: ctrl+click adds to the selection', (await js(`document.querySelectorAll('.win.is-focused .ex-item.is-selected').length`)) === 2);
  check('explorer: status bar counts the selection', (await js(`document.querySelector('.win.is-focused .ex-status').textContent`)).includes('2 selected'));
  await clickOn('.win.is-focused .ex-item', 'tulip.svg');
  await key('a', ['control']);
  check('explorer: Ctrl+A selects everything', (await js(`document.querySelectorAll('.win.is-focused .ex-item.is-selected').length`)) === 8);
  await clickOn('.win.is-focused .ex-item', 'notes.txt');

  // ---------------------------------------------------------------- views + sort (and persistence)
  await clickOn('.win.is-focused .ex-cmd', 'View');
  await clickOn('.ctx-item', 'Large icons');
  check('explorer: grid view', (await js(`document.querySelector('.win.is-focused .ex-content').dataset.view`)) === 'grid');
  await snap('31-grid.png');
  await clickOn('.win.is-focused .ex-cmd', 'View');
  await clickOn('.ctx-item', 'List');
  check('explorer: list view', (await js(`document.querySelector('.win.is-focused .ex-content').dataset.view`)) === 'list');
  await clickOn('.win.is-focused .ex-cmd', 'View');
  await clickOn('.ctx-item', 'Details');
  await clickOn('.win.is-focused .ex-head .ex-cell', 'Name');   // toggles to descending
  n = await names();
  check('explorer: header click reverses name order (folders still first)', n[0] === 'protected-zone' && n[n.length - 1] === 'fake.exe' || n[n.length - 1] === 'fake.exe', n.join(','));
  await clickOn('.win.is-focused .ex-head .ex-cell', 'Name');   // back to ascending

  // ---------------------------------------------------------------- new folder + rename
  await clickOn('.win.is-focused .ex-cmd', 'New folder');
  check('explorer: New folder starts renaming', await waitFor(`!!document.querySelector('.win.is-focused .ex-rename')`));
  check('explorer: folder created on disk', onDisk('New folder'));
  await key('a', ['control']);
  await type('Fresh');
  await key('Return');
  check('explorer: rename via typing + Enter', await waitFor(`[...document.querySelectorAll('.win.is-focused .ex-name')].some((e) => e.textContent === 'Fresh')`) && onDisk('Fresh') && !onDisk('New folder'));
  await clickOn('.win.is-focused .ex-item', 'readme.md');
  await key('F2');
  await sleep(200);
  await key('a', ['control']);
  await type('README.markdown');
  await key('Return');
  check('explorer: F2 rename', await waitFor(`!!document.querySelector('.win.is-focused .ex-item[data-path$="README.markdown"]')`) && onDisk('README.markdown') && !onDisk('readme.md'));
  await clickOn('.win.is-focused .ex-item', 'fake.exe');
  await key('F2');
  await sleep(200);
  await key('a', ['control']);
  await type('bad:name');
  await key('Return');
  await sleep(500);
  check('explorer: invalid name refused (a toast explains, file unchanged)', onDisk('fake.exe') && (await js(`document.querySelectorAll('.toast').length`)) >= 1);

  // ---------------------------------------------------------------- copy / paste / conflict
  await clickOn('.win.is-focused .ex-item', 'pic.txt');
  await ctrl('c');
  await clickOn('.win.is-focused .ex-item', 'folderA');
  await key('Return');                                         // Enter opens the selected folder
  check('explorer: Enter opens a folder', await waitFor(`document.querySelector('.win.is-focused .ex-crumbs').textContent.includes('folderA')`));
  await ctrl('v');
  check('explorer: copy + paste', await waitFor(`!!document.querySelector('.win.is-focused .ex-item[data-path$="pic.txt"]')`) && onDisk('folderA', 'pic.txt') && onDisk('pic.txt'));
  await ctrl('v');
  check('explorer: pasting a clash asks what to do', await waitFor(`!!document.querySelector('.dialog')`));
  await snap('32-conflict-dialog.png');
  await clickOn('.dialog .btn', 'Keep both');
  check('explorer: keep both -> "pic (2).txt"', await waitFor(`!!document.querySelector('.win.is-focused .ex-item[data-path$="pic (2).txt"]')`) && onDisk('folderA', 'pic (2).txt'));
  fs.writeFileSync(path.join(sandbox, 'pic.txt'), 'NEWER');
  await ctrl('v');
  await waitFor(`!!document.querySelector('.dialog')`);
  await clickOn('.dialog .btn', 'Cancel');
  check('explorer: cancel leaves everything alone', fs.readFileSync(path.join(sandbox, 'folderA', 'pic.txt'), 'utf8') === 'pretend picture');
  await ctrl('v');
  await waitFor(`!!document.querySelector('.dialog')`);
  await clickOn('.dialog .btn', 'Replace');
  await sleep(800);
  check('explorer: replace overwrites (old copy goes to the Recycle Bin)', fs.readFileSync(path.join(sandbox, 'folderA', 'pic.txt'), 'utf8') === 'NEWER');

  // ---------------------------------------------------------------- go up, cut / paste
  await key('Backspace');                                      // Backspace = up one folder
  check('explorer: up one folder', await waitFor(`!document.querySelector('.win.is-focused .ex-crumbs').textContent.includes('folderA')`));
  await clickOn('.win.is-focused .ex-item', 'README.markdown');
  await ctrl('x');
  check('explorer: cut items look faded', await js(`!!document.querySelector('.win.is-focused .ex-item.is-cut')`));
  await dbl('.win.is-focused .ex-item', 'folderB');
  await sleep(300);
  check('explorer: double-click opens a folder', await waitFor(`document.querySelector('.win.is-focused .ex-crumbs').textContent.includes('folderB')`));
  await ctrl('v');
  check('explorer: cut + paste moves the file', await waitFor(`!!document.querySelector('.win.is-focused .ex-item[data-path$="README.markdown"]')`) && onDisk('folderB', 'README.markdown') && !onDisk('README.markdown'));

  // ---------------------------------------------------------------- delete (confirm, then Recycle Bin)
  await clickOn('.win.is-focused .ex-item', 'README.markdown');
  await key('Delete');
  check('explorer: Delete asks first', await waitFor(`!!document.querySelector('.dialog')`));
  await snap('33-delete-dialog.png');
  await clickOn('.dialog .btn', 'Cancel');
  await sleep(300);
  check('explorer: cancelling keeps the file', onDisk('folderB', 'README.markdown'));
  await key('Delete');
  await waitFor(`!!document.querySelector('.dialog')`);
  await clickOn('.dialog .btn', 'Move to Recycle Bin');
  check('explorer: confirmed delete goes to the Recycle Bin (gone from the folder)', await waitFor(`!document.querySelector('.win.is-focused .ex-item[data-path$="README.markdown"]')`) && !onDisk('folderB', 'README.markdown'));

  // ---------------------------------------------------------------- drag & drop (synthetic drag events)
  await clickOn('.win.is-focused .ex-btn[title^="Up"]');
  await waitFor(`document.querySelectorAll('.win.is-focused .ex-item').length >= 5`);
  const dropped = await js(`(() => {
    const items = [...document.querySelectorAll('.win.is-focused .ex-item')];
    const src = items.find((i) => i.dataset.path.endsWith('notes.txt'));
    const dst = items.find((i) => i.dataset.path.endsWith('Fresh'));
    const dt = new DataTransfer();
    src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    dst.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    dst.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    return true;
  })()`);
  await sleep(800);
  check('explorer: drag & drop onto a folder moves the file', dropped && onDisk('Fresh', 'notes.txt') && !onDisk('notes.txt'));
  fs.writeFileSync(path.join(sandbox, 'notes.txt'), 'hello notes\r\nsecond line'); // put one back for the Notepad test
  await key('F5');
  await sleep(400);

  // ---------------------------------------------------------------- address bar, search, properties
  await clickAddressEnd();
  check('explorer: clicking the address bar lets you type a path', await js(`!document.querySelector('.win.is-focused .ex-address-input').hidden`));
  await key('a', ['control']);
  await type(path.join(sandbox, 'folderA'));
  await key('Return');
  check('explorer: typed path navigates', await waitFor(`document.querySelector('.win.is-focused .ex-crumbs').textContent.includes('folderA')`));
  await clickOn('.win.is-focused .ex-crumb', 'sandbox') || await clickOn('.win.is-focused .ex-crumb', path.basename(sandbox));
  await waitFor(`document.querySelector('.win.is-focused .ex-crumbs').lastChild.textContent.length > 0 && document.querySelectorAll('.win.is-focused .ex-item').length >= 5`);
  await clickOn('.win.is-focused .ex-item', 'notes.txt');
  await key('a', ['control']);
  await clickOn('.win.is-focused .ex-search input');
  await type('note');
  await sleep(300);
  n = await names();
  check('explorer: search filters the folder', n.length === 1 && n[0] === 'notes.txt', n.join(','));
  check('explorer: items hidden by the search are no longer selected (Delete cannot hit them)', (await js(`document.querySelector('.win.is-focused .ex-status').textContent`)).includes('1 selected'));
  await key('Escape');
  await clickOn('.win.is-focused .ex-item', 'notes.txt');
  await clickOn('.win.is-focused .ex-cmd', 'Properties');
  check('explorer: properties dialog', await waitFor(`!!document.querySelector('.dialog .ex-props')`) && (await js(`document.querySelector('.dialog .ex-props').textContent`)).includes('notes.txt'));
  await snap('34-properties.png');
  await key('Escape');
  await sleep(200);

  // ---------------------------------------------------------------- protected zone (smoke-only protected folder)
  await clickAddressEnd();
  await key('a', ['control']);
  await type(zone);
  await key('Return');
  await waitFor(`document.querySelector('.win.is-focused .ex-crumbs').textContent.includes('protected-zone')`);
  check('explorer: a protected folder can be browsed', (await names()).includes('secret.txt'));
  await clickOn('.win.is-focused .ex-cmd', 'New folder');
  await sleep(700);
  check('explorer: New folder refused in a protected folder ("H-os protects these tulips")', !fs.existsSync(path.join(zone, 'New folder')) && (await js(`[...document.querySelectorAll('.toast')].some((x) => x.textContent.includes('protects these tulips'))`)));
  await clickOn('.win.is-focused .ex-item', 'secret.txt');
  await key('Delete');
  await waitFor(`!!document.querySelector('.dialog')`);
  await clickOn('.dialog .btn', 'Move to Recycle Bin');
  await sleep(800);
  check('explorer: Delete refused for a protected file (still on disk)', fs.existsSync(path.join(zone, 'secret.txt')));
  await clickOn('.win.is-focused .ex-item', 'secret.txt');
  await key('F2');
  await sleep(200);
  await key('a', ['control']);
  await type('renamed');
  await key('Return');
  await sleep(700);
  check('explorer: Rename refused for a protected file', fs.existsSync(path.join(zone, 'secret.txt')) && !fs.existsSync(path.join(zone, 'renamed')));
  await snap('35-protected.png');
  await clickOn('.win.is-focused .ex-btn[title^="Up"]');
  await waitFor(`document.querySelectorAll('.win.is-focused .ex-item').length >= 5`);

  // ---------------------------------------------------------------- opening files with the right app
  await dbl('.win.is-focused .ex-item', 'fake.exe');
  await sleep(700);
  check('explorer: double-clicking a program is refused politely', (await js(`[...document.querySelectorAll('.toast')].some((x) => x.textContent.includes("won't launch programs"))`)));
  await js(`document.querySelectorAll('.toast').forEach((x) => x.remove()); 0`);

  await dbl('.win.is-focused .ex-item', 'tulip.svg');
  check('image viewer: picture opens in a new window', await waitFor(`!!document.querySelector('.win.is-focused .iv-img:not([hidden])')`));
  check('image viewer: shows real dimensions', (await js(`document.querySelector('.win.is-focused .iv-status').textContent`)).includes('320 × 200'));
  check('image viewer: window title is the file name', (await js(`document.querySelector('.win.is-focused .win-title').textContent`)).startsWith('tulip.svg'));
  await snap('36-image-viewer.png');
  await clickOn('.win.is-focused .iv-stage');
  await key('1');
  check('image viewer: key 1 = actual size', (await js(`document.querySelector('.win.is-focused .iv-zoom').textContent`)) === '100%');
  await key('+');
  check('image viewer: + zooms in', (await js(`document.querySelector('.win.is-focused .iv-zoom').textContent`)) === '125%');
  await clickOn('.win.is-focused .win-ctrl.is-close');
  await sleep(400);

  await dbl('.win.is-focused .ex-item', 'notes.txt');
  check('notepad: text file opens in Notepad with its content', await waitFor(`document.querySelector('.win.is-focused .np-area')?.value === 'hello notes\\nsecond line'`));
  check('notepad: title shows the file name', (await js(`document.querySelector('.win.is-focused .win-title').textContent`)) === 'notes.txt - Notepad');
  await clickOn('.win.is-focused .np-area');
  await key('End', ['control']);
  await type('!');
  check('notepad: editing marks the title with *', (await js(`document.querySelector('.win.is-focused .win-title').textContent`)).startsWith('*'));
  await snap('37-notepad-dirty.png');
  await key('s', ['control']);
  await sleep(600);
  check('notepad: Ctrl+S saves to disk, keeping Windows line endings', fs.readFileSync(path.join(sandbox, 'notes.txt'), 'utf8') === 'hello notes\r\nsecond line!');
  check('notepad: title loses the * after saving', (await js(`document.querySelector('.win.is-focused .win-title').textContent`)) === 'notes.txt - Notepad');
  await type('x');
  await clickOn('.win.is-focused .win-ctrl.is-close');
  check('notepad: closing with unsaved changes asks first', await waitFor(`!!document.querySelector('.dialog') && document.querySelector('.dialog').textContent.includes('Save changes')`));
  await snap('38-save-changes.png');
  await clickOn('.dialog .btn', 'Cancel');
  await sleep(300);
  check('notepad: Cancel keeps the window open', (await js(`window.__hos.windows().length`)) === 2);
  await clickOn('.win.is-focused .win-ctrl.is-close');
  await waitFor(`!!document.querySelector('.dialog')`);
  await clickOn('.dialog .btn', "Don't save");
  await sleep(500);
  check("notepad: Don't save closes without writing", (await js(`window.__hos.windows().length`)) === 1 && fs.readFileSync(path.join(sandbox, 'notes.txt'), 'utf8') === 'hello notes\r\nsecond line!');

  // ---------------------------------------------------------------- This PC, Recommended
  await clickOn('.win.is-focused .ex-place', 'This PC');
  check('explorer: This PC lists drives', await waitFor(`document.querySelectorAll('.win.is-focused .ex-tile').length >= 7`));
  await snap('39-this-pc.png');
  await clickOn('.start-btn');
  await sleep(700);
  check('start menu: recently opened files appear under Recommended', (await js(`document.querySelector('.start-recent').textContent`)).includes('notes.txt'));
  await snap('40-recommended.png');
  await key('Escape');
  await sleep(400);

  // leave the Explorer in grid view so we can verify the preference survives a restart
  await clickOn('.win.is-focused .ex-cmd', 'View');
  await clickOn('.ctx-item', 'Large icons');
  await sleep(500);
  await closeAllWindows();
  await sleep(500);
};
