import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { kvStorage } from './persistence';

/**
 * How the app holds its Discover credential:
 * - `token`: a static backend token typed in Settings (the admin's DISCOVER_TOKEN, or a
 *   self-hosted backend without Navidrome login).
 * - `login`: a short-lived per-user session the backend issued after checking the user's
 *   Navidrome credentials. Renewed by `discoverAuthService`, never typed by the user.
 */
export type DiscoverAuthMode = 'token' | 'login';

interface DiscoverSettingsState {
  /** Base URL of the navidrome-discover backend, without a trailing slash. */
  baseUrl: string | null;
  token: string | null;
  /** Null on installs from before sessions existed; those hold a static token. */
  mode: DiscoverAuthMode | null;
  /** Session expiry (epoch ms) for `login` mode. */
  tokenExpiresAt: number | null;
  /** `serverUrl|username` the `login` session belongs to; another account drops it. */
  account: string | null;
  /** The user disconnected on purpose: do not connect automatically again. */
  autoConnectDisabled: boolean;
  /** Last.fm API key for artist listener and play counts; null leaves them out. */
  lastfmApiKey: string | null;
  setConnection: (baseUrl: string, token: string) => void;
  setSession: (baseUrl: string, token: string, expiresAt: number, account: string) => void;
  clearConnection: () => void;
  setAutoConnectDisabled: (disabled: boolean) => void;
  setLastfmApiKey: (key: string) => void;
}

const emptyConnection = {
  baseUrl: null,
  token: null,
  mode: null,
  tokenExpiresAt: null,
  account: null,
} as const;

export function normalizeDiscoverUrl(url: string): string | null {
  return url.trim().replace(/\/+$/, '') || null;
}

export const discoverSettingsStore = create<DiscoverSettingsState>()(
  persist(
    (set) => ({
      ...emptyConnection,
      autoConnectDisabled: false,
      lastfmApiKey: null,
      setConnection: (baseUrl, token) =>
        set({
          ...emptyConnection,
          baseUrl: normalizeDiscoverUrl(baseUrl),
          token: token.trim() || null,
          mode: 'token',
        }),
      setSession: (baseUrl, token, expiresAt, account) =>
        set({
          baseUrl: normalizeDiscoverUrl(baseUrl),
          token,
          mode: 'login',
          tokenExpiresAt: expiresAt,
          account,
          autoConnectDisabled: false,
        }),
      clearConnection: () => set({ ...emptyConnection }),
      setAutoConnectDisabled: (disabled) => set({ autoConnectDisabled: disabled }),
      setLastfmApiKey: (key) => set({ lastfmApiKey: key.trim() || null }),
    }),
    {
      name: 'substreamer-discover-settings',
      storage: createJSONStorage(() => kvStorage),
      partialize: (state) => ({
        baseUrl: state.baseUrl,
        token: state.token,
        mode: state.mode,
        tokenExpiresAt: state.tokenExpiresAt,
        account: state.account,
        autoConnectDisabled: state.autoConnectDisabled,
        lastfmApiKey: state.lastfmApiKey,
      }),
    },
  ),
);
