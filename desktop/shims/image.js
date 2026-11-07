// expo-image-colors and expo-image-resize (local native modules) on canvas, for the
// desktop build. The palette is a port of the Android implementation
// (modules/expo-image-colors/android/.../ExpoImageColorsModule.kt): OKLab hue
// buckets, dominant bucket by count x chroma, clamped to readable dark/light tones.
const { req, toPath } = require('./node');

function loadImage(uri) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load image ${uri}`));
    img.src = uri;
  });
}

const HUE_BUCKETS = 24;
const REJECT_L_MIN = 0.1;
const REJECT_L_MAX = 0.96;
const REJECT_C_MIN = 0.04;
const SECONDARY_MIN_HUE_DIST = Math.PI / 3;
const DARK = { lMin: 0.22, lMax: 0.4, floor: 0.15, yMax: 0.18 };
const LIGHT = { lMin: 0.75, lMax: 0.9, ceiling: 0.96, yMin: 0.55 };
const L_STEP = 0.02;

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const linearToSrgb = (c) => Math.min(1, Math.max(0, c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));

function linToOklab(r, g, b) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToLin(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function clampToRgb(L, startC, hue) {
  let C = startC;
  let lin = [0, 0, 0];
  for (let i = 0; i < 8; i++) {
    lin = oklabToLin(L, C * Math.cos(hue), C * Math.sin(hue));
    if (lin.every((v) => v >= 0 && v <= 1)) break;
    C *= 0.9;
  }
  const [r, g, b] = lin.map((v) => Math.min(1, Math.max(0, v)));
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const hex = `#${[r, g, b]
    .map((v) => Math.round(linearToSrgb(v) * 255).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
  return { hex, y };
}

function toDark(lin) {
  const [L0, a, b] = linToOklab(...lin);
  const hue = Math.atan2(b, a);
  const C = Math.hypot(a, b);
  let L = Math.min(DARK.lMax, Math.max(DARK.lMin, L0));
  let out = clampToRgb(L, C, hue);
  while (out.y > DARK.yMax && L > DARK.floor) {
    L -= L_STEP;
    out = clampToRgb(L, C, hue);
  }
  return out.hex;
}

function toLight(lin) {
  const [L0, a, b] = linToOklab(...lin);
  const hue = Math.atan2(b, a);
  const C = Math.hypot(a, b);
  let L = Math.min(LIGHT.lMax, Math.max(LIGHT.lMin, L0));
  let out = clampToRgb(L, C, hue);
  while (out.y < LIGHT.yMin && L < LIGHT.ceiling) {
    L += L_STEP;
    out = clampToRgb(L, C, hue);
  }
  return out.hex;
}

function extractPalette(data) {
  const count = new Array(HUE_BUCKETS).fill(0);
  const sum = Array.from({ length: HUE_BUCKETS }, () => [0, 0, 0]);
  const vibrance = new Array(HUE_BUCKETS).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const lin = [srgbToLinear(data[i] / 255), srgbToLinear(data[i + 1] / 255), srgbToLinear(data[i + 2] / 255)];
    const [L, a, b] = linToOklab(...lin);
    const C = Math.hypot(a, b);
    if (L < REJECT_L_MIN || L > REJECT_L_MAX || C < REJECT_C_MIN) continue;
    const hue = (Math.atan2(b, a) + 2 * Math.PI) % (2 * Math.PI);
    const bucket = Math.min(HUE_BUCKETS - 1, Math.floor((hue * HUE_BUCKETS) / (2 * Math.PI)));
    count[bucket] += 1;
    sum[bucket][0] += lin[0];
    sum[bucket][1] += lin[1];
    sum[bucket][2] += lin[2];
    vibrance[bucket] += C;
  }
  let primary = -1;
  let best = 0;
  for (let i = 0; i < HUE_BUCKETS; i++) {
    if (!count[i]) continue;
    const score = count[i] * Math.sqrt(vibrance[i] / count[i]);
    if (score > best) {
      best = score;
      primary = i;
    }
  }
  if (primary < 0) return null;
  const avg = (i) => sum[i].map((v) => v / count[i]);
  let secondary = -1;
  let secondaryCount = 0;
  const span = (2 * Math.PI) / HUE_BUCKETS;
  for (let i = 0; i < HUE_BUCKETS; i++) {
    if (i === primary || !count[i]) continue;
    const d = Math.abs(primary - i);
    if (Math.min(d, HUE_BUCKETS - d) * span < SECONDARY_MIN_HUE_DIST) continue;
    if (count[i] > secondaryCount) {
      secondaryCount = count[i];
      secondary = i;
    }
  }
  const p = avg(primary);
  const s = secondary >= 0 ? avg(secondary) : null;
  return {
    dark: { primary: toDark(p), secondary: s ? toDark(s) : null },
    light: { primary: toLight(p), secondary: s ? toLight(s) : null },
  };
}

async function getImagePaletteAsync(uri) {
  const img = await loadImage(uri);
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, size, size);
  return extractPalette(ctx.getImageData(0, 0, size, size).data);
}

async function resizeImageToFileAsync(sourceUri, targetUri, maxWidth, quality) {
  const img = await loadImage(sourceUri);
  const scale = img.naturalWidth > maxWidth ? maxWidth / img.naturalWidth : 1;
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  const q = quality > 1 ? quality / 100 : quality;
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', q || 0.85));
  if (!blob) throw new Error('Image encode failed');
  const dest = toPath(targetUri);
  await req('fs').promises.mkdir(req('path').dirname(dest), { recursive: true });
  await req('fs').promises.writeFile(dest, Buffer.from(await blob.arrayBuffer()));
}

module.exports = { __esModule: true, getImagePaletteAsync, resizeImageToFileAsync };
