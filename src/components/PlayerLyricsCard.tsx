import Ionicons from '@react-native-vector-icons/ionicons/static';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { type LyricsData } from '../services/subsonicService';
import { playerStore } from '../store/playerStore';

/** Lines shown in the card: one already sung, the current one and the next few. */
const LINES_BEFORE = 1;
const LINES_SHOWN = 7;

/** Index of the line being sung at `positionMs`, or -1 before the first line. */
export function activeLyricsLine(lines: { startMs: number }[], offsetMs: number, positionMs: number): number {
  let active = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startMs + offsetMs <= positionMs) active = i;
    else break;
  }
  return active;
}

/** The lines the card shows and which of them is active (-1 when none is). */
export function lyricsCardWindow(
  lyrics: LyricsData,
  positionMs: number,
): { lines: string[]; activeInWindow: number } {
  const texts = lyrics.lines.map((l) => l.text);
  if (!lyrics.synced) return { lines: texts.slice(0, LINES_SHOWN), activeInWindow: -1 };
  const active = activeLyricsLine(lyrics.lines, lyrics.offsetMs, positionMs);
  const start = Math.max(0, Math.min(active - LINES_BEFORE, texts.length - LINES_SHOWN));
  return { lines: texts.slice(start, start + LINES_SHOWN), activeInWindow: active - start };
}

/**
 * Spotify's lyrics card under the player: a block in the cover's colour that follows the
 * song, current line in white. Tapping it opens the full-screen lyrics.
 */
export const PlayerLyricsCard = memo(function PlayerLyricsCard({
  lyrics,
  loading,
  backgroundColor,
  onExpand,
}: {
  lyrics: LyricsData | null | undefined;
  loading: boolean;
  backgroundColor: string;
  onExpand: () => void;
}) {
  const { t } = useTranslation();
  const synced = !!lyrics?.synced;
  // Only synced lyrics need the position; a whole-second tick is plenty for a preview.
  const positionMs = playerStore((s) => (synced ? Math.floor(s.position) * 1000 : 0));

  const view = useMemo(
    () => (lyrics && lyrics.lines.length > 0 ? lyricsCardWindow(lyrics, positionMs) : null),
    [lyrics, positionMs],
  );

  if (!loading && !view) return null;

  return (
    <Pressable
      onPress={onExpand}
      disabled={!view}
      style={({ pressed }) => [styles.card, { backgroundColor }, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={t('lyricsShowAll')}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{t('lyrics')}</Text>
        <Ionicons name="expand-outline" size={20} color="#fff" />
      </View>
      {view ? (
        view.lines.map((line, i) => (
          <Text
            key={`${i}-${line}`}
            style={[
              styles.line,
              view.activeInWindow >= 0 && i > view.activeInWindow && styles.upcoming,
              view.activeInWindow >= 0 && i < view.activeInWindow && styles.past,
            ]}
            numberOfLines={2}
          >
            {line || '♪'}
          </Text>
        ))
      ) : (
        <ActivityIndicator color="#fff" style={styles.spinner} />
      )}
      {view && (
        <View style={styles.showButton}>
          <Text style={styles.showLabel}>{t('lyricsShowAll')}</Text>
        </View>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  pressed: {
    opacity: 0.85,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  line: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 30,
    marginBottom: 4,
  },
  past: {
    color: 'rgba(255,255,255,0.7)',
  },
  upcoming: {
    color: 'rgba(0,0,0,0.55)',
  },
  spinner: {
    paddingVertical: 24,
  },
  showButton: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  showLabel: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});
