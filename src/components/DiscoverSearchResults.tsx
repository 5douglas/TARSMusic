import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { DiscoverEntityRow, DiscoverTrackRow } from './DiscoverRows';
import { useDiscoverActions } from '../hooks/useDiscoverActions';
import { useTheme } from '../hooks/useTheme';
import {
  searchDiscover,
  type DiscoverAlbum,
  type DiscoverArtist,
  type DiscoverItem,
} from '../services/discoverService';
import { discoverPreviewStore } from '../store/discoverPreviewStore';

const SEARCH_DEBOUNCE_MS = 500;
const LIMITS = { track: 8, album: 8, artist: 5 } as const;

interface DeezerResults {
  tracks: DiscoverItem[];
  albums: DiscoverAlbum[];
  artists: DiscoverArtist[];
}

const notInLibrary = <T extends { in_library: boolean }>(items: unknown[] | undefined, limit: number): T[] =>
  ((items ?? []) as T[]).filter((i) => !i.in_library).slice(0, limit);

/**
 * Deezer matches for the Search tab's query that are not in the library yet, under the
 * library results: songs to preview or download, albums to download or open, artists to open.
 */
export function DiscoverSearchResults({ query }: { query: string }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { handlePreview, handleTrackDownload, handleAlbumDownload, handleOpen } = useDiscoverActions();
  const playingId = discoverPreviewStore((s) => s.playingId);
  const [results, setResults] = useState<DeezerResults | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setResults(null);
    if (!query) return;
    let alive = true;
    const timer = setTimeout(() => {
      setLoading(true);
      void Promise.all([
        searchDiscover(query, 'track'),
        searchDiscover(query, 'album'),
        searchDiscover(query, 'artist'),
      ]).then(([tracks, albums, artists]) => {
        if (!alive) return;
        setResults({
          tracks: notInLibrary<DiscoverItem>(tracks?.items, LIMITS.track),
          albums: notInLibrary<DiscoverAlbum>(albums?.items, LIMITS.album),
          artists: notInLibrary<DiscoverArtist>(artists?.items, LIMITS.artist),
        });
        setLoading(false);
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query]);

  if (loading && !results) {
    return <ActivityIndicator testID="deezer-loading" style={styles.spinner} color={colors.primary} />;
  }
  if (!results || results.tracks.length + results.albums.length + results.artists.length === 0) {
    return null;
  }

  const sub = (key: string) => (
    <Text style={[styles.subTitle, { color: colors.label }]}>{t(key)}</Text>
  );

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>{t('discoverNotInLibrary')}</Text>
      {results.tracks.length > 0 && sub('songs')}
      {results.tracks.map((item) => (
        <DiscoverTrackRow
          key={`t-${item.id}`}
          item={item}
          playing={item.id === playingId}
          onPreview={handlePreview}
          onDownload={handleTrackDownload}
        />
      ))}
      {results.albums.length > 0 && sub('albums')}
      {results.albums.map((item) => (
        <DiscoverEntityRow key={`a-${item.id}`} item={item} onOpen={handleOpen} onDownload={handleAlbumDownload} />
      ))}
      {results.artists.length > 0 && sub('artists')}
      {results.artists.map((item) => (
        <DiscoverEntityRow key={`r-${item.id}`} item={item} onOpen={handleOpen} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // Rows carry their own 16dp gutter; the search list already pads by 16.
    marginHorizontal: -16,
    marginTop: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    paddingHorizontal: 16,
  },
  subTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    marginTop: 16,
    marginBottom: 4,
  },
  spinner: {
    marginTop: 24,
  },
});
