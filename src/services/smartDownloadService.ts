/**
 * Smart offline download: keeps the user's favourite and most-played songs on the
 * device without them having to pick anything.
 *
 * Each chosen song becomes an ordinary `song:<id>` download through the standard
 * queue (dedup, storage limit, retries and resume all come from there). The feature
 * remembers which of those items it created (`ownedSongIds`) and only ever removes
 * those, so a song the user downloaded by hand is never touched.
 *
 * Selection is favourites first (newest first), then the most-played songs, taken in
 * that order until the estimated size reaches the user's limit. A run happens on
 * startup, on joining Wi-Fi, on app foreground (at most every RUN_INTERVAL_MS), after a
 * settings change and shortly after the favourites change. With "Wi-Fi only" on, a run
 * needs Wi-Fi or ethernet, and leaving Wi-Fi cancels the smart rows still waiting in
 * the queue (they are queued again on the next Wi-Fi run).
 */

import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { type NativeEventSubscription } from 'react-native';

import { listAllStarredSongs, starredItemOf } from '../db/repository/favorites';
import { listMostPlayedSongs } from '../db/repository/songs';
import { connectivityStore } from '../store/connectivityStore';
import { favoritesStore } from '../store/favoritesStore';
import { musicCacheStore } from '../store/musicCacheStore';
import { offlineModeStore } from '../store/offlineModeStore';
import { playbackSettingsStore } from '../store/playbackSettingsStore';
import { getDb } from '../store/persistence/db';
import { smartDownloadStore } from '../store/smartDownloadStore';
import { onAppForeground } from '../utils/onAppForeground';
import {
  cancelDownload,
  deleteCachedItem,
  enqueueSongDownload,
  waitForTrackMapsReady,
} from './musicCacheService';
import { shouldBlockContent } from './navidromeReid/reidMarker';
import { type Child } from './subsonicService';

const RUN_INTERVAL_MS = 30 * 60 * 1000;
const FAVORITES_DEBOUNCE_MS = 20 * 1000;
const BYTES_PER_GB = 1024 ** 3;
/** Size assumed for a song the server reports neither size nor duration for. */
const FALLBACK_SONG_BYTES = 8 * 1024 * 1024;

const songItemId = (songId: string) => `song:${songId}`;

let started = false;
let unsubscribeNetInfo: (() => void) | null = null;
let unsubscribeSettings: (() => void) | null = null;
let unsubscribeFavorites: (() => void) | null = null;
let foregroundSub: NativeEventSubscription | null = null;
let favoritesTimer: ReturnType<typeof setTimeout> | null = null;
let lastRunAt = 0;
let wasOnAllowedNetwork: boolean | null = null;
let rerunRequested = false;

/* ------------------------------------------------------------------ */
/*  Pure helpers (exported for tests)                                  */
/* ------------------------------------------------------------------ */

/** Estimated on-disk size of a song once downloaded with the current download settings. */
export function estimateSongBytes(
  song: Pick<Child, 'size' | 'duration' | 'bitRate'>,
  downloadFormat: string,
  downloadMaxBitRate: number | null,
): number {
  const duration = song.duration ?? 0;
  const transcoded = downloadFormat !== 'raw' && downloadMaxBitRate != null;
  if (transcoded && duration > 0) {
    const transcodedBytes = duration * downloadMaxBitRate * 125;
    return song.size ? Math.min(song.size, transcodedBytes) : transcodedBytes;
  }
  if (song.size) return song.size;
  if (duration > 0 && song.bitRate) return duration * song.bitRate * 125;
  return FALLBACK_SONG_BYTES;
}

export interface SmartSelection {
  songs: Child[];
  estimatedBytes: number;
  skippedForSpace: number;
}

/**
 * Merge the candidate lists in priority order (duplicates keep their first place) and
 * take songs until the next one would go over `budgetBytes`.
 */
export function selectSmartSongs(
  candidateLists: Child[][],
  budgetBytes: number,
  sizeOf: (song: Child) => number,
): SmartSelection {
  const seen = new Set<string>();
  const ordered: Child[] = [];
  for (const list of candidateLists) {
    for (const song of list) {
      if (!song?.id || seen.has(song.id)) continue;
      seen.add(song.id);
      ordered.push(song);
    }
  }

  const songs: Child[] = [];
  let estimatedBytes = 0;
  let i = 0;
  for (; i < ordered.length; i++) {
    const bytes = sizeOf(ordered[i]);
    if (estimatedBytes + bytes > budgetBytes) break;
    estimatedBytes += bytes;
    songs.push(ordered[i]);
  }
  return { songs, estimatedBytes, skippedForSpace: ordered.length - i };
}

