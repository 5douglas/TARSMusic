// expo-file-system (the `File` / `Directory` / `Paths` API) on Node's fs, for the
// desktop build. Covers the subset the app uses.
const { req, appPaths, toPath, toUri } = require('./node');

const fs = () => req('fs');
const path = () => req('path');

function joinSegments(segments) {
  const parts = [];
  for (const seg of segments) {
    if (seg == null) continue;
    if (seg instanceof FsEntry) parts.push(seg._path);
    else parts.push(toPath(String(seg)));
  }
  if (parts.length === 0) return '';
  return path().join(...parts);
}

function statOrNull(p) {
  try {
    return fs().statSync(p);
  } catch {
    return null;
  }
}

class FsEntry {
  constructor(...segments) {
    this._path = joinSegments(segments);
  }
  get name() {
    return path().basename(this._path);
  }
  get parentDirectory() {
    // eslint-disable-next-line no-use-before-define
    return new Directory(path().dirname(this._path));
  }
  get exists() {
    return statOrNull(this._path) != null;
  }
}

class File extends FsEntry {
  get uri() {
    return toUri(this._path);
  }
  get extension() {
    return path().extname(this._path);
  }
  get exists() {
    const st = statOrNull(this._path);
    return !!st && st.isFile();
  }
  get size() {
    const st = statOrNull(this._path);
    return st ? st.size : 0;
  }
  get modificationTime() {
    const st = statOrNull(this._path);
    return st ? st.mtimeMs : null;
  }
  get creationTime() {
    const st = statOrNull(this._path);
    return st ? st.birthtimeMs : null;
  }
  get md5() {
    if (!this.exists) return null;
    return req('crypto').createHash('md5').update(fs().readFileSync(this._path)).digest('hex');
  }
  get type() {
    return null;
  }
  info() {
    const st = statOrNull(this._path);
    return st
      ? { exists: true, uri: this.uri, size: st.size, modificationTime: st.mtimeMs, creationTime: st.birthtimeMs }
      : { exists: false, uri: this.uri };
  }
  create(options = {}) {
    if (options.intermediates) fs().mkdirSync(path().dirname(this._path), { recursive: true });
    if (this.exists && !options.overwrite) {
      if (options.idempotent) return;
      throw new Error(`File already exists: ${this.uri}`);
    }
    fs().writeFileSync(this._path, '');
  }
  write(content, options = {}) {
    fs().mkdirSync(path().dirname(this._path), { recursive: true });
    let data = content;
    if (typeof content === 'string') {
      data = options.encoding === 'base64' ? Buffer.from(content, 'base64') : content;
    } else if (content instanceof ArrayBuffer) {
      data = Buffer.from(content);
    } else if (ArrayBuffer.isView(content)) {
      data = Buffer.from(content.buffer, content.byteOffset, content.byteLength);
    }
    if (options.append) fs().appendFileSync(this._path, data);
    else fs().writeFileSync(this._path, data);
  }
  textSync() {
    return fs().readFileSync(this._path, 'utf8');
  }
  async text() {
    return fs().promises.readFile(this._path, 'utf8');
  }
  base64Sync() {
    return fs().readFileSync(this._path).toString('base64');
  }
  async base64() {
    return (await fs().promises.readFile(this._path)).toString('base64');
  }
  bytesSync() {
    return new Uint8Array(fs().readFileSync(this._path));
  }
  async bytes() {
    return new Uint8Array(await fs().promises.readFile(this._path));
  }
  delete() {
    if (!statOrNull(this._path)) throw new Error(`File does not exist: ${this.uri}`);
    fs().rmSync(this._path, { force: true });
  }
  _target(destination) {
    if (destination instanceof Directory) return path().join(destination._path, this.name);
    if (destination instanceof FsEntry) return destination._path;
    return toPath(String(destination));
  }
  copy(destination) {
    const to = this._target(destination);
    fs().mkdirSync(path().dirname(to), { recursive: true });
    fs().copyFileSync(this._path, to);
  }
  move(destination) {
    const to = this._target(destination);
    fs().mkdirSync(path().dirname(to), { recursive: true });
    try {
      fs().renameSync(this._path, to);
    } catch (e) {
      // rename fails across drives on Windows (EXDEV); fall back to copy + delete.
      fs().copyFileSync(this._path, to);
      fs().rmSync(this._path, { force: true });
    }
    this._path = to;
  }
  rename(newName) {
    this.move(path().join(path().dirname(this._path), newName));
  }
  static async downloadFileAsync(url, destination, options = {}) {
    let target;
    const res = await fetch(url, { headers: options.headers });
    if (!res.ok) throw new Error(`Download failed with status ${res.status}`);
    if (destination instanceof Directory) {
      let name = '';
      const cd = res.headers.get('content-disposition') || '';
      const m = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
      if (m) name = decodeURIComponent(m[1]);
      if (!name) {
        try {
          name = path().basename(new URL(url).pathname) || 'download';
        } catch {
          name = 'download';
        }
      }
      target = new File(destination, name);
    } else {
      target = destination instanceof File ? destination : new File(destination);
    }
    if (target.exists && !options.idempotent) {
      throw new Error(`Destination already exists: ${target.uri}`);
    }
    fs().mkdirSync(path().dirname(target._path), { recursive: true });
    const buf = Buffer.from(await res.arrayBuffer());
    await fs().promises.writeFile(target._path, buf);
    return target;
  }
}

