import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { checkNewMusic, NEW_MUSIC_NOTIFICATION_KIND } from '../services/newMusicAlertService';
import { syncNewMusicTaskRegistration } from '../services/newMusicBackgroundTask';
import { newMusicAlertsStore } from '../store/newMusicAlertsStore';

/** Check again while the app runs (also in the background while music plays). */
const CHECK_INTERVAL_MS = 30 * 60 * 1000;
/** Coming back to the app checks at most this often. */
const RESUME_GAP_MS = 10 * 60 * 1000;

/**
 * New-release and arrived-request notifications (see `newMusicAlertService`): asks for the
 * notification permission once, keeps the background task registered, checks on start,
 * on resume and every half hour, and opens the album when a notification is tapped.
 */
export function useNewMusicAlerts(enabled: boolean) {
  const router = useRouter();
  const lastCheck = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const run = () => {
      lastCheck.current = Date.now();
      void checkNewMusic();
    };

    void (async () => {
      try {
        const { status, canAskAgain } = await Notifications.getPermissionsAsync();
        if (status !== 'granted' && canAskAgain) await Notifications.requestPermissionsAsync();
      } catch {
        /* no permission: checks still run and post nothing */
      }
      await syncNewMusicTaskRegistration().catch(() => {});
      run();
    })();

    const interval = setInterval(run, CHECK_INTERVAL_MS);
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active' && Date.now() - lastCheck.current > RESUME_GAP_MS) run();
    });
    const toggles = newMusicAlertsStore.subscribe((s, prev) => {
      if (s.releasesEnabled !== prev.releasesEnabled || s.requestsEnabled !== prev.requestsEnabled) {
        void syncNewMusicTaskRegistration().catch(() => {});
      }
    });
    return () => {
      clearInterval(interval);
      appState.remove();
      toggles();
    };
  }, [enabled]);

  const lastResponse = Notifications.useLastNotificationResponse();
  const handledId = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || !lastResponse) return;
    const { identifier, content } = lastResponse.notification.request;
    const data = content.data as { kind?: string; albumId?: string; list?: string } | undefined;
    if (data?.kind !== NEW_MUSIC_NOTIFICATION_KIND || handledId.current === identifier) return;
    handledId.current = identifier;
    if (data.albumId) router.push(`/album/${data.albumId}`);
    else if (data.list) router.push({ pathname: '/album-list', params: { type: data.list } });
  }, [enabled, lastResponse, router]);
}
