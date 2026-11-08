import Ionicons from '@react-native-vector-icons/ionicons/static';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { CachedImage } from './CachedImage';
import { useArtistCoverArt } from '../hooks/useTopArtists';
import { useTheme } from '../hooks/useTheme';
import { hexWithAlpha, mixHexColors } from '../utils/colors';

/** Accent colours for mix covers; each Daily Mix and artist mix gets its own. */
export const MIX_ACCENTS = ['#8B5CF6', '#F43F5E', '#10B981', '#F59E0B', '#06B6D4', '#EC4899'] as const;

/** Stable accent for a mix: by Daily Mix number, or by a hash of the artist id. */
export function mixAccent(kind: 'daily' | 'artist' | 'dailyMix', primary: string, mixNumber?: number, artistId?: string): string {
  if (kind === 'daily') return primary;
  if (kind === 'dailyMix') return MIX_ACCENTS[(Math.max(1, mixNumber ?? 1) - 1) % MIX_ACCENTS.length];
  let h = 0;
  for (const ch of artistId ?? '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return MIX_ACCENTS[h % MIX_ACCENTS.length];
}

/**
 * Square cover for a "Made for you" playlist. The daily recommendations get a glowing
 * gradient tile in the TARSMusic blue; an artist mix or a Daily Mix shows an artist's photo
 * with a duotone wash and a gradient footer in the mix's own accent colour.
 */
export function MixCover({
  kind,
  artistId,
  artistName,
  mixNumber,
  size,
}: {
  kind: 'daily' | 'artist' | 'dailyMix';
  artistId?: string;
  artistName?: string;
  /** For a Daily Mix: its number ("Daily Mix 2"). */
  mixNumber?: number;
  size: number;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const coverArt = useArtistCoverArt(kind === 'daily' ? undefined : artistId);
  const accent = mixAccent(kind, colors.primary, mixNumber, artistId);
  const deep = mixHexColors(accent, '#000000', 0.7);
  const box = { width: size, height: size, borderRadius: Math.round(size * 0.07) };
  const pad = Math.round(size * 0.08);

  if (kind === 'daily') {
    const glow = mixHexColors(colors.primary, '#8B5CF6', 0.55);
    return (
      <LinearGradient
        colors={[mixHexColors(colors.primary, '#ffffff', 0.15), glow, deep]}
        locations={[0, 0.55, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.cover, box, { padding: pad }, styles.daily]}
      >
        <View
          style={[
            styles.orb,
            { width: size * 0.9, height: size * 0.9, borderRadius: size, top: -size * 0.35, right: -size * 0.35 },
          ]}
        />
        <View
          style={[
            styles.orb,
            { width: size * 0.5, height: size * 0.5, borderRadius: size, bottom: -size * 0.12, right: size * 0.1 },
          ]}
        />
        <View style={[styles.chip, { width: size * 0.24, height: size * 0.24, borderRadius: size * 0.12 }]}>
          <Ionicons name="sparkles" size={size * 0.13} color="#fff" />
        </View>
        <Text style={[styles.title, { fontSize: size * 0.085, lineHeight: size * 0.105 }]} numberOfLines={3}>
          {t('dailyRecommendations')}
        </Text>
      </LinearGradient>
    );
  }

  const label =
    kind === 'dailyMix' ? t('dailyMixTitle', { number: mixNumber ?? 1 }) : t('artistMixTitle', { artist: artistName ?? '' });

  return (
    <View style={[styles.cover, box, { backgroundColor: deep }]}>
      <CachedImage coverArtId={coverArt} size={300} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <LinearGradient
        colors={[hexWithAlpha(accent, 0.45), hexWithAlpha(accent, 0)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0.7 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[hexWithAlpha(deep, 0), hexWithAlpha(deep, 0.92)]}
        locations={[0.4, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.accentBar, { backgroundColor: accent, height: Math.max(3, size * 0.025) }]} />
      <View style={[styles.footer, { padding: pad }]}>
        <View
          style={[
            styles.chip,
            { width: size * 0.18, height: size * 0.18, borderRadius: size * 0.09, marginBottom: size * 0.04 },
          ]}
        >
          <Ionicons name={kind === 'dailyMix' ? 'albums' : 'radio'} size={size * 0.1} color="#fff" />
        </View>
        <Text style={[styles.title, { fontSize: Math.max(12, size * 0.105) }]} numberOfLines={2}>
          {label}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    overflow: 'hidden',
  },
  daily: {
    justifyContent: 'space-between',
  },
  orb: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  chip: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  title: {
    color: '#fff',
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
});
