import { create } from 'zustand';

interface DevOptionsState {
  enabled: boolean;
  enable: () => void;
}

export const devOptionsStore = create<DevOptionsState>()((set) => ({
  enabled: false,
  enable: () => set({ enabled: true }),
}));
