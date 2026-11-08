/**
 * The seam between the player and a listening-together session ("Ouvir junto").
 *
 * While this phone is a guest in someone else's session, every control the listener
 * touches (play, pause, skip, seek, pick a song, add to the queue) must also reach the
 * host, who owns the shared queue. `playerService` reports each user action here as the
 * first, synchronous statement of the action, and `jamService` registers the handler.
 *
 * The guest's own follower also drives the player to match the host; it runs those calls
 * inside `runAsJamFollower`, so they are not reported back as user actions.
 */
import type { Child } from './subsonicService';

export type JamAction =
  | { kind: 'play' }
  | { kind: 'pause' }
  | { kind: 'next' }
  | { kind: 'prev' }
  | { kind: 'seek'; pos: number }
  | { kind: 'jump'; songId: string; index: number }
  | { kind: 'remove'; songId: string; index: number }
  | { kind: 'shuffle' }
  | { kind: 'add'; songs: Child[] }
  | { kind: 'addNext'; song: Child }
  | { kind: 'playNow'; song: Child; queue: Child[] };

type Handler = (action: JamAction) => void;

let handler: Handler | null = null;
let followerDepth = 0;

export function setJamActionHandler(next: Handler | null): void {
  handler = next;
}

/** True while a guest handler is registered (radio and other automatic extras stay off). */
export function isJamGuestActive(): boolean {
  return handler !== null;
}

/** Called by the player for a user action. A no-op outside a guest session. */
export function reportJamAction(action: JamAction | (() => JamAction | null)): void {
  if (!handler || followerDepth > 0) return;
  const resolved = typeof action === 'function' ? action() : action;
  if (!resolved) return;
  try {
    handler(resolved);
  } catch {
    // Never let the session break a local control.
  }
}

/**
 * Runs a player call on behalf of the session follower. The depth counter is raised only
 * around the synchronous start of the call, which is where the player reports actions.
 */
export function runAsJamFollower<T>(fn: () => Promise<T>): Promise<T> {
  followerDepth += 1;
  let promise: Promise<T>;
  try {
    promise = fn();
  } finally {
    followerDepth -= 1;
  }
  return promise;
}
