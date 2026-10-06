import { create } from 'zustand';

import { type Share } from '../services/subsonicService';

interface EditShareState {
  visible: boolean;
  share: Share | null;

  show: (share: Share) => void;
  hide: () => void;
}

export const editShareStore = create<EditShareState>()((set) => ({
  visible: false,
  share: null,

  show: (share) => set({ visible: true, share }),
  hide: () => set({ visible: false, share: null }),
}));
