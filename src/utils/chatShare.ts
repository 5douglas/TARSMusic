import { router } from 'expo-router';

import type { ChatShare } from '../services/chatService';

/** Opens the contact picker that sends `share` as a card in the chat. */
export function openChatShare(share: ChatShare): void {
  router.push({ pathname: '/chat-send', params: { share: JSON.stringify(share) } });
}

/** Parses the `share` route param written by {@link openChatShare}. */
export function parseChatShareParam(raw: string | string[] | undefined): ChatShare | null {
  if (typeof raw !== 'string') return null;
  try {
    const share = JSON.parse(raw) as ChatShare;
    return share && typeof share.id === 'string' && ['song', 'album', 'artist', 'playlist'].includes(share.kind)
      ? share
      : null;
  } catch {
    return null;
  }
}
