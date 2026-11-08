/**
 * Listening together ("Ouvir junto", like Spotify Jam).
 *
 * One person hosts: their player is the session. The host publishes what is playing (song,
 * position, play/pause and the next songs) in their session playlist (`jamTransport`), and
 * re-publishes on every change plus a heartbeat. Listeners poll it and steer their own player
 * to match: same song, same spot (within `DRIFT_SECONDS`), same play/pause, same queue.
 *
 * Everyone can control the session. A listener's play, pause, skip, seek, song pick, "play
 * next" and "add to queue" are reported by `playerService` through `jamControl`; they happen
 * at once on the listener's phone and are also written to the listener's own session
 * playlist, where the host picks them up and carries them out, so everyone follows.
 *
 * Nothing here needs a server of its own: only Navidrome.
 */
import { AppState } from 'react-native';

import { authStore } from '../store/authStore';
import { jamStore, type JamSessionSummary } from '../store/jamStore';
import { playerStore } from '../store/playerStore';
import { setJamActionHandler, runAsJamFollower, type JamAction } from './jamControl';
import {
  currentJamUser,
  encodeJamComment,
  findJamHosts,
  findJamSession,
  writeOwnJamComment,
  type JamGuestDoc,
  type JamHostDoc,
  type JamRequest,
  type JamWireAction,
} from './jamTransport';
import {
  addToQueue,
  playSongNext,
  playTrack,
  removeFromQueue,
  seekTo,
  shuffleQueue,
  skipToNext,
  skipToPrevious,
  skipToTrack,
  togglePlayPause,
} from './playerService';
import { getApi, type Child } from './subsonicService';

/** Songs after the current one that the host shares. */
export const QUEUE_WINDOW = 25;
/** How far a listener may drift from the host before being moved. */
export const DRIFT_SECONDS = 3;
const GUEST_TICK_MS = 2000;
const HOST_TICK_MS = 2500;
const HOST_HEARTBEAT_MS = 10_000;
const GUEST_HEARTBEAT_MS = 15_000;
/** A listener not heard from for this long has left. */
const GUEST_STALE_MS = 60_000;
/** A host not heard from for this long has ended the session (paused hosts may be asleep). */
const HOST_STALE_PLAYING_MS = 90_000;
const HOST_STALE_PAUSED_MS = 15 * 60_000;
/** After a listener's own action, give the host this long to carry it out before following again. */
const GUEST_ACTION_GRACE_MS = 8000;
/** After the follower moved the player, let it settle before judging drift again. */
const SETTLE_MS = 4000;
/** Requests kept in a listener's comment (the host only needs the ones it has not done yet). */
const MAX_REQUESTS = 15;
/** Consecutive missing-host answers before a listener leaves (one can be a write in flight). */
const MISSING_HOST_LIMIT = 3;

/* ------------------------------------------------------------------ */
/*  Pure helpers                                                       */
/* ------------------------------------------------------------------ */

/** Where in the song the host is now, by the host's last report. */
export function expectedPosition(doc: Pick<JamHostDoc, 'at' | 'pos' | 'playing'>, now: number): number {
  const elapsed = doc.playing ? Math.max(0, (now - doc.at) / 1000) : 0;
  return doc.pos + elapsed;
}

export function isHostFresh(doc: Pick<JamHostDoc, 'at' | 'playing'>, now: number): boolean {
  return now - doc.at < (doc.playing ? HOST_STALE_PLAYING_MS : HOST_STALE_PAUSED_MS);
}

export function isGuestFresh(doc: Pick<JamGuestDoc, 'at'>, now: number): boolean {
  return now - doc.at < GUEST_STALE_MS;
}

export type QueuePlan = { type: 'none' } | { type: 'append'; ids: string[] } | { type: 'replace' };

/**
 * How a listener's upcoming songs (`local`) become the host's (`host`, at most
 * `QUEUE_WINDOW` long; shorter means the host's queue really ends there).
 */
