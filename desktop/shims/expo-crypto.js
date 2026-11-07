// expo-crypto on Node's crypto, for the desktop build. The web version uses
// WebCrypto, which has no MD5, and Subsonic token auth needs MD5.
const { req } = require('./node');

const CryptoDigestAlgorithm = {
  SHA1: 'SHA-1',
  SHA256: 'SHA-256',
  SHA384: 'SHA-384',
  SHA512: 'SHA-512',
  MD2: 'MD2',
  MD4: 'MD4',
  MD5: 'MD5',
};
const CryptoEncoding = { HEX: 'hex', BASE64: 'base64' };
const nodeAlgo = (a) => String(a).replace('-', '').toLowerCase();

function getRandomValues(array) {
  return globalThis.crypto.getRandomValues(array);
}
function getRandomBytes(n) {
  return getRandomValues(new Uint8Array(n));
}
async function digestStringAsync(algorithm, data, options = {}) {
  return req('crypto')
    .createHash(nodeAlgo(algorithm))
    .update(String(data), 'utf8')
    .digest(options.encoding === CryptoEncoding.BASE64 ? 'base64' : 'hex');
}
async function digest(algorithm, data) {
  const buf = req('crypto').createHash(nodeAlgo(algorithm)).update(Buffer.from(data.buffer ?? data)).digest();
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

module.exports = {
  __esModule: true,
  CryptoDigestAlgorithm,
  CryptoEncoding,
  getRandomValues,
  getRandomBytes,
  getRandomBytesAsync: async (n) => getRandomBytes(n),
  randomUUID: () => globalThis.crypto.randomUUID(),
  digestStringAsync,
  digest,
};
