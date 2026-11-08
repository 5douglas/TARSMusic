import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { HeaderHeightContext, useIsFocused } from "expo-router/react-navigation";
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DiscoverEntityRow, DiscoverTrackRow } from '../components/DiscoverRows';
import { BottomChrome } from '../components/BottomChrome';
import { EmptyState } from '../components/EmptyState';
import { GradientBackground } from '../components/GradientBackground';
import { useDiscoverActions } from '../hooks/useDiscoverActions';
import { useTheme } from '../hooks/useTheme';
import { stopDiscoverPreview } from '../services/discoverPreviewService';
import {
  fetchDiscoverBrowse,
  fetchDiscoverPlaylist,
  queueDiscoverDownload,
  type DiscoverAlbum,
  type DiscoverBrowse,
  type DiscoverItem,
} from '../services/discoverService';
import { discoverPreviewStore } from '../store/discoverPreviewStore';
import { newMusicAlertsStore } from '../store/newMusicAlertsStore';
import { playbackToastStore } from '../store/playbackToastStore';
import { themedAlertStore } from '../store/themedAlertStore';

/**
 * Queues every release one after another (deemix takes one link per call) and says how
 * many made it. Each queued release is remembered so the app can announce its arrival.
 */
export async function downloadReleases(releases: DiscoverAlbum[]): Promise<{ queued: number; failed: number }> {
  let queued = 0;
  let failed = 0;
  for (const album of releases) {
    // Sequential on purpose: a burst of parallel requests would hammer deemix.
    // eslint-disable-next-line no-await-in-loop
    const ok = await queueDiscoverDownload(album.link);
    if (ok) {
      queued += 1;
      newMusicAlertsStore.getState().addRequest({ album: album.title, artist: album.artist, title: album.title, wholeAlbum: true });
    } else failed += 1;
  }
  return { queued, failed };
}

type Row =
  | { kind: 'section'; key: string; label: string }
  | { kind: 'releaseChips'; key: string }
  | { kind: 'track'; key: string; item: DiscoverItem }
  | { kind: 'album'; key: string; item: DiscoverAlbum };

/** Release kinds an artist's discography can be narrowed to (Deezer's `record_type`). */
export type ReleaseFilter = 'all' | 'album' | 'ep' | 'single';
const RELEASE_FILTERS: Array<{ key: ReleaseFilter; labelKey: string }> = [
  { key: 'all', labelKey: 'discoverFilterAll' },
  { key: 'album', labelKey: 'discoverReleaseAlbums' },
  { key: 'ep', labelKey: 'discoverReleaseEps' },
  { key: 'single', labelKey: 'discoverReleaseSingles' },
];

/** Releases of the given kind; Deezer's compilations count as albums. */
export function filterReleases(albums: DiscoverAlbum[], filter: ReleaseFilter): DiscoverAlbum[] {
  if (filter === 'all') return albums;
  return albums.filter((a) => {
    const kind = a.record_type === 'compile' ? 'album' : a.record_type ?? 'album';
    return kind === filter;
  });
}

function buildRows(data: DiscoverBrowse, t: (key: string) => string, releaseFilter: ReleaseFilter): Row[] {
  const rows: Row[] = [];
  if (data.type === 'artist' && data.items.length > 0) {
    rows.push({ kind: 'section', key: 'top', label: t('discoverTopTracks') });
  }
  for (const item of data.items) rows.push({ kind: 'track', key: `t-${item.id}`, item });
  if (data.albums && data.albums.length > 0) {
    rows.push({ kind: 'section', key: 'albums', label: t('discoverDiscography') });
    if (data.type === 'artist') rows.push({ kind: 'releaseChips', key: 'chips' });
    for (const item of filterReleases(data.albums, releaseFilter)) {
      rows.push({ kind: 'album', key: `a-${item.id}`, item });
    }
  }
  return rows;
}

const DISCOGRAPHY_LABEL: Record<ReleaseFilter, string> = {
  all: 'discoverDownloadDiscography',
  album: 'discoverDownloadAllAlbums',
  ep: 'discoverDownloadAllEps',
  single: 'discoverDownloadAllSingles',
};

