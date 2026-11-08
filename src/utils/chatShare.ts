import { router } from 'expo-router';

import type { ChatShare } from '../services/chatService';
import { playTrack } from '../services/playerService';
import { getSong } from '../services/subsonicService';

/** Opens the contact picker that sends `share` as a card in the chat. */
export function openChatShare(share: ChatShare): void {
  router.push({ pathname: '/chat-send', params: { share: JSON.stringify(share) } });
}

/** Opens what a chat card points at: album, artist or playlist page; a song starts playing. */
export async function openChatShareTarget(share: ChatShare): Promise<void> {
  if (share.kind === 'album') router.push(`/album/${share.id}`);
  else if (share.kind === 'artist') router.push(`/artist/${share.id}`);
  else if (share.kind === 'playlist') router.push(`/playlist/${share.id}`);
  else {
    const song = await getSong(share.id);
    if (song) await playTrack(song, [song]);
  }
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
