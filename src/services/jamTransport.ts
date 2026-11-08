/**
 * Where a listening-together session ("Ouvir junto") lives on the server.
 *
 * Navidrome has no API for shared app state, so every member keeps one PUBLIC playlist named
 * `JAM_PLAYLIST_NAME`, with no songs, whose comment holds that member's part of the session:
 * the host's comment is the session state (track, position, queue), each listener's comment
 * is the list of things that listener asked for. Only the owner can change a playlist
 * (navidrome persistence/playlist_repository.go userFilter + core playlists Update →
 * ErrNotAuthorized), and public playlists are readable by every user, which is exactly the
 * shape a host + listeners need.
 *
 * Reads go through Navidrome's own REST API (`/api/playlist?q=`), whose `q` filter matches a
 * substring of the name or the comment (persistence/playlist_repository.go playlistFilter).
 * That lets one small request return just the comments of one session, instead of the
 * Subsonic `getPlaylists`, which carries every playlist comment (backups included) on each call.
 */
import { authStore } from '../store/authStore';
import { buildPostApi, getApi, JAM_PLAYLIST_NAME } from './subsonicService';

export const JAM_COMMENT_PREFIX = 'TARSJAM1';

export type JamRole = 'host' | 'guest';

/** The host's comment: what everyone should be hearing right now. */
export interface JamHostDoc {
  /** Host clock, ms, when `pos` was read. */
  at: number;
  /** Song id playing now (also `q[0]`), null when nothing is loaded. */
  track: string | null;
  /** The current song followed by the next ones in the host's queue. */
  q: string[];
  /** Seconds into `track` at `at`. */
  pos: number;
  playing: boolean;
  /** Per listener, the newest request number the host has carried out. */
  handled: Record<string, number>;
  /** Usernames of the listeners currently in the session. */
  members: string[];
  /** For the session list: what is playing. */
  title?: string;
  artist?: string;
  coverArt?: string;
}

export type JamWireAction =
  | { kind: 'play' }
  | { kind: 'pause' }
  | { kind: 'next' }
  | { kind: 'prev' }
  | { kind: 'seek'; pos: number }
  | { kind: 'jump'; songId: string; index: number }
  | { kind: 'remove'; songId: string; index: number }
  | { kind: 'shuffle' }
  | { kind: 'add'; ids: string[] }
  | { kind: 'addNext'; id: string }
  | { kind: 'playNow'; id: string; ids: string[] };

export type JamRequest = JamWireAction & { n: number };

/** A listener's comment: still here (`at`), and what they asked the host to do. */
export interface JamGuestDoc {
  at: number;
  reqs: JamRequest[];
}

export interface JamEntry {
  playlistId: string;
  owner: string;
  role: JamRole;
  sid: string;
  doc: JamHostDoc | JamGuestDoc;
}

export function encodeJamComment(role: JamRole, sid: string, doc: JamHostDoc | JamGuestDoc): string {
  return `${JAM_COMMENT_PREFIX}|${role}|${sid}|${JSON.stringify(doc)}`;
}

