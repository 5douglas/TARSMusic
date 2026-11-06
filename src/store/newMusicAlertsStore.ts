import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { kvStorage } from './persistence';

/** A Deezer download the user asked for, waiting to show up in the library. */
export interface PendingRequest {
  /** Album the download lands in (the track's album for a single track). */
  album: string;
  artist: string;
  /** What the user picked: the album, or one track of it. */
  title: string;
  wholeAlbum: boolean;
  requestedAt: number;
}

/** Requests that never matched an album are dropped after this long. */
export const REQUEST_TTL_MS = 14 * 24 * 60 * 60 * 1000;

interface NewMusicAlertsState {
  /** Notify about new albums from artists the user listens to. */
  releasesEnabled: boolean;
  /** Notify when a requested download arrives in the library. */
  requestsEnabled: boolean;
  /**
   * Newest `created` time (ms) of any album already looked at; albums added after it are
   * new. Null until the first check, which only records it so the existing library is not
   * announced.
   */
  lastSeenCreated: number | null;
  requests: PendingRequest[];
  setReleasesEnabled: (enabled: boolean) => void;
  setRequestsEnabled: (enabled: boolean) => void;
  setLastSeenCreated: (ms: number) => void;
  addRequest: (request: Omit<PendingRequest, 'requestedAt'>) => void;
  setRequests: (requests: PendingRequest[]) => void;
}

export const newMusicAlertsStore = create<NewMusicAlertsState>()(
  persist(
    (set) => ({
      releasesEnabled: true,
      requestsEnabled: true,
      lastSeenCreated: null,
      requests: [],
      setReleasesEnabled: (releasesEnabled) => set({ releasesEnabled }),
      setRequestsEnabled: (requestsEnabled) => set({ requestsEnabled }),
      setLastSeenCreated: (lastSeenCreated) => set({ lastSeenCreated }),
      addRequest: (request) =>
        set((s) => ({ requests: [...s.requests, { ...request, requestedAt: Date.now() }] })),
      setRequests: (requests) => set({ requests }),
    }),
    {
      name: 'tarsmusic-new-music-alerts',
      version: 1,
      storage: createJSONStorage(() => kvStorage),
      partialize: (s) => ({
        releasesEnabled: s.releasesEnabled,
        requestsEnabled: s.requestsEnabled,
        lastSeenCreated: s.lastSeenCreated,
        requests: s.requests,
      }),
    },
  ),
);
