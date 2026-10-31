import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { kvStorage } from './persistence';

interface ProfileState {
  /** file:// URI of the profile picture copied into the app's documents; null shows initials. */
  avatarUri: string | null;
  /** Bumped on every new picture so cached image views reload the same path. */
  avatarVersion: number;
  /** The Spotify-style side menu opened from the avatar. Not persisted. */
  menuVisible: boolean;
  setAvatar: (uri: string | null) => void;
  openMenu: () => void;
  closeMenu: () => void;
}

export const profileStore = create<ProfileState>()(
  persist(
    (set) => ({
      avatarUri: null,
      avatarVersion: 0,
      menuVisible: false,
      setAvatar: (uri) => set((s) => ({ avatarUri: uri, avatarVersion: s.avatarVersion + 1 })),
      openMenu: () => set({ menuVisible: true }),
      closeMenu: () => set({ menuVisible: false }),
    }),
    {
      name: 'substreamer-profile',
      storage: createJSONStorage(() => kvStorage),
      partialize: (state) => ({ avatarUri: state.avatarUri, avatarVersion: state.avatarVersion }),
    },
  ),
);
