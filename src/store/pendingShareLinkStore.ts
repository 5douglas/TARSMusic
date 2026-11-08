import { create } from 'zustand';

import type { ShareLinkTarget } from '../utils/shareLink';

interface PendingShareLinkState {
  /** A share link that arrived before the app could open it (cold start, signed out). */
  pending: ShareLinkTarget | null;
  setPending: (target: ShareLinkTarget | null) => void;
}

export const pendingShareLinkStore = create<PendingShareLinkState>()((set) => ({
  pending: null,
  setPending: (pending) => set({ pending }),
}));