/** A playlist comment → its session part, or null for anything else (an ended session is ''). */
export function parseJamComment(comment: string | null | undefined): Omit<JamEntry, 'playlistId' | 'owner'> | null {
  if (!comment || !comment.startsWith(`${JAM_COMMENT_PREFIX}|`)) return null;
  const parts = comment.split('|');
  if (parts.length < 4) return null;
  const role = parts[1];
  const sid = parts[2];
  if ((role !== 'host' && role !== 'guest') || !/^[a-z0-9]{6,32}$/.test(sid)) return null;
  const json = parts.slice(3).join('|');
  try {
    const doc = JSON.parse(json) as JamHostDoc | JamGuestDoc;
    if (!doc || typeof doc !== 'object' || typeof doc.at !== 'number') return null;
    if (role === 'host') {
      const h = doc as JamHostDoc;
      if (!Array.isArray(h.q) || typeof h.pos !== 'number' || typeof h.playing !== 'boolean') return null;
      if (!h.handled || typeof h.handled !== 'object') h.handled = {};
      if (!Array.isArray(h.members)) h.members = [];
    } else {
      const g = doc as JamGuestDoc;
      if (!Array.isArray(g.reqs)) g.reqs = [];
    }
    return { role, sid, doc };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Navidrome REST (read side)                                         */
/* ------------------------------------------------------------------ */

let ndToken: { key: string; token: string } | null = null;

function accountKey(): string | null {
  const { serverUrl, username } = authStore.getState();
  return serverUrl && username ? `${serverUrl}|${username.toLowerCase()}` : null;
}

function baseUrl(): string | null {
  const url = authStore.getState().serverUrl;
  return url ? url.replace(/\/+$/, '') : null;
}

async function login(): Promise<string> {
  const { username, password } = authStore.getState();
  const base = baseUrl();
  const key = accountKey();
  if (!base || !key || !username || !password) throw new Error('not signed in');
  const res = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`login ${res.status}`);
  const body = (await res.json()) as { token?: string };
  if (!body.token) throw new Error('login: no token');
  ndToken = { key, token: body.token };
  return body.token;
}

async function ndGet<T>(path: string): Promise<T> {
  const base = baseUrl();
  const key = accountKey();
  if (!base || !key) throw new Error('not signed in');
  if (!getApi()) throw new Error('offline');
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = ndToken && ndToken.key === key && attempt === 0 ? ndToken.token : await login();
    const res = await fetch(`${base}${path}`, { headers: { 'X-ND-Authorization': `Bearer ${token}` } });
    if (res.status === 401) {
      ndToken = null;
      continue;
    }
    if (!res.ok) throw new Error(`${path} ${res.status}`);
    // Navidrome sends a refreshed token with every answer (server/auth.go).
    const fresh = res.headers.get('x-nd-authorization');
    if (fresh && fresh.toLowerCase().startsWith('bearer ')) ndToken = { key, token: fresh.slice(7) };
    return (await res.json()) as T;
  }
  throw new Error('unauthorized');
}

interface NdPlaylist {
  id: string;
  name: string;
  comment?: string;
  ownerName?: string;
  public?: boolean;
}

/** Every session part whose comment contains `needle` (a session id, or the host marker). */
export async function findJamEntries(needle: string): Promise<JamEntry[]> {
  const q = encodeURIComponent(needle);
  const list = await ndGet<NdPlaylist[]>(`/api/playlist?q=${q}&_start=0&_end=200`);
  const out: JamEntry[] = [];
  for (const p of Array.isArray(list) ? list : []) {
    if (p.name !== JAM_PLAYLIST_NAME || !p.ownerName) continue;
    const parsed = parseJamComment(p.comment);
    if (!parsed) continue;
    out.push({ playlistId: p.id, owner: p.ownerName, ...parsed });
  }
  return out;
}

/** All sessions hosted right now (by anyone, this account included). */
export function findJamHosts(): Promise<JamEntry[]> {
  return findJamEntries(`${JAM_COMMENT_PREFIX}|host|`);
}

/** The host's and every listener's part of one session. */
export function findJamSession(sid: string): Promise<JamEntry[]> {
  return findJamEntries(`|${sid}|`);
}

/* ------------------------------------------------------------------ */
/*  Own playlist (write side)                                          */
/* ------------------------------------------------------------------ */

let ownPlaylist: { key: string; id: string } | null = null;

async function ensureOwnPlaylist(): Promise<string> {
  const key = accountKey();
  if (!key) throw new Error('not signed in');
  if (ownPlaylist?.key === key) return ownPlaylist.id;
  const api = getApi();
  if (!api) throw new Error('offline');
  const username = authStore.getState().username?.toLowerCase();
  const find = async () => {
    const res = await api.getPlaylists();
    return (res.playlists?.playlist ?? []).find(
      (p) => p.name === JAM_PLAYLIST_NAME && (!p.owner || p.owner.toLowerCase() === username),
    );
  };
  let match = await find();
  if (!match) {
    await api.createPlaylist({ name: JAM_PLAYLIST_NAME });
    match = await find();
    if (!match) throw new Error('could not create the session playlist');
  }
  ownPlaylist = { key, id: match.id };
  return match.id;
}

/** Writes this account's part of a session ('' ends it). */
export async function writeOwnJamComment(comment: string): Promise<void> {
  const id = await ensureOwnPlaylist();
  const api = buildPostApi();
  if (!api) throw new Error('offline');
  try {
    await api.updatePlaylist({ playlistId: id, comment, public: true });
  } catch (err) {
    // The playlist may have been deleted by hand: look it up again next time.
    ownPlaylist = null;
    throw err;
  }
}

export function currentJamUser(): string | null {
  return authStore.getState().username ?? null;
}
