import { create } from 'zustand';

import { fetchUnreadCount, type ChatConversation } from '../services/chatService';

interface ChatState {
  /** Unread messages across all conversations; 0 when the chat is unreachable. */
  unread: number;
  /** Username of the conversation on screen, so its new messages don't pop a banner. */
  activePeer: string | null;
  /** The newest incoming message to announce in the in-app banner. */
  banner: ChatConversation | null;
  setUnread: (unread: number) => void;
  setActivePeer: (peer: string | null) => void;
  showBanner: (conversation: ChatConversation) => void;
  hideBanner: () => void;
  refreshUnread: () => Promise<void>;
}

export const chatStore = create<ChatState>()((set) => ({
  unread: 0,
  activePeer: null,
  banner: null,
  setUnread: (unread) => set({ unread }),
  setActivePeer: (activePeer) => set({ activePeer }),
  showBanner: (banner) => set({ banner }),
  hideBanner: () => set({ banner: null }),
  refreshUnread: async () => {
    const count = await fetchUnreadCount();
    if (count !== null) set({ unread: count });
  },
}));
