import Ionicons from '@react-native-vector-icons/ionicons/static';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CachedImage } from './CachedImage';
import { useTheme } from '../hooks/useTheme';
import type { LibraryItem } from '../services/libraryItemsService';
import { moreOptionsStore } from '../store/moreOptionsStore';
import { mixHexColors } from '../utils/colors';

export const LIBRARY_ROW_COVER = 64;

function useSubtitle(entry: LibraryItem): string {
  const { t } = useTranslation();
  if (entry.kind === 'playlist') {
    return [t('libraryKindPlaylist'), entry.item.owner].filter(Boolean).join(' • ');
  }
  if (entry.kind === 'album') {
    return [t('libraryKindAlbum'), entry.item.artist].filter(Boolean).join(' • ');
  }
  return t('libraryKindArtist');
}

/** One playlist, album or artist in Your Library: Spotify's list row or grid tile. */
export const LibraryItemRow = memo(function LibraryItemRow({
  entry,
  grid,
  tileSize,
}: {
  entry: LibraryItem;
  grid?: boolean;
  tileSize?: number;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const subtitle = useSubtitle(entry);

  const handlePress = useCallback(() => {
    router.push(`/${entry.kind}/${entry.id}` as never);
  }, [router, entry.kind, entry.id]);

  const handleLongPress = useCallback(() => {
    if (entry.kind === 'playlist') moreOptionsStore.getState().show({ type: 'playlist', item: entry.item });
    else if (entry.kind === 'album') moreOptionsStore.getState().show({ type: 'album', item: entry.item });
    else moreOptionsStore.getState().show({ type: 'artist', item: entry.item });
  }, [entry]);

  const round = entry.kind === 'artist';
  const size = grid ? tileSize ?? 110 : LIBRARY_ROW_COVER;
  const cover = (
    <CachedImage
      coverArtId={entry.item.coverArt}
      size={300}
      style={[{ width: size, height: size }, round ? { borderRadius: size / 2 } : styles.square]}
      resizeMode="cover"
    />
  );

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      style={({ pressed }) => [grid ? [styles.tile, { width: size }] : styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={entry.item.name}
    >
      {cover}
      <View style={grid ? styles.tileText : styles.text}>
        <Text
          style={[styles.title, { color: colors.textPrimary }, grid && round && styles.centered]}
          numberOfLines={grid ? 2 : 1}
        >
          {entry.item.name}
        </Text>
        <Text
          style={[styles.subtitle, { color: colors.textSecondary }, grid && round && styles.centered]}
          numberOfLines={1}
        >
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
});

/** The pinned "Liked Songs" entry at the top of Your Library, in the TARSMusic blue. */
export const LikedSongsRow = memo(function LikedSongsRow({
  count,
  grid,
  tileSize,
}: {
  count: number;
  grid?: boolean;
  tileSize?: number;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const size = grid ? tileSize ?? 110 : LIBRARY_ROW_COVER;
  const dark = mixHexColors(colors.primary, '#000000', 0.6);

  return (
    <Pressable
      onPress={() => router.push('/liked-songs')}
      style={({ pressed }) => [grid ? [styles.tile, { width: size }] : styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={t('likedSongsTitle')}
    >
      <LinearGradient
        colors={[colors.primary, dark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.square, styles.likedCover, { width: size, height: size }]}
      >
        <Ionicons name="heart" size={size * 0.38} color="#fff" />
      </LinearGradient>
      <View style={grid ? styles.tileText : styles.text}>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
          {t('likedSongsTitle')}
        </Text>
        <View style={styles.pinnedLine}>
          <Ionicons name="pin" size={12} color={colors.primary} style={styles.pin} />
          <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
            {t('libraryLikedSubtitle', { count })}
          </Text>
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  tile: {
    marginBottom: 16,
  },
  pressed: {
    opacity: 0.6,
  },
  square: {
    borderRadius: 4,
  },
  likedCover: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    marginLeft: 12,
  },
  tileText: {
    marginTop: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  centered: {
    textAlign: 'center',
  },
  pinnedLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  pin: {
    marginRight: 4,
    transform: [{ rotate: '45deg' }],
  },
});
