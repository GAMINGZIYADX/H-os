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
