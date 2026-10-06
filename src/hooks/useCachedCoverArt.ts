/**
 * Hook that resolves a cover art URI from the local disk cache
 * (if available) or the remote Subsonic URL, and triggers a
 * background cache download on a miss.
 *
 * Intended for non-Image consumers like `react-native-image-colors`.
 * Resolution is asynchronous and DB-authoritative — no synchronous
 * FS/SQLite — and the cache-update subscription re-resolves when a
 * download lands.
 */

import { useEffect, useState } from 'react';

import {
  ensureCached,
  resolveCachedImageUri,
  subscribeImageCacheUpdate,
} from '../services/imageCacheService';
import { getCoverArtUrl } from '../services/subsonicService';

/**
 * Returns a URI (file:// or http(s)://) for the given cover art,
 * preferring the local cache.  Triggers background caching on miss.
 */
export function useCachedCoverArt(
  coverArtId: string | undefined,
  size: number,
): string | null {
  const [uri, setUri] = useState<string | null>(() =>
    coverArtId ? getCoverArtUrl(coverArtId, size) : null,
  );

  useEffect(() => {
    if (!coverArtId) {
      setUri(null);
      return;
    }
    let cancelled = false;

    const resolve = () => {
      resolveCachedImageUri(coverArtId, size)
        .then((cached) => {
          if (cancelled) return;
          if (cached) {
            setUri(cached);
          } else {
            // Not cached: fall back to the remote URL and kick off caching.
            setUri(getCoverArtUrl(coverArtId, size));
            ensureCached(coverArtId).catch(() => {
              /* non-critical: caching failure falls back to network URL */
            });
          }
        })
        .catch(() => {
          if (!cancelled) setUri(getCoverArtUrl(coverArtId, size));
        });
    };

    resolve();
    // Re-resolve when a download/resize lands for this id.
    const unsub = subscribeImageCacheUpdate(coverArtId, resolve);

    return () => {
      cancelled = true;
      unsub();
    };
  }, [coverArtId, size]);

  return uri;
}
