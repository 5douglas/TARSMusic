import { memo, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useLyricsActiveLine } from '../hooks/useLyricsActiveLine';
import { useLyricsTranslation } from '../hooks/useLyricsTranslation';
import { type LyricsData } from '../services/subsonicService';

/** Height of the visible window of lines. */
const VIEWPORT_HEIGHT = 300;
/** Where the line being sung sits in the window, from its top. */
const ACTIVE_ANCHOR = 72;
/** Unsynced lyrics only show their start. */
const UNSYNCED_LINES = 7;
const SCROLL_TIMING = { duration: 550, easing: Easing.out(Easing.cubic) } as const;
const FADE_TIMING = { duration: 350, easing: Easing.out(Easing.quad) } as const;

/**
 * Spotify's lyrics preview under the player: a card in the cover's colour whose lines glide
 * up as the song plays, the sung line in white and the rest dimmed, with "Show lyrics" to
 * open the full screen. The line comes from `useLyricsActiveLine`, which keeps it in time
 * with the audio between the player's position reports.
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
  const active = useLyricsActiveLine(lyrics);
  const hasLines = !!lyrics && lyrics.lines.length > 0;
  const lines = hasLines ? (synced ? lyrics.lines : lyrics.lines.slice(0, UNSYNCED_LINES)) : [];
  const { translations } = useLyricsTranslation(lyrics?.lines);

  const activeSV = useSharedValue(synced ? -1 : -2);
  const translateY = useSharedValue(0);
  const lineTops = useRef<number[]>([]);

  const scrollTo = useCallback(
    (index: number, animated: boolean) => {
      const top = index >= 0 ? lineTops.current[index] : 0;
      if (top == null) return;
      const target = index >= 0 ? Math.min(0, ACTIVE_ANCHOR - top) : 0;
      translateY.value = animated ? withTiming(target, SCROLL_TIMING) : target;
    },
    [translateY],
  );

  useEffect(() => {
    activeSV.value = synced ? active : -2;
    if (synced) scrollTo(active, true);
  }, [active, synced, activeSV, scrollTo]);

  // A new song starts at the top.
  useEffect(() => {
    lineTops.current = [];
    translateY.value = 0;
  }, [lyrics, translateY]);

  const onLineLayout = useCallback(
    (index: number, y: number) => {
      lineTops.current[index] = y;
      // The line being sung laid out after it became active (opening mid-song): jump to it.
      if (index === active && synced) scrollTo(index, false);
    },
    [active, synced, scrollTo],
  );

  const contentStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

  if (!loading && !hasLines) return null;

  return (
    <Pressable
      onPress={onExpand}
      disabled={!hasLines}
      style={({ pressed }) => [styles.card, { backgroundColor }, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={t('lyricsShowAll')}
    >
      <Text style={styles.title}>{t('lyricsPreview')}</Text>
      {hasLines ? (
        <View style={[styles.viewport, !synced && styles.viewportUnsynced]}>
          <Animated.View style={contentStyle}>
            {lines.map((line, i) => (
              <CardLine
                key={i}
                index={i}
                text={line.text}
                translation={translations?.[i]}
                activeSV={activeSV}
                onLayoutTop={onLineLayout}
              />
            ))}
          </Animated.View>
        </View>
      ) : (
        <ActivityIndicator color="#fff" style={styles.spinner} />
      )}
      {hasLines && (
        <View style={styles.showButton}>
          <Text style={styles.showLabel}>{t('lyricsShowAll')}</Text>
        </View>
      )}
    </Pressable>
  );
});

const CardLine = memo(function CardLine({
  index,
  text,
  translation,
  activeSV,
  onLayoutTop,
}: {
  index: number;
  text: string;
  translation?: string | null;
  /** Line being sung; -1 before the first, -2 for unsynced lyrics (all lines lit). */
  activeSV: SharedValue<number>;
  onLayoutTop: (index: number, y: number) => void;
}) {
  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => onLayoutTop(index, e.nativeEvent.layout.y),
    [index, onLayoutTop],
  );
  const style = useAnimatedStyle(() => {
    const a = activeSV.value;
    const target = a === -2 || index === a ? 1 : index < a ? 0.75 : 0.5;
    return { opacity: withTiming(target, FADE_TIMING) };
  }, [index]);
  return (
    <Animated.View onLayout={handleLayout} style={[styles.lineWrap, style]}>
      <Text style={styles.line} numberOfLines={3}>
        {text || '♪'}
      </Text>
      {!!translation && translation !== text && (
        <Text style={styles.lineTranslation} numberOfLines={2}>
          {translation}
        </Text>
      )}
    </Animated.View>
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
    opacity: 0.9,
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 12,
  },
  viewport: {
    height: VIEWPORT_HEIGHT,
    overflow: 'hidden',
  },
  viewportUnsynced: {
    height: undefined,
    maxHeight: VIEWPORT_HEIGHT,
  },
  lineWrap: {
    paddingVertical: 6,
  },
  line: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 30,
  },
  lineTranslation: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 21,
    marginTop: 2,
    opacity: 0.7,
  },
  spinner: {
    paddingVertical: 24,
  },
  showButton: {
    alignSelf: 'flex-start',
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: '#fff',
  },
  showLabel: {
    color: '#000',
    fontSize: 14,
    fontWeight: '700',
  },
});
