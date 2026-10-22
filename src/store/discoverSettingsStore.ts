import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { kvStorage } from './persistence';

interface DiscoverSettingsState {
  /** Base URL of the navidrome-discover backend, without a trailing slash. */
  baseUrl: string | null;
  token: string | null;
  /** Last.fm API key for artist listener and play counts; null leaves them out. */
  lastfmApiKey: string | null;
  setConnection: (baseUrl: string, token: string) => void;
  clearConnection: () => void;
  setLastfmApiKey: (key: string) => void;
}

export const discoverSettingsStore = create<DiscoverSettingsState>()(
  persist(
    (set) => ({
      baseUrl: null,
      token: null,
      lastfmApiKey: null,
      setConnection: (baseUrl, token) =>
        set({
          baseUrl: baseUrl.trim().replace(/\/+$/, '') || null,
          token: token.trim() || null,
        }),
      clearConnection: () => set({ baseUrl: null, token: null }),
      setLastfmApiKey: (key) => set({ lastfmApiKey: key.trim() || null }),
    }),
    {
      name: 'substreamer-discover-settings',
      storage: createJSONStorage(() => kvStorage),
      partialize: (state) => ({ baseUrl: state.baseUrl, token: state.token, lastfmApiKey: state.lastfmApiKey }),
    },
  ),
);
