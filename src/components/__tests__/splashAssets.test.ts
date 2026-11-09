// The native splash (react-native-bootsplash plugin config in app.json) and the JS
// splash that takes over from it (assets/bootsplash/manifest.json) must use the same
// background, or the launch flashes from one colour to another.
const appJson = require('../../../app.json');
const manifest = require('../../../assets/bootsplash/manifest.json');

describe('splash assets', () => {
  it('JS bootsplash background matches the native splash background', () => {
    const plugin = appJson.expo.plugins.find(
      (p: unknown) => Array.isArray(p) && p[0] === 'react-native-bootsplash',
    );
    expect(plugin).toBeDefined();
    expect(manifest.background.toLowerCase()).toBe(plugin[1].background.toLowerCase());
    expect(manifest.logo.width).toBe(plugin[1].logoWidth);
  });
});
