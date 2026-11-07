import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { kvStorage } from './persistence';

interface ProfileState {
  /** file:// URI of the profile picture copied into the app's documents; null shows initials. */
  avatarUri: string | null;
  /** Bumped on every new picture so cached image views reload the same path. */
  avatarVersion: number;
  /** When the picture last changed (here or on another device), ISO; null before any change. */
  avatarUpdatedAt: string | null;
  /** True while a change made here has not reached the server yet. */
  avatarDirty: boolean;
  /** The Spotify-style side menu opened from the avatar. Not persisted. */
  menuVisible: boolean;
  /** A change made on this device: marked dirty until the server has it. */
  setAvatar: (uri: string | null) => void;
  /** A picture that came from the server (another device's change). */
  applyServerAvatar: (uri: string | null, updatedAt: string) => void;
  markAvatarSynced: (updatedAt: string) => void;
  openMenu: () => void;
  closeMenu: () => void;
}

export const profileStore = create<ProfileState>()(
  persist(
    (set) => ({
      avatarUri: null,
      avatarVersion: 0,
      avatarUpdatedAt: null,
      avatarDirty: false,
      menuVisible: false,
      setAvatar: (uri) =>
        set((s) => ({
          avatarUri: uri,
          avatarVersion: s.avatarVersion + 1,
          avatarUpdatedAt: new Date().toISOString(),
          avatarDirty: true,
        })),
      applyServerAvatar: (uri, updatedAt) =>
        set((s) => ({ avatarUri: uri, avatarVersion: s.avatarVersion + 1, avatarUpdatedAt: updatedAt, avatarDirty: false })),
      markAvatarSynced: (updatedAt) =>
        set((s) => (s.avatarUpdatedAt === updatedAt ? { avatarDirty: false } : {})),
      openMenu: () => set({ menuVisible: true }),
      closeMenu: () => set({ menuVisible: false }),
    }),
    {
      name: 'substreamer-profile',
      storage: createJSONStorage(() => kvStorage),
      partialize: (state) => ({
        avatarUri: state.avatarUri,
        avatarVersion: state.avatarVersion,
        avatarUpdatedAt: state.avatarUpdatedAt,
        avatarDirty: state.avatarDirty,
      }),
    },
  ),
);
