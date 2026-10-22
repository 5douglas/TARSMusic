import { Stack, useLocalSearchParams, useNavigation } from 'expo-router';
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
import { FlashList } from '@shopify/flash-list';
import { LIST_DRAW_DISTANCE } from '../constants/layout';
import Ionicons from "@react-native-vector-icons/ionicons/static";
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AlbumRow } from '../components/AlbumRow';
import { EmptyState } from '../components/EmptyState';
import { ArtistCard } from '../components/ArtistCard';
import { CachedImage } from '../components/CachedImage';
import { BottomChrome } from '../components/BottomChrome';
import { MoreOptionsButton } from '../components/MoreOptionsButton';
import { DiscoverMoreFromArtist } from '../components/DiscoverMoreFromArtist';
import { PopularTrackRow } from '../components/PopularTrackRow';
import { SectionTitle } from '../components/SectionTitle';
import { closeOpenRow } from '../components/SwipeableRow';
import { DetailScreenBackground } from '../components/DetailScreenBackground';
import { PlayAllButton, ShufflePlayButton } from '../components/DetailHeroButtons';
import { useDetailFetch } from '../hooks/useDetailFetch';
import { useIsStarred } from '../hooks/useIsStarred';
import { useLayoutMode } from '../hooks/useLayoutMode';
import { useRefreshControlKey } from '../hooks/useRefreshControlKey';
import { useTheme } from '../hooks/useTheme';
import { useTransitionComplete } from '../hooks/useTransitionComplete';
import { refreshCoverArt } from '../services/imageCacheService';
import {
  fetchArtistStats,
  formatCount,
  playsForTitle,
  type ArtistStats,
} from '../services/artistStatsService';
import { PillToggle } from '../components/PillToggle';
import { playAllByArtist, playMoreByArtist, toggleStar } from '../services/moreOptionsService';
import { shuffleArray } from '../utils/arrayHelpers';
import { playTrack } from '../services/playerService';
import {
  fetchArtistBase,
  fetchArtistBio,
  fetchArtistInfo,
  fetchArtistTopSongs,
} from '../services/detailFetchService';
import { getDb } from '../store/persistence/db';
import { getArtistBase } from '../db/repository/details';
import { subscribeDetailChanged } from '../db/detailNotifier';
import { layoutPreferencesStore } from '../store/layoutPreferencesStore';
import { moreOptionsStore } from '../store/moreOptionsStore';
import { offlineModeStore } from '../store/offlineModeStore';
import { playbackSettingsStore, type ArtistPlayMode } from '../store/playbackSettingsStore';

import {
  type AlbumID3,
  type ArtistID3,
  type ArtistWithAlbumsID3,
  type Child,
} from '../services/subsonicService';

const HERO_COVER_SIZE = 600;
const BANNER_MAX_HEIGHT = 420;
const POPULAR_COLLAPSED = 5;
const POPULAR_EXPANDED = 10;
/** Darkens the banner's lower half so the white artist name stays legible on any photo. */
const BANNER_SCRIM: readonly [string, string, string] = ['rgba(0,0,0,0.25)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.65)'];
const BANNER_SCRIM_LOCATIONS: readonly [number, number, number] = [0, 0.35, 1];
const HEADER_BAR_HEIGHT = 44;
const CARD_WIDTH = 88;
const HORIZONTAL_GAP = 10;

/* ------------------------------------------------------------------ */
/*  Main screen                                                       */
/* ------------------------------------------------------------------ */

