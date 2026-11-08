import { create } from 'zustand';

import type { ShareableItem } from '../services/shareLinkService';

export interface ShareSheetItem extends ShareableItem {
  /** Resolved cover art id for the sheet header and the chat card. */
  coverArt?: string;
}

interface ShareSheetState {
  visible: boolean;
  item: ShareSheetItem | null;
  show: (item: ShareSheetItem) => void;
  hide: () => void;
}

/** The "Compartilhar" sheet: chat, copy link, other apps and the public Navidrome link. */
export const shareSheetStore = create<ShareSheetState>()((set) => ({
  visible: false,
  item: null,
  show: (item) => set({ visible: true, item }),
  hide: () => set({ visible: false }),
}));
