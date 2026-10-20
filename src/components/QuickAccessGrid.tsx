import { useRouter } from 'expo-router';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CachedImage } from './CachedImage';
import { useTheme } from '../hooks/useTheme';

import type { AlbumID3 } from '../services/subsonicService';

const MAX_TILES = 6;

/** Spotify-style shortcuts: up to six recent albums in a two-column grid of compact tiles. */
export const QuickAccessGrid = memo(function QuickAccessGrid({ albums }: { albums: readonly AlbumID3[] }) {
  const { colors } = useTheme();
  const router = useRouter();
  const tiles = albums.slice(0, MAX_TILES);
  if (tiles.length === 0) return null;

  return (
    <View style={styles.grid}>
      {tiles.map((album) => (
        <Pressable
          key={album.id}
          onPress={() => router.push(`/album/${album.id}`)}
          style={({ pressed }) => [styles.tile, { backgroundColor: colors.card }, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={album.name}
        >
          <CachedImage coverArtId={album.coverArt} size={150} style={styles.cover} resizeMode="cover" />
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
            {album.name}
          </Text>
        </Pressable>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8,
    marginBottom: 24,
  },
  tile: {
    width: '48.8%',
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.6,
  },
  cover: {
    width: 56,
    height: 56,
  },
  title: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: 8,
  },
});
