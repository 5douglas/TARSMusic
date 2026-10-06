/**
 * Debounced, deferred-stringify Zustand persist storage for the large
 * library-catalog stores (album/artist/playlist lists, favorites, genres, …).
 *
 * Problem it solves: those stores persist as a single multi-MB JSON blob and,
 * with the default `createJSONStorage`, Zustand calls `JSON.stringify` on the
 * whole partialized state on **every** mutation. During a library sync that
 * mutates the list repeatedly, that's an O(n²) storm of synchronous stringifies
 * on the JS thread (plus a DB write each time).
 *
 * This adapter works at the `PersistStorage` (object) level instead of the
 * string level, so it can:
 *   1. **Coalesce** writes per key — a burst of N mutations within the debounce
 *      window collapses to a single flush.
 *   2. **Defer the `JSON.stringify`** to that single flush (once per burst,
 *      not once per mutation) — the real O(n²)→O(n) win.
 *   3. Run the actual write through the async {@link kvStorage} adapter, so the
 *      SQLite IO happens on a background thread.
 *
 * Reads (boot hydration) delegate straight to the async adapter — a store
 * backed by this hydrates asynchronously, exactly like a plain async
 * `kvStorage` store.
 *
 * Durability: writes live only in memory until the debounce timer fires.
 * `flushAllPersistStorages()` is wired to AppState background/inactive (and can
 * be called at other critical moments) so leaving the app persists the latest
 * state. A hard crash within the debounce window loses the most recent delta —
 * acceptable here because this data is re-derivable from the server on the next
 * sync. `dropAllPendingPersistWrites()` is called on logout so a late flush
 * can't resurrect data after `clearKvStorage()`.
 */
import { type PersistStorage, type StorageValue } from 'zustand/middleware';

import { kvStorage } from './kvStorage';

/** Default coalescing window. A burst of writes within this many ms flushes once. */
const DEFAULT_DEBOUNCE_MS = 1000;

/** Per-instance flush hook, registered so {@link flushAllPersistStorages} can
 *  force every debounced store to write synchronously-soon (e.g. on
 *  backgrounding). */
type Flusher = () => Promise<void>;
type Dropper = () => void;

const flushers = new Set<Flusher>();
const droppers = new Set<Dropper>();

/**
 * Flush every debounced persist store's pending write immediately. Wire this to
 * AppState 'background'/'inactive' and any "force persist now" moment.
 */
export async function flushAllPersistStorages(): Promise<void> {
  await Promise.all([...flushers].map((flush) => flush()));
}

/**
 * Discard every pending (not-yet-flushed) write without persisting it. Called
 * on logout/reset so a debounce timer can't fire after `clearKvStorage()` and
 * write stale data back.
 */
export function dropAllPendingPersistWrites(): void {
  for (const drop of droppers) drop();
}

/**
 * Build a debounced, deferred-stringify `PersistStorage`. One instance per
 * store; pass to `persist`'s `storage` option in place of
 * `createJSONStorage(() => kvStorage)`.
 */
export function createDebouncedPersistStorage<S>(
  debounceMs: number = DEFAULT_DEBOUNCE_MS,
): PersistStorage<S> {
  // Latest pending value per key (object form — stringified only at flush).
  const pending = new Map<string, StorageValue<S>>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const cancelTimer = (name: string): void => {
    const t = timers.get(name);
    if (t !== undefined) {
      clearTimeout(t);
      timers.delete(name);
    }
  };

  const flushKey = async (name: string): Promise<void> => {
    cancelTimer(name);
    if (!pending.has(name)) return;
    const value = pending.get(name) as StorageValue<S>;
    pending.delete(name);
    try {
      // Stringify ONCE here (deferred), then write off-thread via kvStorage.
      await kvStorage.setItem(name, JSON.stringify(value));
    } catch {
      /* persistence dropped this write; nothing else to do */
    }
  };

  flushers.add(async () => {
    await Promise.all([...pending.keys()].map((name) => flushKey(name)));
  });

  droppers.add(() => {
    for (const name of [...timers.keys()]) cancelTimer(name);
    pending.clear();
  });

  return {
    async getItem(name: string): Promise<StorageValue<S> | null> {
      // A pending in-memory write is fresher than disk; prefer it.
      if (pending.has(name)) return pending.get(name) as StorageValue<S>;
      const raw = await kvStorage.getItem(name);
      if (raw == null) return null;
      try {
        return JSON.parse(raw) as StorageValue<S>;
      } catch {
        return null;
      }
    },

    setItem(name: string, value: StorageValue<S>): void {
      // Keep only the latest value; (re)arm the debounce timer. The in-memory
      // Zustand store is already updated, so returning immediately is safe.
      pending.set(name, value);
      cancelTimer(name);
      const timer = setTimeout(() => {
        void flushKey(name);
      }, debounceMs);
      // This best-effort flush must never hold the process open: under Node
      // (jest) an un-unref'd timer leaves the worker hanging at exit. `unref`
      // is Node-only and absent in the RN runtime, so guard the call.
      (timer as { unref?: () => void }).unref?.();
      timers.set(name, timer);
    },

    async removeItem(name: string): Promise<void> {
      cancelTimer(name);
      pending.delete(name);
      await kvStorage.removeItem(name);
    },
  };
}
