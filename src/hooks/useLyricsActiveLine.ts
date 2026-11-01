import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { LINE_LEAD_MS, pickActiveLine } from '../utils/lyricsTiming';
import { type LyricsData } from '../services/subsonicService';
import { playerStore } from '../store/playerStore';

/** How often the extrapolated clock picks the line: well under a syllable, cheap on JS. */
const TICK_MS = 100;

/**
 * The synced lyrics line being sung, for the surfaces outside the full-screen lyrics (the
 * line under the cover and the lyrics card). The player only reports its position every
 * 500 ms, so reading it straight lags the singer by up to half a second (a whole second when
 * rounded); this extrapolates between reports like `SyncedLyricsView` does and lights the
 * line `LINE_LEAD_MS` early so its animation lands on time. -1 before the first line, and
 * always -1 for unsynced lyrics. Pauses while the app is in the background.
 */
export function useLyricsActiveLine(lyrics: LyricsData | null | undefined): number {
  const lineStarts = useMemo(
    () => (lyrics?.synced ? lyrics.lines.map((l) => l.startMs + lyrics.offsetMs) : []),
    [lyrics],
  );
  const [active, setActive] = useState(-1);
  const activeRef = useRef(-1);

  useEffect(() => {
    if (lineStarts.length === 0) {
      activeRef.current = -1;
      setActive(-1);
      return;
    }
    // Forces the first pick below to publish, whatever the previous song's line was.
    activeRef.current = -2;

    let sampledSec = playerStore.getState().position;
    let sampledAt = Date.now();
    let timer: ReturnType<typeof setInterval> | null = null;

    const pick = () => {
      const s = playerStore.getState();
      const elapsed = s.playbackState === 'playing' ? (Date.now() - sampledAt) / 1000 : 0;
      const ms = (sampledSec + elapsed) * 1000 + LINE_LEAD_MS;
      const idx = pickActiveLine(lineStarts, ms, activeRef.current);
      if (idx !== activeRef.current) {
        activeRef.current = idx;
        setActive(idx);
      }
    };
    // Only a new reported position re-anchors the clock; other store updates (queue,
    // state) must not, or the stale position would pull the line back.
    const unsub = playerStore.subscribe((s, prev) => {
      if (s.position !== prev.position || s.playbackState !== prev.playbackState) {
        sampledSec = s.position;
        sampledAt = Date.now();
        pick();
      }
    });
    const start = () => {
      if (timer == null) timer = setInterval(pick, TICK_MS);
    };
    const stop = () => {
      if (timer != null) clearInterval(timer);
      timer = null;
    };
    const appSub = AppState.addEventListener('change', (next) => (next === 'active' ? start() : stop()));
    pick();
    if (AppState.currentState === 'active') start();
    return () => {
      unsub();
      appSub.remove();
      stop();
    };
  }, [lineStarts]);

  return active;
}
