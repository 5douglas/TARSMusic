import { useEffect } from 'react';

/**
 * Minimal shape of a Zustand `persist`-enabled store's persistence API.
 * Library stores persist via the async kvStorage adapter, so they are NOT
 * populated at first render — they hydrate a microtask/IO cycle later.
 */
interface PersistApi {
  persist: {
    hasHydrated: () => boolean;
    onFinishHydration: (cb: () => void) => () => void;
  };
}

/**
 * Run `check` exactly once, but only after the given persisted store has
 * finished hydrating: immediately if it is already hydrated, otherwise via
 * `onFinishHydration`.
 *
 * Use this for "if the list is empty, fetch it" mount guards. With the async
 * persist adapter, a naive `useEffect(() => { if (xs.length === 0) fetch() })`
 * can see an empty store *before* its cached blob has hydrated and fire a
 * spurious full network fetch (and flash an empty list). Gating on hydration
 * makes the empty-check see the real cached data first; it only fetches when
 * the library is genuinely empty after hydration.
 *
 * `check` should read fresh state via `getState()` (not captured selector
 * values), since it may run after the initial render.
 */
export function useFetchOnHydrated(store: PersistApi, check: () => void): void {
  useEffect(() => {
    if (store.persist.hasHydrated()) {
      check();
      return;
    }
    return store.persist.onFinishHydration(check);
    // Mount-only guard; `store`/`check` are stable for the screen's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
