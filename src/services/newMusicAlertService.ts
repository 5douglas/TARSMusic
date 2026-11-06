/**
 * Notifications for new music: a new album from an artist the user listens to (autodl
 * downloads new Deezer releases into the library every 12h), and a download the user
 * requested from Discover search arriving in the library.
 *
 * Everything is read from the music server, so the check also works from the background
 * task (`newMusicBackgroundTask`) with no UI mounted: the newest albums (`getAlbumList2`
 * type `newest`), the artists of the most played albums and the starred artists. The
 * app's own play counts are added when they are loaded.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import i18n from '../i18n/i18n';
import { completedScrobbleStore } from '../store/completedScrobbleStore';
import { newMusicAlertsStore, REQUEST_TTL_MS, type PendingRequest } from '../store/newMusicAlertsStore';
import { getApi, type AlbumID3 } from './subsonicService';

export const NEW_MUSIC_CHANNEL_ID = 'new-music';
/** `data.kind` of these notifications; the app's notification handler shows them as banners. */
export const NEW_MUSIC_NOTIFICATION_KIND = 'new-music';
/** Albums added longer ago than this are never announced (e.g. after alerts were off). */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Above this many new releases one summary notification is posted instead of one each. */
const MAX_SINGLE_RELEASE_NOTIFICATIONS = 3;
/** An artist counts as listened to after this many plays counted by the app. */
const MIN_LOCAL_PLAYS = 3;
const NEWEST_PAGE = 100;
const FREQUENT_PAGE = 200;

if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync(NEW_MUSIC_CHANNEL_ID, {
    name: 'New music',
    importance: Notifications.AndroidImportance.DEFAULT,
  }).catch(() => {
    /* non-critical: Android falls back to the default channel */
  });
}

/** Lowercase, no accents, no "(Deluxe)"-style suffixes, letters and digits only. */
export function normalizeName(value: string | undefined | null): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function albumCreatedMs(album: AlbumID3): number {
  return album.created ? Date.parse(String(album.created)) : NaN;
}

/** The album's artist names (main artist, display artist and each credited artist), normalized. */
export function albumArtistNames(album: AlbumID3): string[] {
  const names = [album.artist, album.displayArtist, ...(album.artists ?? []).map((a) => a.name)];
  return [...new Set(names.map(normalizeName).filter(Boolean))];
}

export function albumArtistIds(album: AlbumID3): string[] {
  return [album.artistId, ...(album.artists ?? []).map((a) => a.id)].filter((id): id is string => !!id);
}

export interface FollowedArtists {
  ids: Set<string>;
  names: Set<string>;
}

export function isFollowed(album: AlbumID3, followed: FollowedArtists): boolean {
  return (
    albumArtistIds(album).some((id) => followed.ids.has(id)) ||
    albumArtistNames(album).some((name) => followed.names.has(name))
  );
}

/** Whether `album` is where the requested download landed: same album title and artist. */
export function matchesRequest(album: AlbumID3, request: PendingRequest): boolean {
  if (normalizeName(album.name) !== normalizeName(request.album)) return false;
  const artist = normalizeName(request.artist);
  return albumArtistNames(album).some((name) => name === artist || name.includes(artist) || artist.includes(name));
}

export interface AlertPlan {
  /** Newest `created` seen, to store for the next check. */
  lastSeenCreated: number;
  arrived: Array<{ request: PendingRequest; album: AlbumID3 }>;
  releases: AlbumID3[];
  /** Requests still waiting (unmatched and not expired). */
  requests: PendingRequest[];
}

/** Decides what to announce, given the newest albums. Pure, so it is unit tested. */
export function planAlerts(input: {
  albums: AlbumID3[];
  lastSeenCreated: number;
  requests: PendingRequest[];
  followed: FollowedArtists;
  now: number;
}): AlertPlan {
  const { albums, lastSeenCreated, followed, now } = input;
  let newest = lastSeenCreated;
  const fresh: AlbumID3[] = [];
  for (const album of albums) {
    const created = albumCreatedMs(album);
    if (!Number.isFinite(created)) continue;
    newest = Math.max(newest, created);
    if (created > lastSeenCreated && now - created <= MAX_AGE_MS) fresh.push(album);
  }

  const arrived: AlertPlan['arrived'] = [];
  const announced = new Set<string>();
  const requests: PendingRequest[] = [];
  for (const request of input.requests) {
    const album = fresh.find((a) => matchesRequest(a, request));
    if (album) {
      arrived.push({ request, album });
      announced.add(album.id);
    } else if (now - request.requestedAt <= REQUEST_TTL_MS) {
      requests.push(request);
    }
  }

  const releases = fresh.filter((a) => !announced.has(a.id) && isFollowed(a, followed));
  return { lastSeenCreated: newest, arrived, releases, requests };
}

