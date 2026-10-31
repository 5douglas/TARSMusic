import Ionicons from '@react-native-vector-icons/ionicons/static';
import { FlashList } from '@shopify/flash-list';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from 'expo-router/react-navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { BottomSheet } from '../components/BottomSheet';
import { DARK_MIX, GRADIENT_LOCATIONS, GRADIENT_MIX_CURVE, LIGHT_MIX } from '../components/GradientBackground';
import { EmptyState } from '../components/EmptyState';
import { LibraryItemRow, LikedSongsRow } from '../components/LibraryItemRow';
import { useTheme } from '../hooks/useTheme';
import { countStarredSongs } from '../db/repository/favorites';
import {
  loadDownloadedLibraryItems,
  loadLibraryItems,
  sortLibraryItems,
  type LibraryItem,
  type LibrarySort,
} from '../services/libraryItemsService';
import { albumListsStore } from '../store/albumListsStore';
import { favoritesStore } from '../store/favoritesStore';
import { filterBarStore } from '../store/filterBarStore';
import { libraryViewStore } from '../store/libraryViewStore';
import { musicCacheStore } from '../store/musicCacheStore';
import { offlineModeStore } from '../store/offlineModeStore';
import { getDb } from '../store/persistence/db';
import { searchStore } from '../store/searchStore';
import { syncStatusStore } from '../store/syncStatusStore';
import { layoutPreferencesStore } from '../store/layoutPreferencesStore';
import { mixHexColors } from '../utils/colors';
import { runWhenIdle } from '../utils/runWhenIdle';
import { AlbumLibraryListScreen } from './album-library-list';
import { ArtistListScreen } from './artist-list';
import { PlaylistListScreen } from './playlist-list';
import { SongLibraryListScreen } from './song-library-list';

/** Spotify's filter chips. None selected is the mixed list. */
type LibraryFilter = 'playlists' | 'artists' | 'albums' | 'songs' | 'downloaded';

const FILTERS: { key: LibraryFilter; labelKey: string }[] = [
  { key: 'playlists', labelKey: 'playlists' },
  { key: 'artists', labelKey: 'artists' },
  { key: 'albums', labelKey: 'albums' },
  { key: 'songs', labelKey: 'songs' },
  { key: 'downloaded', labelKey: 'libraryDownloaded' },
];

const SORTS: { key: LibrarySort; labelKey: string }[] = [
  { key: 'recents', labelKey: 'librarySortRecents' },
  { key: 'recentlyAdded', labelKey: 'librarySortRecentlyAdded' },
  { key: 'alphabetical', labelKey: 'librarySortAlphabetical' },
  { key: 'creator', labelKey: 'librarySortCreator' },
];

const CHIP_ROW_HEIGHT = 48;
const SORT_ROW_HEIGHT = 40;
const GRID_COLUMNS = 3;
const GRID_GAP = 12;
const SIDE_PADDING = 16;

type Row = { kind: 'liked' } | LibraryItem;

/* ------------------------------------------------------------------ */
/*  LibraryScreen                                                     */
/* ------------------------------------------------------------------ */

/**
 * Your Library, Spotify style: filter chips (Playlists, Artists, Albums, Songs, Downloaded)
 * over a mixed list that opens with the pinned Liked Songs, sortable and switchable
 * between list and grid. A chip for one kind shows that kind's full library list.
 */
