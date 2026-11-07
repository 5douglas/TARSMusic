// Node access for the desktop shims. The Electron window runs with nodeIntegration,
// so `window.require` is Node's require. Metro never sees these module names.
const nodeRequire = typeof window !== 'undefined' && typeof window.require === 'function' ? window.require : null;

function req(name) {
  if (!nodeRequire) throw new Error(`[desktop] Node module "${name}" is only available in the desktop app`);
  return nodeRequire(name);
}

let pathsCache = null;
function appPaths() {
  if (!pathsCache) {
    try {
      pathsCache = req('electron').ipcRenderer.sendSync('tars:paths');
    } catch {
      const os = req('os');
      const path = req('path');
      const base = path.join(os.tmpdir(), 'tarsmusic');
      pathsCache = { document: path.join(base, 'Documents'), cache: path.join(base, 'Cache'), bundle: base };
    }
  }
  return pathsCache;
}

function toPath(uri) {
  if (uri == null) return '';
  const s = String(uri);
  if (/^file:/i.test(s)) return req('url').fileURLToPath(s);
  return s;
}

function toUri(p) {
  const href = req('url').pathToFileURL(p).href;
  return href;
}

module.exports = { req, appPaths, toPath, toUri, hasNode: !!nodeRequire };
