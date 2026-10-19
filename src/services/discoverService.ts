/**
 * Client for the navidrome-discover backend (new releases, recommendations,
 * charts sourced from Deezer, downloads queued in deemix).
 */
import { discoverSettingsStore } from '../store/discoverSettingsStore';

export type DiscoverPlaylistKind = 'new-releases' | 'recommended' | 'charts-br' | 'charts-global';

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

const PLAYLIST_PATHS: Record<DiscoverPlaylistKind, string> = {
  'new-releases': '/playlists/new-releases',
  recommended: '/playlists/recommended',
  'charts-br': '/playlists/charts?country=BR',
  'charts-global': '/playlists/charts?country=GLOBAL',
};

function connection(): { baseUrl: string; token: string } | null {
  const { baseUrl, token } = discoverSettingsStore.getState();
  return baseUrl && token ? { baseUrl, token } : null;
}

export function isDiscoverConfigured(): boolean {
  return connection() !== null;
}

export async function fetchDiscoverPlaylist(
  kind: DiscoverPlaylistKind,
  refresh = false,
): Promise<DiscoverPlaylist | null> {
  const conn = connection();
  if (!conn) return null;
  const path = PLAYLIST_PATHS[kind];
  const url = `${conn.baseUrl}${path}${refresh ? `${path.includes('?') ? '&' : '?'}refresh=1` : ''}`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${conn.token}` } });
    if (!res.ok) return null;
    const data = (await res.json()) as DiscoverPlaylist;
    return Array.isArray(data?.items) ? data : null;
  } catch {
    // Network failure: the screen shows its error state and offers retry.
    return null;
  }
}

/** Queues a Deezer track/album link in deemix. Resolves true when the backend accepted it. */
export async function queueDiscoverDownload(deezerUrl: string): Promise<boolean> {
  const conn = connection();
  if (!conn) return false;
  try {
    const res = await fetch(`${conn.baseUrl}/download`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${conn.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: deezerUrl }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { queued?: boolean };
    return data.queued === true;
  } catch {
    // Network failure: reported to the user as a failed download.
    return false;
  }
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
