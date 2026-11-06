/**
 * Spotify-style "Daily Mix" playlists: the artists the user plays are grouped by the
 * genre they are mostly played in, and each group becomes one mix that blends songs the
 * user already plays from those artists with similar songs they haven't heard much.
 * The groups and songs are rebuilt once per local day and kept until tomorrow.
 *
 * Listening history is the app's own scrobble log (`scrobble_events`); familiar songs
 * come from the synced library (server play counts and favourites); new songs from the
 * server's similar-songs endpoint.
 */
import { getRandomSongsFiltered, getSimilarSongs2, getTopSongs, type Child } from './subsonicService';
import { seededShuffle } from './personalMixService';
import {
  hydrateSongRows,
  SONG_LIST_COLS,
  songListRowToChild,
  type SongListRow,
} from '../db/repository/songs';
import { getDb } from '../store/persistence/db';
import { personalMixStore, type DailyMixDefinition } from '../store/personalMixStore';
import { dateKey } from '../utils/dateKey';
import { splitGenreValue } from '../utils/genreHelpers';

/** Most Daily Mixes shown, like Spotify. */
export const MAX_DAILY_MIXES = 6;
/** Most-played artists considered when grouping. */
const ARTIST_POOL = 40;
/** Artists kept per mix. */
const MAX_ARTISTS_PER_MIX = 8;
/** Artists per group when there is no genre data to group by. */
const FALLBACK_GROUP_SIZE = 4;
/** History window; widened to all time when it holds too few plays. */
const HISTORY_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const MIN_WINDOW_PLAYS = 30;
/** Share of a mix made of songs the user already plays. */
const FAMILIAR_SHARE = 0.4;

export interface ArtistGenreRow {
  artistId: string;
  artist: string;
  genre: string | null;
  plays: number;
}

/**
 * Group artists into mixes by the genre each is mostly played in. Only genres shared by
 * two or more artists make a mix (a one-artist mix is what the artist mixes are for).
 * Without any genre data, the top artists are split into fixed-size groups instead.
 */
export function groupArtistsIntoMixes(
  rows: readonly ArtistGenreRow[],
  maxMixes = MAX_DAILY_MIXES,
): DailyMixDefinition[] {
  const artists = new Map<
    string,
    { id: string; name: string; plays: number; genres: Map<string, { name: string; plays: number }> }
  >();
  for (const row of rows) {
    if (!row.artistId) continue;
    let a = artists.get(row.artistId);
    if (!a) {
      a = { id: row.artistId, name: row.artist, plays: 0, genres: new Map() };
      artists.set(row.artistId, a);
    }
    a.plays += row.plays;
    for (const name of row.genre ? splitGenreValue(row.genre) : []) {
      const key = name.toLowerCase();
      const g = a.genres.get(key) ?? { name, plays: 0 };
      g.plays += row.plays;
      a.genres.set(key, g);
    }
  }

  const top = [...artists.values()].sort((a, b) => b.plays - a.plays).slice(0, ARTIST_POOL);
  const groups = new Map<string, { name: string; plays: number; artists: typeof top }>();
  for (const a of top) {
    let best: { key: string; name: string; plays: number } | null = null;
    for (const [key, g] of a.genres) if (!best || g.plays > best.plays) best = { key, ...g };
    if (!best) continue;
    const group = groups.get(best.key) ?? { name: best.name, plays: 0, artists: [] };
    group.plays += a.plays;
    group.artists.push(a);
    groups.set(best.key, group);
  }

  const byGenre = [...groups.entries()]
    .filter(([, g]) => g.artists.length >= 2)
    .sort((a, b) => b[1].plays - a[1].plays)
    .slice(0, maxMixes)
    .map(([key, g], i) => ({
      id: `genre:${key}`,
      number: i + 1,
      genre: g.name,
      artists: g.artists.slice(0, MAX_ARTISTS_PER_MIX).map(({ id, name }) => ({ id, name })),
    }));
  if (byGenre.length > 0) return byGenre;

  const out: DailyMixDefinition[] = [];
  for (let i = 0; i < top.length && out.length < maxMixes; i += FALLBACK_GROUP_SIZE) {
    const chunk = top.slice(i, i + FALLBACK_GROUP_SIZE);
    if (chunk.length < 2) break;
    out.push({
      id: `artists:${chunk[0].id}`,
      number: out.length + 1,
      genre: null,
      artists: chunk.map(({ id, name }) => ({ id, name })),
    });
  }
  return out;
}

