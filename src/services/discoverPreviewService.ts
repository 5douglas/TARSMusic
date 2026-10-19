/**
 * 30-second Deezer previews for the Discover tab. Runs on its own expo-audio
 * player so previews never enter the main queue (no scrobbles, no queue
 * persistence); the main player is paused first so the two never overlap.
 */
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

import { discoverPreviewStore } from '../store/discoverPreviewStore';
import { playerStore } from '../store/playerStore';
import { discoverPreviewUrl } from './discoverService';
import { togglePlayPause } from './playerService';

let player: AudioPlayer | null = null;

export function stopDiscoverPreview(): void {
  if (player) {
    player.remove();
    player = null;
  }
  discoverPreviewStore.getState().setPlayingId(null);
}

/** Plays the preview for `trackId`, or stops it if that preview is already playing. */
export async function toggleDiscoverPreview(trackId: number): Promise<void> {
  const wasPlaying = discoverPreviewStore.getState().playingId === trackId;
  stopDiscoverPreview();
  if (wasPlaying) return;

  const uri = discoverPreviewUrl(trackId);
  if (!uri) return;
  if (playerStore.getState().playbackState === 'playing') await togglePlayPause();

  const next = createAudioPlayer({ uri });
  next.addListener('playbackStatusUpdate', (status) => {
    if (status.didJustFinish && player === next) stopDiscoverPreview();
  });
  player = next;
  discoverPreviewStore.getState().setPlayingId(trackId);
  next.play();
}
