import { create } from 'zustand';

import { clearAllLyrics, deleteLyrics, loadLyrics, saveLyrics } from './persistence/lyricsTable';

import { getLyricsForTrack, type LyricsData } from '../services/subsonicService';
import { withTimeout } from '../utils/withTimeout';

/** Hard budget for a single lyrics fetch (OpenSubsonic + classic fallback). */
const FETCH_TIMEOUT_MS = 15_000;

export type LyricsErrorKind = 'timeout' | 'error';

interface LyricsState {
  /** Session cache indexed by track ID. NOT persisted — the `lyrics` table is. */
  entries: Record<string, LyricsData>;
  /** Per-track loading flags. */
  loading: Record<string, boolean>;
  /** Per-track error flags. Set when the last fetch failed. */
  errors: Record<string, LyricsErrorKind>;
  /** Bumped on every table mutation so SQL-derived views (the counts card) re-read. */
  revision: number;
  /** Resolve lyrics for a track: memory, then the table, then the network. */
  fetchLyrics: (
    trackId: string,
    artist?: string,
    title?: string,
  ) => Promise<LyricsData | null>;
  /**
   * Refetch from the server, consulting neither cache, and overwrite the stored row.
   * A server that now returns nothing leaves the existing row alone.
   */
  refreshLyrics: (
    trackId: string,
    artist?: string,
    title?: string,
  ) => Promise<LyricsData | null>;
  /** Store lyrics the app got elsewhere (a fix from the server), in memory and on disk. */
  setLyrics: (trackId: string, data: LyricsData) => Promise<void>;
  /** Move one song's synced lyrics later (+) or earlier (-) by `deltaMs`; returns the new total offset. */
  adjustOffset: (trackId: string, deltaMs: number) => number | null;
  /** Drop one song's cached lyrics, in memory and on disk. */
  removeLyrics: (trackId: string) => Promise<void>;
  /** Clear all cached lyrics, in memory and on disk. */
  clearLyrics: () => Promise<void>;
}

export const lyricsStore = create<LyricsState>()((set, get) => {
  const beginLoad = (trackId: string) => {
    set({
      loading: { ...get().loading, [trackId]: true },
      errors: (() => {
        const { [trackId]: _, ...rest } = get().errors;
        return rest;
      })(),
    });
  };
  const clearLoading = (trackId: string) => {
    const { [trackId]: _, ...rest } = get().loading;
    set({ loading: rest });
  };
  const setError = (trackId: string, kind: LyricsErrorKind) => {
    set({ errors: { ...get().errors, [trackId]: kind } });
  };
  const remember = (trackId: string, data: LyricsData) => {
    set({ entries: { ...get().entries, [trackId]: data }, revision: get().revision + 1 });
  };

  /**
   * Network → row → memory. Shared by the cache-miss path and the browser's explicit
   * refresh, which differ only in whether the caches are consulted first.
   */
  const fetchFromServer = async (
    trackId: string,
    artist?: string,
    title?: string,
  ): Promise<LyricsData | null> => {
    const result = await withTimeout(
      async () => getLyricsForTrack(trackId, artist, title),
      FETCH_TIMEOUT_MS,
    );

    if (result === 'timeout') {
      setError(trackId, 'timeout');
      return null;
    }

    // Well-defined "no lyrics for this track" case. No entry, no error, no row.
    if (result === null) return null;

    await saveLyrics(trackId, result, title, artist);
    remember(trackId, result);
    return result;
  };

  return {
    entries: {},
    loading: {},
    errors: {},
    revision: 0,

    fetchLyrics: async (trackId, artist, title) => {
      const cached = get().entries[trackId];
      if (cached) return cached;

      beginLoad(trackId);
      try {
        const stored = await loadLyrics(trackId);
        if (stored !== null) {
          remember(trackId, stored);
          return stored;
        }
        return await fetchFromServer(trackId, artist, title);
      } catch {
        setError(trackId, 'error');
        return null;
      } finally {
        clearLoading(trackId);
      }
    },

    refreshLyrics: async (trackId, artist, title) => {
      beginLoad(trackId);
      try {
        return await fetchFromServer(trackId, artist, title);
      } catch {
        setError(trackId, 'error');
        return null;
      } finally {
        clearLoading(trackId);
      }
    },

    setLyrics: async (trackId, data) => {
      remember(trackId, data);
      await saveLyrics(trackId, data);
    },

    adjustOffset: (trackId, deltaMs) => {
      const entry = get().entries[trackId];
      if (!entry || !entry.synced) return null;
      const next = { ...entry, offsetMs: entry.offsetMs + deltaMs };
      remember(trackId, next);
      void saveLyrics(trackId, next);
      return next.offsetMs;
    },

    removeLyrics: async (trackId) => {
      const { [trackId]: _, ...entries } = get().entries;
      set({ entries, revision: get().revision + 1 });
      await deleteLyrics(trackId);
    },

    clearLyrics: async () => {
      set({ entries: {}, loading: {}, errors: {}, revision: get().revision + 1 });
      await clearAllLyrics();
    },
  };
});
