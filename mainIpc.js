// =============================================================================
// H-os — shared IPC helpers (main process)
// -----------------------------------------------------------------------------
//   trusted(event)        true only if the message came from H-os's own page
//   makeHandle(toError)   makes handle(channel, fn): registers an ipcMain handler that
//                         answers { ok: true, data } or { ok: false, error: { code, message } }
//                         and never throws into the page.
// =============================================================================

const { ipcMain } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

const rendererUrl = pathToFileURL(path.join(__dirname, 'renderer', 'index.html')).href;

function trusted(event) {
  const url = event.senderFrame && event.senderFrame.url;
  return typeof url === 'string' && url.split('#')[0].split('?')[0] === rendererUrl;
}

function makeHandle(toError) {
  return function handle(channel, fn) {
    ipcMain.handle(channel, async (event, ...args) => {
      if (!trusted(event)) return { ok: false, error: { code: 'UNTRUSTED', message: 'Request refused.' } };
      try {
        return { ok: true, data: await fn(...args, event) };
      } catch (err) {
        return { ok: false, error: toError(err) };
      }
    });
  };
}

module.exports = { trusted, makeHandle, rendererUrl };
