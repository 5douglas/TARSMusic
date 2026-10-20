import { useCallback, useEffect, useState } from 'react';

import { fetchDiscoverHome, type DiscoverHome } from '../services/discoverService';
import { discoverSettingsStore } from '../store/discoverSettingsStore';

/**
 * The Discover home sections (releases, mixes, charts) for embedding in Home. Loads once per
 * connection while `enabled`; `refresh` asks the backend to rebuild and keeps the current
 * sections if that fails.
 */
export function useDiscoverHome(enabled: boolean) {
  const baseUrl = discoverSettingsStore((s) => s.baseUrl);
  const token = discoverSettingsStore((s) => s.token);
  const configured = !!baseUrl && !!token;
  const [home, setHome] = useState<DiscoverHome | null>(null);

  useEffect(() => {
    if (!enabled || !configured) return;
    let alive = true;
    void fetchDiscoverHome(false).then((res) => {
      if (alive) setHome(res);
    });
    return () => {
      alive = false;
    };
  }, [enabled, configured, baseUrl, token]);

  const refresh = useCallback(async () => {
    const res = await fetchDiscoverHome(true);
    if (res) setHome(res);
  }, []);

  return { home: enabled && configured ? home : null, refresh };
}