export function ArtistDetailScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const offlineMode = offlineModeStore((s) => s.offlineMode);
  const artistPlayMode = playbackSettingsStore((s) => s.artistPlayMode);
  const { width: screenWidth } = useWindowDimensions();
  const bannerHeight = Math.min(screenWidth * 0.9, BANNER_MAX_HEIGHT);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const starred = useIsStarred('artist', id ?? '');

  const handleToggleStar = useCallback(() => {
    if (id) toggleStar('artist', id);
  }, [id]);

  const [artist, setArtist] = useState<ArtistWithAlbumsID3 | null>(null);
  const [similarArtists, setSimilarArtists] = useState<ArtistID3[]>([]);
  const [heroFallbackUrl, setHeroFallbackUrl] = useState<string | undefined>(undefined);
  const [topSongs, setTopSongs] = useState<Child[]>([]);
  const [biography, setBiography] = useState<string | null>(null);
  const [bioExpanded, setBioExpanded] = useState(false);
  const [stats, setStats] = useState<ArtistStats | null>(null);
  const [popularExpanded, setPopularExpanded] = useState(false);
  const [albumSortDesc, setAlbumSortDesc] = useState(
    () => layoutPreferencesStore.getState().artistAlbumSortOrder === 'newest',
  );
  const [topSongsSettled, setTopSongsSettled] = useState(false);
  const [bioLoading, setBioLoading] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [hasCache, setHasCache] = useState(false);
  const [cacheChecked, setCacheChecked] = useState(false);

  // Defer heavy sections (top songs, similar artists, albums) until the
  // navigation animation completes so the transition isn't blocked by
  // mounting dozens of CachedImage components synchronously.
  const ready = useTransitionComplete();
  const isWide = useLayoutMode() === 'wide';
  const refreshControlKey = useRefreshControlKey();

  // Read the cached detail from the local DB first (fast) — the server fetch only runs on a
  // genuine miss. The server refresh (fetchArtist) dual-writes normalized + bumps the detail
  // notifier, so a re-open resolves instantly here and a background MBID-override refetch
  // re-reads without a store subscription.
  useEffect(() => {
    if (!id) return;
    const db = getDb();
    if (!db) {
      setCacheChecked(true);
      return;
    }
    let alive = true;
    const read = () =>
      getArtistBase(db, id).then((d) => {
        if (!alive || !d) return;
        setArtist({ ...d.artist, album: d.albums } as ArtistWithAlbumsID3);
        // Presence is the repository's rule (albums present, or a known-empty artist) —
        // never "the row exists", which is true for everything after a list sync.
        setHasCache(true);
      });
    read()
      .catch(() => { /* treat a read failure as a miss → server fetch */ })
      .finally(() => { if (alive) setCacheChecked(true); });
    const unsub = subscribeDetailChanged('artist', id, () => { void read(); });
    return () => {
      alive = false;
      unsub();
    };
  }, [id]);

  // The other three parts load independently — `useDetailFetch` only calls `load` on a
  // base MISS, so routing them through it would leave them unfetched for every artist we
  // already hold. Each owns its own state and its own failure; none may set the shared
  // `error`, which would blank a screen that has already rendered its albums.
  useEffect(() => {
    if (!id) return;
    let alive = true;
    const force = refreshNonce > 0;
    void fetchArtistInfo(id, { force })
      .then((info) => {
        if (!alive || !info) return;
        setSimilarArtists(info.similarArtist);
        setHeroFallbackUrl(info.largeImageUrl ?? undefined);
      })
      .catch(() => { /* section stays absent */ });
    setBioLoading(true);
    void fetchArtistBio(id, { force })
      .then((bio) => { if (alive && bio) setBiography(bio.biography); })
      .catch(() => { /* section stays absent */ })
      .finally(() => { if (alive) setBioLoading(false); });
    setTopSongsSettled(false);
    void fetchArtistTopSongs(id, { force })
      .then((top) => { if (alive) setTopSongs(top?.songs ?? []); })
      .catch(() => { /* section stays absent */ })
      .finally(() => { if (alive) setTopSongsSettled(true); });
    return () => { alive = false; };
  }, [id, refreshNonce]);

  // Public listener / play counts. Keyed on the name: both Last.fm and Deezer match by it.
  const artistName = artist?.name;
  useEffect(() => {
    setStats(null);
    if (!artistName || offlineMode) return;
    let alive = true;
    void fetchArtistStats(artistName).then((res) => { if (alive) setStats(res); });
    return () => { alive = false; };
  }, [artistName, offlineMode, refreshNonce]);

  /* ---- Header right: more options button ---- */
  useEffect(() => {
    if (Platform.OS === 'ios') return;
    if (!artist) return;
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerRight}>
          {!offlineMode && (
            <Pressable onPress={handleToggleStar} hitSlop={8} style={styles.starButton}>
              <Ionicons
                name={starred ? 'heart' : 'heart-outline'}
                size={22}
                color={starred ? colors.red : colors.textPrimary}
              />
            </Pressable>
          )}
          <MoreOptionsButton
            onPress={() =>
              moreOptionsStore.getState().show({ type: 'artist', item: artist })
            }
            color={colors.textPrimary}
          />
        </View>
      ),
    });
  }, [artist, navigation, colors.textPrimary, colors.red, starred, offlineMode, handleToggleStar]);

  /* ---- Data fetching ---- */
  const load = useCallback(async (artistId: string, isRefresh: boolean) => {
    // Base only. The other three parts have their own effect; a pull bumps the nonce so
    // they re-run forced. `force` here is the local-row bypass — it deliberately does NOT
    // re-resolve the bio, which would re-hammer MusicBrainz on every pull.
    if (isRefresh) setRefreshNonce((n) => n + 1);
    const base = await fetchArtistBase(artistId, { force: isRefresh });
    if (!base) {
      setArtist(null);
      setSimilarArtists([]);
      setHeroFallbackUrl(undefined);
      setTopSongs([]);
      setBiography(null);
      return t('artistNotFound');
    }
    setArtist({ ...base.artist, album: base.albums } as ArtistWithAlbumsID3);
    if (isRefresh && base.artist.id) {
      refreshCoverArt(base.artist.id, 'artist-detail-pull').catch(() => { /* non-critical */ });
    }
    return null;
  }, [t]);

  const { loading, refreshing, error, onRefresh } = useDetailFetch({
    id,
    hasCache,
    cacheChecked,
    missingIdMessage: t('missingArtistId'),
    failedMessage: t('failedToLoadArtist'),
    load,
  });

  /* ---- Derived values ---- */
  const albums = artist?.album ?? [];

  const sortedAlbums = useMemo(() => {
    if (albums.length === 0) return albums;
    return [...albums].sort((a, b) => {
      const yearA = a.year ?? 0;
      const yearB = b.year ?? 0;
      return albumSortDesc ? yearB - yearA : yearA - yearB;
    });
  }, [albums, albumSortDesc]);

  const renderAlbumItem = useCallback(
    ({ item }: { item: AlbumID3 }) => (
      <View style={styles.albumRowWrap}>
        <AlbumRow album={item} />
      </View>
    ),
    [],
  );

  const albumKeyExtractor = useCallback((item: AlbumID3) => item.id, []);

  const popularSongs = useMemo(
    () => topSongs.slice(0, popularExpanded ? POPULAR_EXPANDED : POPULAR_COLLAPSED),
    [topSongs, popularExpanded],
  );

  // Public Last.fm plays when the key is set and Last.fm knows the artist's tracks; otherwise
  // the user's own plays, labelled as theirs so the two are never mistaken for each other.
  const hasPublicPlays = !!stats && Object.keys(stats.trackPlays).length > 0;
  const popularPlaysLabel = useCallback(
    (song: Child): string | null => {
      if (hasPublicPlays) {
        const plays = playsForTitle(stats, song.title);
        return plays != null ? formatCount(plays) : null;
      }
      return song.playCount ? t('artistYourPlays', { count: song.playCount, formatted: formatCount(song.playCount) }) : null;
    },
    [hasPublicPlays, stats, t],
  );

  // Last.fm listeners when a key is set, otherwise Deezer fans; null until either arrives.
  const listenersLine = useMemo(() => {
    if (stats?.listeners != null) {
      return t('artistListeners', { count: stats.listeners, formatted: formatCount(stats.listeners) });
    }
    if (stats?.fans != null) {
      return t('artistFans', { count: stats.fans, formatted: formatCount(stats.fans) });
    }
    return null;
  }, [stats, t]);

  const similarArtistsRenderItem = useCallback(
    ({ item }: { item: (typeof similarArtists)[number] }) => (
      <ArtistCard artist={item} width={CARD_WIDTH} />
    ),
    [],
  );

  const similarArtistsKeyExtractor = useCallback(
    (item: (typeof similarArtists)[number]) => item.id,
    [],
  );

  const playModeOptions = useMemo(
    (): [{ key: ArtistPlayMode; label: string }, { key: ArtistPlayMode; label: string }] => [
      { key: 'topSongs', label: t('topSongs') },
      { key: 'allSongs', label: t('allSongs') },
    ],
    [t],
  );

  const handlePlayModeChange = useCallback((mode: ArtistPlayMode) => {
    playbackSettingsStore.getState().setArtistPlayMode(mode);
  }, []);

  const listHeader = useMemo(() => {
    if (!artist) return null;
    return (
      <>
        {/* ---- Hero: full-width banner with the name over it, Spotify style ---- */}
        <View style={[styles.banner, { height: bannerHeight + insets.top }]}>
          <CachedImage
            coverArtId={artist.coverArt}
            size={HERO_COVER_SIZE}
            fallbackUri={heroFallbackUrl}
            style={styles.bannerImage}
            resizeMode="cover"
          />
          <LinearGradient
            colors={BANNER_SCRIM}
            locations={BANNER_SCRIM_LOCATIONS}
            style={styles.bannerImage}
            pointerEvents="none"
          />
          <Text style={styles.artistName} numberOfLines={2} adjustsFontSizeToFit>
            {artist.name}
          </Text>
        </View>
        <View style={styles.meta}>
          <Text style={[styles.metaText, { color: colors.textSecondary }]}>
            {listenersLine ?? t('albumCount', { count: artist.albumCount ?? 0 })}
          </Text>
        </View>
        <View style={styles.heroButtons}>
          <PillToggle
            options={playModeOptions}
            selected={artistPlayMode}
            onSelect={handlePlayModeChange}
            colors={colors}
          />
          <View style={styles.heroPlayButtons}>
            {/* Top songs arrive after the base, so an unarrived list must not read as an
                empty one — that would silently fall through to "more by artist" and play
                the wrong thing. Only the topSongs mode depends on it; allSongs needs the
                base alone and stays live. */}
            <ShufflePlayButton
              disabled={artistPlayMode === 'topSongs' && !topSongsSettled}
              onPress={() => {
                if (artistPlayMode === 'allSongs') {
                  playAllByArtist(artist.id, artist.name, true);
                } else if (topSongs.length > 1) {
                  const shuffled = shuffleArray(topSongs);
                  playTrack(shuffled[0], shuffled);
                } else {
                  playMoreByArtist(artist.id, artist.name);
                }
              }}
            />
            <PlayAllButton
              disabled={artistPlayMode === 'topSongs' && !topSongsSettled}
              onPress={() => {
                if (artistPlayMode === 'allSongs') {
                  playAllByArtist(artist.id, artist.name, false);
                } else if (topSongs.length > 0) {
                  playTrack(topSongs[0], topSongs);
                } else {
                  playMoreByArtist(artist.id, artist.name);
                }
              }}
            />
          </View>
        </View>

        {/* Heavy sections deferred until after the navigation animation */}
        {ready && (
          <>
            {/* ---- Popular: numbered rows with play counts ---- */}
            {popularSongs.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>
                  {t('artistPopular')}
                </Text>
                {popularSongs.map((song, index) => (
                  <PopularTrackRow
                    key={`${song.id}-${index}`}
                    song={song}
                    rank={index + 1}
                    playsLabel={popularPlaysLabel(song)}
                    songs={topSongs}
                  />
                ))}
                {topSongs.length > POPULAR_COLLAPSED && (
                  <Pressable
                    onPress={() => setPopularExpanded((prev) => !prev)}
                    style={({ pressed }) => [styles.seeMore, pressed && styles.pressed]}
                    hitSlop={8}
                  >
                    <Text style={[styles.seeMoreText, { color: colors.primary }]}>
                      {popularExpanded ? t('showLess') : t('artistSeeMore')}
                    </Text>
                  </Pressable>
                )}
              </View>
            )}

            {/* ---- Similar Artists ---- */}
            {similarArtists.length > 0 && (
              <View style={styles.section}>
                <SectionTitle title={t('artistFansAlsoLike')} color={colors.label} />
                <FlashList
                  data={similarArtists}
                  renderItem={similarArtistsRenderItem}
                  keyExtractor={similarArtistsKeyExtractor}
                  drawDistance={LIST_DRAW_DISTANCE}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.horizontalList}
                  ItemSeparatorComponent={() => (
                    <View style={{ width: HORIZONTAL_GAP }} />
                  )}
                />
              </View>
            )}

            {/* ---- Biography ---- */}
            {/* The bio is the slowest part — it can fall through to MusicBrainz — so show
                the section with a spinner while it resolves rather than leaving a gap that
                looks like the artist simply has no bio. */}
            {bioLoading && (biography == null || biography.length === 0) && (
              <View style={styles.section}>
                <SectionTitle title={t('about')} color={colors.label} />
                <View style={styles.bioLoading}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[styles.bioLoadingText, { color: colors.textSecondary }]}>
                    {t('loadingBiography')}
                  </Text>
                </View>
              </View>
            )}
            {biography != null && biography.length > 0 && (
              <View style={styles.section}>
                <SectionTitle title={t('about')} color={colors.label} />
                <Text
                  style={[styles.bioText, { color: colors.textSecondary }]}
                  numberOfLines={bioExpanded ? undefined : 4}
                >
                  {biography}
                </Text>
                <Pressable
                  onPress={() => setBioExpanded((prev) => !prev)}
                  style={({ pressed }) => pressed && styles.pressed}
                >
                  <Text style={[styles.bioToggle, { color: colors.primary }]}>
                    {bioExpanded ? t('showLess') : t('readMore')}
                  </Text>
                </Pressable>
              </View>
            )}

            {/* ---- Deezer releases missing from the library ---- */}
            <DiscoverMoreFromArtist name={artist.name} style={styles.section} />

            {/* ---- Albums section header (list items follow in FlashList) ---- */}
            {albums.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <SectionTitle title={t('albums')} color={colors.label} />
                  <Pressable
                    onPress={() => setAlbumSortDesc((prev) => !prev)}
                    style={({ pressed }) => [
                      styles.sortButton,
                      pressed && styles.pressed,
                    ]}
                    hitSlop={8}
                  >
                    <Ionicons
                      name={albumSortDesc ? 'arrow-down' : 'arrow-up'}
                      size={14}
                      color={colors.primary}
                    />
                    <Text style={[styles.sortLabel, { color: colors.textPrimary }]}>
                      {albumSortDesc ? t('newest') : t('oldest')}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
          </>
        )}
      </>
    );
  }, [
    artist,
    heroFallbackUrl,
    bannerHeight,
    insets.top,
    listenersLine,
    popularSongs,
    popularExpanded,
    popularPlaysLabel,
    ready,
    biography,
    bioExpanded,
    topSongs,
    similarArtists,
    albums.length,
    albumSortDesc,
    colors.textPrimary,
    colors.textSecondary,
    colors.label,
    colors.primary,
    similarArtistsRenderItem,
    similarArtistsKeyExtractor,
    artistPlayMode,
    playModeOptions,
    handlePlayModeChange,
    t,
  ]);

  /* ---- Loading state ---- */
  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  /* ---- Error state ---- */
  if (error || !artist) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <EmptyState
          icon="person-outline"
          title={t('couldntLoadArtist')}
          subtitle={`${t('loadArtistError')}\n\n${error ?? t('unknownError')}`}
        />
      </View>
    );
  }

  return (
    <>
      {Platform.OS === 'ios' && artist && (
        <Stack.Toolbar placement="right">
          {!offlineMode && (
            <Stack.Toolbar.Button
              icon={starred ? 'heart.fill' : 'heart'}
              onPress={handleToggleStar}
              tintColor={starred ? colors.red : undefined}
            />
          )}
          <Stack.Toolbar.Button
            icon="ellipsis"
            onPress={() => moreOptionsStore.getState().show({ type: 'artist', item: artist })}
          />
        </Stack.Toolbar>
      )}
      <View style={styles.container}>
        <DetailScreenBackground coverArt={artist?.coverArt} isWide={isWide} />

        <FlashList
          data={sortedAlbums}
          renderItem={renderAlbumItem}
          keyExtractor={albumKeyExtractor}
          drawDistance={LIST_DRAW_DISTANCE}
          ListHeaderComponent={listHeader}
          onScrollBeginDrag={closeOpenRow}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.content,
          ]}
          refreshControl={
            offlineMode ? undefined : (
              <RefreshControl
                key={refreshControlKey}
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.primary}
                progressViewOffset={insets.top + HEADER_BAR_HEIGHT}
              />
            )
          }
        />
        <BottomChrome withSafeAreaPadding />
      </View>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles                                                            */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: 32,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  starButton: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  pressed: {
    opacity: 0.8,
  },

  /* Hero banner — runs under the transparent header, so it includes the top inset */
  banner: {
    width: '100%',
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(128,128,128,0.12)',
  },
  bannerImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  artistName: {
    color: '#fff',
    fontSize: 44,
    fontWeight: '900',
    letterSpacing: -1,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  meta: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  metaText: {
    fontSize: 14,
    fontWeight: '500',
  },
  heroButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  heroPlayButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  /* Sections */
  section: {
    paddingHorizontal: 16,
    marginTop: 20,
  },

  sectionHeading: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 8,
  },
  seeMore: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingLeft: 34,
  },
  seeMoreText: {
    fontSize: 14,
    fontWeight: '700',
  },

  /* Biography */
  bioLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  bioLoadingText: {
    fontSize: 13,
  },
  bioText: {
    fontSize: 16,
    lineHeight: 22,
  },
  bioToggle: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 6,
  },

  /* Album list */
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 4,
    marginBottom: 10,
    gap: 4,
  },
  sortLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  albumRowWrap: {
    paddingHorizontal: 16,
  },

  /* Horizontal card lists (Top Songs / Similar Artists) */
  horizontalList: {
    paddingRight: 16,
  },
});
