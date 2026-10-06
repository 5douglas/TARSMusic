import { requireNativeModule } from 'expo-modules-core';

interface CompressResult {
  bytes: number;
}

interface ExpoGzipNativeModule {
  compressToFile(data: string, destUri: string): Promise<CompressResult>;
  decompressFromFile(sourceUri: string): Promise<string>;
}

let module: ExpoGzipNativeModule;

try {
  module = requireNativeModule('ExpoGzip');
} catch {
  console.warn(
    '[expo-gzip] Native module not found. ' +
      'Run `npx expo run:ios` or `npx expo run:android` to rebuild with the native module.'
  );

  module = {
    compressToFile: () => Promise.resolve({ bytes: 0 }),
    decompressFromFile: () => Promise.resolve(''),
  } as unknown as ExpoGzipNativeModule;
}

export default module;
