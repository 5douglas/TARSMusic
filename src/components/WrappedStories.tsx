/**
 * Retrospectiva as stories: full-screen cards with progress bars at the top, that move
 * on by themselves or by tapping the sides (arrow buttons and keys on the desktop). Each story can be shared
 * as an image (the share sheet on the phone, a downloaded PNG on the desktop app).
 */
import Ionicons from '@react-native-vector-icons/ionicons/static';
import { LinearGradient } from 'expo-linear-gradient';
import { shareAsync } from 'expo-sharing';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

import { CachedImage } from './CachedImage';
import { useArtistCoverArt } from '../hooks/useTopArtists';
import { processingOverlayStore } from '../store/processingOverlayStore';
import { getArtistInitials } from '../utils/stringHelpers';
import type { WrappedSummary } from '../utils/wrapped';

const LOGO = require('../assets/logo-mark.png');

/** How long each story stays before moving on by itself. */
export const STORY_MS = 7000;

/** Each story's background: vivid two-colour gradients. */
const PALETTES: [string, string][] = [
  ['#1D9BF0', '#0B2A5B'],
  ['#7B2FF7', '#F107A3'],
  ['#00B4A0', '#05445E'],
  ['#FF5F6D', '#7A1F5C'],
  ['#F7971E', '#B5172E'],
  ['#3A1C71', '#1D9BF0'],
  ['#11998E', '#38EF7D'],
  ['#121826', '#1D9BF0'],
];

export interface WrappedStoriesData {
  summary: WrappedSummary;
  /** "2026" or "novembro de 2026". */
  periodLabel: string;
  minutes: number;
  /** Already formatted (locale), e.g. "21:00". */
  peakHourLabel: string | null;
  /** Already formatted, e.g. "3 de março". */
  busiestDayLabel: string | null;
  bestMonthLabel: string | null;
  fmtInt: (n: number) => string;
}

type StoryId = 'intro' | 'minutes' | 'topArtist' | 'artists' | 'songs' | 'album' | 'facts' | 'summary';

/** The stories that have something to show, in order. */
export function storyIds(summary: WrappedSummary): StoryId[] {
  const ids: StoryId[] = ['intro', 'minutes'];
  if (summary.topArtists.length > 0) ids.push('topArtist');
  if (summary.topArtists.length > 1) ids.push('artists');
  if (summary.topSongs.length > 0) ids.push('songs');
  if (summary.topAlbums.length > 0) ids.push('album');
  if (summary.topGenres.length > 0 || summary.peakHour !== null || summary.busiestDay) ids.push('facts');
  ids.push('summary');
  return ids;
}

function Cover({ id, size, round }: { id?: string; size: number; round?: boolean }) {
  const style = { width: size, height: size, borderRadius: round ? size / 2 : 8 };
  return id ? (
    <CachedImage coverArtId={id} size={300} style={style} resizeMode="cover" />
  ) : (
    <View style={[style, styles.coverFallback]}>
      <Ionicons name="musical-notes" size={size * 0.4} color="rgba(255,255,255,0.8)" />
    </View>
  );
}

function Brand() {
  return (
    <View style={styles.brand}>
      <Image source={LOGO} style={styles.brandLogo} resizeMode="contain" />
      <Text style={styles.brandText}>TARSMusic</Text>
    </View>
  );
}