export function planQueueSync(local: string[], host: string[]): QueuePlan {
  const hostIsFullWindow = host.length >= QUEUE_WINDOW;
  const prefixMatches = (a: string[], b: string[]) => a.every((id, i) => b[i] === id);
  if (local.length >= host.length && prefixMatches(host, local)) {
    // Same songs coming up; extra local songs only matter when the host's queue ends sooner.
    return hostIsFullWindow || local.length === host.length ? { type: 'none' } : { type: 'replace' };
  }
  if (prefixMatches(local, host)) return { type: 'append', ids: host.slice(local.length) };
  return { type: 'replace' };
}

/** A listener's requests the host has not carried out yet, oldest first. */
export function pendingRequests(reqs: JamRequest[], handled: number | undefined): JamRequest[] {
  return reqs.filter((r) => typeof r.n === 'number' && r.n > (handled ?? 0)).sort((a, b) => a.n - b.n);
}

/** The queue index of `songId`, preferring the one closest to where the listener saw it. */
export function findQueueIndex(queue: Pick<Child, 'id'>[], songId: string, hint: number): number {
  let best = -1;
  for (let i = 0; i < queue.length; i++) {
    if (queue[i].id !== songId) continue;
    if (best === -1 || Math.abs(i - hint) < Math.abs(best - hint)) best = i;
  }
  return best;
}

export function toWireAction(action: JamAction): JamWireAction {
  switch (action.kind) {
    case 'add':
      return { kind: 'add', ids: action.songs.map((s) => s.id) };
    case 'addNext':
      return { kind: 'addNext', id: action.song.id };
    case 'playNow': {
      // Keep the picked song and what follows it, so the request stays small.
      const start = Math.max(0, action.queue.findIndex((s) => s.id === action.song.id));
      const ids = action.queue.slice(start, start + 100).map((s) => s.id);
      return { kind: 'playNow', id: action.song.id, ids: ids.length > 0 ? ids : [action.song.id] };
    }
    default:
      return action;
  }
}

