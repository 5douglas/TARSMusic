// TARSMusic for Windows: Electron shell around the app's web build (desktop/web).
//
// The renderer runs the same React Native code as the phone app (through
// react-native-web), with the native modules replaced by desktop/shims. It needs
// Node in the renderer for the database (node:sqlite) and the file system, and it
// talks to the user's own servers, which do not all send CORS headers.
const { app, BrowserWindow, ipcMain, net, protocol, screen, shell, Menu, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const WEB_ROOT = path.join(__dirname, 'web');
const MINI_ROOT = path.join(__dirname, 'mini');
const SCHEME = 'app';
const ORIGIN = `${SCHEME}://tarsmusic`;

protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
  },
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let mainWindow = null;

function dataDirs() {
  const userData = app.getPath('userData');
  const document = path.join(userData, 'Documents');
  const cache = path.join(userData, 'Cache');
  for (const dir of [document, cache]) fs.mkdirSync(dir, { recursive: true });
  return { document, cache, bundle: WEB_ROOT };
}

// Synchronous so the file-system shim has its paths before any module reads them.
ipcMain.on('tars:paths', (event) => {
  event.returnValue = dataDirs();
});
ipcMain.on('tars:version', (event) => {
  event.returnValue = app.getVersion();
});
ipcMain.on('tars:minimize-to-tray', () => {
  mainWindow?.minimize();
});

function serveWebBuild() {
  // Expo Router uses browser history, so any path that is not a file falls back to
  // index.html (a single-page app).
  protocol.handle(SCHEME, (request) => {
    const { pathname } = new URL(request.url);
    const rel = decodeURIComponent(pathname).replace(/^\/+/, '');
    // The mini player window's own page (desktop/mini).
    if (rel.startsWith('__mini/')) {
      const mini = path.normalize(path.join(MINI_ROOT, rel.slice('__mini/'.length)));
      if (mini.startsWith(MINI_ROOT) && fs.existsSync(mini)) return net.fetch(pathToFileURL(mini).toString());
      return new Response('not found', { status: 404 });
    }
    let file = path.normalize(path.join(WEB_ROOT, rel));
    if (!file.startsWith(WEB_ROOT) || !rel || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(WEB_ROOT, 'index.html');
    }
    return net.fetch(pathToFileURL(file).toString());
  });
}

function createWindow() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png'));
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 420,
    minHeight: 600,
    backgroundColor: '#121826',
    title: 'TARSMusic',
    icon: icon.isEmpty() ? undefined : icon,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
      spellcheck: false,
    },
  });
  Menu.setApplicationMenu(null);

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
    if (miniWindow && !miniWindow.isDestroyed()) miniWindow.close();
  });

  // Links to anything but the app itself open in the default browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(ORIGIN)) {
      event.preventDefault();
      if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
    }
  });

  // F12 / Ctrl+Shift+I open the developer tools, F5 / Ctrl+R reload.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = input.key.toLowerCase();
    if (key === 'f12' || (input.control && input.shift && key === 'i')) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    } else if (key === 'f5' || (input.control && key === 'r')) {
      mainWindow.webContents.reload();
      event.preventDefault();
    }
  });

  if (process.env.TARS_DEV_URL) {
    mainWindow.loadURL(process.env.TARS_DEV_URL);
  } else {
    mainWindow.loadURL(`${ORIGIN}/`);
  }
}

// --- Mini player --------------------------------------------------------------
// A small frameless window that stays above other windows, with the cover, the song and
// the main controls. The app (main window) keeps playing; it sends the mini window what
// is playing (tars:mini-state) and carries out its buttons (tars:mini-command).
let miniWindow = null;
let miniState = null;

function miniBoundsFile() {
  return path.join(app.getPath('userData'), 'mini-player.json');
}

function readMiniBounds() {
  try {
    const b = JSON.parse(fs.readFileSync(miniBoundsFile(), 'utf8'));
    if (![b.x, b.y, b.width, b.height].every((n) => Number.isFinite(n))) return null;
    // Only where a screen still is (a monitor may have been unplugged since).
    const area = screen.getDisplayMatching(b).workArea;
    const visible =
      b.x < area.x + area.width - 40 && b.x + b.width > area.x + 40 && b.y >= area.y - 10 && b.y < area.y + area.height - 40;
    if (visible) return b;
  } catch {
    /* first time */
  }
  return null;
}

/** First time: the bottom-right corner of the screen the app is on, like a video pop-up. */
function defaultMiniBounds(width, height) {
  const area = (mainWindow ? screen.getDisplayMatching(mainWindow.getBounds()) : screen.getPrimaryDisplay()).workArea;
  return { x: area.x + area.width - width - 24, y: area.y + area.height - height - 24, width, height };
}

function saveMiniBounds() {
  if (!miniWindow || miniWindow.isDestroyed()) return;
  try {
    fs.writeFileSync(miniBoundsFile(), JSON.stringify(miniWindow.getBounds()));
  } catch {
    /* best effort */
  }
}

