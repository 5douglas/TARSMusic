// Native-only modules and the desktop file that replaces each one in the web bundle
// (see metro.config.js). Paths are relative to this folder.
module.exports = {
  'react-native-nitro-modules': 'queue-player.js',
  '@op-engineering/op-sqlite': 'op-sqlite.js',
  'expo-file-system': 'expo-file-system.js',
  'expo-async-fs': 'expo-async-fs.js',
  'expo-gzip': 'expo-gzip.js',
  'expo-image-colors': 'image.js',
  'expo-image-resize': 'image.js',
  'expo-backup-exclusions': 'noop-modules.js',
  'expo-move-to-back': 'noop-modules.js',
  'expo-scroll-to-top': 'noop-modules.js',
  'expo-app-installer': 'noop-modules.js',
  'expo-player-widget': 'noop-modules.js',
  'expo-notifications': 'expo-notifications.js',
  'expo-crypto': 'expo-crypto.js',
};
