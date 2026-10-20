#!/usr/bin/env node
/**
 * Generate app icon and splash-screen PNG assets from the TARSMusic logo: the
 * four slab monoliths of TARS drawn as a centred audio waveform, each slab split
 * into two blocks like the robot's segments.
 *
 * The colour mark (purple to teal, white outlines, a little depth) is used for the
 * launcher icons; flat single-colour slabs for the splash and placeholders, matching
 * the in-app WaveformLogo component.
 *
 * These source PNGs live in src/assets/ and are referenced by app.json.
 * Expo prebuild (npx expo prebuild --clean) reads app.json and generates
 * the platform-specific native assets in ios/ and android/ automatically.
 *
 * Usage:  node scripts/generate-assets.js   (or: npm run generate-assets)
 * Requires: sharp (npm i -D sharp)
 */

const fs = require('fs');
const sharp = require('sharp');
const path = require('path');

const BACKGROUND = '#121826';
const WHITE = '#FFFFFF';
const ASSETS_DIR = path.resolve(__dirname, '..', 'src', 'assets');

/** Slab heights and block split points – keep in sync with src/components/WaveformLogo.tsx. */
const SLABS = [[0.5, 0.5], [1.0, 0.38], [0.74, 0.62], [0.36, 0.5]];
const GAP_RATIO = 0.55;
const SLAB_GAP_RATIO = 0.04;

const GRADIENTS = `<defs>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a77be0"/><stop offset="1" stop-color="#5fc7c9"/></linearGradient>
<linearGradient id="side" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7d5cb8"/><stop offset="1" stop-color="#3f9ea3"/></linearGradient>
<linearGradient id="topf" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c9a8f2"/><stop offset="1" stop-color="#8fe0e0"/></linearGradient>
</defs>`;

/**
 * Build an SVG string of the logo.
 *
 * @param {number} size         Canvas width & height
 * @param {string} bgColor      Background fill (use 'none' for transparent)
 * @param {string} barColor     Slab fill, or 'color' for the gradient 3D mark
 * @param {number} logoScale    0-1, how much of the canvas the logo occupies
 * @param {number} cornerRadius Rounding for background rect (0 = none)
 */
function buildSvg(size, bgColor, barColor, logoScale = 0.5, cornerRadius = 0) {
  const colour = barColor === 'color';
  const W = size * logoScale;
  const depth = colour ? W * 0.05 : 0;
  const barW = (W - depth) / (SLABS.length + (SLABS.length - 1) * GAP_RATIO);
  const gap = barW * GAP_RATIO;
  const originX = (size - W) / 2;
  const mid = size / 2;
  const blockGap = W * SLAB_GAP_RATIO;
  const stroke = Math.max(1, size * 0.012);
  const outline = colour ? ` stroke="#fff" stroke-width="${stroke}" stroke-linejoin="round"` : '';
  const radius = colour ? 0 : barW * 0.12;

  let shapes = '';
  SLABS.forEach(([hf, split], i) => {
    const h = W * hf;
    const x = originX + i * (barW + gap);
    const top = mid - h / 2 + depth / 2;
    const cut = top + h * split;
    [[top, cut - blockGap / 2], [cut + blockGap / 2, top + h]].forEach(([y0, y1]) => {
      if (colour) {
        shapes += `<path d="M${x + barW} ${y0} l${depth} ${-depth} v${y1 - y0} l${-depth} ${depth} z" fill="url(#side)"${outline}/>`;
        shapes += `<path d="M${x} ${y0} l${depth} ${-depth} h${barW} l${-depth} ${depth} z" fill="url(#topf)"${outline}/>`;
      }
      shapes += `<rect x="${x}" y="${y0}" width="${barW}" height="${y1 - y0}" rx="${radius}" ry="${radius}" fill="${colour ? 'url(#g)' : barColor}"${outline}/>`;
    });
  });

  const bgRect =
    bgColor === 'none'
      ? ''
      : `<rect width="${size}" height="${size}" rx="${cornerRadius}" ry="${cornerRadius}" fill="${bgColor}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${colour ? GRADIENTS : ''}
  ${bgRect}
  ${shapes}
</svg>`;
}

