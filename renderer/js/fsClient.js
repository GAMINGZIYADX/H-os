// fsClient.js — friendly wrapper around window.hos.fs / shell / dialog.
//
// The main process answers every call with { ok: true, data } or { ok: false, error }.
// Here we unwrap that: success returns the data, failure THROWS an FsError whose
// `message` is already written for humans (and safe to show in a toast).

export class FsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

async function call(promise) {
  let result;
  try {
    result = await promise;
  } catch (err) {
    throw new FsError('UNKNOWN', 'Something went wrong talking to the system.');
  }
  if (!result || !result.ok) {
    const e = (result && result.error) || {};
    throw new FsError(e.code || 'UNKNOWN', e.message || 'Something went wrong.');
  }
  return result.data;
}

const need = () => {
  if (!window.hos || !window.hos.fs) throw new FsError('UNAVAILABLE', 'The filesystem is only available inside H-os.');
  return window.hos;
};

export const fsApi = {
  places: () => call(need().fs.places()),
  drives: () => call(need().fs.drives()),
  readdir: (dir, opts) => call(need().fs.readdir(dir, opts)),
  stat: (p) => call(need().fs.stat(p)),
  folderInfo: (p) => call(need().fs.folderInfo(p)),
  mkdir: (parent, name) => call(need().fs.mkdir(parent, name)),
  rename: (p, newName) => call(need().fs.rename(p, newName)),
  conflicts: (sources, destDir) => call(need().fs.conflicts(sources, destDir)),
  paste: (mode, sources, destDir, onConflict) => call(need().fs.paste(mode, sources, destDir, onConflict)),
  trash: (paths) => call(need().shell.trash(paths)),
  readText: (p) => call(need().fs.readText(p)),
  writeText: (p, text, eol) => call(need().fs.writeText(p, text, eol)),
  readImage: (p) => call(need().fs.readImage(p)),
  openPath: (p) => call(need().shell.openPath(p)),
  openRecycleBin: () => call(need().shell.openRecycleBin()),
  pickOpenFile: (kind) => call(need().dialog.openFile(kind)),
  pickSaveFile: (name) => call(need().dialog.saveFile(name)),
};