function StoryBody({ id, data, artistCover }: { id: StoryId; data: WrappedStoriesData; artistCover?: string }) {
  const { t } = useTranslation();
  const { summary, fmtInt } = data;
  const top = summary.topArtists[0];
  switch (id) {
    case 'intro':
      return (
        <View style={styles.center}>
          <Image source={LOGO} style={styles.introLogo} resizeMode="contain" />
          <Text style={styles.kicker}>{t('wrappedStoriesIntroKicker')}</Text>
          <Text style={styles.huge}>{data.periodLabel}</Text>
          <Text style={styles.body}>{t('wrappedStoriesIntroBody')}</Text>
        </View>
      );
    case 'minutes':
      return (
        <View style={styles.center}>
          <Text style={styles.kicker}>{t('wrappedStoriesMinutesKicker')}</Text>
          <Text style={styles.giant} adjustsFontSizeToFit numberOfLines={1}>{fmtInt(data.minutes)}</Text>
          <Text style={styles.title}>{t('wrappedStoriesMinutesUnit')}</Text>
          <Text style={styles.body}>
            {t('wrappedStoriesMinutesBody', { plays: fmtInt(summary.totalPlays), days: fmtInt(summary.daysListened) })}
          </Text>
          {data.bestMonthLabel && (
            <Text style={styles.body}>{t('wrappedBestMonth', { month: data.bestMonthLabel })}</Text>
          )}
        </View>
      );
    case 'topArtist':
      return (
        <View style={styles.center}>
          <Text style={styles.kicker}>{t('wrappedTopArtist')}</Text>
          {artistCover ? (
            <Cover id={artistCover} size={220} round />
          ) : (
            <View style={[styles.initials, { width: 220, height: 220, borderRadius: 110 }]}>
              <Text style={styles.initialsText}>{getArtistInitials(top.artist)}</Text>
            </View>
          )}
          <Text style={styles.huge} numberOfLines={2} adjustsFontSizeToFit>{top.artist}</Text>
          <Text style={styles.body}>{t('wrappedPlays', { count: top.count, formatted: fmtInt(top.count) })}</Text>
        </View>
      );
    case 'artists':
      return (
        <View style={styles.listStory}>
          <Text style={styles.listTitle}>{t('wrappedTopArtists')}</Text>
          {summary.topArtists.map((a, i) => (
            <View key={a.artist} style={styles.listRow}>
              <Text style={styles.rank}>{i + 1}</Text>
              <View style={styles.listText}>
                <Text style={styles.listName} numberOfLines={1}>{a.artist}</Text>
                <Text style={styles.listSub}>{t('wrappedPlays', { count: a.count, formatted: fmtInt(a.count) })}</Text>
              </View>
            </View>
          ))}
        </View>
      );
    case 'songs':
      return (
        <View style={styles.listStory}>
          <Text style={styles.listTitle}>{t('wrappedTopSongs')}</Text>
          {summary.topSongs.map((s, i) => (
            <View key={s.song.id} style={styles.listRow}>
              <Text style={styles.rank}>{i + 1}</Text>
              <Cover id={s.song.coverArt} size={52} />
              <View style={styles.listText}>
                <Text style={styles.listName} numberOfLines={1}>{s.song.title}</Text>
                <Text style={styles.listSub} numberOfLines={1}>{s.song.artist ?? ''}</Text>
              </View>
            </View>
          ))}
        </View>
      );
    case 'album': {
      const album = summary.topAlbums[0];
      return (
        <View style={styles.center}>
          <Text style={styles.kicker}>{t('wrappedStoriesTopAlbum')}</Text>
          <Cover id={album.coverArt} size={240} />
          <Text style={styles.big} numberOfLines={2}>{album.album}</Text>
          <Text style={styles.body} numberOfLines={1}>{album.artist}</Text>
          <Text style={styles.body}>{t('wrappedPlays', { count: album.count, formatted: fmtInt(album.count) })}</Text>
        </View>
      );
    }
    case 'facts':
      return (
        <View style={styles.listStory}>
          <Text style={styles.listTitle}>{t('wrappedFacts')}</Text>
          {summary.topGenres[0] && (
            <View style={styles.fact}>
              <Text style={styles.factLabel}>{t('wrappedStoriesGenre')}</Text>
              <Text style={styles.factValue} numberOfLines={2}>{summary.topGenres[0].genre}</Text>
            </View>
          )}
          {data.peakHourLabel && (
            <View style={styles.fact}>
              <Text style={styles.factLabel}>{t('wrappedStoriesPeakHour')}</Text>
              <Text style={styles.factValue}>{data.peakHourLabel}</Text>
            </View>
          )}
          {summary.busiestDay && data.busiestDayLabel && (
            <View style={styles.fact}>
              <Text style={styles.factLabel}>{t('wrappedStoriesBusiestDay')}</Text>
              <Text style={styles.factValue}>{data.busiestDayLabel}</Text>
              <Text style={styles.listSub}>
                {t('wrappedPlays', { count: summary.busiestDay.count, formatted: fmtInt(summary.busiestDay.count) })}
              </Text>
            </View>
          )}
        </View>
      );
    case 'summary':
      return (
        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>{t('wrappedStoriesSummaryTitle', { period: data.periodLabel })}</Text>
          {artistCover && <Cover id={artistCover} size={150} round />}
          <View style={styles.summaryCols}>
            <View style={styles.summaryCol}>
              <Text style={styles.summaryHead}>{t('wrappedTopArtists')}</Text>
              {summary.topArtists.slice(0, 5).map((a, i) => (
                <Text key={a.artist} style={styles.summaryItem} numberOfLines={1}>{`${i + 1} ${a.artist}`}</Text>
              ))}
            </View>
            <View style={styles.summaryCol}>
              <Text style={styles.summaryHead}>{t('wrappedTopSongs')}</Text>
              {summary.topSongs.slice(0, 5).map((s, i) => (
                <Text key={s.song.id} style={styles.summaryItem} numberOfLines={1}>{`${i + 1} ${s.song.title}`}</Text>
              ))}
            </View>
          </View>
          <View style={styles.summaryCols}>
            <View style={styles.summaryCol}>
              <Text style={styles.summaryHead}>{t('wrappedStoriesMinutesUnit')}</Text>
              <Text style={styles.summaryBig}>{fmtInt(data.minutes)}</Text>
            </View>
            {summary.topGenres[0] && (
              <View style={styles.summaryCol}>
                <Text style={styles.summaryHead}>{t('wrappedStoriesGenre')}</Text>
                <Text style={styles.summaryBig} numberOfLines={1} adjustsFontSizeToFit>{summary.topGenres[0].genre}</Text>
              </View>
            )}
          </View>
        </View>
      );
  }
}

