// expo-gzip (local native module) on Node's zlib, for the desktop build.
const { req, toPath } = require('./node');

async function compressToFile(data, destUri) {
  const buf = req('zlib').gzipSync(Buffer.from(data, 'utf8'));
  const dest = toPath(destUri);
  await req('fs').promises.mkdir(req('path').dirname(dest), { recursive: true });
  await req('fs').promises.writeFile(dest, buf);
  return { bytes: buf.length };
}

async function decompressFromFile(sourceUri) {
  const buf = await req('fs').promises.readFile(toPath(sourceUri));
  return req('zlib').gunzipSync(buf).toString('utf8');
}

module.exports = { __esModule: true, compressToFile, decompressFromFile };