/* ------------------------------------------------------------------ */
/*  Network gate                                                       */
/* ------------------------------------------------------------------ */

function isAllowedNetwork(state: NetInfoState): boolean {
  if (state.isConnected === false) return false;
  if (!smartDownloadStore.getState().wifiOnly) return state.type !== 'none';
  return state.type === 'wifi' || state.type === 'ethernet';
}

async function currentNetworkAllowed(): Promise<boolean> {
  try {
    return isAllowedNetwork(await NetInfo.fetch());
  } catch {
    return false;
  }
}

function canTalkToServer(): boolean {
  return (
    !offlineModeStore.getState().offlineMode &&
    connectivityStore.getState().isServerReachable
  );
}

/* ------------------------------------------------------------------ */
/*  Run                                                                */
/* ------------------------------------------------------------------ */

/** Remove a smart download, or cancel it if it is still waiting in the queue. */
async function removeOwned(songId: string): Promise<void> {
  const itemId = songItemId(songId);
  const state = musicCacheStore.getState();
  const queued = state.downloadQueue.find((q) => q.itemId === itemId);
  if (queued) await cancelDownload(queued.queueId);
  if (itemId in musicCacheStore.getState().cachedItems) await deleteCachedItem(itemId);
}

/**
 * Bring the smart downloads in line with the current favourites / most played and the
 * settings. `force` skips the interval check (settings changed, favourites changed,
 * or the user tapped "Update now").
 */
export async function runSmartDownload(opts: { force?: boolean } = {}): Promise<void> {
  const store = smartDownloadStore.getState();
  if (!store.enabled) return;
  if (store.running) {
    if (opts.force) rerunRequested = true;
    return;
  }
  if (!opts.force && Date.now() - lastRunAt < RUN_INTERVAL_MS) return;
  if (!canTalkToServer()) return;
  if (!(await currentNetworkAllowed())) return;
  // A Navidrome id re-key empties the song tables mid-pass; a selection read then
  // would look empty and remove every smart download.
  if (shouldBlockContent()) return;
  const db = getDb();
  if (!db) return;

  smartDownloadStore.getState().setRunning(true);
  lastRunAt = Date.now();
  try {
    await waitForTrackMapsReady();
    const settings = smartDownloadStore.getState();
    const favorites = settings.includeFavorites
      ? (await listAllStarredSongs(db)).map(starredItemOf)
      : [];
    const mostPlayed = settings.includeMostPlayed
      ? ((await listMostPlayedSongs(db, settings.mostPlayedCount)) as Child[])
      : [];

    const { downloadFormat, downloadMaxBitRate } = playbackSettingsStore.getState();
    const selection = selectSmartSongs(
      [favorites, mostPlayed],
      settings.maxSizeGB * BYTES_PER_GB,
      (s) => estimateSongBytes(s, downloadFormat, downloadMaxBitRate),
    );

    const wanted = new Set(selection.songs.map((s) => s.id));
    const owned = new Set(smartDownloadStore.getState().ownedSongIds);

    // Drop what fell out of the set first, so its space is free before new songs land.
    for (const songId of [...owned]) {
      if (wanted.has(songId)) continue;
      // eslint-disable-next-line no-await-in-loop
      await removeOwned(songId);
      owned.delete(songId);
      smartDownloadStore.getState().setOwnedSongIds([...owned]);
    }

    for (const song of selection.songs) {
      if (!smartDownloadStore.getState().enabled) break;
      const itemId = songItemId(song.id);
      const { cachedItems, downloadQueue } = musicCacheStore.getState();
      // Already downloaded or queued. When it isn't ours the user added it: leave it be.
      // An owned song missing from both had its row cancelled off Wi-Fi: queue it again.
      if (itemId in cachedItems || downloadQueue.some((q) => q.itemId === itemId)) continue;
      // eslint-disable-next-line no-await-in-loop
      if (!canTalkToServer() || !(await currentNetworkAllowed())) break;
      owned.add(song.id);
      smartDownloadStore.getState().setOwnedSongIds([...owned]);
      // eslint-disable-next-line no-await-in-loop
      await enqueueSongDownload(song).catch(() => { /* retried on the next run */ });
    }

    smartDownloadStore.getState().setLastResult({
      at: Date.now(),
      selected: selection.songs.length,
      skippedForSpace: selection.skippedForSpace,
      estimatedBytes: selection.estimatedBytes,
    });
  } catch {
    /* best-effort: the next trigger tries again */
  } finally {
    smartDownloadStore.getState().setRunning(false);
    if (rerunRequested) {
      rerunRequested = false;
      void runSmartDownload({ force: true });
    }
  }
}