/** Saves a captured story: the share sheet on the phone, a PNG download on the desktop. */
async function shareImage(uri: string, name: string): Promise<void> {
  if (Platform.OS === 'web') {
    const a = document.createElement('a');
    a.href = uri;
    a.download = `${name}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }
  await shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'TARSMusic', UTI: 'public.png' });
}

export function WrappedStories({
  visible,
  data,
  onClose,
}: {
  visible: boolean;
  data: WrappedStoriesData;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const ids = useMemo(() => storyIds(data.summary), [data.summary]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [sharing, setSharing] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  /** Time spent on the current story, without the paused stretches. */
  const elapsed = useRef(0);
  const cardRef = useRef<View>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const artistCover = useArtistCoverArt(data.summary.topArtists[0]?.artistId)
    ?? data.summary.topAlbums.find((a) => a.artist === data.summary.topArtists[0]?.artist)?.coverArt;

  // Wide windows (the desktop app): arrow buttons beside the card.
  const wide = width >= 700;
  const side = wide ? 72 : 0;
  // A 9:16 card, as big as the window allows.
  const cardH = Math.min(height - insets.top - insets.bottom - (wide ? 48 : 0), ((width - side * 2) * 16) / 9);
  const cardW = Math.min(width - side * 2, (cardH * 9) / 16);

  useEffect(() => {
    if (visible) {
      setIndex(0);
      elapsed.current = 0;
      progress.setValue(0);
    }
  }, [visible, progress]);

  const go = useCallback(
    (delta: number) => {
      elapsed.current = 0;
      progress.setValue(0);
      setIndex((i) => {
        const next = i + delta;
        if (next >= ids.length) {
          onCloseRef.current();
          return i;
        }
        return Math.max(0, next);
      });
    },
    [ids.length, progress],
  );

  // The current story's clock. A plain timer reading the wall clock, so it keeps time
  // whatever re-renders the screen behind does, and resumes where a pause stopped it.
  useEffect(() => {
    if (!visible || paused || sharing) return undefined;
    let last = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      elapsed.current += now - last;
      last = now;
      const p = Math.min(1, elapsed.current / STORY_MS);
      progress.setValue(p);
      if (p >= 1) go(1);
    }, 50);
    return () => clearInterval(timer);
  }, [visible, paused, sharing, index, go, progress]);

  // Desktop keys: arrows move, space pauses, Esc closes.
  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'Escape') onCloseRef.current();
      else if (e.key === ' ') {
        e.preventDefault();
        setPaused((p) => !p);
      } else return;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, go]);

  const share = useCallback(async () => {
    if (!cardRef.current) return;
    setSharing(true);
    try {
      // Let the share button hide before the picture is taken.
      await new Promise((r) => setTimeout(r, 60));
      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 1,
        result: Platform.OS === 'web' ? 'data-uri' : 'tmpfile',
      });
      await shareImage(uri, `tarsmusic-retrospectiva-${ids[index]}`);
    } catch {
      processingOverlayStore.getState().showError(t('wrappedStoriesShareFailed'));
    } finally {
      setSharing(false);
    }
  }, [ids, index, t]);

  const id = ids[Math.min(index, ids.length - 1)];
  const [c1, c2] = PALETTES[Math.min(index, ids.length - 1) % PALETTES.length];

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent transparent>
      <View style={[styles.backdrop, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {wide && (
          <>
            {/* The story's colours, dimmed, behind the card. */}
            <LinearGradient colors={[c1, c2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.wideGlow]} />
            <View style={[StyleSheet.absoluteFill, styles.wideShade]} />
          </>
        )}
        <View style={styles.stage}>
          {wide && (
            <Pressable
              onPress={() => go(-1)}
              disabled={index === 0}
              style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                styles.arrow,
                (hovered || pressed) && styles.arrowHover,
                index === 0 && styles.arrowDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('wrappedStoriesPrev')}
            >
              <Ionicons name="chevron-back" size={28} color="#fff" />
            </Pressable>
          )}
        <View style={{ width: cardW, height: cardH }}>
          {/* What gets shared: the story card with its gradient and the TARSMusic brand. */}
          <View ref={cardRef} collapsable={false} style={styles.card}>
            <LinearGradient colors={[c1, c2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <View style={styles.cardInner}>
              <StoryBody id={id} data={data} artistCover={artistCover} />
            </View>
            <Brand />
          </View>

          {/* Tap left / right to move, hold to pause. */}
          <View style={styles.tapZones}>
            <Pressable
              style={styles.tapLeft}
              onPress={() => go(-1)}
              onLongPress={() => setPaused(true)}
              onPressOut={() => setPaused(false)}
              accessibilityRole="button"
              accessibilityLabel={t('wrappedStoriesPrev')}
            />
            <Pressable
              style={styles.tapRight}
              onPress={() => go(1)}
              onLongPress={() => setPaused(true)}
              onPressOut={() => setPaused(false)}
              accessibilityRole="button"
              accessibilityLabel={t('wrappedStoriesNext')}
            />
          </View>

          {/* Progress bars and close, over the card (not in the shared image). */}
          {!sharing && (
            <View style={styles.top} pointerEvents="box-none">
              <View style={styles.bars}>
                {ids.map((sid, i) => (
                  <View key={sid} style={styles.bar}>
                    <Animated.View
                      style={[
                        styles.barFill,
                        {
                          width:
                            i < index
                              ? '100%'
                              : i > index
                                ? '0%'
                                : progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                        },
                      ]}
                    />
                  </View>
                ))}
              </View>
              <View style={styles.topRow} pointerEvents="box-none">
                <Text style={styles.topLabel}>{t('wrapped')}</Text>
                <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('close')}>
                  <Ionicons name="close" size={28} color="#fff" />
                </Pressable>
              </View>
            </View>
          )}

          {!sharing ? (
            <Pressable
              onPress={() => void share()}
              style={({ pressed }) => [styles.shareButton, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
            >
              <Ionicons name={Platform.OS === 'web' ? 'download-outline' : 'share-social'} size={18} color="#000" />
              <Text style={styles.shareText}>{t('wrappedStoriesShare')}</Text>
            </Pressable>
          ) : (
            <View style={styles.shareButton}>
              <ActivityIndicator color="#000" />
            </View>
          )}
        </View>
          {wide && (
            <Pressable
              onPress={() => go(1)}
              style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                styles.arrow,
                (hovered || pressed) && styles.arrowHover,
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('wrappedStoriesNext')}
            >
              <Ionicons name="chevron-forward" size={28} color="#fff" />
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  wideGlow: { opacity: 0.55 },
  wideShade: { backgroundColor: 'rgba(0,0,0,0.55)' },
  stage: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  arrow: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  arrowHover: { backgroundColor: 'rgba(255,255,255,0.28)' },
  arrowDisabled: { opacity: 0.3 },
  card: { flex: 1, borderRadius: 18, overflow: 'hidden', backgroundColor: '#121826' },
  cardInner: { flex: 1, paddingHorizontal: 28, paddingTop: 72, paddingBottom: 84 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  introLogo: { width: 110, height: 110, marginBottom: 10 },
  kicker: { color: 'rgba(255,255,255,0.85)', fontSize: 15, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center' },
  giant: { color: '#fff', fontSize: 96, fontWeight: '900', letterSpacing: -3, textAlign: 'center' },
  huge: { color: '#fff', fontSize: 44, fontWeight: '900', letterSpacing: -1, textAlign: 'center' },
  big: { color: '#fff', fontSize: 30, fontWeight: '800', textAlign: 'center' },
  title: { color: '#fff', fontSize: 26, fontWeight: '800', textAlign: 'center', marginTop: -8 },
  body: { color: 'rgba(255,255,255,0.9)', fontSize: 17, fontWeight: '500', textAlign: 'center', lineHeight: 24 },
  initials: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.2)' },
  initialsText: { color: '#fff', fontSize: 72, fontWeight: '900' },
  coverFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)' },
  listStory: { flex: 1, justifyContent: 'center', gap: 14 },
  listTitle: { color: '#fff', fontSize: 34, fontWeight: '900', letterSpacing: -1, marginBottom: 10 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  rank: { color: '#fff', fontSize: 28, fontWeight: '900', width: 30, textAlign: 'center' },
  listText: { flex: 1, minWidth: 0 },
  listName: { color: '#fff', fontSize: 19, fontWeight: '800' },
  listSub: { color: 'rgba(255,255,255,0.8)', fontSize: 14, marginTop: 2 },
  fact: { backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: 14, padding: 16 },
  factLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  factValue: { color: '#fff', fontSize: 30, fontWeight: '900', marginTop: 4 },
  summary: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 },
  summaryTitle: { color: '#fff', fontSize: 26, fontWeight: '900', textAlign: 'center' },
  summaryCols: { flexDirection: 'row', gap: 16, alignSelf: 'stretch' },
  summaryCol: { flex: 1, minWidth: 0, gap: 3 },
  summaryHead: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '700', marginBottom: 4 },
  summaryItem: { color: '#fff', fontSize: 15, fontWeight: '700' },
  summaryBig: { color: '#fff', fontSize: 30, fontWeight: '900' },
  brand: { position: 'absolute', left: 0, right: 0, bottom: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  brandLogo: { width: 22, height: 22 },
  brandText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  tapZones: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row' },
  tapLeft: { flex: 1 },
  tapRight: { flex: 2 },
  top: { position: 'absolute', top: 10, left: 10, right: 10 },
  bars: { flexDirection: 'row', gap: 4 },
  bar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' },
  barFill: { height: 3, backgroundColor: '#fff' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  topLabel: { color: '#fff', fontSize: 14, fontWeight: '800' },
  shareButton: {
    position: 'absolute',
    bottom: 54,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 10,
    minWidth: 120,
    justifyContent: 'center',
  },
  shareText: { color: '#000', fontSize: 15, fontWeight: '800' },
});
