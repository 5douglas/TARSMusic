import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { kvStorage } from './persistence';

interface LyricsTranslationState {
  /** Show the translation under each lyrics line. Remembered across songs and launches. */
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

export const lyricsTranslationStore = create<LyricsTranslationState>()(
  persist(
    (set) => ({
      enabled: false,
      setEnabled: (enabled) => set({ enabled }),
    }),
    {
      name: 'tarsmusic-lyrics-translation',
      version: 1,
      storage: createJSONStorage(() => kvStorage),
      partialize: (s) => ({ enabled: s.enabled }),
    },
  ),
);
