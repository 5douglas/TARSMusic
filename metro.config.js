// Learn more: https://docs.expo.dev/guides/customizing-metro/
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Windows desktop build (desktop/): the web bundle runs inside Electron, so the
// native-only modules are swapped for desktop implementations in desktop/shims.
// Android and iOS bundles are untouched.
const desktopShims = require('./desktop/shims/map');

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web') {
    const shim = desktopShims[moduleName];
    if (shim) {
      return { type: 'sourceFile', filePath: path.join(__dirname, 'desktop', 'shims', shim) };
    }
  }
  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