function newSessionId(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 12; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

const sameUser = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

/* ------------------------------------------------------------------ */
/*  Songs by id                                                        */
/* ------------------------------------------------------------------ */

const songCache = new Map<string, Child>();

async function resolveSongs(ids: string[]): Promise<Child[]> {
  for (const c of playerStore.getState().queue) songCache.set(c.id, c);
  const api = getApi();
  const missing = [...new Set(ids.filter((id) => !songCache.has(id)))];
  if (missing.length > 0 && api) {
    await Promise.all(
      missing.map(async (id) => {
        try {
          const res = await api.getSong({ id });
          if (res.song) songCache.set(id, res.song);
        } catch {
          // A song gone from the server is simply skipped.
        }
      }),
    );
  }
  if (songCache.size > 2000) {
    const keep = new Set(ids);
    for (const key of songCache.keys()) if (!keep.has(key)) songCache.delete(key);
  }
  return ids.map((id) => songCache.get(id)).filter((c): c is Child => !!c);
}

/* ------------------------------------------------------------------ */
/*  Session loop                                                       */
/* ------------------------------------------------------------------ */

let timer: ReturnType<typeof setInterval> | null = null;
let ticking = false;
let lastTickAt = 0;

// Host
let lastPublished: JamHostDoc | null = null;
let lastPublishedAt = 0;
let hostDirty = false;
let handled: Record<string, number> = {};
let publishTimer: ReturnType<typeof setTimeout> | null = null;

// Guest
let requests: JamRequest[] = [];
let lastRequestN = 0;
let guestDirty = false;
let lastGuestWriteAt = 0;
let lastOwnActionAt = 0;
let lastFollowAt = 0;
let missingHost = 0;
let following = false;

function tickInterval(): number {
  return jamStore.getState().mode === 'host' ? HOST_TICK_MS : GUEST_TICK_MS;
}

function startLoop(): void {
  stopLoop();
  lastTickAt = 0;
  timer = setInterval(() => void tick(), tickInterval());
  void tick();
}

function stopLoop(): void {
  if (timer) clearInterval(timer);
  timer = null;
  if (publishTimer) clearTimeout(publishTimer);
  publishTimer = null;
}

let running: Promise<void> | null = null;

function tick(): Promise<void> {
  if (running) return running;
  const { mode, sid } = jamStore.getState();
  if (mode === 'none' || !sid) return Promise.resolve();
  ticking = true;
  lastTickAt = Date.now();
  running = (async () => {
    try {
      if (mode === 'host') await hostTick(sid);
      else await guestTick(sid);
      if (!jamStore.getState().connected || jamStore.getState().error) jamStore.getState().setConnected(true);
    } catch (err) {
      jamStore.getState().setConnected(jamStore.getState().connected, err instanceof Error ? err.message : String(err));
    } finally {
      ticking = false;
      running = null;
    }
  })();
  return running;
}

/* ---------------------------- Host ---------------------------- */

function buildHostDoc(): JamHostDoc {
  const { currentTrack, currentTrackIndex, queue, position, playbackState } = playerStore.getState();
  const idx = currentTrackIndex ?? -1;
  const q = currentTrack ? [currentTrack.id, ...queue.slice(idx + 1, idx + 1 + QUEUE_WINDOW).map((c) => c.id)] : [];
  return {
    at: Date.now(),
    track: currentTrack?.id ?? null,
    q,
    pos: Math.max(0, position),
    playing: playbackState === 'playing' || playbackState === 'buffering' || playbackState === 'loading',
    handled,
    members: jamStore.getState().members,
    title: currentTrack?.title,
    artist: currentTrack?.artist,
    coverArt: currentTrack?.coverArt,
  };
}

async function publishHost(): Promise<void> {
  const { mode, sid } = jamStore.getState();
  if (mode !== 'host' || !sid) return;
  hostDirty = false;
  const doc = buildHostDoc();
  await writeOwnJamComment(encodeJamComment('host', sid, doc));
  lastPublished = doc;
  lastPublishedAt = doc.at;
}

/** Publishes soon, folding a burst of player changes into one write. */
function schedulePublish(): void {
  hostDirty = true;
  if (publishTimer) return;
  publishTimer = setTimeout(() => {
    publishTimer = null;
    if (ticking) return; // the running tick publishes the dirty state
    void publishHost().catch(() => {
      hostDirty = true;
    });
  }, 300);
}

async function applyHostRequest(req: JamRequest): Promise<void> {
  const { queue, playbackState } = playerStore.getState();
  const playing = playbackState === 'playing';
  switch (req.kind) {
    case 'play':
      if (!playing) await togglePlayPause();
      return;
    case 'pause':
      if (playing) await togglePlayPause();
      return;
    case 'next':
      await skipToNext();
      return;
    case 'prev':
      await skipToPrevious();
      return;
    case 'seek':
      await seekTo(req.pos);
      return;
    case 'jump': {
      const i = findQueueIndex(queue, req.songId, req.index);
      if (i >= 0) await skipToTrack(i);
      return;
    }
    case 'remove': {
      const i = findQueueIndex(queue, req.songId, req.index);
      if (i >= 0 && i !== playerStore.getState().currentTrackIndex) await removeFromQueue(i);
      return;
    }
    case 'shuffle':
      await shuffleQueue();
      return;
    case 'add': {
      const songs = await resolveSongs(req.ids);
      if (songs.length > 0) await addToQueue(songs);
      return;
    }
    case 'addNext': {
      const [song] = await resolveSongs([req.id]);
      if (song) await playSongNext(song);
      return;
    }
    case 'playNow': {
      const songs = await resolveSongs(req.ids);
      const song = songs.find((s) => s.id === req.id) ?? songs[0];
      if (song) await playTrack(song, songs);
      return;
    }
  }
}

async function hostTick(sid: string): Promise<void> {
  const me = currentJamUser();
  let entries;
  try {
    entries = await findJamSession(sid);
  } catch (err) {
    // Reading the listeners failed, but they still need the host's heartbeat and changes.
    if (hostDirty || Date.now() - lastPublishedAt > HOST_HEARTBEAT_MS) await publishHost();
    throw err;
  }
  const now = Date.now();
  const guests = entries.filter(
    (e) => e.role === 'guest' && e.sid === sid && !sameUser(e.owner, me) && isGuestFresh(e.doc, now),
  );

  let changed = false;
  for (const guest of guests) {
    const todo = pendingRequests((guest.doc as JamGuestDoc).reqs, handled[guest.owner]);
    for (const req of todo) {
      if (jamStore.getState().mode !== 'host') return;
      try {
        await applyHostRequest(req);
      } catch {
        // One failed request must not block the ones after it.
      }
      handled = { ...handled, [guest.owner]: req.n };
      changed = true;
    }
  }

  const members = [...new Set(guests.map((g) => g.owner))].sort((a, b) => a.localeCompare(b));
  const prev = jamStore.getState().members;
  if (members.length !== prev.length || members.some((m, i) => m !== prev[i])) {
    jamStore.getState().setMembers(members);
    const kept: Record<string, number> = {};
    for (const m of members) if (handled[m] != null) kept[m] = handled[m];
    for (const g of guests) if (handled[g.owner] != null) kept[g.owner] = handled[g.owner];
    handled = kept;
    changed = true;
  }

  if (changed) {
    // Let the player settle on what the requests did before reporting it.
    await new Promise((r) => setTimeout(r, 400));
  }
  if (changed || hostDirty || Date.now() - lastPublishedAt > HOST_HEARTBEAT_MS) await publishHost();
}

/** Marks the host state dirty when the player changes in a way listeners must follow. */
function onPlayerChange(
  state: ReturnType<typeof playerStore.getState>,
  prev: ReturnType<typeof playerStore.getState>,
): void {
  const { mode } = jamStore.getState();
  if (mode === 'none') return;

  // Progress events keep coming while backgrounded, when timers may sleep: tick from them too.
  if (Date.now() - lastTickAt > tickInterval() * 1.5) void tick();

  if (mode !== 'host') return;
  if (
    state.currentTrack?.id !== prev.currentTrack?.id ||
    state.currentTrackIndex !== prev.currentTrackIndex ||
    state.queue !== prev.queue ||
    (state.playbackState === 'playing') !== (prev.playbackState === 'playing') ||
    (state.playbackState === 'paused') !== (prev.playbackState === 'paused')
  ) {
    schedulePublish();
    return;
  }
  // A seek: the position moved away from where the last report says it should be.
  if (lastPublished && lastPublished.track === state.currentTrack?.id && state.position !== prev.position) {
    const predicted = expectedPosition(lastPublished, Date.now());
    if (Math.abs(state.position - predicted) > DRIFT_SECONDS - 0.5) schedulePublish();
  }
}

/* ---------------------------- Guest ---------------------------- */

function onGuestAction(action: JamAction): void {
  const n = Math.max(lastRequestN + 1, Date.now());
  lastRequestN = n;
  lastOwnActionAt = Date.now();
  requests = [...requests, { ...toWireAction(action), n }].slice(-MAX_REQUESTS);
  guestDirty = true;
  void writeGuest().catch(() => {
    guestDirty = true;
  });
}

async function writeGuest(): Promise<void> {
  const { mode, sid } = jamStore.getState();
  if (mode !== 'guest' || !sid) return;
  guestDirty = false;
  const doc: JamGuestDoc = { at: Date.now(), reqs: requests };
  lastGuestWriteAt = doc.at;
  await writeOwnJamComment(encodeJamComment('guest', sid, doc));
}

async function guestTick(sid: string): Promise<void> {
  if (guestDirty || Date.now() - lastGuestWriteAt > GUEST_HEARTBEAT_MS) await writeGuest();

  const { host } = jamStore.getState();
  const entries = await findJamSession(sid);
  const hostEntry = entries.find((e) => e.role === 'host' && e.sid === sid && sameUser(e.owner, host));
  const now = Date.now();
  if (!hostEntry || !isHostFresh(hostEntry.doc as JamHostDoc, now)) {
    missingHost += 1;
    if (missingHost >= MISSING_HOST_LIMIT) await leaveSession('host-left');
    return;
  }
  missingHost = 0;
  const doc = hostEntry.doc as JamHostDoc;
  jamStore.getState().setMembers(doc.members.filter((m) => !sameUser(m, host)));

  // The host has not carried out our last request yet: don't undo it locally meanwhile.
  const me = currentJamUser();
  const handledByHost = Object.entries(doc.handled).find(([user]) => sameUser(user, me))?.[1] ?? 0;
  if (handledByHost < lastRequestN && now - lastOwnActionAt < GUEST_ACTION_GRACE_MS) return;

  await follow(doc);
}

async function follow(doc: JamHostDoc): Promise<void> {
  if (following) return;
  following = true;
  try {
    const local = playerStore.getState();
    const now = Date.now();
    const busy = local.queueLoading || local.playbackState === 'loading' || local.playbackState === 'buffering';

    if (!doc.track) {
      if (local.playbackState === 'playing') await runAsJamFollower(togglePlayPause);
      return;
    }

    const expected = expectedPosition(doc, now);

    if (local.currentTrack?.id !== doc.track) {
      if (local.queueLoading) return;
      const localIdx = local.queue.findIndex(
        (c, i) => c.id === doc.track && i > (local.currentTrackIndex ?? -1) - 2,
      );
      const localUp = localIdx >= 0 ? local.queue.slice(localIdx + 1).map((c) => c.id) : [];
      if (localIdx >= 0 && planQueueSync(localUp, doc.q.slice(1)).type === 'none') {
        await runAsJamFollower(() => skipToTrack(localIdx));
      } else {
        const songs = await resolveSongs(doc.q);
        const first = songs.find((s) => s.id === doc.track);
        if (!first) return;
        await runAsJamFollower(() => playTrack(first, songs));
      }
      if (expected > 2) await runAsJamFollower(() => seekTo(expected));
      if (!doc.playing) await runAsJamFollower(togglePlayPause);
      lastFollowAt = Date.now();
      return;
    }

    // Same song: bring the songs after it in line with the host's.
    const idx = local.currentTrackIndex ?? 0;
    const localUp = local.queue.slice(idx + 1).map((c) => c.id);
    const plan = planQueueSync(localUp, doc.q.slice(1));
    if (plan.type === 'append') {
      const songs = await resolveSongs(plan.ids);
      if (songs.length > 0) await runAsJamFollower(() => addToQueue(songs));
    } else if (plan.type === 'replace') {
      if (localUp.length > 40) {
        // Removing one by one would take long: reload around the current song instead.
        const songs = await resolveSongs(doc.q);
        const first = songs.find((s) => s.id === doc.track);
        if (first) {
          const at = playerStore.getState().position;
          const wasPlaying = playerStore.getState().playbackState === 'playing';
          await runAsJamFollower(() => playTrack(first, songs));
          await runAsJamFollower(() => seekTo(at));
          if (!wasPlaying) await runAsJamFollower(togglePlayPause);
          lastFollowAt = Date.now();
        }
      } else {
        for (let i = local.queue.length - 1; i > idx; i--) {
          await runAsJamFollower(() => removeFromQueue(i));
        }
        const songs = await resolveSongs(doc.q.slice(1));
        if (songs.length > 0) await runAsJamFollower(() => addToQueue(songs));
      }
    }

    if (busy) return;
    const fresh = playerStore.getState();
    const localPlaying = fresh.playbackState === 'playing';
    if (doc.playing !== localPlaying && (fresh.playbackState === 'playing' || fresh.playbackState === 'paused')) {
      await runAsJamFollower(togglePlayPause);
      lastFollowAt = Date.now();
    }
    if (now - lastFollowAt > SETTLE_MS && Math.abs(fresh.position - expected) > DRIFT_SECONDS) {
      const duration = fresh.duration || fresh.currentTrack?.duration || 0;
      if (!duration || expected < duration - 1) {
        await runAsJamFollower(() => seekTo(expected));
        lastFollowAt = Date.now();
      }
    }
  } finally {
    following = false;
  }
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

let installed = false;

/** Hooks the session into the player and the app lifecycle. Idempotent. */
export function initJamService(): void {
  if (installed) return;
  installed = true;
  playerStore.subscribe(onPlayerChange);
  AppState.addEventListener('change', (next) => {
    if (next === 'active' && jamStore.getState().mode !== 'none') void tick();
  });
  authStore.subscribe((state, prev) => {
    if (jamStore.getState().mode === 'none') return;
    if (!state.isLoggedIn || state.serverUrl !== prev.serverUrl || state.username !== prev.username) {
      // Another account or server: this session belongs to the old one.
      setJamActionHandler(null);
      stopLoop();
      jamStore.getState().setSession('none', null, null);
    }
  });
}

/** Starts a session hosted by this account; others can join it from "Ouvir junto". */
export async function startHosting(): Promise<void> {
  initJamService();
  if (jamStore.getState().mode === 'guest') await leaveSession();
  if (jamStore.getState().mode === 'host') return;
  const me = currentJamUser();
  const sid = newSessionId();
  handled = {};
  lastPublished = null;
  lastPublishedAt = 0;
  jamStore.getState().setEnded(null);
  jamStore.getState().setSession('host', sid, me);
  try {
    await publishHost();
    jamStore.getState().setConnected(true);
  } catch (err) {
    jamStore.getState().setSession('none', null, null);
    throw err;
  }
  startLoop();
}

/** Joins the session `sid` hosted by `host`. Playback switches to the host's song. */
export async function joinSession(sid: string, host: string): Promise<void> {
  initJamService();
  const { mode, sid: current } = jamStore.getState();
  if (mode === 'guest' && current === sid) return;
  if (mode !== 'none') await leaveSession();
  requests = [];
  lastRequestN = 0;
  lastOwnActionAt = 0;
  lastFollowAt = 0;
  missingHost = 0;
  jamStore.getState().setEnded(null);
  jamStore.getState().setSession('guest', sid, host);
  try {
    await writeGuest();
  } catch (err) {
    jamStore.getState().setSession('none', null, null);
    throw err;
  }
  setJamActionHandler(onGuestAction);
  startLoop();
}

/** Leaves the session (as a listener) or ends it for everyone (as the host). */
export async function leaveSession(reason: 'host-left' | null = null): Promise<void> {
  const { mode } = jamStore.getState();
  if (mode === 'none') return;
  setJamActionHandler(null);
  stopLoop();
  jamStore.getState().setSession('none', null, null);
  jamStore.getState().setEnded(reason);
  requests = [];
  try {
    await writeOwnJamComment('');
  } catch {
    // The others notice from the stale heartbeat instead.
  }
}

/** Syncs with the session right away instead of waiting for the next tick. */
export async function syncJamNow(): Promise<void> {
  if (running) await running;
  await tick();
}

/** Refreshes the list of sessions other people are hosting. */
export async function refreshJamSessions(): Promise<void> {
  const store = jamStore.getState();
  store.setSessionsLoading(true);
  try {
    const me = currentJamUser();
    const now = Date.now();
    const hosts = await findJamHosts();
    const sessions: JamSessionSummary[] = hosts
      .filter((h) => !sameUser(h.owner, me) && isHostFresh(h.doc as JamHostDoc, now))
      .map((h) => {
        const doc = h.doc as JamHostDoc;
        return {
          sid: h.sid,
          host: h.owner,
          title: doc.title,
          artist: doc.artist,
          coverArt: doc.coverArt,
          playing: doc.playing,
          listeners: doc.members.length,
        };
      })
      .sort((a, b) => a.host.localeCompare(b.host));
    jamStore.getState().setSessions(sessions);
  } catch (err) {
    jamStore.getState().setSessionsLoading(false, err instanceof Error ? err.message : String(err));
  }
}
