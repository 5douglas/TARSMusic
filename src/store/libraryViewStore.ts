import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { kvStorage } from './persistence';

import type { LibrarySort } from '../services/libraryItemsService';

interface LibraryViewState {
  sort: LibrarySort;
  grid: boolean;
  setSort: (sort: LibrarySort) => void;
  toggleGrid: () => void;
}

/** How the mixed Your Library list is sorted and laid out. */
export const libraryViewStore = create<LibraryViewState>()(
  persist(
    (set) => ({
      sort: 'recents',
      grid: false,
      setSort: (sort) => set({ sort }),
      toggleGrid: () => set((s) => ({ grid: !s.grid })),
    }),
    {
      name: 'substreamer-library-view',
      storage: createJSONStorage(() => kvStorage),
      partialize: (state) => ({ sort: state.sort, grid: state.grid }),
    },
  ),
);
