/**
 * Desktop mini player (Windows / Linux app): a small always-on-top window with the cover,
 * the song and the main controls. The Electron main process owns the window
 * (desktop/main.js, desktop/mini/mini.html); this side sends it what is playing and carries
 * out the buttons pressed in it. Phones don't have it (`isMiniPlayerAvailable()` is false).
 */
import { playerStore } from '../store/playerStore';
import { getCoverArtUrl } from './subsonicService';
import { seekTo, skipToNext, skipToPrevious, togglePlayPause } from './playerService';

export interface MiniPlayerState {
  title: string;
  artist: string;
  cover: string | null;
  playing: boolean;
  /** Seconds. */
  position: number;
  duration: number;
  /** Date.now() when `position` was read, so the window can move the bar on its own. */
  at: number;
}

export type MiniPlayerCommand =
  | { kind: 'toggle' }
  | { kind: 'next' }
  | { kind: 'prev' }
  | { kind: 'seek'; position: number };

interface DesktopMiniBridge {
  open: () => void;
  close: () => void;
  sendState: (state: MiniPlayerState) => void;
  onCommand: (listener: (cmd: MiniPlayerCommand) => void) => () => void;
}

function bridge(): DesktopMiniBridge | null {
  return (globalThis as { tarsDesktopMini?: DesktopMiniBridge }).tarsDesktopMini ?? null;
}

export function isMiniPlayerAvailable(): boolean {
  return bridge() !== null;
}

type PlayerState = ReturnType<typeof playerStore.getState>;

export function miniStateFrom(s: PlayerState, now = Date.now()): MiniPlayerState {
  const track = s.currentTrack;
  const playing = s.playbackState === 'playing' || s.playbackState === 'buffering' || s.playbackState === 'loading';
  return {
    title: track?.title ?? '',
    artist: track?.artist ?? '',
    cover: track?.coverArt ? getCoverArtUrl(track.coverArt, 300) : null,
    playing,
    position: s.position ?? 0,
    duration: s.duration || track?.duration || 0,
    at: now,
  };
}

/** Carries out a button pressed in the mini window. */
export async function runMiniCommand(cmd: MiniPlayerCommand): Promise<void> {
  switch (cmd.kind) {
    case 'toggle':
      return togglePlayPause();
    case 'next':
      return skipToNext();
    case 'prev':
      return skipToPrevious();
    case 'seek':
      return seekTo(Math.max(0, cmd.position));
  }
}

let installed = false;

/** Keeps the mini window in step with the player. Idempotent; a no-op off the desktop. */
export function installMiniPlayerSync(): void {
  const b = bridge();
  if (!b || installed) return;
  installed = true;
  let lastSent = 0;
  const send = () => {
    lastSent = Date.now();
    b.sendState(miniStateFrom(playerStore.getState(), lastSent));
  };
  playerStore.subscribe((s, prev) => {
    const changed =
      s.currentTrack?.id !== prev.currentTrack?.id ||
      s.playbackState !== prev.playbackState ||
      s.duration !== prev.duration ||
      Math.abs((s.position ?? 0) - (prev.position ?? 0)) > 2; // a seek
    // Progress reports: the window extrapolates, so a refresh every few seconds is enough.
    if (changed || Date.now() - lastSent > 5000) send();
  });
  b.onCommand((cmd) => void runMiniCommand(cmd).catch(() => undefined));
  send();
}

/** Opens the mini window (the desktop app's "mini player" button). */
export function openMiniPlayer(): void {
  const b = bridge();
  if (!b) return;
  installMiniPlayerSync();
  b.open();
  b.sendState(miniStateFrom(playerStore.getState()));
}