export function LibraryScreen() {
  const { t } = useTranslation();
  const { theme, colors } = useTheme();
  const isFocused = useIsFocused();
  const { width, height: windowHeight } = useWindowDimensions();
  const headerHeight = searchStore((s) => s.headerHeight);
  const offlineMode = offlineModeStore((s) => s.offlineMode);
  const [filter, setFilter] = useState<LibraryFilter | null>(null);
  const [sortSheetVisible, setSortSheetVisible] = useState(false);
  const sort = libraryViewStore((s) => s.sort);
  const grid = libraryViewStore((s) => s.grid);

  // Offline only downloaded music plays, so the mixed list shows just that.
  const effectiveFilter: LibraryFilter | null = offlineMode && filter === null ? 'downloaded' : filter;
  const mixed = effectiveFilter === null || effectiveFilter === 'downloaded';

  // The full lists are heavy: let the chip highlight first, then mount the list.
  const [contentReady, setContentReady] = useState(false);
  useEffect(() => {
    setContentReady(false);
    return runWhenIdle(() => setContentReady(true));
  }, [effectiveFilter]);

  // The kind lists read the header filter bar; Your Library has its own chips instead.
  useEffect(() => {
    if (!isFocused) return;
    const store = filterBarStore.getState();
    store.setLayoutToggle(null);
    store.setDownloadButtonConfig(null);
    store.setHideDownloaded(true);
    store.setHideFavorites(true);
  }, [isFocused]);

  /* ---- Mixed list data ---- */
  const recentlyPlayed = albumListsStore((s) => s.recentlyPlayed);
  const favoritesVersion = favoritesStore((s) => s.version);
  const downloadsRevision = musicCacheStore((s) => s.revision);
  const playlistsFetchedAt = syncStatusStore((s) => s.playlistLibraryLastFetchedAt);
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [likedCount, setLikedCount] = useState(0);

  useEffect(() => {
    if (!mixed || !isFocused) return;
    const db = getDb();
    if (!db) {
      setItems([]);
      return;
    }
    let alive = true;
    const load = effectiveFilter === 'downloaded' ? loadDownloadedLibraryItems(db) : loadLibraryItems(db, recentlyPlayed);
    void Promise.all([load, effectiveFilter === null ? countStarredSongs(db) : Promise.resolve(0)])
      .then(([next, liked]) => {
        if (!alive) return;
        setItems(next);
        setLikedCount(liked);
      })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, [mixed, isFocused, effectiveFilter, recentlyPlayed, favoritesVersion, downloadsRevision, playlistsFetchedAt]);

  const rows = useMemo<Row[]>(() => {
    const sorted = sortLibraryItems(items ?? [], sort);
    return effectiveFilter === null ? [{ kind: 'liked' }, ...sorted] : sorted;
  }, [items, sort, effectiveFilter]);

  const tileSize = Math.floor((width - SIDE_PADDING * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS);

  const renderRow = useCallback(
    ({ item, index }: { item: Row; index: number }) => {
      const cell =
        item.kind === 'liked' ? (
          <LikedSongsRow count={likedCount} grid={grid} tileSize={tileSize} />
        ) : (
          <LibraryItemRow entry={item} grid={grid} tileSize={tileSize} />
        );
      if (!grid) return cell;
      // Centre each tile in its column so the gaps stay even.
      const column = index % GRID_COLUMNS;
      return <View style={[styles.gridCell, column === 0 ? styles.cellStart : column === GRID_COLUMNS - 1 ? styles.cellEnd : null]}>{cell}</View>;
    },
    [grid, tileSize, likedCount],
  );

  /* ---- Kind lists ---- */
  const albumLayout = layoutPreferencesStore((s) => s.albumLayout);
  const artistLayout = layoutPreferencesStore((s) => s.artistLayout);
  const playlistLayout = layoutPreferencesStore((s) => s.playlistLayout);
  const songLayout = layoutPreferencesStore((s) => s.songLayout);

  const contentInsetTop = headerHeight + CHIP_ROW_HEIGHT + (mixed ? SORT_ROW_HEIGHT : 0);
  const sortLabel = t(SORTS.find((s) => s.key === sort)?.labelKey ?? 'librarySortRecents');

  let content: React.ReactNode;
  if (!contentReady) {
    content = (
      <View style={[styles.centered, { paddingTop: contentInsetTop }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  } else if (mixed) {
    content = (
      <FlashList
        key={grid ? 'grid' : 'list'}
        data={rows}
        numColumns={grid ? GRID_COLUMNS : 1}
        renderItem={renderRow}
        keyExtractor={(row) => (row.kind === 'liked' ? 'liked' : `${row.kind}-${row.id}`)}
        getItemType={(row) => row.kind}
        drawDistance={600}
        maintainVisibleContentPosition={{ disabled: true }}
        contentContainerStyle={{
          paddingTop: contentInsetTop,
          paddingBottom: 120,
          paddingHorizontal: grid ? SIDE_PADDING : 0,
        }}
        ListEmptyComponent={
          items === null ? (
            <ActivityIndicator style={styles.spinner} color={colors.primary} />
          ) : (
            <EmptyState
              icon={effectiveFilter === 'downloaded' ? 'cloud-download-outline' : 'library-outline'}
              title={effectiveFilter === 'downloaded' ? t('noDownloadedMusic') : t('libraryEmpty')}
            />
          )
        }
      />
    );
  } else if (effectiveFilter === 'playlists') {
    content = <PlaylistListScreen layout={playlistLayout} downloadedOnly={false} contentInsetTop={contentInsetTop} />;
  } else if (effectiveFilter === 'artists') {
    content = <ArtistListScreen layout={artistLayout} favoritesOnly={false} contentInsetTop={contentInsetTop} />;
  } else if (effectiveFilter === 'albums') {
    content = (
      <AlbumLibraryListScreen layout={albumLayout} downloadedOnly={false} favoritesOnly={false} contentInsetTop={contentInsetTop} />
    );
  } else {
    content = (
      <SongLibraryListScreen layout={songLayout} downloadedOnly={false} favoritesOnly={false} contentInsetTop={contentInsetTop} />
    );
  }

  // The chips stay put while the list scrolls under them, so they get the header's own
  // backdrop: the continuation of its gradient on Android, the same blur on iOS.
  const backdropColors = useMemo(() => {
    const peak = theme === 'dark' ? DARK_MIX : LIGHT_MIX;
    return GRADIENT_MIX_CURVE.map((m) => mixHexColors(colors.background, colors.primary, peak * m)) as [
      string,
      string,
      ...string[],
    ];
  }, [theme, colors.primary, colors.background]);

  const visibleFilters = filter ? FILTERS.filter((f) => f.key === filter) : offlineMode ? [] : FILTERS;

  return (
    <View style={styles.container}>
      <View style={styles.content}>{content}</View>
      <View style={[styles.overlay, { top: headerHeight }]}>
        {Platform.OS === 'ios' ? (
          <BlurView tint={theme === 'dark' ? 'dark' : 'light'} intensity={80} style={StyleSheet.absoluteFill} />
        ) : (
          <LinearGradient
            colors={backdropColors}
            locations={GRADIENT_LOCATIONS}
            style={[styles.backdrop, { top: -headerHeight, height: windowHeight }]}
            pointerEvents="none"
          />
        )}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          style={styles.chipRow}
        >
          {filter && (
            <Pressable
              onPress={() => setFilter(null)}
              style={({ pressed }) => [styles.clearChip, { backgroundColor: colors.inputBg }, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={t('libraryClearFilter')}
            >
              <Ionicons name="close" size={16} color={colors.textPrimary} />
            </Pressable>
          )}
          {visibleFilters.map((f) => {
            const selected = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(selected ? null : f.key)}
                style={({ pressed }) => [
                  styles.chip,
                  { backgroundColor: selected ? colors.primary : colors.inputBg },
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.chipLabel, { color: selected ? '#fff' : colors.textPrimary }]}>{t(f.labelKey)}</Text>
              </Pressable>
            );
          })}
          {offlineMode && !filter && (
            <View style={[styles.chip, { backgroundColor: colors.primary }]}>
              <Text style={[styles.chipLabel, styles.chipLabelSelected]}>{t('libraryDownloaded')}</Text>
            </View>
          )}
        </ScrollView>
        {mixed && (
          <View style={styles.sortRow}>
            <Pressable
              onPress={() => setSortSheetVisible(true)}
              style={({ pressed }) => [styles.sortButton, pressed && styles.pressed]}
              hitSlop={8}
              accessibilityRole="button"
            >
              <Ionicons name="swap-vertical" size={16} color={colors.textPrimary} />
              <Text style={[styles.sortLabel, { color: colors.textPrimary }]}>{sortLabel}</Text>
            </Pressable>
            <Pressable
              onPress={() => libraryViewStore.getState().toggleGrid()}
              hitSlop={8}
              style={({ pressed }) => pressed && styles.pressed}
              accessibilityRole="button"
              accessibilityLabel={grid ? t('libraryShowList') : t('libraryShowGrid')}
            >
              <Ionicons name={grid ? 'list' : 'grid-outline'} size={18} color={colors.textPrimary} />
            </Pressable>
          </View>
        )}
      </View>

      <BottomSheet visible={sortSheetVisible} onClose={() => setSortSheetVisible(false)}>
        <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>{t('librarySortBy')}</Text>
        {SORTS.map((s) => (
          <Pressable
            key={s.key}
            onPress={() => {
              libraryViewStore.getState().setSort(s.key);
              setSortSheetVisible(false);
            }}
            style={({ pressed }) => [styles.sheetRow, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityState={{ selected: sort === s.key }}
          >
            <Text style={[styles.sheetLabel, { color: sort === s.key ? colors.primary : colors.textPrimary }]}>
              {t(s.labelKey)}
            </Text>
            {sort === s.key && <Ionicons name="checkmark" size={20} color={colors.primary} />}
          </Pressable>
        ))}
      </BottomSheet>
    </View>
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
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: {
    marginTop: 32,
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1,
    overflow: 'hidden',
  },
  backdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  chipRow: {
    height: CHIP_ROW_HEIGHT,
    flexGrow: 0,
  },
  chips: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: SIDE_PADDING,
  },
  clearChip: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  chipLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  chipLabelSelected: {
    color: '#fff',
  },
  pressed: {
    opacity: 0.6,
  },
  sortRow: {
    height: SORT_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SIDE_PADDING,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sortLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  gridCell: {
    flex: 1,
    alignItems: 'center',
  },
  cellStart: {
    alignItems: 'flex-start',
  },
  cellEnd: {
    alignItems: 'flex-end',
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  sheetLabel: {
    fontSize: 16,
  },
});
