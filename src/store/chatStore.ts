import { create } from 'zustand';

import { fetchUnreadCount } from '../services/chatService';

interface ChatState {
  /** Unread messages across all conversations; 0 when the chat is unreachable. */
  unread: number;
  refreshUnread: () => Promise<void>;
}

export const chatStore = create<ChatState>()((set) => ({
  unread: 0,
  refreshUnread: async () => {
    const count = await fetchUnreadCount();
    if (count !== null) set({ unread: count });
  },
}));
