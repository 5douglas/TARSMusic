import { useEffect, useState } from 'react';

import { translateLyrics, targetLanguage } from '../services/lyricsTranslationService';
import { type LyricsLine } from '../services/subsonicService';
import { lyricsTranslationStore } from '../store/lyricsTranslationStore';

/** Translations of this session, keyed by the lyrics text, so reopening a song is instant. */
const cache = new Map<string, string[] | null>();

export interface LyricsTranslationResult {
  /** Translation toggle state (shared by every lyrics surface). */
  enabled: boolean;
  toggle: () => void;
  /** One translation per line while enabled and loaded; null otherwise. */
  translations: string[] | null;
  loading: boolean;
  /** The service failed, or the lyrics are already in the phone's language. */
  unavailable: boolean;
}

export function useLyricsTranslation(lines: LyricsLine[] | null | undefined): LyricsTranslationResult {
  const enabled = lyricsTranslationStore((s) => s.enabled);
  const [state, setState] = useState<{ key: string; lines: string[] | null } | null>(null);
  const [loading, setLoading] = useState(false);

  const target = targetLanguage();
  const key = lines && lines.length > 0 ? `${target}\u0000${lines.map((l) => l.text).join('\n')}` : '';

  useEffect(() => {
    if (!enabled || !key || !lines) return;
    if (cache.has(key)) {
      setState({ key, lines: cache.get(key) ?? null });
      return;
    }
    let alive = true;
    setLoading(true);
    translateLyrics(lines.map((l) => l.text), target)
      .then((res) => {
        // Already in the phone's language: nothing to show under each line.
        const value = res && res.sourceLang !== target ? res.lines : null;
        cache.set(key, value);
        if (alive) setState({ key, lines: value });
      })
      .catch(() => {
        if (alive) setState({ key, lines: null });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // `lines` is captured through `key`, which changes whenever their text does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key, target]);

  const current = state && state.key === key ? state.lines : null;
  return {
    enabled,
    toggle: () => lyricsTranslationStore.getState().setEnabled(!enabled),
    translations: enabled ? current : null,
    loading: enabled && loading,
    unavailable: enabled && !loading && state?.key === key && current == null,
  };
}
