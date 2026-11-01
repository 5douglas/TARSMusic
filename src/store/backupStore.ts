import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { kvStorage } from './persistence';

interface BackupState {
  autoBackupEnabled: boolean;
  lastBackupTimes: Record<string, number>;
  /** Per identity: `createdAt` of the server backup last uploaded or merged here. */
  serverSyncedAt: Record<string, string>;
  /** Per identity: the server backup has been checked (and merged) since login, so it is
   *  safe to overwrite it with this device's data. */
  serverChecked: Record<string, boolean>;

  setAutoBackupEnabled: (enabled: boolean) => void;
  setLastBackupTime: (identityKey: string, time: number) => void;
  getLastBackupTime: (identityKey: string) => number | null;
  setServerSynced: (identityKey: string, createdAt: string) => void;
  setServerChecked: (identityKey: string, checked: boolean) => void;
}

const PERSIST_KEY = 'substreamer-backup-settings';

export function migrateBackupState(persisted: any, version: number) {
  if (!persisted || typeof persisted !== 'object') {
    // Fresh install or corrupt blob — return safe defaults so the
    // Zustand persist pipeline can't throw on destructure.
    return { autoBackupEnabled: true, lastBackupTimes: {} };
  }
  if (version === 0 || version === undefined) {
    // Migrate from scalar lastBackupTime to keyed lastBackupTimes.
    // We can't determine which identity the old value belonged to, so discard it.
    // Worst case: one extra auto-backup fires on the next launch.
    const { lastBackupTime: _, ...rest } = persisted;
    return { ...rest, lastBackupTimes: {} };
  }
  return persisted;
}

export const backupStore = create<BackupState>()(
  persist(
    (set, get) => ({
      autoBackupEnabled: true,
      lastBackupTimes: {},
      serverSyncedAt: {},
      serverChecked: {},

      setAutoBackupEnabled: (autoBackupEnabled) => set({ autoBackupEnabled }),
      setLastBackupTime: (identityKey, time) =>
        set((s) => ({ lastBackupTimes: { ...s.lastBackupTimes, [identityKey]: time } })),
      getLastBackupTime: (identityKey) => get().lastBackupTimes[identityKey] ?? null,
      setServerSynced: (identityKey, createdAt) =>
        set((s) => ({ serverSyncedAt: { ...s.serverSyncedAt, [identityKey]: createdAt } })),
      setServerChecked: (identityKey, checked) =>
        set((s) => ({ serverChecked: { ...s.serverChecked, [identityKey]: checked } })),
    }),
    {
      name: PERSIST_KEY,
      version: 1,
      storage: createJSONStorage(() => kvStorage),
      partialize: (state) => ({
        autoBackupEnabled: state.autoBackupEnabled,
        lastBackupTimes: state.lastBackupTimes,
        serverSyncedAt: state.serverSyncedAt,
        serverChecked: state.serverChecked,
      }),
      migrate: migrateBackupState,
    }
  )
);
