import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Ionicons from "@react-native-vector-icons/ionicons/static";
import { FlashList } from '@shopify/flash-list';
import { LIST_DRAW_DISTANCE } from '../constants/layout';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CachedImage } from '../components/CachedImage';
import { EmptyState } from '../components/EmptyState';
import { DownloadButton } from '../components/DownloadButton';
import { BottomChrome } from '../components/BottomChrome';
import { MoreOptionsButton } from '../components/MoreOptionsButton';
import { closeOpenRow } from '../components/SwipeableRow';
import { TrackRow } from '../components/TrackRow';
import { DetailScreenBackground } from '../components/DetailScreenBackground';
import { DiscoverMoreFromArtist } from '../components/DiscoverMoreFromArtist';
import { PlayAllButton } from '../components/DetailHeroButtons';
import { ReleaseCard } from '../components/ReleaseRow';
import { useDownloadStatus } from '../hooks/useDownloadStatus';
import { useDetailFetch } from '../hooks/useDetailFetch';
import { useIsStarred } from '../hooks/useIsStarred';
import { useLayoutMode } from '../hooks/useLayoutMode';
import { useRefreshControlKey } from '../hooks/useRefreshControlKey';
import { useTheme } from '../hooks/useTheme';
import { useTransitionComplete } from '../hooks/useTransitionComplete';
import { refreshCoverArt } from '../services/imageCacheService';
import { toggleStar } from '../services/moreOptionsService';
import { enqueueAlbumDownload } from '../services/musicCacheService';
import { shuffleArray } from '../utils/arrayHelpers';
import { playTrack } from '../services/playerService';
import { fetchAlbumDetail, fetchArtistBase } from '../services/detailFetchService';
import { getDb } from '../store/persistence/db';
import { getAlbumDetail, getArtistBase } from '../db/repository/details';
import { moreOptionsStore } from '../store/moreOptionsStore';
import { offlineModeStore } from '../store/offlineModeStore';

import type { AlbumID3, AlbumWithSongsID3, Child } from '../services/subsonicService';
import { releaseKind, releaseKindKey, sortReleasesNewestFirst } from '../utils/releaseType';

const HERO_COVER_SIZE = 600;
const HERO_COVER_MAX = 300;
const MORE_BY_LIMIT = 10;
const MORE_BY_CARD = 140;
const HEADER_BAR_HEIGHT = 44;

type AlbumListItem =
  | { type: 'disc-header'; discNumber: number }
  | { type: 'track'; track: Child };

