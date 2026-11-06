import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { kvStorage } from './persistence';

import type { Child } from '../services/subsonicService';

/** One "Daily Mix": a group of the user's artists that share a genre. */
export interface DailyMixDefinition {
  /** Stable across days (derived from the genre), so per-mix caches key on it. */
  id: string;
  /** 1-based position: "Daily Mix 1" is the group the user plays most. */
  number: number;
  /** Display name of the shared genre; null for a group built without genre data. */
  genre: string | null;
  /** The group's artists, most played first. */
  artists: { id: string; name: string }[];
}

export interface PersonalMixState {
  /** Local calendar day (`YYYY-MM-DD`) the daily recommendations were built for. */
  dailyDate: string | null;
  /** That day's recommendations, kept so the list stays the same all day. */
  dailySongs: Child[];
  setDaily: (date: string, songs: Child[]) => void;
  /** Local day the Daily Mix groups (and their songs) were built for. */
  dailyMixDate: string | null;
  dailyMixes: DailyMixDefinition[];
  /** That day's songs per Daily Mix id; filled when a mix is first opened or played. */
  dailyMixSongs: Record<string, Child[]>;
  setDailyMixes: (date: string, mixes: DailyMixDefinition[]) => void;
  setDailyMixSongs: (date: string, id: string, songs: Child[]) => void;
}

export const personalMixStore = create<PersonalMixState>()(
  persist(
    (set) => ({
      dailyDate: null,
      dailySongs: [],
      setDaily: (date, songs) => set({ dailyDate: date, dailySongs: songs }),
      dailyMixDate: null,
      dailyMixes: [],
      dailyMixSongs: {},
      setDailyMixes: (date, mixes) =>
        set((s) => ({
          dailyMixDate: date,
          dailyMixes: mixes,
          // A new day starts every mix afresh.
          dailyMixSongs: s.dailyMixDate === date ? s.dailyMixSongs : {},
        })),
      setDailyMixSongs: (date, id, songs) =>
        set((s) => (s.dailyMixDate === date ? { dailyMixSongs: { ...s.dailyMixSongs, [id]: songs } } : {})),
    }),
    {
      name: 'substreamer-personal-mixes',
      storage: createJSONStorage(() => kvStorage),
      partialize: (state) => ({
        dailyDate: state.dailyDate,
        dailySongs: state.dailySongs,
        dailyMixDate: state.dailyMixDate,
        dailyMixes: state.dailyMixes,
        dailyMixSongs: state.dailyMixSongs,
      }),
    },
  ),
);
