/**
 * Feeds the Android home-screen widget (modules/expo-player-widget) from the player
 * and lyrics stores.
 *
 * JS only sends facts: the track, its synced lyrics, and position reports. The native
 * side keeps the clock and picks the line being sung, because JS timers stop while the
 * app is in the background and the player reports its position only every 10 s there.
 *
 * Installed from `initPlayer()`, so it runs on the UI boot and on a headless
 * (Android Auto / media-button) start alike. No-op on iOS and on an APK without the module.
 */
import { Platform } from 'react-native';
import { PlayerWidget, type ExpoPlayerWidgetModule } from 'expo-player-widget';

import { resolveDisplayImage } from './imageCacheService';
import type { Child, LyricsData } from './subsonicService';
import { lyricsStore } from '../store/lyricsStore';
import { offlineModeStore } from '../store/offlineModeStore';
import { playbackSettingsStore } from '../store/playbackSettingsStore';
import { playerStore, type PlaybackStatus } from '../store/playerStore';

const ART_SIZE = 300;

let installed = false;
const subscriptions: Array<() => void> = [];

/** The button shows pause while the player is playing or getting ready to. */
const showsPause = (s: PlaybackStatus): boolean =>
  s === 'playing' || s === 'buffering' || s === 'loading';

/** Line starts (offset applied) + texts, or null when the lyrics are not synced. */
export function syncedLines(lyrics: LyricsData | null | undefined): { starts: number[]; lines: string[] } | null {
  if (!lyrics?.synced || lyrics.lines.length === 0) return null;
  return {
    starts: lyrics.lines.map((l) => l.startMs + lyrics.offsetMs),
    lines: lyrics.lines.map((l) => l.text),
  };
}

function pushPosition(native: ExpoPlayerWidgetModule): void {
  const { position, playbackState } = playerStore.getState();
  native.syncPosition(position * 1000, playbackState === 'playing', showsPause(playbackState));
}

async function pushArtwork(native: ExpoPlayerWidgetModule, track: Child): Promise<void> {
  if (!track.coverArt) {
    native.setArtwork(null);
    return;
  }
  try {
    const uri = (await resolveDisplayImage(track, ART_SIZE, { offline: offlineModeStore.getState().offlineMode })).uri;
    // The track may have changed while the cover resolved.
    if (playerStore.getState().currentTrack?.id !== track.id) return;
    native.setArtwork(uri ?? null);
  } catch {
    /* the widget keeps its placeholder */
  }
}

async function pushLyrics(native: ExpoPlayerWidgetModule, track: Child): Promise<void> {
  if (!playbackSettingsStore.getState().widgetLyrics) return;
  const lyrics = await lyricsStore
    .getState()
    .fetchLyrics(track.id, track.artist ?? undefined, track.title ?? undefined)
    .catch(() => null);
  if (playerStore.getState().currentTrack?.id !== track.id) return;
  const synced = syncedLines(lyrics);
  if (synced) native.setLyrics(synced.starts, synced.lines);
}

function pushTrack(native: ExpoPlayerWidgetModule, track: Child | null): void {
  if (!track) {
    native.clearTrack();
    return;
  }
  // Text first so the widget updates at once; the cover follows when resolved.
  native.setTrack(track.title ?? null, track.artist ?? null, track.album ?? null);
  pushPosition(native);
  void pushArtwork(native, track);
  void pushLyrics(native, track);
}

export function installNowPlayingSurfaces(): void {
  if (installed || Platform.OS !== 'android' || !PlayerWidget) return;
  installed = true;
  const native = PlayerWidget;

  native.setLyricsEnabled(playbackSettingsStore.getState().widgetLyrics);
  const current = playerStore.getState().currentTrack;
  if (current) pushTrack(native, current);

  subscriptions.push(
    playerStore.subscribe((s, prev) => {
      if (s.currentTrack?.id !== prev.currentTrack?.id) {
        pushTrack(native, s.currentTrack);
      } else if (s.position !== prev.position || s.playbackState !== prev.playbackState) {
        pushPosition(native);
      }
    }),
    playbackSettingsStore.subscribe((s, prev) => {
      if (s.widgetLyrics === prev.widgetLyrics) return;
      native.setLyricsEnabled(s.widgetLyrics);
      const track = playerStore.getState().currentTrack;
      if (s.widgetLyrics && track) {
        void pushLyrics(native, track).then(() => pushPosition(native));
      }
    }),
  );
}

/** Internal state reset for unit tests (not public API). */
export const __test = {
  reset: () => {
    subscriptions.forEach((dispose) => dispose());
    subscriptions.length = 0;
    installed = false;
  },
};