function openMiniWindow() {
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.show();
    miniWindow.focus();
    return;
  }
  const bounds = readMiniBounds() ?? defaultMiniBounds(360, 116);
  const icon = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png'));
  miniWindow = new BrowserWindow({
    ...bounds,
    minWidth: 280,
    minHeight: 96,
    maxHeight: 220,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    fullscreenable: false,
    maximizable: false,
    backgroundColor: '#121826',
    title: 'TARSMusic',
    icon: icon.isEmpty() ? undefined : icon,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      spellcheck: false,
    },
  });
  // Above full-screen windows too, where the platform allows it.
  miniWindow.setAlwaysOnTop(true, 'floating');
  const reveal = () => {
    if (!miniWindow || miniWindow.isDestroyed() || miniWindow.isVisible()) return;
    miniWindow.show();
    // The pop-up takes the big window's place until "back to the app".
    if (mainWindow && !mainWindow.isMinimized()) mainWindow.minimize();
  };
  miniWindow.once('ready-to-show', reveal);
  miniWindow.webContents.on('did-finish-load', () => {
    if (miniState) miniWindow?.webContents.send('tars:mini-state', miniState);
    reveal();
  });
  miniWindow.webContents.on('did-fail-load', (_e, code, desc) => console.warn('[mini] load failed', code, desc));
  miniWindow.on('moved', saveMiniBounds);
  miniWindow.on('resized', saveMiniBounds);
  miniWindow.on('close', saveMiniBounds);
  miniWindow.on('closed', () => {
    miniWindow = null;
  });
  miniWindow.loadURL(`${ORIGIN}/__mini/mini.html`);
}

ipcMain.on('tars:mini-open', () => openMiniWindow());
ipcMain.on('tars:mini-close', () => miniWindow?.close());
ipcMain.on('tars:mini-state', (_event, state) => {
  miniState = state;
  if (miniWindow && !miniWindow.isDestroyed()) miniWindow.webContents.send('tars:mini-state', state);
});
ipcMain.on('tars:mini-command', (_event, cmd) => {
  if (!cmd || typeof cmd.kind !== 'string') return;
  if (cmd.kind === 'expand' || cmd.kind === 'close') {
    // Back to the full app: show it and close the mini window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
    miniWindow?.close();
    return;
  }
  mainWindow?.webContents.send('tars:mini-command', cmd);
});

let autoUpdater = null;
function updater() {
  if (!app.isPackaged) return null;
  if (!autoUpdater) {
    try {
      ({ autoUpdater } = require('electron-updater'));
      // Downloads in the background as soon as an update is found and installs it
      // when the app closes; "Check for updates" in the app can install it now.
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = true;
      autoUpdater.on('error', (err) => console.warn('[update]', err?.message ?? err));
    } catch (err) {
      console.warn('[update] unavailable', err?.message ?? err);
      return null;
    }
  }
  return autoUpdater;
}

function startAutoUpdate() {
  const u = updater();
  if (!u) return;
  const check = () => u.checkForUpdates().catch(() => {});
  check();
  // Check again every 6 hours while the app stays open.
  setInterval(check, 6 * 60 * 60 * 1000);
}

ipcMain.handle('tars:update-check', async () => {
  const u = updater();
  if (!u) return null;
  const result = await u.checkForUpdates();
  if (!result || !result.isUpdateAvailable) return null;
  return { version: result.updateInfo.version };
});

ipcMain.handle('tars:update-install', async () => {
  const u = updater();
  if (!u) throw new Error('Updates are only available in the installed app');
  await u.downloadUpdate();
  // Silent install, then start the app again.
  setImmediate(() => u.quitAndInstall(true, true));
});

// TARSMusic share links (substreamer://s/<kind>/<id>), from the "Open in TARSMusic"
// button on a shared link's web page. Windows starts the app with the link as an
// argument, or hands it to the running app through second-instance.
const LINK_SCHEME = 'substreamer';
let pendingLink = null;

function linkFromArgs(argv) {
  return argv.find((arg) => typeof arg === 'string' && arg.toLowerCase().startsWith(`${LINK_SCHEME}://`)) ?? null;
}

function deliverLink(url) {
  if (!url) return;
  if (mainWindow && !mainWindow.webContents.isLoading()) {
    mainWindow.webContents.send('tars:open-link', url);
  } else {
    pendingLink = url;
  }
}

if (process.defaultApp) {
  // Development (electron .): register the script too, or Windows starts bare Electron.
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(LINK_SCHEME, process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient(LINK_SCHEME);
}
pendingLink = linkFromArgs(process.argv);

ipcMain.handle('tars:take-link', () => {
  const url = pendingLink;
  pendingLink = null;
  return url;
});

app.on('second-instance', (_event, argv) => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
  deliverLink(linkFromArgs(argv));
});

app.whenReady().then(() => {
  app.setAppUserModelId('com.douglas.tarsmusic');
  serveWebBuild();
  createWindow();
  startAutoUpdate();
});

app.on('window-all-closed', () => app.quit());
