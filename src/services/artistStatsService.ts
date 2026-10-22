/**
 * Public play statistics for the artist page: Last.fm listeners and per-track play counts
 * (when a Last.fm API key is set) and the artist's Deezer fan count (no key needed).
 * Every lookup is best-effort — a failed one just leaves its number out.
 */
import { discoverSettingsStore } from '../store/discoverSettingsStore';

const LASTFM_API = 'https://ws.audioscrobbler.com/2.0/';
const DEEZER_API = 'https://api.deezer.com';
const TOP_TRACKS_LIMIT = 100;

export interface ArtistStats {
  /** Last.fm listeners; null without an API key or when Last.fm has no match. */
  listeners: number | null;
  /** Deezer fans; null when Deezer has no match. */
  fans: number | null;
  /** Last.fm play counts by normalized track title (see `normalizeTitle`). */
  trackPlays: Record<string, number>;
}

/** Folds case, accents, "(feat. …)" / "- Remastered" style suffixes and punctuation away. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s*[([].*?[)\]]/g, '')
    .replace(/\s+-\s+.*$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function playsForTitle(stats: ArtistStats | null, title: string): number | null {
  if (!stats) return null;
  return stats.trackPlays[normalizeTitle(title)] ?? null;
}

async function getJson(url: string): Promise<unknown> {
  try {
    const res = await fetch(url);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

function toCount(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

async function fetchLastfm(name: string, apiKey: string): Promise<Pick<ArtistStats, 'listeners' | 'trackPlays'>> {
  const base = `${LASTFM_API}?format=json&autocorrect=1&api_key=${encodeURIComponent(apiKey)}&artist=${encodeURIComponent(name)}`;
  const [info, top] = (await Promise.all([
    getJson(`${base}&method=artist.getinfo`),
    getJson(`${base}&method=artist.gettoptracks&limit=${TOP_TRACKS_LIMIT}`),
  ])) as [
    { artist?: { stats?: { listeners?: string } } } | null,
    { toptracks?: { track?: Array<{ name?: string; playcount?: string }> } } | null,
  ];
  const trackPlays: Record<string, number> = {};
  for (const track of top?.toptracks?.track ?? []) {
    const plays = toCount(track.playcount);
    if (!track.name || plays == null) continue;
    const key = normalizeTitle(track.name);
    // Last.fm lists the most played version first; keep it over later duplicates.
    if (!(key in trackPlays)) trackPlays[key] = plays;
  }
  return { listeners: toCount(info?.artist?.stats?.listeners), trackPlays };
}

async function fetchDeezerFans(name: string): Promise<number | null> {
  const data = (await getJson(`${DEEZER_API}/search/artist?limit=5&q=${encodeURIComponent(name)}`)) as
    | { data?: Array<{ name?: string; nb_fan?: number }> }
    | null;
  const results = data?.data ?? [];
  const wanted = normalizeTitle(name);
  const match = results.find((a) => a.name && normalizeTitle(a.name) === wanted);
  return toCount(match?.nb_fan);
}

export async function fetchArtistStats(name: string): Promise<ArtistStats> {
  const apiKey = discoverSettingsStore.getState().lastfmApiKey;
  const [lastfm, fans] = await Promise.all([
    apiKey ? fetchLastfm(name, apiKey) : Promise.resolve({ listeners: null, trackPlays: {} }),
    fetchDeezerFans(name),
  ]);
  return { ...lastfm, fans };
}

/** "1234567" → "1,234,567" in the device locale. */
export function formatCount(n: number): string {
  return new Intl.NumberFormat().format(n);
}
