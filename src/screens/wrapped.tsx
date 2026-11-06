import Ionicons from '@react-native-vector-icons/ionicons/static';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import i18next from 'i18next';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BottomChrome } from '../components/BottomChrome';
import { CachedImage } from '../components/CachedImage';
import { EmptyState } from '../components/EmptyState';
import { GradientBackground } from '../components/GradientBackground';
import { MiniBarChart } from '../components/MiniBarChart';
import { SectionTitle } from '../components/SectionTitle';
import { TopItemRow } from '../components/TopItemRow';
import { useRefreshControlKey } from '../hooks/useRefreshControlKey';
import { useTheme } from '../hooks/useTheme';
import { useArtistCoverArt } from '../hooks/useTopArtists';
import { useTransitionComplete } from '../hooks/useTransitionComplete';
import { playTrack } from '../services/playerService';
import { type Child } from '../services/subsonicService';
import { completedScrobbleStore } from '../store/completedScrobbleStore';
import { offlineModeStore } from '../store/offlineModeStore';
import {
  computeScrobbleAnalytics,
  loadScrobbleMonthTotals,
  type ScrobbleAnalytics,
  type ScrobbleMonthTotal,
} from '../store/persistence/scrobbleAggregates';
import { mixHexColors } from '../utils/colors';
import { fireAndForget } from '../utils/fireAndForget';
import { getDateTimeFormat } from '../utils/intl';
import { getArtistInitials, minDelay } from '../utils/stringHelpers';
import {
  buildWrappedSummary,
  wrappedRange,
  wrappedYearMonths,
  wrappedYears,
  type WrappedSummary,
} from '../utils/wrapped';

function monthName(month: number, style: 'short' | 'long'): string {
  return getDateTimeFormat(i18next.language, { month: style }).format(new Date(2000, month - 1, 1));
}

function formatHour(hour: number): string {
  return getDateTimeFormat(i18next.language, { hour: 'numeric', minute: '2-digit' }).format(
    new Date(2000, 0, 1, hour),
  );
}

function formatDay(dk: string): string {
  const [y, m, d] = dk.split('-').map(Number);
  return getDateTimeFormat(i18next.language, { day: 'numeric', month: 'long' }).format(new Date(y, m - 1, d));
}

const fmtInt = (n: number): string => Math.round(n).toLocaleString(i18next.language);

interface ChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
}

function Chip({ label, active, onPress }: ChipProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: active ? colors.primary : colors.card },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.chipLabel, { color: active ? '#fff' : colors.textPrimary }]}>{label}</Text>
    </Pressable>
  );
}

/** The #1 artist, shown big with the artist image (or their top album's cover). */
function TopArtistHero({
  summary,
  onPress,
}: {
  summary: WrappedSummary;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const top = summary.topArtists[0];
  const artistCover = useArtistCoverArt(top?.artistId);
  if (!top) return null;
  const fallbackCover = summary.topAlbums.find((a) => a.artist === top.artist)?.coverArt;
  const cover = artistCover ?? fallbackCover;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.card, styles.topArtistCard, { backgroundColor: colors.card }, pressed && styles.pressed]}
    >
      {cover ? (
        <CachedImage coverArtId={cover} size={300} style={styles.topArtistImage} resizeMode="cover" />
      ) : (
        <View style={[styles.topArtistImage, styles.initials, { backgroundColor: colors.primary }]}>
          <Text style={styles.initialsText}>{getArtistInitials(top.artist)}</Text>
        </View>
      )}
      <View style={styles.topArtistInfo}>
        <Text style={[styles.kicker, { color: colors.primary }]}>{t('wrappedTopArtist')}</Text>
        <Text style={[styles.topArtistName, { color: colors.textPrimary }]} numberOfLines={2}>
          {top.artist}
        </Text>
        <Text style={[styles.muted, { color: colors.textSecondary }]}>
          {t('wrappedPlays', { count: top.count, formatted: fmtInt(top.count) })}
        </Text>
      </View>
    </Pressable>
  );
}

