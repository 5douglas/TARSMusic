import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { HeaderHeightContext, useIsFocused } from "expo-router/react-navigation";
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DiscoverEntityRow, DiscoverTrackRow } from '../components/DiscoverRows';
import { EmptyState } from '../components/EmptyState';
import { GradientBackground } from '../components/GradientBackground';
import { useDiscoverActions } from '../hooks/useDiscoverActions';
import { useTheme } from '../hooks/useTheme';
import { stopDiscoverPreview } from '../services/discoverPreviewService';
import {
  fetchDiscoverBrowse,
  type DiscoverAlbum,
  type DiscoverBrowse,
  type DiscoverItem,
} from '../services/discoverService';
import { discoverPreviewStore } from '../store/discoverPreviewStore';

type Row =
  | { kind: 'section'; key: string; label: string }
  | { kind: 'track'; key: string; item: DiscoverItem }
  | { kind: 'album'; key: string; item: DiscoverAlbum };

function buildRows(data: DiscoverBrowse, t: (key: string) => string): Row[] {
  const rows: Row[] = [];
  if (data.type === 'artist' && data.items.length > 0) {
    rows.push({ kind: 'section', key: 'top', label: t('discoverTopTracks') });
  }
  for (const item of data.items) rows.push({ kind: 'track', key: `t-${item.id}`, item });
  if (data.albums && data.albums.length > 0) {
    rows.push({ kind: 'section', key: 'albums', label: t('albums') });
    for (const item of data.albums) rows.push({ kind: 'album', key: `a-${item.id}`, item });
  }
  return rows;
}

/** A Deezer album (its tracks) or artist (top tracks + discography) reached from Discover search. */
export function DiscoverBrowseScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const { kind, id } = useLocalSearchParams<{ kind: string; id: string }>();
  const { handlePreview, handleTrackDownload, handleAlbumDownload, handleOpen } = useDiscoverActions();
  const playingId = discoverPreviewStore((s) => s.playingId);
  const [data, setData] = useState<DiscoverBrowse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const browseKind = kind === 'artist' ? 'artist' : 'album';
  const numericId = Number(id);

  const load = useCallback(
    async (refresh: boolean) => {
      const res = await fetchDiscoverBrowse(browseKind, numericId, refresh);
      if (res || !refresh) setData(res);
    },
    [browseKind, numericId],
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

  const rows = useMemo(() => (data ? buildRows(data, t) : []), [data, t]);

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      if (item.kind === 'section') {
        return <Text style={[styles.section, { color: colors.textPrimary }]}>{item.label}</Text>;
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
    [colors, playingId, handlePreview, handleTrackDownload, handleAlbumDownload, handleOpen],
  );

  const header = data ? (
    <View style={styles.header}>
      <Image
        source={data.cover ?? undefined}
        style={[styles.headerCover, data.type === 'artist' && styles.round]}
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
    </View>
  ) : null;

  let empty = null;
  if (loading) empty = <ActivityIndicator style={styles.spinner} color={colors.primary} />;
  else if (!data) empty = <EmptyState icon="cloud-offline-outline" title={t('discoverLoadFailed')} subtitle={t('discoverLoadFailedHint')} />;
  else empty = <EmptyState icon="musical-notes-outline" title={t('discoverEmpty')} />;

  return (
    <GradientBackground style={styles.container} scrollable>
      <FlashList
        data={rows}
        keyExtractor={(row) => row.key}
        getItemType={(row) => row.kind}
        renderItem={renderItem}
        extraData={playingId}
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
