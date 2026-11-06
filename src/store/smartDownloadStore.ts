import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { kvStorage } from './persistence';

export const SMART_DOWNLOAD_TOP_COUNTS = [25, 50, 100, 200, 500] as const;
export const SMART_DOWNLOAD_SIZE_OPTIONS_GB = [1, 2, 5, 10, 20, 50] as const;

export interface SmartDownloadResult {
  at: number;
  /** Songs in the smart set right now (downloaded or queued). */
  selected: number;
  /** Candidates left out because they did not fit in the size limit. */
  skippedForSpace: number;
  /** Estimated size of the smart set, in bytes. */
  estimatedBytes: number;
}

interface SmartDownloadState {
  enabled: boolean;
  includeFavorites: boolean;
  includeMostPlayed: boolean;
  mostPlayedCount: number;
  wifiOnly: boolean;
  maxSizeGB: number;
  /** Song ids whose `song:` download this feature created, and so may remove again. */
  ownedSongIds: string[];
  lastResult: SmartDownloadResult | null;
  /** Transient: a run is choosing and queueing songs. */
  running: boolean;

  setEnabled: (enabled: boolean) => void;
  setIncludeFavorites: (v: boolean) => void;
  setIncludeMostPlayed: (v: boolean) => void;
  setMostPlayedCount: (n: number) => void;
  setWifiOnly: (v: boolean) => void;
  setMaxSizeGB: (gb: number) => void;
  setOwnedSongIds: (ids: string[]) => void;
  setLastResult: (r: SmartDownloadResult | null) => void;
  setRunning: (running: boolean) => void;
}

export const smartDownloadStore = create<SmartDownloadState>()(
  persist(
    (set) => ({
      enabled: false,
      includeFavorites: true,
      includeMostPlayed: true,
      mostPlayedCount: 100,
      wifiOnly: true,
      maxSizeGB: 2,
      ownedSongIds: [],
      lastResult: null,
      running: false,

      setEnabled: (enabled) => set({ enabled }),
      setIncludeFavorites: (includeFavorites) => set({ includeFavorites }),
      setIncludeMostPlayed: (includeMostPlayed) => set({ includeMostPlayed }),
      setMostPlayedCount: (mostPlayedCount) => set({ mostPlayedCount }),
      setWifiOnly: (wifiOnly) => set({ wifiOnly }),
      setMaxSizeGB: (maxSizeGB) => set({ maxSizeGB }),
      setOwnedSongIds: (ownedSongIds) => set({ ownedSongIds }),
      setLastResult: (lastResult) => set({ lastResult }),
      setRunning: (running) => set({ running }),
    }),
    {
      name: 'tarsmusic-smart-download',
      storage: createJSONStorage(() => kvStorage),
      partialize: (state) => ({
        enabled: state.enabled,
        includeFavorites: state.includeFavorites,
        includeMostPlayed: state.includeMostPlayed,
        mostPlayedCount: state.mostPlayedCount,
        wifiOnly: state.wifiOnly,
        maxSizeGB: state.maxSizeGB,
        ownedSongIds: state.ownedSongIds,
        lastResult: state.lastResult,
      }),
    },
  ),
);
