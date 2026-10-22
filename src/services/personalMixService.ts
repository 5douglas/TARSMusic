/**
 * "Made for you" playlists on Home, Spotify style: one mix per most-played artist (the
 * artist's own top songs blended with similar artists' songs) and a daily recommendations
 * list built from artists similar to the ones the user plays most, favouring songs not yet
 * played. Songs come from the server's similar-songs and top-songs endpoints.
 */
import { getSimilarSongs2, getTopSongs, type AlbumID3, type Child } from './subsonicService';
import { personalMixStore } from '../store/personalMixStore';
import { dateKey } from '../utils/dateKey';

export interface TopArtist {
  id: string;
  name: string;
  /** Plays counted by this app; 0 for artists that only come from the server's album list. */
  plays: number;
}

/** Artists ranked by the app's own plays, topped up from the server's frequently-played albums. */
export function rankTopArtists(
  artistCounts: Record<string, { count: number; artistId?: string }>,
  frequentlyPlayed: AlbumID3[],
  limit: number,
): TopArtist[] {
  const ranked: TopArtist[] = Object.entries(artistCounts)
    .filter(([, v]) => !!v.artistId)
    .map(([name, v]) => ({ id: v.artistId!, name, plays: v.count }))
    .sort((a, b) => b.plays - a.plays);
  const seen = new Set(ranked.map((a) => a.id));
  for (const album of frequentlyPlayed) {
    if (!album.artistId || !album.artist || seen.has(album.artistId)) continue;
    seen.add(album.artistId);
    ranked.push({ id: album.artistId, name: album.artist, plays: 0 });
  }
  return ranked.slice(0, limit);
}

/** Deterministic PRNG (mulberry32) so a day's shuffle is stable. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function seededShuffle<T>(items: T[], seed: string): T[] {
  const random = seededRandom(hashString(seed));
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function dedupe(songs: Child[]): Child[] {
  const seen = new Set<string>();
  return songs.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
}

/** The artist's top songs (about a third of the mix) blended with songs from similar artists. */
export async function buildArtistMix(artist: TopArtist, size: number): Promise<Child[]> {
  const [top, similar] = await Promise.all([
    getTopSongs(artist.name, Math.ceil(size / 3)).catch(() => null),
    getSimilarSongs2(artist.id, size).catch(() => [] as Child[]),
  ]);
  const own = top ?? [];
  const seed = `${artist.id}-${dateKey(Date.now())}`;
  return seededShuffle(dedupe([...own, ...similar]), seed).slice(0, size);
}

/**
 * Today's recommendations: songs similar to the top artists, unplayed ones first and the
 * top artists' own songs left out. Built once per local day and kept, so reopening the
 * list gives the same songs until tomorrow.
 */
export async function getDailyRecommendations(
  artists: TopArtist[],
  size: number,
  force = false,
): Promise<Child[]> {
  const today = dateKey(Date.now());
  const cached = personalMixStore.getState();
  if (!force && cached.dailyDate === today && cached.dailySongs.length > 0) return cached.dailySongs;

  const seeds = artists.slice(0, 5);
  const perSeed = Math.ceil((size * 2) / Math.max(seeds.length, 1));
  const batches = await Promise.all(
    seeds.map((a) => getSimilarSongs2(a.id, perSeed).catch(() => [] as Child[])),
  );
  const topIds = new Set(seeds.map((a) => a.id));
  const pool = dedupe(batches.flat()).filter((s) => !s.artistId || !topIds.has(s.artistId));
  const unplayed = pool.filter((s) => !s.playCount);
  const played = pool.filter((s) => !!s.playCount);
  const songs = [
    ...seededShuffle(unplayed, today),
    ...seededShuffle(played, today),
  ].slice(0, size);
  // Interleave so the day's list doesn't open with one seed artist's whole batch.
  const result = seededShuffle(songs, `${today}-order`);
  if (result.length > 0) personalMixStore.getState().setDaily(today, result);
  return result;
}
