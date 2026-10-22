import Ionicons from '@react-native-vector-icons/ionicons/static';
import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CachedImage } from './CachedImage';
import { NowPlayingIndicator } from './NowPlayingIndicator';
import { useTheme } from '../hooks/useTheme';
import { playTrack } from '../services/playerService';
import { type Child } from '../services/subsonicService';
import { moreOptionsStore } from '../store/moreOptionsStore';
import { playerStore } from '../store/playerStore';

const COVER_SIZE = 48;

/**
 * Spotify-style "Popular" row on the artist page: rank, cover, title and play count, with a
 * trailing more-options button. Tapping plays the artist's top songs from this one.
 */
export const PopularTrackRow = memo(function PopularTrackRow({
  song,
  rank,
  playsLabel,
  songs,
}: {
  song: Child;
  rank: number;
  /** Already formatted play count line; hidden when null. */
  playsLabel: string | null;
  songs: Child[];
}) {
  const { colors } = useTheme();
  const isActive = playerStore((s) => s.currentTrack?.id === song.id);

  const handlePress = useCallback(() => {
    playTrack(song, songs);
  }, [song, songs]);

  const handleMore = useCallback(() => {
    moreOptionsStore.getState().show({ type: 'song', item: song });
  }, [song]);

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleMore}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={song.title}
    >
      <View style={styles.rank}>
        {isActive ? (
          <NowPlayingIndicator size={16} color={colors.primary} />
        ) : (
          <Text style={[styles.rankText, { color: colors.textSecondary }]}>{rank}</Text>
        )}
      </View>
      <CachedImage
        coverArtId={song.coverArt}
        albumId={song.albumId}
        size={150}
        style={styles.cover}
        resizeMode="cover"
      />
      <View style={styles.text}>
        <Text
          style={[styles.title, { color: isActive ? colors.primary : colors.textPrimary }]}
          numberOfLines={1}
        >
          {song.title}
        </Text>
        {playsLabel != null && (
          <Text style={[styles.plays, { color: colors.textSecondary }]} numberOfLines={1}>
            {playsLabel}
          </Text>
        )}
      </View>
      <Pressable onPress={handleMore} hitSlop={10} style={styles.more} accessibilityRole="button">
        <Ionicons name="ellipsis-vertical" size={18} color={colors.textSecondary} />
      </Pressable>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  pressed: {
    opacity: 0.6,
  },
  rank: {
    width: 28,
    alignItems: 'center',
  },
  rankText: {
    fontSize: 15,
    fontWeight: '600',
  },
  cover: {
    width: COVER_SIZE,
    height: COVER_SIZE,
    borderRadius: 4,
    marginLeft: 6,
  },
  text: {
    flex: 1,
    marginLeft: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
  plays: {
    fontSize: 13,
    marginTop: 2,
  },
  more: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
});