export function WrappedScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const transitionComplete = useTransitionComplete();
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const refreshControlKey = useRefreshControlKey();
  const offlineMode = offlineModeStore((s) => s.offlineMode);
  // Re-query when a new play lands in the history.
  const totalPlaysAllTime = completedScrobbleStore((s) => s.stats.totalPlays);

  const [months, setMonths] = useState<ScrobbleMonthTotal[] | undefined>(undefined);
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [result, setResult] = useState<ScrobbleAnalytics | undefined>(undefined);
  const [tick, setTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadScrobbleMonthTotals().then((m) => {
      if (alive) setMonths(m);
    });
    return () => {
      alive = false;
    };
  }, [tick, totalPlaysAllTime]);

  const years = useMemo(() => wrappedYears(months ?? []), [months]);
  // Default to the latest year with history; keep the user's pick otherwise.
  const selectedYear = year !== null && years.includes(year) ? year : (years[0] ?? null);
  const yearMonths = useMemo(
    () => (selectedYear === null ? [] : wrappedYearMonths(months ?? [], selectedYear)),
    [months, selectedYear],
  );
  const monthsWithData = yearMonths.filter((m) => m.plays > 0).map((m) => m.month);
  const selectedMonth = month !== null && monthsWithData.includes(month) ? month : null;

  useEffect(() => {
    if (selectedYear === null) return;
    let alive = true;
    setResult(undefined);
    const { since, until } = wrappedRange(selectedYear, selectedMonth);
    void computeScrobbleAnalytics(since, until).then((r) => {
      if (alive) setResult(r);
    });
    return () => {
      alive = false;
    };
  }, [selectedYear, selectedMonth, tick, totalPlaysAllTime]);

  const summary = useMemo(
    () => (result ? buildWrappedSummary(result.stats, result.aggregates) : undefined),
    [result],
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    const delay = minDelay();
    setTick((x) => x + 1);
    await delay;
    setRefreshing(false);
  }, []);

  const onPlaySong = useCallback(
    (song: Child, queue: Child[]) => {
      if (offlineMode) return undefined;
      return () => fireAndForget(playTrack(song, queue), 'wrapped:playSong');
    },
    [offlineMode],
  );
  const onOpenAlbum = useCallback(
    (albumId: string | undefined) => (offlineMode || !albumId ? undefined : () => router.push(`/album/${albumId}`)),
    [offlineMode, router],
  );
  const onOpenArtist = useCallback(
    (artistId: string | undefined) => (offlineMode || !artistId ? undefined : () => router.push(`/artist/${artistId}`)),
    [offlineMode, router],
  );

  if (!transitionComplete || months === undefined) {
    return (
      <GradientBackground style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
        <BottomChrome withSafeAreaPadding />
      </GradientBackground>
    );
  }

  if (selectedYear === null) {
    return (
      <GradientBackground style={styles.center}>
        <EmptyState icon="sparkles-outline" title={t('wrappedEmptyTitle')} subtitle={t('wrappedEmptySubtitle')} />
        <BottomChrome withSafeAreaPadding />
      </GradientBackground>
    );
  }

  const periodLabel =
    selectedMonth === null ? String(selectedYear) : `${monthName(selectedMonth, 'long')} ${selectedYear}`;
  const hours = summary ? summary.totalSeconds / 3600 : 0;
  const minutes = summary ? summary.totalSeconds / 60 : 0;
  const bestMonth = yearMonths.reduce<{ month: number; seconds: number } | null>(
    (best, m) => (m.seconds > 0 && (best === null || m.seconds > best.seconds) ? m : best),
    null,
  );
  const monthBars = yearMonths.map((m) => ({
    value: Math.round((m.seconds / 3600) * 10) / 10,
    label: monthName(m.month, 'short').slice(0, 3),
  }));
  const topSongQueue = summary?.topSongs.map((e) => e.song) ?? [];

  return (
    <GradientBackground scrollable>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingTop: headerHeight + 8 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            key={refreshControlKey}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            progressViewOffset={headerHeight}
          />
        }
      >
        {/* Year picker */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {years.map((y) => (
            <Chip
              key={y}
              label={String(y)}
              active={y === selectedYear}
              onPress={() => {
                setYear(y);
                setMonth(null);
              }}
            />
          ))}
        </ScrollView>

        {/* Month picker: whole year + months with plays */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <Chip label={t('wrappedWholeYear')} active={selectedMonth === null} onPress={() => setMonth(null)} />
          {monthsWithData.map((m) => (
            <Chip key={m} label={monthName(m, 'short')} active={m === selectedMonth} onPress={() => setMonth(m)} />
          ))}
        </ScrollView>

        {/* Hero */}
        <LinearGradient
          colors={[colors.primary, mixHexColors(colors.primary, '#000000', 0.55)]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Text style={styles.heroKicker}>{t('wrappedHeroKicker', { period: periodLabel })}</Text>
          {summary === undefined ? (
            <ActivityIndicator color="#fff" style={styles.heroLoading} />
          ) : (
            <>
              <Text style={styles.heroValue}>{fmtInt(hours >= 10 ? hours : Math.round(hours * 10) / 10)}</Text>
              <Text style={styles.heroUnit}>{t('wrappedHoursListened', { count: Math.round(hours) })}</Text>
              <Text style={styles.heroSub}>
                {t('wrappedMinutesAndPlays', {
                  minutes: fmtInt(minutes),
                  plays: fmtInt(summary.totalPlays),
                })}
              </Text>
            </>
          )}
        </LinearGradient>

        {summary !== undefined && summary.totalPlays > 0 && (
          <>
            {/* Numbers */}
            <View style={styles.statGrid}>
              {[
                { key: 'artists', value: summary.uniqueArtists, label: t('wrappedArtists') },
                { key: 'albums', value: summary.uniqueAlbums, label: t('wrappedAlbums') },
                { key: 'songs', value: summary.uniqueSongs, label: t('wrappedSongs') },
                { key: 'days', value: summary.daysListened, label: t('wrappedDays') },
              ].map((s) => (
                <View key={s.key} style={[styles.statCard, { backgroundColor: colors.card }]}>
                  <Text style={[styles.statValue, { color: colors.primary }]}>{fmtInt(s.value)}</Text>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{s.label}</Text>
                </View>
              ))}
            </View>

            <TopArtistHero summary={summary} onPress={onOpenArtist(summary.topArtists[0]?.artistId)} />

            {/* Hours per month (year view) */}
            {selectedMonth === null && (
              <View style={[styles.card, { backgroundColor: colors.card }]}>
                <SectionTitle title={t('wrappedHoursPerMonth')} color={colors.textSecondary} />
                <MiniBarChart
                  data={monthBars}
                  colors={colors}
                  highlightIndex={bestMonth ? bestMonth.month - 1 : undefined}
                />
                {bestMonth && (
                  <Text style={[styles.muted, styles.chartNote, { color: colors.textSecondary }]}>
                    {t('wrappedBestMonth', { month: monthName(bestMonth.month, 'long') })}
                  </Text>
                )}
              </View>
            )}

            {summary.topSongs.length > 0 && (
              <View style={[styles.card, { backgroundColor: colors.card }]}>
                <SectionTitle title={t('wrappedTopSongs')} color={colors.textSecondary} />
                {summary.topSongs.map((item, i) => (
                  <TopItemRow
                    key={item.song.id}
                    rank={i + 1}
                    title={item.song.title}
                    subtitle={item.song.artist ?? undefined}
                    count={item.count}
                    maxCount={summary.topSongs[0].count}
                    coverArtId={item.song.coverArt}
                    albumId={item.song.albumId}
                    colors={colors}
                    index={i}
                    onPress={onPlaySong(item.song, topSongQueue.slice(i))}
                  />
                ))}
              </View>
            )}

            {summary.topArtists.length > 0 && (
              <View style={[styles.card, { backgroundColor: colors.card }]}>
                <SectionTitle title={t('wrappedTopArtists')} color={colors.textSecondary} />
                {summary.topArtists.map((item, i) => (
                  <TopItemRow
                    key={item.artist}
                    rank={i + 1}
                    title={item.artist}
                    count={item.count}
                    maxCount={summary.topArtists[0].count}
                    colors={colors}
                    initials={getArtistInitials(item.artist)}
                    index={i}
                    onPress={onOpenArtist(item.artistId)}
                  />
                ))}
              </View>
            )}

            {summary.topAlbums.length > 0 && (
              <View style={[styles.card, { backgroundColor: colors.card }]}>
                <SectionTitle title={t('wrappedTopAlbums')} color={colors.textSecondary} />
                {summary.topAlbums.map((item, i) => (
                  <TopItemRow
                    key={`${item.album}-${item.artist}`}
                    rank={i + 1}
                    title={item.album}
                    subtitle={item.artist}
                    count={item.count}
                    maxCount={summary.topAlbums[0].count}
                    coverArtId={item.coverArt}
                    colors={colors}
                    index={i}
                    onPress={onOpenAlbum(item.albumId)}
                  />
                ))}
              </View>
            )}

            {/* Fun facts */}
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <SectionTitle title={t('wrappedFacts')} color={colors.textSecondary} />
              {summary.topGenres[0] && (
                <Fact icon="pricetag-outline" text={t('wrappedTopGenre', { genre: summary.topGenres[0].genre })} />
              )}
              {summary.peakHour !== null && (
                <Fact icon="time-outline" text={t('wrappedPeakHour', { hour: formatHour(summary.peakHour) })} />
              )}
              {summary.busiestDay && (
                <Fact
                  icon="flame-outline"
                  text={t('wrappedBusiestDay', {
                    day: formatDay(summary.busiestDay.date),
                    count: summary.busiestDay.count,
                    formatted: fmtInt(summary.busiestDay.count),
                  })}
                />
              )}
            </View>

            <Text style={[styles.muted, styles.footnote, { color: colors.textSecondary }]}>
              {t('wrappedFootnote')}
            </Text>
          </>
        )}
        <View style={styles.footer} />
      </ScrollView>
      <BottomChrome withSafeAreaPadding />
    </GradientBackground>
  );
}

function Fact({ icon, text }: { icon: 'pricetag-outline' | 'time-outline' | 'flame-outline'; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.fact}>
      <Ionicons name={icon} size={18} color={colors.primary} />
      <Text style={[styles.factText, { color: colors.textPrimary }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
  chipRow: { gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  chipLabel: { fontSize: 14, fontWeight: '600' },
  hero: { borderRadius: 16, padding: 20, minHeight: 170 },
  heroKicker: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  heroLoading: { marginTop: 40 },
  heroValue: { color: '#fff', fontSize: 64, fontWeight: '800', letterSpacing: -2, marginTop: 8 },
  heroUnit: { color: '#fff', fontSize: 20, fontWeight: '700', marginTop: -6 },
  heroSub: { color: 'rgba(255,255,255,0.85)', fontSize: 14, marginTop: 10 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: { flexBasis: '47%', flexGrow: 1, borderRadius: 12, padding: 14, gap: 2 },
  statValue: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  statLabel: { fontSize: 13, fontWeight: '500' },
  card: { borderRadius: 12, padding: 16 },
  topArtistCard: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  topArtistImage: { width: 96, height: 96, borderRadius: 48 },
  initials: { alignItems: 'center', justifyContent: 'center' },
  initialsText: { color: '#fff', fontSize: 32, fontWeight: '800' },
  topArtistInfo: { flex: 1, gap: 4 },
  kicker: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  topArtistName: { fontSize: 22, fontWeight: '800' },
  muted: { fontSize: 13 },
  chartNote: { marginTop: 8 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  factText: { flex: 1, fontSize: 15 },
  footnote: { textAlign: 'center', paddingHorizontal: 12 },
  footer: { height: 40 },
});