async function loadArtistGenreRows(): Promise<ArtistGenreRow[]> {
  const db = getDb();
  if (db === null) return [];
  const query = (sinceMs: number) =>
    db.getAllAsync<{ artist_id: string; artist: string | null; genre: string | null; c: number }>(
      `SELECT artist_id, MAX(artist) AS artist, genre, COUNT(*) AS c FROM scrobble_events
        WHERE artist_id IS NOT NULL AND artist_id <> '' AND time >= ?
        GROUP BY artist_id, genre`,
      [sinceMs],
    );
  let rows = await query(Date.now() - HISTORY_WINDOW_MS);
  if (rows.reduce((n, r) => n + r.c, 0) < MIN_WINDOW_PLAYS) rows = await query(0);
  return rows.map((r) => ({
    artistId: r.artist_id,
    artist: r.artist ?? '',
    genre: r.genre,
    plays: r.c,
  }));
}

/** Today's Daily Mixes (built from listening history once per day). */
export async function getDailyMixes(force = false): Promise<DailyMixDefinition[]> {
  const today = dateKey(Date.now());
  const state = personalMixStore.getState();
  if (!force && state.dailyMixDate === today && state.dailyMixes.length > 0) return state.dailyMixes;
  const mixes = groupArtistsIntoMixes(await loadArtistGenreRows().catch(() => []));
  if (mixes.length > 0) personalMixStore.getState().setDailyMixes(today, mixes);
  return mixes;
}

/** Songs from these artists that the user already plays or starred, most played first. */
async function loadFamiliarSongs(artistIds: string[], limit: number): Promise<Child[]> {
  const db = getDb();
  if (db === null || artistIds.length === 0) return [];
  const rows = await db.getAllAsync<SongListRow>(
    `SELECT ${SONG_LIST_COLS} FROM songs
      WHERE artist_id IN (SELECT value FROM json_each(?))
        AND (COALESCE(play_count, 0) > 0 OR starred IS NOT NULL)
      ORDER BY COALESCE(play_count, 0) DESC
      LIMIT ?`,
    [JSON.stringify(artistIds), limit],
  );
  await hydrateSongRows(db, rows);
  return rows.map(songListRowToChild);
}

function dedupe(songs: readonly Child[], exclude: ReadonlySet<string> = new Set()): Child[] {
  const seen = new Set(exclude);
  return songs.filter((s) => (s?.id && !seen.has(s.id) ? (seen.add(s.id), true) : false));
}

/** Alternate two lists: one familiar song, then two new ones, until `size`. */
export function blendFamiliarAndNew(familiar: Child[], fresh: Child[], size: number): Child[] {
  const out: Child[] = [];
  let f = 0;
  let n = 0;
  while (out.length < size && (f < familiar.length || n < fresh.length)) {
    if (f < familiar.length) out.push(familiar[f++]);
    for (let k = 0; k < 2 && n < fresh.length && out.length < size; k++) out.push(fresh[n++]);
  }
  return out.slice(0, size);
}

/** Build one mix's songs for today (cached until tomorrow unless `force`). */
export async function getDailyMixSongs(
  mix: DailyMixDefinition,
  size: number,
  force = false,
): Promise<Child[]> {
  const today = dateKey(Date.now());
  const state = personalMixStore.getState();
  const cached = state.dailyMixDate === today ? state.dailyMixSongs[mix.id] : undefined;
  if (!force && cached && cached.length > 0) return cached;

  const seed = `${mix.id}-${today}${force ? `-${Date.now()}` : ''}`;
  const ids = mix.artists.map((a) => a.id);
  const familiarTarget = Math.round(size * FAMILIAR_SHARE);

  let familiarPool = await loadFamiliarSongs(ids, familiarTarget * 3).catch(() => [] as Child[]);
  if (familiarPool.length === 0) {
    const tops = await Promise.all(
      mix.artists.slice(0, 4).map((a) => getTopSongs(a.name, 5).catch(() => null)),
    );
    familiarPool = tops.flatMap((t) => t ?? []);
  }
  const familiar = seededShuffle(dedupe(familiarPool), seed).slice(0, familiarTarget);

  const [similar, genreSongs] = await Promise.all([
    Promise.all(
      mix.artists.slice(0, 4).map((a) => getSimilarSongs2(a.id, size).catch(() => [] as Child[])),
    ),
    mix.genre
      ? getRandomSongsFiltered({ size, genre: mix.genre }).catch(() => null)
      : Promise.resolve(null),
  ]);
  const freshPool = dedupe([...similar.flat(), ...(genreSongs ?? [])], new Set(familiar.map((s) => s.id)));
  // Songs the user has barely played come first, so each day brings something new.
  const unplayed = seededShuffle(freshPool.filter((s) => !s.playCount), seed);
  const played = seededShuffle(freshPool.filter((s) => !!s.playCount), seed);
  const fresh = [...unplayed, ...played];

  const songs = blendFamiliarAndNew(familiar, fresh, size);
  if (songs.length > 0) {
    if (state.dailyMixDate !== today) personalMixStore.getState().setDailyMixes(today, state.dailyMixes);
    personalMixStore.getState().setDailyMixSongs(today, mix.id, songs);
  }
  return songs;
}
