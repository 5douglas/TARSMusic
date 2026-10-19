import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { kvStorage } from './persistence';

interface DiscoverSettingsState {
  /** Base URL of the navidrome-discover backend, without a trailing slash. */
  baseUrl: string | null;
  token: string | null;
  setConnection: (baseUrl: string, token: string) => void;
  clearConnection: () => void;
}

export const discoverSettingsStore = create<DiscoverSettingsState>()(
  persist(
    (set) => ({
      baseUrl: null,
      token: null,
      setConnection: (baseUrl, token) =>
        set({
          baseUrl: baseUrl.trim().replace(/\/+$/, '') || null,
          token: token.trim() || null,
        }),
      clearConnection: () => set({ baseUrl: null, token: null }),
    }),
    {
      name: 'substreamer-discover-settings',
      storage: createJSONStorage(() => kvStorage),
      partialize: (state) => ({ baseUrl: state.baseUrl, token: state.token }),
    },
  ),
);
