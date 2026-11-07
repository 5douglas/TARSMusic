// Phone-only native modules that have nothing to do on Windows.

// expo-backup-exclusions
async function excludeFromBackup() {}

// expo-move-to-back
function moveToBack() {
  try {
    window.require('electron').ipcRenderer.send('tars:minimize-to-tray');
  } catch {
    /* not in the desktop app */
  }
}

// expo-scroll-to-top
function setArmed() {}
function isSupported() {
  return false;
}
function addStatusBarTapListener() {
  return () => {};
}

module.exports = {
  __esModule: true,
  excludeFromBackup,
  moveToBack,
  setArmed,
  isSupported,
  addStatusBarTapListener,
  // expo-app-installer / expo-player-widget: absent, like on a phone without them.
  AppInstaller: null,
  PlayerWidget: null,
};
