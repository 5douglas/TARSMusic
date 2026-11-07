// Entry for the web bundle, which is the Windows desktop app (desktop/). Fills in
// the few React Native APIs react-native-web lacks, then starts the app the same
// way index.js does.
require('./desktop/bootstrap');

try {
  require('./src/services/playerBootstrap');
} catch (e) {
  // eslint-disable-next-line no-console
  console.error('[index] playerBootstrap failed:', e);
}

require('expo-router/entry');
