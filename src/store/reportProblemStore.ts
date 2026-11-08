import { create } from 'zustand';

export interface ReportSong {
  id: string;
  title: string;
  artist?: string;
}

interface ReportProblemState {
  visible: boolean;
  song: ReportSong | null;
  show: (song: ReportSong) => void;
  hide: () => void;
}

/** Opens the "Report a problem" sheet for one song from anywhere (the ⋯ menu). */
export const reportProblemStore = create<ReportProblemState>()((set) => ({
  visible: false,
  song: null,
  show: (song) => set({ visible: true, song }),
  hide: () => set({ visible: false }),
}));
