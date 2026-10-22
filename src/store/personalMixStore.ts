import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { kvStorage } from './persistence';

import type { Child } from '../services/subsonicService';

export interface PersonalMixState {
  /** Local calendar day (`YYYY-MM-DD`) the daily recommendations were built for. */
  dailyDate: string | null;
  /** That day's recommendations, kept so the list stays the same all day. */
  dailySongs: Child[];
  setDaily: (date: string, songs: Child[]) => void;
}

export const personalMixStore = create<PersonalMixState>()(
  persist(
    (set) => ({
      dailyDate: null,
      dailySongs: [],
      setDaily: (date, songs) => set({ dailyDate: date, dailySongs: songs }),
    }),
    {
      name: 'substreamer-personal-mixes',
      storage: createJSONStorage(() => kvStorage),
      partialize: (state) => ({ dailyDate: state.dailyDate, dailySongs: state.dailySongs }),
    },
  ),
);