/** Remove every song this feature downloaded. */
export async function removeSmartDownloads(): Promise<void> {
  const owned = [...smartDownloadStore.getState().ownedSongIds];
  for (const songId of owned) {
    // eslint-disable-next-line no-await-in-loop
    await removeOwned(songId).catch(() => { /* best-effort */ });
  }
  smartDownloadStore.getState().setOwnedSongIds([]);
  smartDownloadStore.getState().setLastResult(null);
}

/** Cancel smart rows that have not started yet; they come back on the next allowed run. */
async function cancelPendingOwned(): Promise<void> {
  const owned = smartDownloadStore.getState().ownedSongIds;
  if (owned.length === 0) return;
  const ownedItemIds = new Set(owned.map(songItemId));
  const pending = musicCacheStore
    .getState()
    .downloadQueue.filter((q) => q.status === 'queued' && ownedItemIds.has(q.itemId));
  for (const row of pending) {
    // eslint-disable-next-line no-await-in-loop
    await cancelDownload(row.queueId).catch(() => { /* best-effort */ });
  }
}

/* ------------------------------------------------------------------ */
/*  Lifecycle                                                          */
/* ------------------------------------------------------------------ */

function handleNetworkChange(state: NetInfoState): void {
  if (state.type === 'unknown') return;
  if (!smartDownloadStore.getState().enabled) return;
  const allowed = isAllowedNetwork(state);
  const prev = wasOnAllowedNetwork;
  wasOnAllowedNetwork = allowed;
  if (allowed && prev === false) {
    void runSmartDownload({ force: true });
  } else if (!allowed && prev !== false) {
    void cancelPendingOwned();
  }
}

/** Start watching the network, foreground, settings and favourites. Idempotent. */
export function startSmartDownloads(): void {
  if (started) return;
  started = true;

  unsubscribeNetInfo = NetInfo.addEventListener(handleNetworkChange);
  foregroundSub = onAppForeground(() => { void runSmartDownload(); });

  unsubscribeSettings = smartDownloadStore.subscribe((state, prev) => {
    const settingsChanged =
      state.enabled !== prev.enabled ||
      state.includeFavorites !== prev.includeFavorites ||
      state.includeMostPlayed !== prev.includeMostPlayed ||
      state.mostPlayedCount !== prev.mostPlayedCount ||
      state.maxSizeGB !== prev.maxSizeGB ||
      state.wifiOnly !== prev.wifiOnly;
    if (!settingsChanged || !state.enabled) return;
    wasOnAllowedNetwork = null;
    void runSmartDownload({ force: true });
  });

  unsubscribeFavorites = favoritesStore.subscribe((state, prev) => {
    if (state.songIds === prev.songIds) return;
    const { enabled, includeFavorites } = smartDownloadStore.getState();
    if (!enabled || !includeFavorites) return;
    if (favoritesTimer) clearTimeout(favoritesTimer);
    favoritesTimer = setTimeout(() => {
      favoritesTimer = null;
      void runSmartDownload({ force: true });
    }, FAVORITES_DEBOUNCE_MS);
  });

  void runSmartDownload({ force: true });
}

export function stopSmartDownloads(): void {
  started = false;
  unsubscribeNetInfo?.();
  unsubscribeNetInfo = null;
  unsubscribeSettings?.();
  unsubscribeSettings = null;
  unsubscribeFavorites?.();
  unsubscribeFavorites = null;
  foregroundSub?.remove();
  foregroundSub = null;
  if (favoritesTimer) clearTimeout(favoritesTimer);
  favoritesTimer = null;
  wasOnAllowedNetwork = null;
  rerunRequested = false;
  lastRunAt = 0;
}
