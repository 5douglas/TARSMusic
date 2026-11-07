// expo-async-fs (local native module) on Node's fs, for the desktop build.
const { req, toPath } = require('./node');

const fsp = () => req('fs').promises;
const path = () => req('path');

const listeners = new Set();

async function dirSize(p) {
  let total = 0;
  let entries = [];
  try {
    entries = await fsp().readdir(p, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const full = path().join(p, e.name);
    if (e.isDirectory()) total += await dirSize(full);
    else {
      try {
        total += (await fsp().stat(full)).size;
      } catch {
        /* vanished */
      }
    }
  }
  return total;
}

async function listDirectoryAsync(uri) {
  try {
    return await fsp().readdir(toPath(uri));
  } catch {
    return [];
  }
}

async function listDirectoryWithSizesAsync(uri) {
  const dir = toPath(uri);
  let entries = [];
  try {
    entries = await fsp().readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    const full = path().join(dir, e.name);
    let size = 0;
    if (e.isDirectory()) size = await dirSize(full);
    else {
      try {
        size = (await fsp().stat(full)).size;
      } catch {
        /* vanished */
      }
    }
    out.push({ name: e.name, size, isDirectory: e.isDirectory() });
  }
  return out;
}

async function statAsync(uri) {
  try {
    const st = await fsp().stat(toPath(uri));
    return { exists: true, size: st.isDirectory() ? 0 : st.size, isDirectory: st.isDirectory() };
  } catch {
    return { exists: false, size: 0, isDirectory: false };
  }
}

async function existsAsync(uri) {
  return (await statAsync(uri)).exists;
}

async function deleteFileAsync(uri) {
  try {
    await fsp().rm(toPath(uri), { force: true });
    return true;
  } catch {
    return false;
  }
}

async function deleteDirectoryAsync(uri) {
  try {
    await fsp().rm(toPath(uri), { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

async function getDirectorySizeAsync(uri) {
  return dirSize(toPath(uri));
}

async function downloadFileAsyncWithProgress(url, destinationUri, downloadId) {
  const dest = toPath(destinationUri);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const totalBytes = Number(res.headers.get('content-length')) || -1;
  await fsp().mkdir(path().dirname(dest), { recursive: true });
  const handle = await fsp().open(dest, 'w');
  let bytesWritten = 0;
  let lastEmit = 0;
  try {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      await handle.write(value);
      bytesWritten += value.byteLength;
      const now = Date.now();
      if (now - lastEmit > 250) {
        lastEmit = now;
        for (const l of listeners) l({ downloadId, bytesWritten, totalBytes });
      }
    }
  } finally {
    await handle.close();
  }
  for (const l of listeners) l({ downloadId, bytesWritten, totalBytes: totalBytes > 0 ? totalBytes : bytesWritten });
  return { uri: destinationUri, bytes: bytesWritten };
}

function addDownloadProgressListener(listener) {
  listeners.add(listener);
  return { remove: () => listeners.delete(listener) };
}

module.exports = {
  __esModule: true,
  listDirectoryAsync,
  listDirectoryWithSizesAsync,
  statAsync,
  existsAsync,
  deleteFileAsync,
  deleteDirectoryAsync,
  getDirectorySizeAsync,
  downloadFileAsyncWithProgress,
  addDownloadProgressListener,
};
