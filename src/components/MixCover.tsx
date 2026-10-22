import Ionicons from '@react-native-vector-icons/ionicons/static';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { CachedImage } from './CachedImage';
import { useArtistCoverArt } from '../hooks/useTopArtists';
import { useTheme } from '../hooks/useTheme';
import { mixHexColors } from '../utils/colors';

/**
 * Square cover for a "Made for you" playlist, Spotify style but in the TARSMusic blue: the
 * daily recommendations get a blue gradient tile, an artist mix the artist's photo with a
 * blue band naming the mix.
 */
export function MixCover({
  kind,
  artistId,
  artistName,
  size,
}: {
  kind: 'daily' | 'artist';
  artistId?: string;
  artistName?: string;
  size: number;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const coverArt = useArtistCoverArt(kind === 'artist' ? artistId : undefined);
  const dark = mixHexColors(colors.primary, '#000000', 0.55);
  const box = { width: size, height: size };

  if (kind === 'daily') {
    return (
      <LinearGradient colors={[colors.primary, dark]} style={[styles.cover, box, styles.daily]}>
        <Ionicons name="sparkles" size={size * 0.18} color="#fff" />
        <Text style={[styles.dailyTitle, { fontSize: size * 0.12 }]} numberOfLines={3}>
          {t('dailyRecommendations')}
        </Text>
      </LinearGradient>
    );
  }

  return (
    <View style={[styles.cover, box]}>
      <CachedImage coverArtId={coverArt} size={300} style={box} resizeMode="cover" />
      <View style={[styles.band, { backgroundColor: colors.primary }]}>
        <Text style={[styles.bandText, { fontSize: Math.max(11, size * 0.085) }]} numberOfLines={1}>
          {t('artistMixTitle', { artist: artistName ?? '' })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    borderRadius: 6,
    overflow: 'hidden',
  },
  daily: {
    padding: 12,
    justifyContent: 'space-between',
  },
  dailyTitle: {
    color: '#fff',
    fontWeight: '900',
  },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  bandText: {
    color: '#fff',
    fontWeight: '800',
  },
});
