/**
 * Runs the new-music check (`checkNewMusic`) while the app is closed, through Android
 * WorkManager / iOS BGTaskScheduler via expo-background-task. The OS picks the moment, no
 * more often than `minimumInterval`.
 *
 * The task must be defined when the JS bundle loads, before any UI, because the OS can
 * start the app headless just to run it: this module is required from `index.js`.
 */
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { newMusicAlertsStore } from '../store/newMusicAlertsStore';
import { offlineModeStore } from '../store/offlineModeStore';
import { checkNewMusic } from './newMusicAlertService';

export const NEW_MUSIC_TASK = 'tarsmusic-new-music-check';
/** Minutes. */
const MINIMUM_INTERVAL = 60;

type PersistedStore = {
  persist: { hasHydrated: () => boolean; onFinishHydration: (fn: () => void) => () => void };
};

function hydrated(store: PersistedStore): Promise<void> {
  if (store.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = store.persist.onFinishHydration(() => {
      unsub();
      resolve();
    });
  });
}

TaskManager.defineTask(NEW_MUSIC_TASK, async () => {
  try {
    // A headless start has not loaded the async-persisted settings yet (the account is in
    // the synchronous auth store).
    await Promise.all([hydrated(newMusicAlertsStore), hydrated(offlineModeStore)]);
    await checkNewMusic();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/** Registers the periodic task once alerts are on; unregisters it when both are off. */
export async function syncNewMusicTaskRegistration(): Promise<void> {
  const { releasesEnabled, requestsEnabled } = newMusicAlertsStore.getState();
  const registered = await TaskManager.isTaskRegisteredAsync(NEW_MUSIC_TASK);
  if ((releasesEnabled || requestsEnabled) && !registered) {
    await BackgroundTask.registerTaskAsync(NEW_MUSIC_TASK, { minimumInterval: MINIMUM_INTERVAL });
  } else if (!releasesEnabled && !requestsEnabled && registered) {
    await BackgroundTask.unregisterTaskAsync(NEW_MUSIC_TASK);
  }
}
