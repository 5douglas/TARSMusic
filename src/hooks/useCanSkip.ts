import { playerStore } from '../store/playerStore';
import { playbackSettingsStore } from '../store/playbackSettingsStore';

/**
 * Reactive check for whether skip-to-next and skip-to-previous are possible
 * given the current queue position and repeat mode.
 */
export function useCanSkip(): { canSkipNext: boolean; canSkipPrevious: boolean } {
  const currentTrackIndex = playerStore((s) => s.currentTrackIndex);
  const queueLength = playerStore((s) => s.queue).length;
  const repeatMode = playbackSettingsStore((s) => s.repeatMode);

  if (currentTrackIndex == null || queueLength === 0) {
    return { canSkipNext: false, canSkipPrevious: false };
  }

  return {
    canSkipNext: repeatMode !== 'off' || currentTrackIndex < queueLength - 1,
    canSkipPrevious: true,
  };
}