/** Artists of the most played albums on the server, starred artists, and the app's own plays. */
async function loadFollowedArtists(): Promise<FollowedArtists> {
  const ids = new Set<string>();
  const names = new Set<string>();
  const api = getApi();
  if (!api) return { ids, names };
  const [frequent, starred] = await Promise.all([
    api.getAlbumList2({ type: 'frequent', size: FREQUENT_PAGE }).catch(() => null),
    api.getStarred2().catch(() => null),
  ]);
  for (const album of frequent?.albumList2?.album ?? []) {
    albumArtistIds(album).forEach((id) => ids.add(id));
    albumArtistNames(album).forEach((name) => names.add(name));
  }
  for (const artist of starred?.starred2?.artist ?? []) {
    ids.add(artist.id);
    const name = normalizeName(artist.name);
    if (name) names.add(name);
  }
  const counts = completedScrobbleStore.getState().aggregates?.artistCounts ?? {};
  for (const [name, value] of Object.entries(counts)) {
    if (value.count < MIN_LOCAL_PLAYS) continue;
    if (value.artistId) ids.add(value.artistId);
    const normalized = normalizeName(name);
    if (normalized) names.add(normalized);
  }
  return { ids, names };
}

async function post(title: string, body: string, data: Record<string, string>): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: { kind: NEW_MUSIC_NOTIFICATION_KIND, ...data },
      ...(Platform.OS === 'android' && { channelId: NEW_MUSIC_CHANNEL_ID }),
    },
    trigger: null,
  });
}

async function notify(plan: AlertPlan, releasesEnabled: boolean, requestsEnabled: boolean): Promise<void> {
  const t = i18n.t.bind(i18n);
  if (requestsEnabled) {
    for (const { request, album } of plan.arrived) {
      await post(t('newMusicRequestArrived'), `${request.title} · ${request.artist}`, { albumId: album.id });
    }
  }
  if (!releasesEnabled || plan.releases.length === 0) return;
  if (plan.releases.length <= MAX_SINGLE_RELEASE_NOTIFICATIONS) {
    for (const album of plan.releases) {
      await post(t('newMusicRelease'), `${album.name} · ${album.artist ?? ''}`.trim(), { albumId: album.id });
    }
    return;
  }
  const artists = [...new Set(plan.releases.map((a) => a.artist).filter(Boolean))];
  await post(
    t('newMusicReleases', { count: plan.releases.length }),
    artists.slice(0, 4).join(', ') + (artists.length > 4 ? '…' : ''),
    { list: 'recentlyAdded' },
  );
}

let inFlight: Promise<void> | null = null;

/**
 * Looks for albums added since the last check and posts the notifications. Safe to call
 * often: overlapping calls share one run. Never throws.
 */
export function checkNewMusic(): Promise<void> {
  if (!inFlight) {
    inFlight = runCheck()
      .catch(() => {
        /* offline or server error: the next check retries */
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

async function runCheck(): Promise<void> {
  const state = newMusicAlertsStore.getState();
  if (!state.releasesEnabled && !state.requestsEnabled) return;
  const api = getApi();
  if (!api) return;

  // Assumes `newest` lists the most recently added albums first; every album's `created`
  // is still compared, so a different order only narrows what is seen.
  const res = await api.getAlbumList2({ type: 'newest', size: NEWEST_PAGE });
  const albums = res.albumList2?.album ?? [];
  const now = Date.now();

  if (state.lastSeenCreated === null) {
    // First check: remember where the library is, announce nothing.
    const newest = Math.max(0, ...albums.map(albumCreatedMs).filter(Number.isFinite));
    state.setLastSeenCreated(newest || now);
    return;
  }

  const followed = state.releasesEnabled ? await loadFollowedArtists() : { ids: new Set<string>(), names: new Set<string>() };
  const plan = planAlerts({ albums, lastSeenCreated: state.lastSeenCreated, requests: state.requests, followed, now });

  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') await notify(plan, state.releasesEnabled, state.requestsEnabled);

  state.setLastSeenCreated(plan.lastSeenCreated);
  // Drop the requests this run settled, keeping any added while it ran.
  const settled = new Set(state.requests.filter((r) => !plan.requests.includes(r)));
  state.setRequests(newMusicAlertsStore.getState().requests.filter((r) => !settled.has(r)));
}