/** Spotify's album length: "45 min 12 sec", or "1 hr 5 min" past the hour. */
export function formatAlbumLength(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h} hr ${m} min` : `${m} min ${s} sec`;
}

/** The album's release date as Spotify prints it under the tracks ("March 3, 2021"), or just the year. */
function releaseDateLabel(album: AlbumID3): string | null {
  const d = album.releaseDate ?? album.originalReleaseDate;
  if (d?.year && d.month && d.day) {
    return new Date(d.year, d.month - 1, d.day).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
  const year = d?.year ?? album.year;
  return year ? String(year) : null;
}

function groupTracksByDisc(songs: Child[]): Map<number, Child[]> {
  const sorted = [...songs].sort((a, b) => {
    const discA = a.discNumber ?? 1;
    const discB = b.discNumber ?? 1;
    if (discA !== discB) return discA - discB;
    return (a.track ?? 0) - (b.track ?? 0);
  });
  const map = new Map<number, Child[]>();
  for (const s of sorted) {
    const disc = s.discNumber ?? 1;
    if (!map.has(disc)) map.set(disc, []);
    map.get(disc)!.push(s);
  }
  return map;
}

export function AlbumDetailScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const offlineMode = offlineModeStore((s) => s.offlineMode);
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const coverSize = Math.min(screenWidth * 0.68, HERO_COVER_MAX);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [album, setAlbum] = useState<AlbumWithSongsID3 | null>(null);
  const [hasCache, setHasCache] = useState(false);
  const [cacheChecked, setCacheChecked] = useState(false);
  // Read the cached detail from the local DB first (fast) — the server fetch only runs
  // on a genuine miss. The server refresh (fetchAlbum) dual-writes normalized, so a
  // re-open resolves instantly from here without a network round-trip.
  useEffect(() => {
    if (!id) return;
    const db = getDb();
    if (!db) {
      setCacheChecked(true);
      return;
    }
    let alive = true;
    getAlbumDetail(db, id)
      .then((d) => {
        if (!alive) return;
        if (d) {
          setAlbum((prev) => prev ?? ({ ...d.album, song: d.songs } as AlbumWithSongsID3));
          // "Cached" only if we actually have the tracks — an album ROW can exist without
          // its songs synced yet; an empty song list ⇒ fetch from the server.
          setHasCache(d.songs.length > 0);
        }
        setCacheChecked(true);
      })
      .catch(() => {
        if (alive) setCacheChecked(true);
      });
    return () => {
      alive = false;
    };
  }, [id]);
  const starred = useIsStarred('album', id ?? '');
  const transitionComplete = useTransitionComplete();
  const downloadStatus = useDownloadStatus('album', Platform.OS === 'ios' ? (id ?? '') : '');
  const isWide = useLayoutMode() === 'wide';
  const refreshControlKey = useRefreshControlKey();

  const handleToggleStar = useCallback(() => {
    if (id) toggleStar('album', id);
  }, [id]);

  /* ---- Data fetching ---- */
  const load = useCallback(async (albumId: string, isRefresh: boolean) => {
    // The fetch always upserts the album row, so the viewed album reaches the library
    // list without a separate sync step. `force` only on an explicit pull-to-refresh;
    // a normal open answers from the local database when we already hold the tracks.
    const data = await fetchAlbumDetail(albumId, { force: isRefresh });
    setAlbum(data);
    if (isRefresh && data?.id) {
      refreshCoverArt(data.id, 'album-detail-pull').catch(() => { /* non-critical */ });
    }
    return data ? null : t('albumNotFound');
  }, [t]);

  const { loading, refreshing, error, onRefresh } = useDetailFetch({
    id,
    hasCache,
    cacheChecked,
    missingIdMessage: t('missingAlbumId'),
    failedMessage: t('failedToLoadAlbum'),
    load,
  });

  const allSongs = useMemo(() => album?.song ?? [], [album?.song]);

  const listData = useMemo(() => {
    if (!allSongs.length) return [];
    const discs = groupTracksByDisc(allSongs);
    const hasMultipleDiscs = discs.size > 1;
    const items: AlbumListItem[] = [];
    for (const [discNum, tracks] of discs.entries()) {
      if (hasMultipleDiscs) {
        items.push({ type: 'disc-header', discNumber: discNum });
      }
      for (const track of tracks) {
        items.push({ type: 'track', track });
      }
    }
    return items;
  }, [allSongs]);

  // paddingTop on contentContainerStyle for BOTH platforms — never iOS's
  // contentInset.top + contentOffset.y = -inset to clear the floating Stack.Toolbar.
  // Fabric recycles RCTScrollViewComponentView instances across screen pushes and
  // `contentOffset` is initial-only, so it is not re-applied to a recycled instance:
  // the second push of any detail screen leaves the hero scrolled partly off the top.
  // paddingTop is content-side, so the layout engine applies it either way.
  const headerInset = insets.top + HEADER_BAR_HEIGHT;
  const listContentContainerStyle = useMemo(
    () => ({
      paddingTop: headerInset,
      paddingBottom: 32,
    }),
    [headerInset],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: AlbumListItem; index: number }) => {
      if (item.type === 'disc-header') {
        return (
          <View style={[styles.discHeaderWrap, index > 0 && styles.discHeaderGap]}>
            <Ionicons name="disc-outline" size={16} color={colors.primary} style={styles.discIcon} />
            <Text style={[styles.discTitle, { color: colors.label }]}>
              {t('discNumber', { number: item.discNumber })}
            </Text>
          </View>
        );
      }
      return (
        <View style={styles.trackItemWrap}>
          <TrackRow
            track={item.track}
            trackNumber={item.track.track != null ? `${item.track.track}. ` : undefined}
            colors={colors}
            songs={allSongs}
          />
        </View>
      );
    },
    [colors, allSongs, t],
  );

  const keyExtractor = useCallback(
    (item: AlbumListItem) =>
      item.type === 'disc-header' ? `disc-${item.discNumber}` : `track-${item.track.id}`,
    [],
  );

  const getItemType = useCallback(
    (item: AlbumListItem) => item.type,
    [],
  );

  // "More by <artist>": the artist's other releases, from the local database first and the
  // server only when the artist is not held yet.
  const [moreBy, setMoreBy] = useState<AlbumID3[]>([]);
  const artistIdForMore = album?.artistId;
  useEffect(() => {
    setMoreBy([]);
    if (!artistIdForMore || !transitionComplete) return;
    let alive = true;
    const pick = (albums: AlbumID3[] | undefined) => {
      if (!alive || !albums) return;
      setMoreBy(sortReleasesNewestFirst(albums.filter((a) => a.id !== id)).slice(0, MORE_BY_LIMIT));
    };
    const db = getDb();
    void (async () => {
      try {
        const local = db ? await getArtistBase(db, artistIdForMore) : null;
        if (local && local.albums.length > 0) return pick(local.albums);
        if (offlineMode) return;
        const remote = await fetchArtistBase(artistIdForMore, { prefetchCovers: false });
        pick(remote?.albums);
      } catch {
        /* the shelf stays absent */
      }
    })();
    return () => {
      alive = false;
    };
  }, [artistIdForMore, id, offlineMode, transitionComplete]);

  const playAll = useCallback(() => {
    if (allSongs.length > 0) playTrack(allSongs[0], allSongs);
  }, [allSongs]);
  const shuffleAll = useCallback(() => {
    if (allSongs.length === 0) return;
    const shuffled = shuffleArray(allSongs);
    playTrack(shuffled[0], shuffled);
  }, [allSongs]);

  const artistLabel = album?.artist ?? album?.displayArtist ?? t('unknownArtist');
  const artistAvatar = album?.artists?.find((a) => a.id === album.artistId)?.coverArt ?? album?.artists?.[0]?.coverArt;

  const listHeader = useMemo(() => {
    if (!album) return null;
    const kind = t(releaseKindKey(releaseKind({ ...album, songCount: album.songCount || allSongs.length })));
    const artistContent = (
      <View style={styles.artistRow}>
        {artistAvatar ? (
          <CachedImage coverArtId={artistAvatar} size={64} style={styles.artistAvatar} resizeMode="cover" />
        ) : null}
        <Text style={[styles.artistName, { color: colors.textPrimary }]} numberOfLines={1}>
          {artistLabel}
        </Text>
      </View>
    );
    return (
      <>
        <View style={styles.hero}>
          <View style={[styles.heroImageWrap, { width: coverSize, height: coverSize }]}>
            <CachedImage
              coverArtId={album.coverArt}
              size={HERO_COVER_SIZE}
              style={styles.heroImage}
              resizeMode="cover"
            />
          </View>
        </View>
        <View style={styles.info}>
          <Text style={[styles.albumName, { color: colors.textPrimary }]} numberOfLines={3}>
            {album.name}
          </Text>
          {album.artistId && !offlineMode ? (
            <Pressable
              onPress={() => router.push(`/artist/${album.artistId}`)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('goToArtist')}
              style={({ pressed }) => pressed && styles.pressed}
            >
              {artistContent}
            </Pressable>
          ) : (
            artistContent
          )}
          <Text style={[styles.albumMeta, { color: colors.textSecondary }]}>
            {album.year ? `${kind} · ${album.year}` : kind}
          </Text>

          {/* Spotify's action row: like, download, more on the left; shuffle + play on the right */}
          <View style={styles.actions}>
            {!offlineMode && Platform.OS !== 'ios' && (
              <Pressable
                onPress={handleToggleStar}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityState={{ selected: starred }}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Ionicons
                  name={starred ? 'heart' : 'heart-outline'}
                  size={26}
                  color={starred ? colors.primary : colors.textSecondary}
                />
              </Pressable>
            )}
            {id && Platform.OS !== 'ios' ? <DownloadButton itemId={id} type="album" size={26} /> : null}
            {Platform.OS !== 'ios' && (
              <MoreOptionsButton
                onPress={() => moreOptionsStore.getState().show({ type: 'album', item: album })}
                color={colors.textSecondary}
              />
            )}
            <View style={styles.actionsSpacer} />
            {allSongs.length > 1 && (
              <Pressable
                onPress={shuffleAll}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('shufflePlay')}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Ionicons name="shuffle" size={28} color={colors.textSecondary} />
              </Pressable>
            )}
            {allSongs.length > 0 && <PlayAllButton onPress={playAll} style={styles.playButton} />}
          </View>
        </View>
        <View style={styles.trackListSpacer} />
      </>
    );
  }, [
    album,
    allSongs.length,
    artistAvatar,
    artistLabel,
    colors.primary,
    colors.textPrimary,
    colors.textSecondary,
    coverSize,
    handleToggleStar,
    id,
    offlineMode,
    playAll,
    router,
    shuffleAll,
    starred,
    t,
  ]);

  const listFooter = useMemo(() => {
    if (!album) return null;
    const date = releaseDateLabel(album);
    const totalSeconds = allSongs.reduce((sum, s) => sum + (s.duration ?? 0), 0) || album.duration || 0;
    const label = album.recordLabels?.[0]?.name;
    return (
      <>
        {allSongs.length > 0 && (
          <View style={styles.footerInfo}>
            {date ? <Text style={[styles.footerDate, { color: colors.textPrimary }]}>{date}</Text> : null}
            <Text style={[styles.footerText, { color: colors.textSecondary }]}>
              {t('albumSongsDuration', { count: allSongs.length, duration: formatAlbumLength(totalSeconds) })}
            </Text>
            {label ? (
              <Text style={[styles.footerText, { color: colors.textSecondary }]}>
                {`© ${album.year ? `${album.year} ` : ''}${label}`}
              </Text>
            ) : null}
          </View>
        )}
        {moreBy.length > 0 && (
          <View style={styles.moreBySection}>
            <Text style={[styles.moreByTitle, { color: colors.textPrimary }]}>
              {t('albumMoreBy', { artist: artistLabel })}
            </Text>
            <FlashList
              data={moreBy}
              horizontal
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => <ReleaseCard album={item} width={MORE_BY_CARD} />}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.moreByList}
              ItemSeparatorComponent={() => <View style={styles.moreByGap} />}
            />
          </View>
        )}
        {album.artist ? <DiscoverMoreFromArtist name={album.artist} style={styles.moreFromArtist} /> : null}
      </>
    );
  }, [album, allSongs, artistLabel, colors.textPrimary, colors.textSecondary, moreBy, t]);

  const listEmpty = useMemo(
    () => (
      <View style={styles.emptyTracks}>
        <Text style={[styles.emptyTracksTitle, { color: colors.textPrimary }]}>
          {t('noTracksFound')}
        </Text>
        <Text style={[styles.emptyTracksSubtitle, { color: colors.textSecondary }]}>
          {t('noTracksFoundSubtitle')}
        </Text>
      </View>
    ),
    [colors.textPrimary, colors.textSecondary, t],
  );

  if (loading || !transitionComplete) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error || !album) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <EmptyState
          icon="disc-outline"
          title={t('couldntLoadAlbum')}
          subtitle={`${t('loadAlbumError')}\n\n${error ?? t('unknownError')}`}
        />
      </View>
    );
  }

  return (
    <>
      {Platform.OS === 'ios' && album && id && (
        <Stack.Toolbar placement="right">
          {!offlineMode && (
            <Stack.Toolbar.Button
              icon={starred ? 'heart.fill' : 'heart'}
              onPress={handleToggleStar}
              tintColor={starred ? colors.red : undefined}
            />
          )}
          {downloadStatus === 'none' ? (
            <Stack.Toolbar.Button
              icon="arrow.down.circle"
              onPress={() => enqueueAlbumDownload(id)}
            />
          ) : (
            <Stack.Toolbar.View>
              <DownloadButton itemId={id} type="album" />
            </Stack.Toolbar.View>
          )}
          <Stack.Toolbar.Button
            icon="ellipsis"
            onPress={() => moreOptionsStore.getState().show({ type: 'album', item: album })}
          />
        </Stack.Toolbar>
      )}
      <View style={styles.container}>
        <DetailScreenBackground coverArt={album?.coverArt} isWide={isWide} />
        <FlashList
          data={listData}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          getItemType={getItemType}
          drawDistance={LIST_DRAW_DISTANCE}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={listEmpty}
          ListFooterComponent={listFooter}
          onScrollBeginDrag={closeOpenRow}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={listContentContainerStyle}
          refreshControl={
            offlineMode ? undefined : (
              <RefreshControl
                key={refreshControlKey}
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.primary}
                progressViewOffset={headerInset}
              />
            )
          }
        />
        <BottomChrome withSafeAreaPadding />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  moreFromArtist: {
    paddingHorizontal: 16,
    marginTop: 24,
  },
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  hero: {
    width: '100%',
    paddingTop: 8,
    paddingBottom: 20,
    alignItems: 'center',
  },
  heroImageWrap: {
    backgroundColor: 'rgba(128,128,128,0.12)',
    borderRadius: 4,
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  info: {
    paddingHorizontal: 16,
  },
  albumName: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  artistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  artistAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 8,
  },
  artistName: {
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  albumMeta: {
    fontSize: 13,
    marginTop: 6,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 18,
  },
  actionsSpacer: {
    flex: 1,
  },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  trackItemWrap: {
    // Deliberately empty: TrackRow carries the 16px horizontal padding (matching the
    // `info` block) so its content edge aligns with the title text above while the
    // swipe-gesture area still reaches the screen edge.
  },
  discHeaderWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  discIcon: {
    marginRight: 6,
  },
  discHeaderGap: {
    marginTop: 24,
  },
  trackListSpacer: {
    height: 8,
  },
  discTitle: {
    fontSize: 16,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  footerInfo: {
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 4,
  },
  footerDate: {
    fontSize: 14,
    fontWeight: '600',
  },
  footerText: {
    fontSize: 13,
  },
  moreBySection: {
    marginTop: 28,
  },
  moreByTitle: {
    fontSize: 20,
    fontWeight: '800',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  moreByList: {
    paddingHorizontal: 16,
  },
  moreByGap: {
    width: 14,
  },
  emptyTracks: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 16,
    alignItems: 'center',
  },
  emptyTracksTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyTracksSubtitle: {
    fontSize: 16,
    textAlign: 'center',
  },
});
