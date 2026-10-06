import { create } from 'zustand';

interface TabletLayoutState {
  /** Whether the player is expanded to fill the main content area */
  playerExpanded: boolean;
  setPlayerExpanded: (expanded: boolean) => void;
  togglePlayerExpanded: () => void;
}

export const tabletLayoutStore = create<TabletLayoutState>()((set) => ({
  playerExpanded: false,
  setPlayerExpanded: (expanded) => set({ playerExpanded: expanded }),
  togglePlayerExpanded: () => set((s) => ({ playerExpanded: !s.playerExpanded })),
}));
