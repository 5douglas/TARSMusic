/**
 * Shared audio-related types used across stores, services, and utilities.
 *
 * Extracted from individual modules so that helpers (e.g. effectiveFormat)
 * can reference them without importing from stores directly.
 */

/**
 * Stream format identifier sent as the Subsonic `format=` query parameter.
 * `'raw'` is the canonical "no transcoding" sentinel — for any other value
 * the URL builder sends `format=<value>` verbatim.
 */
export type StreamFormat = string;

/**
 * Maximum bitrate in kbps for streaming or downloads.
 * `null` means no limit (server default / original quality).
 */
export type MaxBitRate = 64 | 128 | 192 | 256 | 320 | null;

/**
 * The resolved format actually delivered to the player, captured at the
 * moment a track is downloaded or added to the play queue.
 */
export interface EffectiveFormat {
  /** Lower-case format suffix actually delivered (e.g. "mp3", "flac", "opus"). */
  suffix: string;
  /** Effective bitrate in kbps. Source value for raw passthrough, capped value for transcodes. */
  bitRate?: number;
  /** Bit depth, only set for raw lossless passthrough when the source Child had it. */
  bitDepth?: number;
  /** Sample rate in Hz, only set for raw lossless passthrough when the source Child had it. */
  samplingRate?: number;
  /** When this stamp was captured (ms since epoch). */
  capturedAt: number;
}
