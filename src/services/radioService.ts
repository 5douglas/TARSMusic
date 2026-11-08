/**
 * Infinite radio (autoplay), Spotify style: when the queue is about to run out, append
 * songs similar to what is playing, taken from the user's own library through the
 * server's similar-songs endpoints, so playback never stops on its own.
 *
 * Runs off `playerStore` (current index + queue), so it needs no hook inside the player
 * engine. Off while repeat is on (the queue loops anyway), in offline mode, or when the
 * server cannot be reached.
 */
import { isJamGuestActive } from './jamControl';
import { addToQueue } from './playerService';
import {
  getRandomSongsFiltered,
  getSimilarSongs,
  getSimilarSongs2,
  type Child,
} from './subsonicService';
import { autoplayStore } from '../store/autoplayStore';
import { completedScrobbleStore } from '../store/completedScrobbleStore';
import { connectivityStore } from '../store/connectivityStore';
import { offlineModeStore } from '../store/offlineModeStore';
import { playbackSettingsStore } from '../store/playbackSettingsStore';
import { playerStore } from '../store/playerStore';
import { shuffleArray } from '../utils/arrayHelpers';

/** Top the queue up once this many tracks (or fewer) are left after the current one. */
export const RADIO_LOOKAHEAD = 2;
/** Songs appended per top-up. */
export const RADIO_BATCH_SIZE = 15;
/** Songs from one artist in a batch before the rest of the pool gets a turn. */
const MAX_PER_ARTIST = 2;
/** Recent plays (newest first) the radio avoids repeating. */
const RECENT_AVOID = 100;

let started = false;
let inFlight = false;
/** The queue state the last top-up was attempted for, so an empty result isn't retried
 *  on every store change. */
let lastAttemptKey: string | null = null;

/** True when the queue has `RADIO_LOOKAHEAD` or fewer tracks left after the current one. */
export function isNearQueueEnd(queueLength: number, currentIndex: number | null): boolean {
  if (currentIndex == null || currentIndex < 0 || queueLength === 0) return false;
  return queueLength - 1 - currentIndex <= RADIO_LOOKAHEAD;
}

/** The current song plus up to two earlier songs by other artists, newest first. */
export function pickRadioSeeds(queue: readonly Child[], currentIndex: number): Child[] {
  const current = queue[currentIndex];
  if (!current) return [];
  const seeds = [current];
  const artists = new Set([current.artistId ?? current.artist]);
  for (let i = currentIndex - 1; i >= 0 && seeds.length < 3; i--) {
    const song = queue[i];
    const artist = song?.artistId ?? song?.artist;
    if (!song || artists.has(artist)) continue;
    artists.add(artist);
    seeds.push(song);
  }
  return seeds;
}

/**
 * Pick `size` songs from candidate layers (highest signal first): skip anything in
 * `exclude`, dedupe, and allow at most `MAX_PER_ARTIST` per artist before falling back
 * to the leftovers when the pool is small.
 */
export function selectRadioSongs(
  layers: readonly (readonly Child[])[],
  exclude: ReadonlySet<string>,
  size: number,
): Child[] {
  const seen = new Set(exclude);
  const pool: Child[] = [];
  for (const layer of layers) {
    for (const song of layer) {
      if (!song?.id || seen.has(song.id)) continue;
      seen.add(song.id);
      pool.push(song);
    }
  }
  const perArtist = new Map<string, number>();
  const picked: Child[] = [];
  const leftovers: Child[] = [];
  for (const song of pool) {
    if (picked.length >= size) break;
    const artist = song.artistId ?? song.artist ?? '';
    const n = perArtist.get(artist) ?? 0;
    if (n >= MAX_PER_ARTIST) {
      leftovers.push(song);
      continue;
    }
    perArtist.set(artist, n + 1);
    picked.push(song);
  }
  for (const song of leftovers) {
    if (picked.length >= size) break;
    picked.push(song);
  }
  return picked;
}

/** Songs similar to the seeds, from the library, not in `exclude`. */
export async function buildRadioBatch(
  seeds: readonly Child[],
  exclude: ReadonlySet<string>,
  size: number,
): Promise<Child[]> {
  const [primary, ...others] = seeds;
  if (!primary) return [];
  const wanted = size * 2;
  const safe = <T>(p: Promise<T[] | null>): Promise<T[]> => p.then((r) => r ?? []).catch(() => []);
  const genre = primary.genre ?? primary.genres?.[0];

  const [bySong, byOtherSongs, byArtist, byGenre] = await Promise.all([
    safe(getSimilarSongs(primary.id, wanted)),
    Promise.all(others.map((s) => safe(getSimilarSongs(s.id, size)))),
    primary.artistId ? safe(getSimilarSongs2(primary.artistId, wanted)) : Promise.resolve([]),
    genre ? safe(getRandomSongsFiltered({ size: wanted, genre })) : Promise.resolve([]),
  ]);

  // Per-song matches lead (shuffled a little so a radio doesn't replay the same order
  // every time), then the artist-level matches, then same-genre picks as filler.
  const songLayer = shuffleArray([...bySong, ...byOtherSongs.flat()]);
  return selectRadioSongs([songLayer, shuffleArray(byArtist), byGenre], exclude, size);
}

function radioAllowed(): boolean {
  if (!autoplayStore.getState().autoplayEnabled) return false;
  // A listener in someone's session plays the host's queue; the host's radio extends it.
  if (isJamGuestActive()) return false;
  if (playbackSettingsStore.getState().repeatMode !== 'off') return false;
  if (offlineModeStore.getState().offlineMode) return false;
  const { hasConnection, isServerReachable } = connectivityStore.getState();
  return hasConnection && isServerReachable;
}

/** Append similar songs when the queue is about to end. Safe to call on every change. */
export async function maybeExtendQueue(): Promise<void> {
  if (inFlight || !radioAllowed()) return;
  const { queue, currentTrackIndex, queueLoading } = playerStore.getState();
  if (queueLoading || currentTrackIndex == null) return;
  if (!isNearQueueEnd(queue.length, currentTrackIndex)) return;

  const seeds = pickRadioSeeds(queue, currentTrackIndex);
  if (seeds.length === 0) return;
  const key = `${queue.length}:${seeds.map((s) => s.id).join(',')}`;
  if (key === lastAttemptKey) return;
  lastAttemptKey = key;

  inFlight = true;
  try {
    const exclude = new Set(queue.map((s) => s.id));
    for (const play of completedScrobbleStore.getState().recentScrobbles.slice(0, RECENT_AVOID)) {
      exclude.add(play.song.id);
    }
    const songs = await buildRadioBatch(seeds, exclude, RADIO_BATCH_SIZE);
    // The user may have started something else while this was loading.
    if (songs.length === 0 || playerStore.getState().queue !== queue || !radioAllowed()) return;
    await addToQueue(songs);
  } catch {
    // Best effort: the queue simply ends as it would without autoplay.
  } finally {
    inFlight = false;
  }
}

/** Start watching the queue. Idempotent. */
export function initAutoplayRadio(): void {
  if (started) return;
  started = true;
  playerStore.subscribe((state, prev) => {
    if (
      state.currentTrackIndex === prev.currentTrackIndex &&
      state.queue === prev.queue &&
      state.queueLoading === prev.queueLoading
    ) {
      return;
    }
    void maybeExtendQueue();
  });
  // Turning autoplay on (or repeat off) near the end of a queue should top it up too.
  autoplayStore.subscribe(() => void maybeExtendQueue());
  playbackSettingsStore.subscribe((state, prev) => {
    if (state.repeatMode !== prev.repeatMode) void maybeExtendQueue();
  });
}
