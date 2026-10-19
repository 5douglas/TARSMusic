import { create } from 'zustand';

interface DiscoverPreviewState {
  /** Deezer track id of the preview currently playing, or null. */
  playingId: number | null;
  setPlayingId: (id: number | null) => void;
}

export const discoverPreviewStore = create<DiscoverPreviewState>()((set) => ({
  playingId: null,
  setPlayingId: (playingId) => set({ playingId }),
}));
