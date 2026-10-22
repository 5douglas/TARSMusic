import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams } from 'expo-router';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlayAllButton, ShufflePlayButton } from '../components/DetailHeroButtons';
import { EmptyState } from '../components/EmptyState';
import { GradientBackground } from '../components/GradientBackground';
import { MixCover } from '../components/MixCover';
import { MAX_ARTIST_MIXES } from '../components/PersonalMixesSection';
import { SongRow } from '../components/SongRow';
import { useTheme } from '../hooks/useTheme';
import { useTopArtists } from '../hooks/useTopArtists';
import { buildArtistMix, getDailyRecommendations } from '../services/personalMixService';
import { playTrack } from '../services/playerService';
import { type Child } from '../services/subsonicService';
import { layoutPreferencesStore } from '../store/layoutPreferencesStore';
import { shuffleArray } from '../utils/arrayHelpers';

const COVER_SIZE = 200;
/** Songs per mix: the list-length setting, but never fewer than this. */
const MIN_MIX_SIZE = 30;

/** A "Made for you" playlist: today's recommendations or one artist's mix. */
export function MixScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const { kind, id, name } = useLocalSearchParams<{ kind: string; id?: string; name?: string }>();
  const isDaily = kind === 'daily';
  const topArtists = useTopArtists(MAX_ARTIST_MIXES);
  const listLength = layoutPreferencesStore((s) => s.listLength);
  const size = Math.max(MIN_MIX_SIZE, listLength);
  const [songs, setSongs] = useState<Child[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (force: boolean) => {
      if (isDaily) return getDailyRecommendations(topArtists, size, force);
      if (!id || !name) return [];
      return buildArtistMix({ id, name, plays: 0 }, size);
    },
    [isDaily, topArtists, id, name, size],
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
  const title = isDaily ? t('dailyRecommendations') : t('artistMixTitle', { artist: name ?? '' });
  const subtitle = isDaily
    ? t('dailyRecommendationsDescription', {
        artists: topArtists.slice(0, 3).map((a) => a.name).join(', '),
      })
    : t('artistMixDescription', { artist: name ?? '' });

  const renderItem = useCallback(
    ({ item }: { item: Child }) => <SongRow song={item} songs={list} />,
    [list],
  );

  const header = (
    <View style={styles.header}>
      <MixCover kind={isDaily ? 'daily' : 'artist'} artistId={id} artistName={name} size={COVER_SIZE} />
      <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
        {title}
      </Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
      {list.length > 0 && (
        <View style={styles.buttons}>
          <Text style={[styles.count, { color: colors.textSecondary }]}>
            {t('songCount', { count: list.length })}
          </Text>
          <View style={styles.playButtons}>
            <ShufflePlayButton
              onPress={() => {
                const shuffled = shuffleArray(list);
                playTrack(shuffled[0], shuffled);
              }}
            />
            <PlayAllButton onPress={() => playTrack(list[0], list)} />
          </View>
        </View>
      )}
    </View>
  );

  let empty = null;
  if (loading) empty = <ActivityIndicator style={styles.spinner} color={colors.primary} />;
  else empty = <EmptyState icon="musical-notes-outline" title={t('mixEmpty')} subtitle={t('mixEmptyHint')} />;

  return (
    <GradientBackground style={styles.container} scrollable>
      <FlashList
        data={loading ? [] : list}
        keyExtractor={(song, index) => `${song.id}-${index}`}
        renderItem={renderItem}
        drawDistance={400}
        maintainVisibleContentPosition={{ disabled: true }}
        contentContainerStyle={{ paddingTop: headerHeight, paddingBottom: insets.bottom + 32 }}
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
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 6,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 12,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  buttons: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  count: {
    fontSize: 13,
  },
  playButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  spinner: {
    marginTop: 32,
  },
});
