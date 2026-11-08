/**
 * Keeps the profile picture on the music server, so it follows the account to every device.
 *
 * Like the server backup, it travels in the comment of a private playlist owned by the user
 * (`SERVER_PROFILE_PLAYLIST_NAME`), since the Subsonic API has no place for app data. The
 * comment holds a small JSON envelope with the picture as base64 (resized before upload) and
 * the time it changed. The newest change wins: a picture picked here is sent at once (and
 * retried on the next sync if that fails); a newer one found on the server replaces the one
 * here.
 */
import { File, Paths } from 'expo-file-system';

import { authStore } from '../store/authStore';
import { profileStore } from '../store/profileStore';
import { isChatConfigured, setChatAvatar } from './chatService';
import { SERVER_PROFILE_PLAYLIST_NAME, getApi } from './subsonicService';

export const SERVER_PROFILE_MARKER = 'TARSMUSIC-PROFILE-1:';
export const AVATAR_PREFIX = 'profile-avatar-';

export interface ServerProfile {
  v: 1;
  updatedAt: string;
  /** JPEG as base64, or null when the picture was removed. */
  avatar: string | null;
}

/** Envelope in a playlist comment → the profile, or null for anything else. */
export function parseServerProfile(comment: string | null | undefined): ServerProfile | null {
  if (!comment || !comment.startsWith(SERVER_PROFILE_MARKER)) return null;
  try {
    const profile = JSON.parse(comment.slice(SERVER_PROFILE_MARKER.length)) as ServerProfile;
    if (profile?.v !== 1 || typeof profile.updatedAt !== 'string') return null;
    if (profile.avatar !== null && typeof profile.avatar !== 'string') return null;
    return profile;
  } catch {
    return null;
  }
}

async function findProfilePlaylist(): Promise<{ id: string } | null> {
  const api = getApi();
  if (!api) return null;
  const username = authStore.getState().username?.toLowerCase();
  const res = await api.getPlaylists();
  const match = (res.playlists?.playlist ?? []).find(
    (p) => p.name === SERVER_PROFILE_PLAYLIST_NAME && (!p.owner || p.owner.toLowerCase() === username),
  );
  return match ? { id: match.id } : null;
}

async function fetchServerProfile(): Promise<ServerProfile | null> {
  const api = getApi();
  if (!api) return null;
  const playlist = await findProfilePlaylist();
  if (!playlist) return null;
  const res = await api.getPlaylist({ id: playlist.id });
  return parseServerProfile(res.playlist?.comment);
}

/** Sends this device's picture to the server. Resolves true when the server has it. */
export async function pushProfileToServer(): Promise<boolean> {
  const api = getApi();
  if (!api) return false;
  const { avatarUri, avatarUpdatedAt } = profileStore.getState();
  if (!avatarUpdatedAt) return false;
  try {
    let avatar: string | null = null;
    if (avatarUri) {
      const file = new File(avatarUri);
      if (!file.exists) return false;
      avatar = await file.base64();
    }
    const profile: ServerProfile = { v: 1, updatedAt: avatarUpdatedAt, avatar };
    let playlist = await findProfilePlaylist();
    if (!playlist) {
      await api.createPlaylist({ name: SERVER_PROFILE_PLAYLIST_NAME });
      playlist = await findProfilePlaylist();
      if (!playlist) return false;
    }
    await api.updatePlaylist({
      playlistId: playlist.id,
      comment: SERVER_PROFILE_MARKER + JSON.stringify(profile),
      public: false,
    });
    profileStore.getState().markAvatarSynced(avatarUpdatedAt);
    void shareAvatarWithChat();
    return true;
  } catch {
    // Offline or refused: `avatarDirty` stays set, so the next sync sends it.
    return false;
  }
}

function deleteFile(uri: string | null): void {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // A stale file only costs a little storage.
  }
}

/** Puts the server's picture on this device. */
function applyServerProfile(profile: ServerProfile): void {
  const old = profileStore.getState().avatarUri;
  let uri: string | null = null;
  if (profile.avatar) {
    const target = new File(Paths.document, `${AVATAR_PREFIX}${Date.now()}.jpg`);
    target.write(profile.avatar, { encoding: 'base64' });
    uri = target.uri;
  }
  profileStore.getState().applyServerAvatar(uri, profile.updatedAt);
  if (old !== uri) deleteFile(old);
}

/**
 * Run at startup and after sign-in: whichever side changed last wins. Best-effort; a
 * failure only means the next run tries again.
 */
export async function syncProfileWithServer(): Promise<void> {
  try {
    if (!getApi()) return;
    const server = await fetchServerProfile();
    // A picture picked before pictures were synced has no change time: send it, unless the
    // server already holds one from another device.
    const before = profileStore.getState();
    if (before.avatarUri && !before.avatarUpdatedAt && !server) {
      profileStore.setState({ avatarUpdatedAt: new Date().toISOString(), avatarDirty: true });
    }
    const local = profileStore.getState();
    const localTime = local.avatarUpdatedAt ? Date.parse(local.avatarUpdatedAt) : 0;
    const serverTime = server ? Date.parse(server.updatedAt) : 0;

    if (server && serverTime > localTime) {
      applyServerProfile(server);
      return;
    }
    if (local.avatarDirty || (local.avatarUpdatedAt && !server)) {
      await pushProfileToServer();
    }
  } catch {
    /* offline or the server refused: the next startup retries */
  }
  void shareAvatarWithChat();
}

/** `avatarUpdatedAt` of the picture the chat last accepted in this app session. */
let chatAvatarSent: string | null = null;

/**
 * Publishes the profile picture to the chat service, where the people this user talks to
 * can see it (the playlist copy is private). Once per picture per app session.
 */
export async function shareAvatarWithChat(): Promise<boolean> {
  const { avatarUri, avatarUpdatedAt } = profileStore.getState();
  if (!isChatConfigured() || (!avatarUri && !avatarUpdatedAt)) return false;
  const version = `${avatarUpdatedAt ?? ''}|${avatarUri ?? ''}`;
  if (chatAvatarSent === version) return true;
  try {
    let data: string | null = null;
    if (avatarUri) {
      const file = new File(avatarUri);
      if (!file.exists) return false;
      data = await file.base64();
    }
    const ok = await setChatAvatar(data);
    if (ok) chatAvatarSent = version;
    return ok;
  } catch {
    return false;
  }
}

/** Test hook. */
export function resetChatAvatarShareForTests(): void {
  chatAvatarSent = null;
}
