// Runs before any app module in the desktop (web) bundle.
const { Image } = require('react-native');
const { Asset } = require('expo-asset');

if (typeof Image.resolveAssetSource !== 'function') {
  Image.resolveAssetSource = (source) => {
    if (source == null) return null;
    if (typeof source === 'number') {
      const asset = Asset.fromModule(source);
      return { uri: asset.uri, width: asset.width ?? undefined, height: asset.height ?? undefined };
    }
    if (typeof source === 'string') return { uri: source };
    return source;
  };
}

// Icon fonts. On a phone they are bundled into the app; on the web each family
// needs an @font-face rule pointing at the font file.
const ICON_FONTS = [
  ['Ionicons', require('@react-native-vector-icons/ionicons/fonts/Ionicons.ttf')],
  ['MaterialDesignIcons', require('@react-native-vector-icons/material-design-icons/fonts/MaterialDesignIcons.ttf')],
  ['FontAwesome5Free-Solid', require('@react-native-vector-icons/fontawesome5/fonts/FontAwesome5_Solid.ttf')],
  ['FontAwesome5Free-Regular', require('@react-native-vector-icons/fontawesome5/fonts/FontAwesome5_Regular.ttf')],
  ['FontAwesome5Brands-Regular', require('@react-native-vector-icons/fontawesome5/fonts/FontAwesome5_Brands.ttf')],
];
if (typeof document !== 'undefined') {
  const css = ICON_FONTS.map(
    ([family, mod]) => `@font-face{font-family:"${family}";src:url("${Asset.fromModule(mod).uri}") format("truetype");font-display:block;}`,
  ).join('\n');
  const style = document.createElement('style');
  style.setAttribute('data-desktop', 'icon-fonts');
  style.textContent = css;
  document.head.appendChild(style);
}

// react-native-screens leaves inactive screens in place on the web unless screens
// are enabled; without it a tab switch shows the previous tab under the new one
// (the app's tab scenes are transparent).
require('react-native-screens').enableScreens(true);

// Carousels: drag and ‹ › buttons with the mouse; thin dark scrollbars.
require('./horizontal-scroll');

// "Check for updates" in the app: electron-updater runs in the main process.
try {
  const { ipcRenderer } = window.require('electron');
  globalThis.tarsDesktopUpdater = {
    check: () => ipcRenderer.invoke('tars:update-check'),
    install: () => ipcRenderer.invoke('tars:update-install'),
  };
} catch {
  /* not in the desktop app */
}

// TARSMusic share links opened from the browser (substreamer://s/...), handed over by
// the main process; useShareLinkHandler opens them.
try {
  const { ipcRenderer } = window.require('electron');
  globalThis.tarsDesktopLinks = {
    take: () => ipcRenderer.invoke('tars:take-link'),
    onLink: (listener) => {
      const handler = (_event, url) => listener(url);
      ipcRenderer.on('tars:open-link', handler);
      return () => ipcRenderer.removeListener('tars:open-link', handler);
    },
  };
} catch {
  /* not in the desktop app */
}
