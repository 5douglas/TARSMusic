import { type StateStorage } from 'zustand/middleware';

const store = new Map<string, string>();

/**
 * Test mock for both kvStorage adapters. Production has a sync (`kvStorageSync`)
 * and an async (`kvStorage`) adapter; the mock keeps BOTH synchronous and
 * backed by the SAME `store` Map so tests can seed via one and read via the
 * other interchangeably. Code under test that does `await kvStorage.getItem()`
 * still works — awaiting a synchronous value resolves immediately.
 */
export const kvStorageSync: StateStorage = {
  getItem(key: string): string | null {
    return store.get(key) ?? null;
  },
  setItem(key: string, value: string): void {
    store.set(key, value);
  },
  removeItem(key: string): void {
    store.delete(key);
  },
};

// Same synchronous implementation, exported under the async adapter's name so
// the (mocked) module shape matches production's two named exports.
export const kvStorage: StateStorage = kvStorageSync;

export function clearKvStorage(): void {
  store.clear();
}
