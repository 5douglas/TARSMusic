import { useEffect, useMemo, useState } from 'react';

import { getArtist } from '../db/repository/artists';
import { rankTopArtists, type TopArtist } from '../services/personalMixService';
import { albumListsStore } from '../store/albumListsStore';
import { completedScrobbleStore } from '../store/completedScrobbleStore';
import { getDb } from '../store/persistence/db';

/** The user's most-played artists (see `rankTopArtists`). */
export function useTopArtists(limit: number): TopArtist[] {
  const artistCounts = completedScrobbleStore((s) => s.aggregates.artistCounts);
  const frequentlyPlayed = albumListsStore((s) => s.frequentlyPlayed);
  return useMemo(
    () => rankTopArtists(artistCounts, frequentlyPlayed, limit),
    [artistCounts, frequentlyPlayed, limit],
  );
}

/** An artist's cover-art token from the synced library; undefined until read or when absent. */
export function useArtistCoverArt(artistId: string | undefined): string | undefined {
  const [coverArt, setCoverArt] = useState<string | undefined>(undefined);
  useEffect(() => {
    const db = getDb();
    if (!artistId || !db) return;
    let alive = true;
    void getArtist(db, artistId)
      .then((row) => {
        const value = row?.cover_art;
        if (alive) setCoverArt(typeof value === 'string' ? value : undefined);
      })
      .catch(() => { /* placeholder cover */ });
    return () => { alive = false; };
  }, [artistId]);
  return coverArt;
}
