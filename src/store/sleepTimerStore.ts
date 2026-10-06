import { create } from 'zustand';

interface SleepTimerState {
  /** Unix epoch end time (seconds), or null if inactive. */
  endTime: number | null;
  /** Whether the timer is in "end of current track" mode. */
  endOfTrack: boolean;
  /** Countdown seconds remaining (JS-side, updated every second). */
  remaining: number | null;
  /** Whether the sleep timer sheet is visible. */
  sheetVisible: boolean;

  setTimer: (endTime: number | null, endOfTrack: boolean) => void;
  setRemaining: (remaining: number | null) => void;
  clear: () => void;
  showSheet: () => void;
  hideSheet: () => void;
}

export const sleepTimerStore = create<SleepTimerState>()((set) => ({
  endTime: null,
  endOfTrack: false,
  remaining: null,
  sheetVisible: false,

  setTimer: (endTime, endOfTrack) => set({ endTime, endOfTrack }),
  setRemaining: (remaining) => set({ remaining }),
  clear: () => set({ endTime: null, endOfTrack: false, remaining: null }),
  showSheet: () => set({ sheetVisible: true }),
  hideSheet: () => set({ sheetVisible: false }),
}));
