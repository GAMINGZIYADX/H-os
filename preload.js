// =============================================================================
// H-os — preload script
// -----------------------------------------------------------------------------
// This is the ONLY bridge between the web page (renderer) and Node/Electron.
// We expose a tiny, explicit set of functions as `window.hos`. The page can
// call exactly these and nothing else. We never hand over `ipcRenderer` itself.
// =============================================================================

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hos', {
  // Really quit the app (call this only after the shutdown animation).
  quit: () => ipcRenderer.send('os:quit'),

  // Settings (stored as JSON in the user-data folder; validated in the main process).
  settings: {
    load: () => ipcRenderer.invoke('settings:load'),
    save: (patch) => ipcRenderer.invoke('settings:save', patch),
  },

  // Filesystem (all checked again in the main process; every call answers { ok, data } or { ok:false, error }).
  fs: {
    places: () => ipcRenderer.invoke('fs:places'),
    drives: () => ipcRenderer.invoke('fs:drives'),
    readdir: (dir, opts) => ipcRenderer.invoke('fs:readdir', dir, opts),
    stat: (p) => ipcRenderer.invoke('fs:stat', p),
    folderInfo: (p) => ipcRenderer.invoke('fs:folder-info', p),
    mkdir: (parent, name) => ipcRenderer.invoke('fs:mkdir', parent, name),
    rename: (p, newName) => ipcRenderer.invoke('fs:rename', p, newName),
    conflicts: (sources, destDir) => ipcRenderer.invoke('fs:conflicts', sources, destDir),
    paste: (mode, sources, destDir, onConflict) => ipcRenderer.invoke('fs:paste', mode, sources, destDir, onConflict),
    readText: (p) => ipcRenderer.invoke('fs:read-text', p),
    writeText: (p, text, eol, encoding) => ipcRenderer.invoke('fs:write-text', p, text, eol, encoding),
    readImage: (p) => ipcRenderer.invoke('fs:read-image', p),
  },

  // Shell: delete goes to the Recycle Bin only (there is no permanent delete).
  shell: {
    openPath: (p) => ipcRenderer.invoke('shell:open-path', p),
    trash: (paths) => ipcRenderer.invoke('shell:trash', paths),
    openRecycleBin: () => ipcRenderer.invoke('shell:open-recycle-bin'),
  },

  // Terminal sessions (a real shell; output arrives through onData / onExit).
  term: {
    spawn: (opts) => ipcRenderer.invoke('term:spawn', opts || {}),
    write: (id, data) => ipcRenderer.invoke('term:write', id, data),
    resize: (id, cols, rows) => ipcRenderer.invoke('term:resize', id, cols, rows),
    kill: (id) => ipcRenderer.invoke('term:kill', id),
    onData: (callback) => {
      const listener = (event, id, data) => callback(id, data);
      ipcRenderer.on('term:data', listener);
      return () => ipcRenderer.removeListener('term:data', listener);
    },
    onExit: (callback) => {
      const listener = (event, id, code) => callback(id, code);
      ipcRenderer.on('term:exit', listener);
      return () => ipcRenderer.removeListener('term:exit', listener);
    },
  },

  // Text clipboard.
  clipboard: {
    readText: () => ipcRenderer.invoke('clipboard:read-text'),
    writeText: (text) => ipcRenderer.invoke('clipboard:write-text', text),
  },

  // Native open/save dialogs.
  dialog: {
    openFile: (kind) => ipcRenderer.invoke('dialog:open-file', kind),
    saveFile: (defaultName) => ipcRenderer.invoke('dialog:save-file', defaultName),
  },

  // Version / platform info for "About H-os".
  getInfo: () => ipcRenderer.invoke('os:get-info'),

  // Main process tells us the user pressed Alt+F4 (or similar): show the
  // "Shut down?" dialog. Returns a function to stop listening.
  onShutdownRequest: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('os:shutdown-request', listener);
    return () => ipcRenderer.removeListener('os:shutdown-request', listener);
  },
});
