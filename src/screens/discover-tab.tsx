import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useIsFocused } from 'expo-router/react-navigation';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { DiscoverConnectHint } from '../components/DiscoverConnectHint';
import { DiscoverHomeSections } from '../components/DiscoverHomeSections';
import { DiscoverEntityRow, DiscoverTrackRow } from '../components/DiscoverRows';
import { EmptyState } from '../components/EmptyState';
import { useDiscoverActions } from '../hooks/useDiscoverActions';
import { useDiscoverHome } from '../hooks/useDiscoverHome';
import { useTheme } from '../hooks/useTheme';
import { stopDiscoverPreview } from '../services/discoverPreviewService';
import {
  searchDiscover,
  type DiscoverAlbum,
  type DiscoverArtist,
  type DiscoverItem,
  type DiscoverSearchType,
} from '../services/discoverService';
import { discoverPreviewStore } from '../store/discoverPreviewStore';
import { discoverSettingsStore } from '../store/discoverSettingsStore';
import { offlineModeStore } from '../store/offlineModeStore';
import { searchStore } from '../store/searchStore';

const SEARCH_DEBOUNCE_MS = 500;
/** How many of each kind the "All" view shows; a kind chip shows everything Deezer returns. */
const ALL_LIMITS = { artist: 5, album: 8, track: 8 } as const;

type Filter = 'all' | DiscoverSearchType;
const FILTERS: Array<{ key: Filter; labelKey: string }> = [
  { key: 'all', labelKey: 'discoverFilterAll' },
  { key: 'artist', labelKey: 'artists' },
  { key: 'album', labelKey: 'albums' },
  { key: 'track', labelKey: 'songs' },
];

interface Results {
  artists: DiscoverArtist[];
  albums: DiscoverAlbum[];
  tracks: DiscoverItem[];
}

/**
 * The Discover tab: search Deezer for artists, albums and songs and download them into the
 * library. An artist opens its discography, where single releases, EPs, albums or the whole
 * discography can be downloaded. With no query it shows new releases and charts.
 */
export function DiscoverTabScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const isFocused = useIsFocused();
  const headerHeight = searchStore((s) => s.headerHeights.discover ?? s.headerHeight);
  const configured = discoverSettingsStore((s) => !!s.baseUrl && !!s.token);
  const offlineMode = offlineModeStore((s) => s.offlineMode);
  const { handlePreview, handleTrackDownload, handleAlbumDownload, handleOpen } = useDiscoverActions();
  const playingId = discoverPreviewStore((s) => s.playingId);
  const { home } = useDiscoverHome(configured && !offlineMode);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const trimmed = query.trim();

  useEffect(() => {
    if (!isFocused) stopDiscoverPreview();
  }, [isFocused]);

  useEffect(() => {
    setResults(null);
    if (!trimmed || !configured) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    const timer = setTimeout(() => {
      const kinds: DiscoverSearchType[] = filter === 'all' ? ['artist', 'album', 'track'] : [filter];
      void Promise.all(kinds.map((k) => searchDiscover(trimmed, k))).then((answers) => {
        if (!alive) return;
        const next: Results = { artists: [], albums: [], tracks: [] };
        answers.forEach((answer, i) => {
          const items = answer?.items ?? [];
          const kind = kinds[i];
          const limit = filter === 'all' ? ALL_LIMITS[kind] : items.length;
          if (kind === 'artist') next.artists = (items as DiscoverArtist[]).slice(0, limit);
          else if (kind === 'album') next.albums = (items as DiscoverAlbum[]).slice(0, limit);
          else next.tracks = (items as DiscoverItem[]).slice(0, limit);
        });
        setResults(next);
        setLoading(false);
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [trimmed, filter, configured]);

  const empty = useMemo(
    () => !!results && results.artists.length + results.albums.length + results.tracks.length === 0,
    [results],
  );

  if (!configured) {
    return (
      <View style={[styles.container, { paddingTop: headerHeight }]}>
        <DiscoverConnectHint />
      </View>
    );
  }

  const section = (key: string) => (
    <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t(key)}</Text>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: headerHeight + 8, paddingBottom: 160 }}
      keyboardShouldPersistTaps="handled"
      onScrollBeginDrag={Keyboard.dismiss}
    >
      <View style={[styles.inputContainer, { backgroundColor: colors.inputBg }]}>
        <Ionicons name="search" size={18} color={colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={[styles.input, { color: colors.textPrimary }]}
          placeholder={t('discoverSearchPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={t('discoverSearchPlaceholder')}
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('clear')}>
            <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
          </Pressable>
        )}
      </View>

      {trimmed.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {FILTERS.map((f) => {
            const selected = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[styles.chip, { backgroundColor: selected ? colors.primary : colors.inputBg }]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.chipLabel, { color: selected ? '#fff' : colors.textPrimary }]}>
                  {t(f.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {trimmed.length === 0 ? (
        <>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('discoverTabHint')}</Text>
          {home && <DiscoverHomeSections home={home} ids={['mixes', 'releases', 'charts']} inset={16} />}
        </>
      ) : loading && !results ? (
        <ActivityIndicator testID="discover-loading" style={styles.spinner} color={colors.primary} />
      ) : empty ? (
        <EmptyState icon="search-outline" title={t('noResultsFound')} />
      ) : results ? (
        <>
          {results.artists.length > 0 && section('artists')}
          {results.artists.map((item) => (
            <DiscoverEntityRow key={`r-${item.id}`} item={item} onOpen={handleOpen} />
          ))}
          {results.albums.length > 0 && section('albums')}
          {results.albums.map((item) => (
            <DiscoverEntityRow key={`a-${item.id}`} item={item} onOpen={handleOpen} onDownload={handleAlbumDownload} />
          ))}
          {results.tracks.length > 0 && section('songs')}
          {results.tracks.map((item) => (
            <DiscoverTrackRow
              key={`t-${item.id}`}
              item={item}
              playing={item.id === playingId}
              onPreview={handlePreview}
              onDownload={handleTrackDownload}
            />
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
  },
  chips: {
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
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
  hint: {
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 6,
  },
  spinner: {
    marginTop: 32,
  },
});