async function generate() {
  // 1. App icon (iOS + Android fallback) – 1024×1024, dark bg, colour mark
  const iconSvg = buildSvg(1024, BACKGROUND, 'color', 0.62, 0);
  await sharp(Buffer.from(iconSvg))
    .png()
    .toFile(path.join(ASSETS_DIR, 'icon.png'));
  console.log('✔  icon.png (1024×1024)');

  // 2. Android adaptive icon foreground – 1024×1024, dark bg, colour mark inside the safe zone
  const adaptiveSvg = buildSvg(1024, BACKGROUND, 'color', 0.46, 0);
  await sharp(Buffer.from(adaptiveSvg))
    .png()
    .toFile(path.join(ASSETS_DIR, 'adaptive-icon.png'));
  console.log('✔  adaptive-icon.png (1024×1024)');

  // 3. Splash logo SVG – vector source for react-native-bootsplash plugin.
  //    Transparent bg + white slabs. The plugin rasterises this at every
  //    density (@1x – @4x) so the native splash is always crisp.
  const splashSvg = buildSvg(200, 'none', WHITE, 0.80, 0);
  fs.writeFileSync(path.join(ASSETS_DIR, 'splash-logo.svg'), splashSvg);
  console.log('✔  splash-logo.svg (200×200 vector)');

  // 4. Favicon – 48×48, dark bg, colour mark
  const faviconSvg = buildSvg(48, BACKGROUND, 'color', 0.70, 6);
  await sharp(Buffer.from(faviconSvg))
    .png()
    .toFile(path.join(ASSETS_DIR, 'favicon.png'));
  console.log('✔  favicon.png (48×48)');

  // 5. Starred-songs cover – 600×600, dark bg, colour mark, JPEG
  const starredSvg = buildSvg(600, BACKGROUND, 'color', 0.50, 0);
  await sharp(Buffer.from(starredSvg))
    .jpeg({ quality: 90 })
    .toFile(path.join(ASSETS_DIR, 'starred-cover.jpg'));
  console.log('✔  starred-cover.jpg (600×600)');

  // 6. Now-playing / cover-art placeholder – 512×512, MILD gray (dark bg, faint
  //    slabs) to match the in-app CachedImage placeholder; no bright flash. Small
  //    JPEG. Also emitted as a base64 module because RNQP's `placeholderArtworkUri`
  //    needs an on-disk file:// written at boot — see nowPlayingPlaceholder.ts.
  const placeholderJpg = await sharp(Buffer.from(buildSvg(512, '#181818', '#3a3a3a', 0.52)))
    .jpeg({ quality: 82 })
    .toBuffer();
  fs.writeFileSync(path.join(ASSETS_DIR, 'nowplaying-placeholder.jpg'), placeholderJpg);
  fs.writeFileSync(
    path.resolve(__dirname, '..', 'src', 'services', 'nowPlayingPlaceholderData.ts'),
    '// AUTO-GENERATED by scripts/generate-assets.js — do not edit by hand.\n' +
      '// base64 of src/assets/nowplaying-placeholder.jpg (mild gray waveform, matches\n' +
      '// the in-app cover-art placeholder). Embedded so it can be written to a file://\n' +
      "// path at boot for RNQP's placeholderArtworkUri (which requires an on-disk file).\n" +
      'export const NOWPLAYING_PLACEHOLDER_JPEG_BASE64 =\n' +
      `  '${placeholderJpg.toString('base64')}';\n`,
  );
  console.log('✔  nowplaying-placeholder.jpg (512×512) + nowPlayingPlaceholderData.ts');

  console.log('\nAll source assets generated in src/assets/');
  console.log('Run "npx expo prebuild --clean" to sync into native ios/ and android/ directories.');
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
