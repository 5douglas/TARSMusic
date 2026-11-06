import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { kvStorage } from './persistence';

export interface AutoplayState {
  /** Infinite radio: when the queue is about to run out, keep playing similar songs. */
  autoplayEnabled: boolean;
  setAutoplayEnabled: (enabled: boolean) => void;
}

export const autoplayStore = create<AutoplayState>()(
  persist(
    (set) => ({
      autoplayEnabled: true,
      setAutoplayEnabled: (autoplayEnabled) => set({ autoplayEnabled }),
    }),
    {
      name: 'tarsmusic-autoplay',
      storage: createJSONStorage(() => kvStorage),
      partialize: (state) => ({ autoplayEnabled: state.autoplayEnabled }),
    },
  ),
);
