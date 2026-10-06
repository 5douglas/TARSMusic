import ExpoGzipModule from './ExpoGzipModule';

/**
 * Gzip-compress a string and write the result to a file.
 * Compression runs on a native background thread.
 *
 * @param data       The string to compress (typically JSON).
 * @param destUri    File URI for the compressed output.
 * @returns          The compressed file size in bytes.
 */
export function compressToFile(
  data: string,
  destUri: string,
): Promise<{ bytes: number }> {
  return ExpoGzipModule.compressToFile(data, destUri);
}

/**
 * Read a gzip file and return the decompressed string.
 * Decompression and file I/O run on a native background thread.
 *
 * @param sourceUri  File URI of the gzip-compressed file.
 * @returns          The decompressed string.
 */
export function decompressFromFile(sourceUri: string): Promise<string> {
  return ExpoGzipModule.decompressFromFile(sourceUri);
}
