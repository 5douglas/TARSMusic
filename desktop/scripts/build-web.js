// Builds the app's web bundle into desktop/web and stamps the app version into
// desktop/package.json, so the installer and the auto-updater carry the same
// version as the phone app.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const desktop = path.join(__dirname, '..');
const root = path.join(desktop, '..');

const appJson = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const version = process.env.TARS_VERSION || appJson.expo.version;
const pkgPath = path.join(desktop, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.version = version;
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`[desktop] version ${version}`);

fs.mkdirSync(path.join(desktop, 'build'), { recursive: true });
fs.copyFileSync(path.join(root, 'src', 'assets', 'icon.png'), path.join(desktop, 'build', 'icon.png'));

fs.rmSync(path.join(desktop, 'web'), { recursive: true, force: true });
execSync('npx expo export --platform web --output-dir desktop/web --clear', {
  cwd: root,
  stdio: 'inherit',
});
