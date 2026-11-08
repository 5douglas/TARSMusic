import { useEffect } from 'react';
import { AppState } from 'react-native';

import { ensureDiscoverSession } from '../services/discoverAuthService';
import { shareAvatarWithChat } from '../services/profileSyncService';
import { authStore } from '../store/authStore';

/**
 * Connects Discover with the logged-in Navidrome account (no token to type) and keeps the
 * session renewed: on login, on an account or server change, and whenever the app returns
 * to the foreground.
 */
export function useDiscoverAutoConnect(enabled: boolean) {
  const serverUrl = authStore((s) => s.primaryServerUrl ?? s.serverUrl);
  const username = authStore((s) => s.username);

  useEffect(() => {
    if (!enabled) return;
    // Once connected, the chat (same address) can show this user's picture to others.
    void ensureDiscoverSession().then((ok) => {
      if (ok) void shareAvatarWithChat();
    });
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void ensureDiscoverSession();
    });
    return () => sub.remove();
  }, [enabled, serverUrl, username]);
}
