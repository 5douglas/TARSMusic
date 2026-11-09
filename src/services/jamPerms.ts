/**
 * Host rules for a listening-together session ("Ouvir junto"): which listener controls the
 * host carries out. Kept free of imports so stores and services can both use it.
 */

export type JamActionKind =
  | 'play'
  | 'pause'
  | 'next'
  | 'prev'
  | 'seek'
  | 'jump'
  | 'remove'
  | 'shuffle'
  | 'add'
  | 'addNext'
  | 'playNow';

/**
 * What the host lets listeners do. Each group of controls can be switched off, and single
 * listeners can be set to "listen only". Missing in a doc (an older app hosting) = all allowed.
 */
export interface JamPerms {
  /** Play, pause and seek. */
  playback: boolean;
  /** Next, previous and picking a song in the queue. */
  skip: boolean;
  /** Add songs, play next, play now, remove and shuffle. */
  queue: boolean;
}

export type JamPermKey = keyof JamPerms;

export const DEFAULT_JAM_PERMS: JamPerms = { playback: true, skip: true, queue: true };

/** The permission a listener's action needs. */
export function permForAction(kind: JamActionKind): JamPermKey {
  switch (kind) {
    case 'play':
    case 'pause':
    case 'seek':
      return 'playback';
    case 'next':
    case 'prev':
    case 'jump':
      return 'skip';
    default:
      return 'queue';
  }
}

function sameName(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** Whether `user` may do `kind` in a session with these rules. */
export function isJamActionAllowed(
  kind: JamActionKind,
  user: string | null | undefined,
  perms: JamPerms,
  listenOnly: string[],
): boolean {
  if (user && listenOnly.some((u) => sameName(u, user))) return false;
  return perms[permForAction(kind)] !== false;
}

export function normalizeJamPerms(raw: unknown): JamPerms {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<JamPermKey, unknown>>;
  return {
    playback: p.playback !== false,
    skip: p.skip !== false,
    queue: p.queue !== false,
  };
}

