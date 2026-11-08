/**
 * Client for the TARSMusic chat service (server/chat), reached at `<Discover URL>/chat`.
 * Every request carries the user's Subsonic credentials; the service checks them with
 * Navidrome, so the chat identity is the Navidrome account.
 */
import { discoverSettingsStore } from '../store/discoverSettingsStore';
import { getSubsonicAuthHeaders } from './subsonicService';

/** A song, album, artist or playlist sent as a card. `id` is the Navidrome id. */
export interface ChatShare {
  kind: 'song' | 'album' | 'artist' | 'playlist';
  id: string;
  title?: string;
  subtitle?: string;
  coverArt?: string;
}

export interface ChatMessage {
  id: number;
  from: string;
  to: string;
  text: string;
  share: ChatShare | null;
  sentAt: number;
  readAt: number | null;
}

export interface ChatUser {
  username: string;
  name: string;
  contact?: boolean;
}

export interface ChatConversation {
  username: string;
  name: string;
  last: ChatMessage;
  unread: number;
}

function chatBase(): string | null {
  const { baseUrl } = discoverSettingsStore.getState();
  return baseUrl ? `${baseUrl}/chat` : null;
}

export function isChatConfigured(): boolean {
  return chatBase() !== null;
}

async function request<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: object): Promise<T | null> {
  const base = chatBase();
  if (!base) return null;
  const auth = await getSubsonicAuthHeaders();
  if (!auth) return null;
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: body ? { ...auth, 'Content-Type': 'application/json' } : auth,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    // Offline or the service is down: callers show their error state.
    return null;
  }
}

export async function fetchConversations(): Promise<ChatConversation[] | null> {
  const data = await request<{ items: ChatConversation[] }>('GET', '/conversations');
  return Array.isArray(data?.items) ? data.items : null;
}

/** The account with exactly this username (case ignored), or null when there is none. */
export async function lookupChatUser(username: string): Promise<ChatUser | null> {
  const data = await request<{ user?: ChatUser }>(
    'GET',
    `/users/lookup?username=${encodeURIComponent(username.trim())}`,
  );
  return data?.user ?? null;
}

export async function fetchContacts(): Promise<ChatUser[] | null> {
  const data = await request<{ items: ChatUser[] }>('GET', '/contacts');
  return Array.isArray(data?.items) ? data.items : null;
}

export async function addContact(username: string): Promise<boolean> {
  const data = await request<{ ok?: boolean }>('POST', '/contacts', { username });
  return data?.ok === true;
}

export async function removeContact(username: string): Promise<boolean> {
  const data = await request<{ ok?: boolean }>('DELETE', `/contacts/${encodeURIComponent(username)}`);
  return data?.ok === true;
}

/** Latest page of a conversation, newer messages (`after`), or older ones (`before`). */
export async function fetchMessages(
  peer: string,
  opts: { after?: number; before?: number } = {},
): Promise<ChatMessage[] | null> {
  const params = new URLSearchParams({ with: peer });
  if (opts.after) params.set('after', String(opts.after));
  if (opts.before) params.set('before', String(opts.before));
  const data = await request<{ items: ChatMessage[] }>('GET', `/messages?${params.toString()}`);
  return Array.isArray(data?.items) ? data.items : null;
}

export async function sendChatMessage(
  to: string,
  content: { text?: string; share?: ChatShare },
): Promise<ChatMessage | null> {
  const data = await request<{ message?: ChatMessage }>('POST', '/messages', { to, ...content });
  return data?.message ?? null;
}

export async function deleteChatMessage(id: number): Promise<boolean> {
  const data = await request<{ ok?: boolean }>('DELETE', `/messages/${id}`);
  return data?.ok === true;
}

export async function markConversationRead(peer: string): Promise<void> {
  await request('POST', '/read', { with: peer });
}

export async function fetchUnreadCount(): Promise<number | null> {
  const data = await request<{ count?: number }>('GET', '/unread');
  return typeof data?.count === 'number' ? data.count : null;
}
