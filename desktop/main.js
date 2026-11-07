// TARSMusic for Windows: Electron shell around the app's web build (desktop/web).
//
// The renderer runs the same React Native code as the phone app (through
// react-native-web), with the native modules replaced by desktop/shims. It needs
// Node in the renderer for the database (node:sqlite) and the file system, and it
// talks to the user's own servers, which do not all send CORS headers.
const { app, BrowserWindow, ipcMain, net, protocol, shell, Menu, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const WEB_ROOT = path.join(__dirname, 'web');
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

function startAutoUpdate() {
  if (!app.isPackaged) return;
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('error', (err) => console.warn('[update]', err?.message ?? err));
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    // Check again every 6 hours while the app stays open.
    setInterval(() => autoUpdater.checkForUpdatesAndNotify().catch(() => {}), 6 * 60 * 60 * 1000);
  } catch (err) {
    console.warn('[update] unavailable', err?.message ?? err);
  }
}

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.whenReady().then(() => {
  app.setAppUserModelId('com.douglas.tarsmusic');
  serveWebBuild();
  createWindow();
  startAutoUpdate();
});

app.on('window-all-closed', () => app.quit());
