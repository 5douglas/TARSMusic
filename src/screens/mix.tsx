import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams } from 'expo-router';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { BottomChrome } from '../components/BottomChrome';
import { PlayAllButton, ShufflePlayButton } from '../components/DetailHeroButtons';
import { EmptyState } from '../components/EmptyState';
import { GradientBackground } from '../components/GradientBackground';
import { MixCover } from '../components/MixCover';
import { dailyMixArtistLine, MAX_ARTIST_MIXES } from '../components/PersonalMixesSection';
import { TrackRow } from '../components/TrackRow';
import { useTheme } from '../hooks/useTheme';
import { useTopArtists } from '../hooks/useTopArtists';
import { getDailyMixes, getDailyMixSongs } from '../services/dailyMixService';
import { buildArtistMix, getDailyRecommendations } from '../services/personalMixService';
import { playTrack } from '../services/playerService';
import { type Child } from '../services/subsonicService';
import { layoutPreferencesStore } from '../store/layoutPreferencesStore';
import { personalMixStore } from '../store/personalMixStore';
import { shuffleArray } from '../utils/arrayHelpers';
import { formatCompactDuration } from '../utils/formatters';

/** Same hero as a playlist: a square cover filling the width, up to this size. */
const HERO_PADDING = 24;
const MAX_COVER_SIZE = 400;
/** Songs per mix: the list-length setting, but never fewer than this. */
const MIN_MIX_SIZE = 30;

/** A "Made for you" playlist: a Daily Mix, today's recommendations or one artist's mix. */
export function MixScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const coverSize = Math.min(MAX_COVER_SIZE, width - HERO_PADDING * 2);
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const { kind, id, name } = useLocalSearchParams<{ kind: string; id?: string; name?: string }>();
  const isDaily = kind === 'daily';
  const isDailyMix = kind === 'dailymix';
  const dailyMix = personalMixStore((s) => (isDailyMix ? s.dailyMixes.find((m) => m.id === id) : undefined));
  const topArtists = useTopArtists(MAX_ARTIST_MIXES);
  const listLength = layoutPreferencesStore((s) => s.listLength);
  const size = Math.max(MIN_MIX_SIZE, listLength);
  const [songs, setSongs] = useState<Child[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (force: boolean) => {
      if (isDaily) return getDailyRecommendations(topArtists, size, force);
      if (isDailyMix) {
        const mix = (await getDailyMixes()).find((m) => m.id === id);
        return mix ? getDailyMixSongs(mix, size, force) : [];
      }
      if (!id || !name) return [];
      return buildArtistMix({ id, name, plays: 0 }, size);
    },
    [isDaily, isDailyMix, topArtists, id, name, size],
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void load(false)
      .then((res) => { if (alive) setSongs(res); })
      .catch(() => { if (alive) setSongs([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // Built once per open: top artists can re-rank while it is showing, which must not
    // swap the list out from under the user.
  }, [kind, id]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await load(true);
      if (res.length > 0) setSongs(res);
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const list = useMemo(() => songs ?? [], [songs]);
  let title: string;
  let subtitle: string;
  if (isDailyMix) {
    title = t('dailyMixTitle', { number: dailyMix?.number ?? 1 });
    subtitle = dailyMix
      ? dailyMix.genre
        ? t('dailyMixGenreDescription', { genre: dailyMix.genre, artists: dailyMixArtistLine(dailyMix) })
        : t('dailyMixDescription', { artists: dailyMixArtistLine(dailyMix) })
      : '';
  } else if (isDaily) {
    title = t('dailyRecommendations');
    subtitle = t('dailyRecommendationsDescription', {
      artists: topArtists.slice(0, 3).map((a) => a.name).join(', '),
    });
  } else {
    title = t('artistMixTitle', { artist: name ?? '' });
    subtitle = t('artistMixDescription', { artist: name ?? '' });
  }

  const renderItem = useCallback(
    ({ item }: { item: Child }) => (
      <TrackRow track={item} colors={colors} songs={list} showCoverArt optionsSource="playlist-detail" />
    ),
    [list, colors],
  );
  const duration = useMemo(() => list.reduce((sum, song) => sum + (song.duration ?? 0), 0), [list]);

  // Laid out like a playlist: big cover, then name, description, size and the play buttons.
  const header = (
    <View>
      <View style={styles.hero}>
        <MixCover
          kind={isDailyMix ? 'dailyMix' : isDaily ? 'daily' : 'artist'}
          artistId={isDailyMix ? dailyMix?.artists[0]?.id : id}
          artistName={name}
          mixNumber={dailyMix?.number}
          size={coverSize}
        />
      </View>
      <View style={styles.info}>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
          {title}
        </Text>
        <View style={styles.subtitleRow}>
          <View style={styles.subtitleText}>
            {subtitle ? (
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
            ) : null}
            {list.length > 0 && (
              <View style={styles.meta}>
                <Ionicons name="musical-notes-outline" size={14} color={colors.primary} />
                <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                  {t('songCount', { count: list.length })}
                </Text>
                <View style={styles.metaSpacer} />
                <Ionicons name="time-outline" size={14} color={colors.primary} />
                <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                  {formatCompactDuration(duration)}
                </Text>
              </View>
            )}
          </View>
          {list.length > 1 && (
            <ShufflePlayButton
              style={styles.heroButtonSpacing}
              onPress={() => {
                const shuffled = shuffleArray(list);
                playTrack(shuffled[0], shuffled);
              }}
            />
          )}
          {list.length > 0 && (
            <PlayAllButton style={styles.heroButtonSpacing} onPress={() => playTrack(list[0], list)} />
          )}
        </View>
      </View>
      <View style={styles.trackListSpacer} />
    </View>
  );

  let empty = null;
  if (loading) empty = <ActivityIndicator style={styles.spinner} color={colors.primary} />;
  else empty = <EmptyState icon="musical-notes-outline" title={t('mixEmpty')} subtitle={t('mixEmptyHint')} />;

  return (
    <GradientBackground style={styles.container} scrollable>
      <View style={styles.container}>
      <FlashList
        data={loading ? [] : list}
        keyExtractor={(song, index) => `${song.id}-${index}`}
        renderItem={renderItem}
        drawDistance={400}
        maintainVisibleContentPosition={{ disabled: true }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: headerHeight, paddingBottom: 24 }}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            progressViewOffset={headerHeight}
            tintColor={colors.primary}
          />
        }
      />
      <BottomChrome withSafeAreaPadding withTabBar />
      </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  hero: {
    alignItems: 'center',
    paddingTop: HERO_PADDING / 2,
    paddingHorizontal: HERO_PADDING,
  },
  info: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  subtitleText: {
    flex: 1,
  },
  subtitle: {
    fontSize: 14,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  metaText: {
    fontSize: 14,
    marginLeft: 4,
  },
  metaSpacer: {
    width: 14,
  },
  heroButtonSpacing: {
    marginLeft: 10,
  },
  trackListSpacer: {
    height: 8,
  },
  spinner: {
    marginTop: 32,
  },
});
