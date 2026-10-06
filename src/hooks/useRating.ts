import { useCallback } from 'react';

import { ratingStore } from '../store/ratingStore';

/**
 * Returns the most accurate rating for an item: the optimistic override if one
 * exists, otherwise the server-provided value.
 *
 * Pure selector — no side effects. Overrides act as a global broadcast of the
 * latest known rating, protecting stale views across multiple stores.
 */
export function useRating(id: string, serverRating?: number): number {
  const sr = serverRating ?? 0;
  return ratingStore(
    useCallback((s) => s.overrides[id]?.rating ?? sr, [id, sr]),
  );
}