/** A Deezer album, artist (top tracks + discography), mix or chart playlist opened from Discover. */
export function DiscoverBrowseScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const { kind, id, path } = useLocalSearchParams<{ kind: string; id?: string; path?: string }>();
  const { handlePreview, handleTrackDownload, handleAlbumDownload, handleOpen } = useDiscoverActions();
  const playingId = discoverPreviewStore((s) => s.playingId);
  const [data, setData] = useState<DiscoverBrowse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [releaseFilter, setReleaseFilter] = useState<ReleaseFilter>('all');
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(
    async (refresh: boolean) => {
      const res =
        kind === 'playlist'
          ? await fetchDiscoverPlaylist(path ?? '', refresh)
          : await fetchDiscoverBrowse(kind === 'artist' ? 'artist' : 'album', Number(id), refresh);
      if (res || !refresh) setData(res);
    },
    [kind, id, path],
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void load(false).finally(() => {
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [load]);

  useEffect(() => {
    if (!isFocused) stopDiscoverPreview();
  }, [isFocused]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load(true);
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const rows = useMemo(() => (data ? buildRows(data, t, releaseFilter) : []), [data, t, releaseFilter]);

  // The releases the discography button would fetch: the chosen kind, minus what the
  // library already has.
  const missingReleases = useMemo(
    () => (data?.albums ? filterReleases(data.albums, releaseFilter).filter((a) => !a.in_library) : []),
    [data, releaseFilter],
  );

  const handleDiscographyDownload = useCallback(() => {
    if (missingReleases.length === 0 || bulkBusy) return;
    themedAlertStore.getState().show(
      t('discoverDownloadDiscographyTitle'),
      t('discoverDownloadDiscographyBody', { count: missingReleases.length, artist: data?.title ?? '' }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('discoverDownload'),
          onPress: () => {
            setBulkBusy(true);
            void downloadReleases(missingReleases).then(({ queued, failed }) => {
              setBulkBusy(false);
              if (failed === 0) playbackToastStore.getState().flashSuccess(t('discoverReleasesQueued', { count: queued }));
              else
                themedAlertStore
                  .getState()
                  .show(t('discoverDownloadFailed'), t('discoverReleasesPartial', { queued, failed }), [{ text: t('ok') }]);
            });
          },
        },
      ],
    );
  }, [missingReleases, bulkBusy, data, t]);

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      if (item.kind === 'section') {
        return <Text style={[styles.section, { color: colors.textPrimary }]}>{item.label}</Text>;
      }
      if (item.kind === 'releaseChips') {
        return (
          <View style={styles.chips}>
            {RELEASE_FILTERS.map((f) => {
              const selected = releaseFilter === f.key;
              return (
                <Pressable
                  key={f.key}
                  onPress={() => setReleaseFilter(f.key)}
                  style={[styles.chip, { backgroundColor: selected ? colors.primary : colors.inputBg }]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.chipLabel, { color: selected ? '#fff' : colors.textPrimary }]}>{t(f.labelKey)}</Text>
                </Pressable>
              );
            })}
          </View>
        );
      }
      if (item.kind === 'track') {
        return (
          <DiscoverTrackRow
            item={item.item}
            playing={item.item.id === playingId}
            onPreview={handlePreview}
            onDownload={handleTrackDownload}
          />
        );
      }
      return <DiscoverEntityRow item={item.item} onOpen={handleOpen} onDownload={handleAlbumDownload} />;
    },
    [colors, playingId, handlePreview, handleTrackDownload, handleAlbumDownload, handleOpen, releaseFilter, t],
  );

  const header = data ? (
    <View style={styles.header}>
      <Image
        source={data.cover ?? undefined}
        style={[styles.headerCover, (data.type === 'artist' || data.type === 'mix') && styles.round]}
      />
      <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={2}>
        {data.title}
      </Text>
      {!!data.description && (
        <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>{data.description}</Text>
      )}
      {(data.album ?? data.artist)?.in_library && (
        <Text style={[styles.badge, { color: colors.green, borderColor: colors.green }]}>
          {t('discoverInLibrary')}
        </Text>
      )}
      {data.album && (
        <Pressable
          onPress={() => handleAlbumDownload(data.album!)}
          style={({ pressed }) => [styles.albumButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={styles.albumButtonLabel}>{t('discoverDownloadAlbum')}</Text>
        </Pressable>
      )}
      {data.type === 'artist' && (data.albums?.length ?? 0) > 0 && (
        <Pressable
          onPress={handleDiscographyDownload}
          disabled={missingReleases.length === 0 || bulkBusy}
          style={({ pressed }) => [
            styles.albumButton,
            { backgroundColor: colors.primary },
            (missingReleases.length === 0 || bulkBusy) && styles.disabled,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
        >
          {bulkBusy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.albumButtonLabel}>
              {missingReleases.length === 0
                ? t('discoverAllInLibrary')
                : t(DISCOGRAPHY_LABEL[releaseFilter], { count: missingReleases.length })}
            </Text>
          )}
        </Pressable>
      )}
    </View>
  ) : null;

  let empty = null;
  if (loading) empty = <ActivityIndicator style={styles.spinner} color={colors.primary} />;
  else if (!data) empty = <EmptyState icon="cloud-offline-outline" title={t('discoverLoadFailed')} subtitle={t('discoverLoadFailedHint')} />;
  else empty = <EmptyState icon="musical-notes-outline" title={t('discoverEmpty')} />;

  return (
    <GradientBackground style={styles.container} scrollable>
      <View style={styles.container}>
      <FlashList
        data={rows}
        keyExtractor={(row) => row.key}
        getItemType={(row) => row.kind}
        renderItem={renderItem}
        extraData={`${playingId}:${releaseFilter}`}
        drawDistance={400}
        maintainVisibleContentPosition={{ disabled: true }}
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
  header: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    gap: 6,
  },
  headerCover: {
    width: 180,
    height: 180,
    borderRadius: 8,
  },
  round: {
    borderRadius: 90,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  badge: {
    fontSize: 11,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    overflow: 'hidden',
  },
  albumButton: {
    marginTop: 8,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  albumButtonLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.6,
  },
  disabled: {
    opacity: 0.5,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  chip: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  chipLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    fontSize: 18,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
  },
  spinner: {
    marginTop: 32,
  },
});