class Directory extends FsEntry {
  get uri() {
    const u = toUri(this._path);
    return u.endsWith('/') ? u : `${u}/`;
  }
  get exists() {
    const st = statOrNull(this._path);
    return !!st && st.isDirectory();
  }
  get size() {
    return dirSize(this._path);
  }
  info() {
    const st = statOrNull(this._path);
    return st ? { exists: true, uri: this.uri, size: dirSize(this._path) } : { exists: false, uri: this.uri };
  }
  create(options = {}) {
    if (this.exists) {
      if (options.idempotent || options.intermediates) return;
      throw new Error(`Directory already exists: ${this.uri}`);
    }
    fs().mkdirSync(this._path, { recursive: true });
  }
  delete() {
    if (!statOrNull(this._path)) throw new Error(`Directory does not exist: ${this.uri}`);
    fs().rmSync(this._path, { recursive: true, force: true });
  }
  list() {
    let names = [];
    try {
      names = fs().readdirSync(this._path, { withFileTypes: true });
    } catch {
      return [];
    }
    return names.map((d) =>
      d.isDirectory() ? new Directory(this._path, d.name) : new File(this._path, d.name),
    );
  }
  listAsRecords() {
    return this.list().map((e) => ({ uri: e.uri, isDirectory: e instanceof Directory }));
  }
  createFile(name) {
    const f = new File(this._path, name);
    f.create();
    return f;
  }
  createDirectory(name) {
    const d = new Directory(this._path, name);
    d.create();
    return d;
  }
  copy(destination) {
    const to = destination instanceof FsEntry ? destination._path : toPath(String(destination));
    fs().cpSync(this._path, path().join(to, this.name), { recursive: true });
  }
  move(destination) {
    const to = path().join(destination instanceof FsEntry ? destination._path : toPath(String(destination)), this.name);
    fs().renameSync(this._path, to);
    this._path = to;
  }
}

function dirSize(p) {
  let total = 0;
  let entries = [];
  try {
    entries = fs().readdirSync(p, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const full = path().join(p, e.name);
    if (e.isDirectory()) total += dirSize(full);
    else {
      const st = statOrNull(full);
      if (st) total += st.size;
    }
  }
  return total;
}

function diskSpace() {
  try {
    const st = fs().statfsSync(appPaths().document);
    return { total: st.blocks * st.bsize, free: st.bavail * st.bsize };
  } catch {
    return { total: 0, free: 0 };
  }
}

class Paths {
  static get document() {
    return new Directory(appPaths().document);
  }
  static get cache() {
    return new Directory(appPaths().cache);
  }
  static get bundle() {
    return new Directory(appPaths().bundle);
  }
  static get totalDiskSpace() {
    return diskSpace().total;
  }
  static get availableDiskSpace() {
    return diskSpace().free;
  }
  static join(...segments) {
    return toUri(joinSegments(segments));
  }
  static dirname(p) {
    return toUri(path().dirname(toPath(p instanceof FsEntry ? p.uri : p)));
  }
  static basename(p, ext) {
    return path().basename(toPath(p instanceof FsEntry ? p.uri : p), ext);
  }
  static extname(p) {
    return path().extname(toPath(p instanceof FsEntry ? p.uri : p));
  }
  static info(...uris) {
    const p = joinSegments(uris);
    const st = statOrNull(p);
    return { exists: !!st, isDirectory: st ? st.isDirectory() : null };
  }
}

module.exports = { File, Directory, Paths, __esModule: true };
