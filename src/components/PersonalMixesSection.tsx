import { useRouter } from 'expo-router';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { MixCover } from './MixCover';
import { useTheme } from '../hooks/useTheme';
import { useTopArtists } from '../hooks/useTopArtists';
import type { TopArtist } from '../services/personalMixService';

const CARD_SIZE = 150;
/** Artist mixes shown after the daily recommendations card. */
export const MAX_ARTIST_MIXES = 6;

type MixCard = { kind: 'daily' } | { kind: 'artist'; artist: TopArtist };

const MixCardTile = memo(function MixCardTile({ card }: { card: MixCard }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();

  const handlePress = useCallback(() => {
    if (card.kind === 'daily') {
      router.push({ pathname: '/mix', params: { kind: 'daily', title: t('dailyRecommendations') } });
    } else {
      router.push({
        pathname: '/mix',
        params: {
          kind: 'artist',
          id: card.artist.id,
          name: card.artist.name,
          title: t('artistMixTitle', { artist: card.artist.name }),
        },
      });
    }
  }, [card, router, t]);

  const title = card.kind === 'daily' ? t('dailyRecommendations') : t('artistMixTitle', { artist: card.artist.name });
  const subtitle = card.kind === 'daily' ? t('dailyRecommendationsSubtitle') : t('artistMixSubtitle', { artist: card.artist.name });

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <MixCover
        kind={card.kind}
        artistId={card.kind === 'artist' ? card.artist.id : undefined}
        artistName={card.kind === 'artist' ? card.artist.name : undefined}
        size={CARD_SIZE}
      />
      <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={2}>
        {subtitle}
      </Text>
    </Pressable>
  );
});

/**
 * "Made for you" carousel on Home: today's recommendations plus a mix for each of the
 * user's most-played artists. Hidden until there is at least one artist to build from.
 */
export function PersonalMixesSection() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const artists = useTopArtists(MAX_ARTIST_MIXES);

  const cards = useMemo<MixCard[]>(
    () => [{ kind: 'daily' }, ...artists.map((artist) => ({ kind: 'artist' as const, artist }))],
    [artists],
  );

  const renderCard = useCallback(({ item }: { item: MixCard }) => <MixCardTile card={item} />, []);

  if (artists.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('madeForYou')}</Text>
      <FlatList
        horizontal
        data={cards}
        keyExtractor={(card) => (card.kind === 'daily' ? 'daily' : `artist-${card.artist.id}`)}
        renderItem={renderCard}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.carousel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 12,
  },
  carousel: {
    gap: 12,
  },
  card: {
    width: CARD_SIZE,
  },
  pressed: {
    opacity: 0.6,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 6,
  },
});
