// Verifies the debounced / deferred-stringify persist storage: writes coalesce
// per key, JSON.stringify happens once per flush (not per setItem), flushAll
// forces an immediate write, and drop discards pending writes.

const mockSetItem = jest.fn<Promise<void>, [string, string]>().mockResolvedValue(undefined);
const mockGetItem = jest.fn<Promise<string | null>, [string]>().mockResolvedValue(null);
const mockRemoveItem = jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined);

jest.mock('../kvStorage', () => ({
  kvStorage: {
    getItem: (k: string) => mockGetItem(k),
    setItem: (k: string, v: string) => mockSetItem(k, v),
    removeItem: (k: string) => mockRemoveItem(k),
  },
}));

import {
  createDebouncedPersistStorage,
  flushAllPersistStorages,
  dropAllPendingPersistWrites,
} from '../debouncedStorage';

const flush = () => Promise.resolve();

beforeEach(() => {
  jest.useFakeTimers();
  mockSetItem.mockClear();
  mockGetItem.mockClear();
  mockRemoveItem.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('createDebouncedPersistStorage', () => {
  it('coalesces a burst of writes into a single deferred stringify+write', async () => {
    const storage = createDebouncedPersistStorage(1000);

    storage.setItem('k', { state: { n: 1 } } as never);
    storage.setItem('k', { state: { n: 2 } } as never);
    storage.setItem('k', { state: { n: 3 } } as never);

    // Nothing written yet — the debounce window hasn't elapsed.
    expect(mockSetItem).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1000);
    await flush();

    // Exactly one write, carrying only the LATEST value.
    expect(mockSetItem).toHaveBeenCalledTimes(1);
    expect(mockSetItem).toHaveBeenCalledWith('k', JSON.stringify({ state: { n: 3 } }));
  });

  it('keeps separate debounce state per key', async () => {
    const storage = createDebouncedPersistStorage(1000);
    storage.setItem('a', { state: 1 } as never);
    storage.setItem('b', { state: 2 } as never);

    jest.advanceTimersByTime(1000);
    await flush();

    expect(mockSetItem).toHaveBeenCalledTimes(2);
    expect(mockSetItem).toHaveBeenCalledWith('a', JSON.stringify({ state: 1 }));
    expect(mockSetItem).toHaveBeenCalledWith('b', JSON.stringify({ state: 2 }));
  });

  it('flushAllPersistStorages writes pending values immediately', async () => {
    const storage = createDebouncedPersistStorage(10_000);
    storage.setItem('k', { state: 'pending' } as never);
    expect(mockSetItem).not.toHaveBeenCalled();

    await flushAllPersistStorages();

    expect(mockSetItem).toHaveBeenCalledWith('k', JSON.stringify({ state: 'pending' }));
  });

  it('dropAllPendingPersistWrites discards pending writes without persisting', async () => {
    const storage = createDebouncedPersistStorage(1000);
    storage.setItem('k', { state: 'doomed' } as never);

    dropAllPendingPersistWrites();
    jest.advanceTimersByTime(5000);
    await flush();

    expect(mockSetItem).not.toHaveBeenCalled();
  });

  it('removeItem cancels a pending write and deletes the key', async () => {
    const storage = createDebouncedPersistStorage(1000);
    storage.setItem('k', { state: 'will-be-removed' } as never);

    await storage.removeItem('k');
    jest.advanceTimersByTime(5000);
    await flush();

    expect(mockRemoveItem).toHaveBeenCalledWith('k');
    expect(mockSetItem).not.toHaveBeenCalled();
  });

  it('getItem returns a pending in-memory value before it is flushed', async () => {
    const storage = createDebouncedPersistStorage(1000);
    storage.setItem('k', { state: { fresh: true } } as never);

    await expect(storage.getItem('k')).resolves.toEqual({ state: { fresh: true } });
    // Did not hit the backing store for a pending value.
    expect(mockGetItem).not.toHaveBeenCalled();
  });

  it('getItem parses the backing stores JSON when nothing is pending', async () => {
    mockGetItem.mockResolvedValueOnce(JSON.stringify({ state: { hydrated: 1 } }));
    const storage = createDebouncedPersistStorage(1000);

    await expect(storage.getItem('k')).resolves.toEqual({ state: { hydrated: 1 } });
    expect(mockGetItem).toHaveBeenCalledWith('k');
  });

  it('getItem returns null for a missing key and for unparseable JSON', async () => {
    const storage = createDebouncedPersistStorage(1000);

    mockGetItem.mockResolvedValueOnce(null);
    await expect(storage.getItem('missing')).resolves.toBeNull();

    mockGetItem.mockResolvedValueOnce('{bad json');
    await expect(storage.getItem('bad')).resolves.toBeNull();
  });
});
