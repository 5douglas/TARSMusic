/**
 * Keeps the app's own data (listening history and stats, MBID overrides, scrobble
 * exclusions, bookmarks) on the music server, so it follows the account: it is saved there
 * automatically and merged back in when the user signs in, on a fresh install or another
 * phone.
 *
 * The Subsonic API has no place for app data, so the newest local backup (the same gzip
 * files `backupService` writes) travels as one JSON bundle in the comment of a private
 * playlist, `SERVER_BACKUP_PLAYLIST_NAME`, owned by the user. The playlist holds no songs
 * and is filtered out of the library. It is written with a POST form body, since a backup is
 * far larger than a URL allows.
 *
 * Restoring merges (never replaces), so data already on this phone is kept and history from
 * several phones adds up. This phone only overwrites the server copy after it has merged it,
 * so a fresh install cannot replace a long history with its first few plays.
 */
import { File } from 'expo-file-system';

import { authStore } from '../store/authStore';
import { backupStore } from '../store/backupStore';
import { deviceIdentityStore } from '../store/deviceIdentityStore';
import {
  BACKUP_FILE_SUFFIXES,
  createBackup,
  getBackupDirectory,
  listBackups,
  makeBackupIdentityKey,
  pruneBackups,
  restoreBackup,
  type RestoreCounts,
} from './backupService';
import { SERVER_BACKUP_PLAYLIST_NAME, buildPostApi, getApi } from './subsonicService';

export const SERVER_BACKUP_MARKER = 'TARSMUSIC-BACKUP-1:';
/** How often this phone refreshes the copy on the server. */
export const SERVER_BACKUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** Comments past this are refused rather than risk the server rejecting the request. */
const MAX_COMMENT_CHARS = 9_000_000;

export interface ServerBackupBundle {
  v: 1;
  createdAt: string;
  deviceId: string;
  /** Base64 of each backup file, keyed by its suffix (`.meta.json`, `.scrobbles.gz`, …). */
  files: Record<string, string>;
}

function currentIdentityKey(): string | null {
  const { serverUrl, primaryServerUrl, username } = authStore.getState();
  const identityUrl = primaryServerUrl ?? serverUrl;
  return identityUrl && username ? makeBackupIdentityKey(identityUrl, username) : null;
}

/** Bundle in a playlist comment → the bundle, or null for anything else. */
export function parseServerBackup(comment: string | null | undefined): ServerBackupBundle | null {
  if (!comment || !comment.startsWith(SERVER_BACKUP_MARKER)) return null;
  try {
    const bundle = JSON.parse(comment.slice(SERVER_BACKUP_MARKER.length)) as ServerBackupBundle;
    if (bundle?.v !== 1 || typeof bundle.createdAt !== 'string' || !bundle.files?.['.meta.json']) return null;
    return bundle;
  } catch {
    return null;
  }
}

/** The user's backup playlist on the server, or null when there is none yet. */
async function findBackupPlaylist(): Promise<{ id: string } | null> {
  const api = getApi();
  if (!api) return null;
  const username = authStore.getState().username?.toLowerCase();
  const res = await api.getPlaylists();
  const match = (res.playlists?.playlist ?? []).find(
    (p) => p.name === SERVER_BACKUP_PLAYLIST_NAME && (!p.owner || p.owner.toLowerCase() === username),
  );
  return match ? { id: match.id } : null;
}

/** Downloads the server backup, or null when there is none (or it is not ours). */
export async function fetchServerBackup(): Promise<ServerBackupBundle | null> {
  const api = getApi();
  if (!api) return null;
  const playlist = await findBackupPlaylist();
  if (!playlist) return null;
  const res = await api.getPlaylist({ id: playlist.id });
  return parseServerBackup(res.playlist?.comment);
}

/**
 * Merges the server backup into this phone when it is one this phone has not merged or
 * written yet. Marks the server as checked either way (even when it holds nothing), which
 * is what allows `uploadBackupToServer` to overwrite it. Throws on network errors, leaving
 * the server unchecked so nothing is overwritten.
 */
export async function restoreFromServerIfNewer(): Promise<RestoreCounts | null> {
  const identity = currentIdentityKey();
  if (!identity || !getApi()) return null;
  const bundle = await fetchServerBackup();
  const store = backupStore.getState();
  if (!bundle || store.serverSyncedAt[identity] === bundle.createdAt) {
    store.setServerChecked(identity, true);
    return null;
  }

  // Unpack the bundle as a local backup, restore it in merge mode, then drop the files.
  const dir = getBackupDirectory();
  const stem = `server-${Date.now()}`;
  const written: File[] = [];
  try {
    for (const suffix of BACKUP_FILE_SUFFIXES) {
      const data = bundle.files[suffix];
      if (!data) continue;
      const file = new File(dir, `${stem}${suffix}`);
      file.write(data, { encoding: 'base64' });
      written.push(file);
    }
    const { current, other } = await listBackups();
    const entry = [...current, ...other].find((e) => e.stem === stem);
    const counts = entry ? await restoreBackup(entry, 'merge') : null;
    store.setServerSynced(identity, bundle.createdAt);
    store.setServerChecked(identity, true);
    return counts;
  } finally {
    for (const file of written) {
      try { file.delete(); } catch { /* best-effort */ }
    }
  }
}

/**
 * Sends the local backup `stem` to the server, creating the backup playlist the first time.
 * Skipped (false) until this phone has merged what the server held.
 */
export async function uploadBackupToServer(stem: string): Promise<boolean> {
  const identity = currentIdentityKey();
  if (!identity || !backupStore.getState().serverChecked[identity]) return false;
  const api = buildPostApi();
  if (!api) return false;

  const dir = getBackupDirectory();
  const files: Record<string, string> = {};
  for (const suffix of BACKUP_FILE_SUFFIXES) {
    const file = new File(dir, `${stem}${suffix}`);
    if (file.exists) files[suffix] = await file.base64();
  }
  if (!files['.meta.json']) return false;

  const bundle: ServerBackupBundle = {
    v: 1,
    createdAt: new Date().toISOString(),
    deviceId: deviceIdentityStore.getState().deviceId,
    files,
  };
  const comment = SERVER_BACKUP_MARKER + JSON.stringify(bundle);
  if (comment.length > MAX_COMMENT_CHARS) return false;

  let playlist = await findBackupPlaylist();
  if (!playlist) {
    await api.createPlaylist({ name: SERVER_BACKUP_PLAYLIST_NAME });
    playlist = await findBackupPlaylist();
    if (!playlist) return false;
  }
  await api.updatePlaylist({ playlistId: playlist.id, comment, public: false });
  backupStore.getState().setServerSynced(identity, bundle.createdAt);
  return true;
}

/**
 * The whole sync, run at startup and after sign-in: merge the server's copy first, then,
 * when the last backup is older than `SERVER_BACKUP_INTERVAL_MS`, take a fresh one and send
 * it. Best-effort: failures only mean the next run tries again.
 */
export async function syncBackupWithServer(): Promise<void> {
  try {
    const identity = currentIdentityKey();
    if (!identity) return;
    await restoreFromServerIfNewer();

    const store = backupStore.getState();
    if (!store.autoBackupEnabled) return;
    const last = store.getLastBackupTime(identity);
    if (last && Date.now() - last < SERVER_BACKUP_INTERVAL_MS) return;

    const stem = await createBackup();
    await pruneBackups();
    if (stem) await uploadBackupToServer(stem);
  } catch {
    /* offline or the server refused: the next startup retries */
  }
}
