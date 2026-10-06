/**
 * Tracks real-time download speed by aggregating native progress events
 * from expo-async-fs across all concurrent downloads.
 *
 * Uses a rolling window of byte deltas to compute a smoothed speed
 * in bytes per second. The global listener is registered once on
 * module import and lives for the app lifetime.
 */

import { addDownloadProgressListener } from 'expo-async-fs';

const WINDOW_MS = 10_000;

interface SpeedSample {
  time: number;
  bytes: number;
}

const downloadBytesMap = new Map<string, number>();
const samples: SpeedSample[] = [];

/**
 * IDs that have been explicitly cleared. Guards against late-arriving
 * native progress events that cross the bridge after the JS promise
 * has already resolved and clearDownload has run.
 */
const finishedIds = new Set<string>();

function pruneOldSamples(): void {
  const cutoff = Date.now() - WINDOW_MS;
  while (samples.length > 0 && samples[0].time < cutoff) {
    samples.shift();
  }
}

addDownloadProgressListener((event) => {
  if (finishedIds.has(event.downloadId)) return;

  const prev = downloadBytesMap.get(event.downloadId) ?? 0;
  const delta = event.bytesWritten - prev;
  downloadBytesMap.set(event.downloadId, event.bytesWritten);

  if (delta > 0) {
    samples.push({ time: Date.now(), bytes: delta });
    pruneOldSamples();
  }
});

/**
 * Returns the current combined download speed in bytes per second,
 * averaged over the rolling window.
 */
export function getDownloadSpeed(): number {
  pruneOldSamples();
  if (samples.length < 2) return 0;
  const totalBytes = samples.reduce((sum, s) => sum + s.bytes, 0);
  const elapsed = (Date.now() - samples[0].time) / 1000;
  if (elapsed <= 0) return 0;
  return totalBytes / elapsed;
}

/**
 * Returns the number of downloads currently being tracked
 * (i.e. that have received progress events but haven't been cleared).
 */
export function getActiveDownloadCount(): number {
  return downloadBytesMap.size;
}

/**
 * Reset tracking state for a download that is about to start (or
 * restart). Removes any stale finished marker so progress events
 * are accepted again.
 */
export function beginDownload(downloadId: string): void {
  finishedIds.delete(downloadId);
  downloadBytesMap.delete(downloadId);
}

/**
 * Remove a download from tracking. Call this when a track download
 * completes or fails so it no longer counts as active. Late-arriving
 * native progress events for this ID will be ignored.
 */
export function clearDownload(downloadId: string): void {
  downloadBytesMap.delete(downloadId);
  finishedIds.add(downloadId);
}

/**
 * Reset all tracking state. Used only in tests for isolation.
 * @internal
 */
export function __resetForTesting(): void {
  downloadBytesMap.clear();
  samples.length = 0;
  finishedIds.clear();
}
