/**
 * Client for the navidrome-discover backend (new releases, recommendations,
 * charts sourced from Deezer, downloads queued in deemix).
 */
import { discoverSettingsStore } from '../store/discoverSettingsStore';

export interface DiscoverItem {
  id: number;
  type: 'track';
  title: string;
  artist: string;
  album: string;
  album_id: number | null;
  cover: string | null;
  cover_small: string | null;
  preview: string | null;
  duration: number;
  explicit: boolean;
  link: string;
  album_link: string | null;
  in_library: boolean;
  reason?: string;
  position?: number;
  release_date?: string;
  record_type?: string;
}

export interface DiscoverPlaylist {
  id: string;
  title: string;
  description: string;
  updated: string;
  count: number;
  items: DiscoverItem[];
}

export interface DiscoverAlbum {
  id: number;
  type: 'album';
  title: string;
  artist: string;
  artist_id: number | null;
  cover: string | null;
  cover_small: string | null;
  record_type: string | null;
  release_date: string | null;
  track_count: number | null;
  explicit: boolean;
  link: string;
  in_library: boolean;
}

export interface DiscoverArtist {
  id: number;
  type: 'artist';
  title: string;
  cover: string | null;
  cover_small: string | null;
  fans: number | null;
  album_count: number | null;
  link: string;
  in_library: boolean;
}

export type DiscoverSearchType = 'track' | 'album' | 'artist';

export interface DiscoverSearchResult {
  query: string;
  type: DiscoverSearchType;
  count: number;
  items: Array<DiscoverItem | DiscoverAlbum | DiscoverArtist>;
}

/** An album (its tracks), an artist (top tracks + discography), a mix or a chart playlist. */
export interface DiscoverBrowse extends DiscoverPlaylist {
  type?: 'album' | 'artist' | 'mix';
  cover?: string | null;
  link?: string;
  album?: DiscoverAlbum;
  artist?: DiscoverArtist;
  albums?: DiscoverAlbum[];
}

/** A mix (seeded by one artist) or a chart playlist; `path` is its backend playlist path. */
export interface DiscoverPlaylistCard {
  id: string;
  type: 'mix' | 'chart';
  title: string;
  cover: string | null;
  cover_small: string | null;
  path: string;
  artist?: string;
  count?: number;
}

export type DiscoverCard = DiscoverAlbum | DiscoverPlaylistCard;

export interface DiscoverHome {
  updated: string;
  scanning: boolean;
  sections: Array<{ id: 'releases' | 'mixes' | 'charts'; title: string; items: DiscoverCard[] }>;
}

export interface DiscoverQueueItem {
  uuid: string;
  title: string;
  artist: string;
  type: string;
  status: 'downloading' | 'inQueue' | 'failed' | 'withErrors' | 'completed';
  cover: string | null;
  progress: number;
  downloaded: number;
  failed: number;
  size: number;
}

export interface DiscoverQueue {
  counts: { active: number; queued: number; failed: number; completed: number };
  active: DiscoverQueueItem[];
  queued: DiscoverQueueItem[];
  failed: DiscoverQueueItem[];
  completed: DiscoverQueueItem[];
}

export type DiscoverQueueAction = 'remove' | 'retry' | 'clear-finished' | 'cancel-all';

function connection(): { baseUrl: string; token: string } | null {
  const { baseUrl, token } = discoverSettingsStore.getState();
  return baseUrl && token ? { baseUrl, token } : null;
}

export function isDiscoverConfigured(): boolean {
  return connection() !== null;
}

/** GETs a backend path; null when unconfigured, on HTTP errors, or when `valid` rejects the body. */
async function getJson<T>(path: string, refresh: boolean, valid: (data: T) => boolean): Promise<T | null> {
  const conn = connection();
  if (!conn) return null;
  const url = `${conn.baseUrl}${path}${refresh ? `${path.includes('?') ? '&' : '?'}refresh=1` : ''}`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${conn.token}` } });
    if (!res.ok) return null;
    const data = (await res.json()) as T;
    return data && valid(data) ? data : null;
  } catch {
    // Network failure: the screen shows its error state and offers retry.
    return null;
  }
}

function getItems<T extends { items: unknown[] }>(path: string, refresh: boolean): Promise<T | null> {
  return getJson<T>(path, refresh, (d) => Array.isArray(d.items));
}

/** POSTs JSON; resolves the parsed body, or null when unconfigured, on HTTP errors or offline. */
async function postJson<T>(path: string, body: object): Promise<T | null> {
  const conn = connection();
  if (!conn) return null;
  try {
    const res = await fetch(`${conn.baseUrl}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${conn.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    // Network failure: the caller reports the action as failed.
    return null;
  }
}

export function fetchDiscoverHome(refresh = false): Promise<DiscoverHome | null> {
  return getJson<DiscoverHome>('/home', refresh, (d) => Array.isArray(d.sections));
}

/** A mix or chart playlist by the `path` its home card carries. */
export function fetchDiscoverPlaylist(path: string, refresh = false): Promise<DiscoverBrowse | null> {
  if (!path.startsWith('/playlists/')) return Promise.resolve(null);
  return getItems<DiscoverBrowse>(path, refresh);
}

export function searchDiscover(
  query: string,
  type: DiscoverSearchType,
): Promise<DiscoverSearchResult | null> {
  return getItems<DiscoverSearchResult>(
    `/search?q=${encodeURIComponent(query)}&type=${type}`,
    false,
  );
}

export function fetchDiscoverBrowse(
  kind: 'album' | 'artist',
  id: number,
  refresh = false,
): Promise<DiscoverBrowse | null> {
  return getItems<DiscoverBrowse>(`/browse/${kind}/${id}`, refresh);
}

/** Queues a Deezer track/album link in deemix. Resolves true when the backend accepted it. */
export async function queueDiscoverDownload(deezerUrl: string): Promise<boolean> {
  const data = await postJson<{ queued?: boolean }>('/download', { url: deezerUrl });
  return data?.queued === true;
}

export function fetchDownloadQueue(): Promise<DiscoverQueue | null> {
  return getJson<DiscoverQueue>('/download/queue', false, (d) => Array.isArray(d.active) && !!d.counts);
}

/** Removes or retries one deemix queue entry, or clears finished / cancels everything. */
export async function runQueueAction(action: DiscoverQueueAction, uuid?: string): Promise<boolean> {
  const data = await postJson<{ ok?: boolean }>(`/download/${action}`, uuid ? { uuid } : {});
  return data?.ok === true;
}

/**
 * Preview stream that always resolves: the backend redirects to a freshly
 * signed Deezer preview, since the `preview` field in a cached playlist expires.
 */
export function discoverPreviewUrl(trackId: number): string | null {
  const conn = connection();
  if (!conn) return null;
  return `${conn.baseUrl}/preview/${trackId}?token=${encodeURIComponent(conn.token)}`;
}
