import { requireOptionalNativeModule } from 'expo-modules-core';

export interface ExpoPlayerWidgetModule {
  /** The track now playing (resets lyrics until `setLyrics`). */
  setTrack(title: string | null, artist: string | null, album: string | null): void;
  /** Its cover: a file://, content:// or http(s) URI; null for the placeholder. */
  setArtwork(uri: string | null): void;
  /** Nothing is loaded any more. */
  clearTrack(): void;
  /** Synced lyrics for the current track: line start times (ms, offset applied) and texts. Empty clears. */
  setLyrics(startsMs: number[], lines: string[]): void;
  /** A position report. `advancing`: the clock runs (playing). `playing`: the button shows pause. */
  syncPosition(positionMs: number, advancing: boolean, playing: boolean): void;
  /** The lyrics line in the widget. */
  setLyricsEnabled(enabled: boolean): void;
}

/**
 * The home-screen widget bridge, or null in a build that predates it
 * (an older APK running a newer bundle) and on iOS.
 */
export const PlayerWidget = requireOptionalNativeModule<ExpoPlayerWidgetModule>('ExpoPlayerWidget');
