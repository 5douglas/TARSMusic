import { useRouter } from 'expo-router';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { MixCover } from './MixCover';
import { useDailyMixes } from '../hooks/useDailyMixes';
import { useTheme } from '../hooks/useTheme';
import { useTopArtists } from '../hooks/useTopArtists';
import type { TopArtist } from '../services/personalMixService';
import type { DailyMixDefinition } from '../store/personalMixStore';

const CARD_SIZE = 150;
/** Artist mixes shown after the daily recommendations card. */
export const MAX_ARTIST_MIXES = 6;

type MixCard =
  | { kind: 'dailyMix'; mix: DailyMixDefinition }
  | { kind: 'daily' }
  | { kind: 'artist'; artist: TopArtist };

/** "A, B, C": a Daily Mix's first three artists. */
export function dailyMixArtistLine(mix: DailyMixDefinition): string {
  return mix.artists.slice(0, 3).map((a) => a.name).join(', ');
}

function cardKey(card: MixCard): string {
  if (card.kind === 'dailyMix') return `dailymix-${card.mix.id}`;
  if (card.kind === 'daily') return 'daily';
  return `artist-${card.artist.id}`;
}

const MixCardTile = memo(function MixCardTile({ card }: { card: MixCard }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();

  const handlePress = useCallback(() => {
    if (card.kind === 'dailyMix') {
      router.push({
        pathname: '/mix',
        params: { kind: 'dailymix', id: card.mix.id, title: t('dailyMixTitle', { number: card.mix.number }) },
      });
    } else if (card.kind === 'daily') {
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

  let title: string;
  let subtitle: string;
  if (card.kind === 'dailyMix') {
    title = t('dailyMixTitle', { number: card.mix.number });
    subtitle = dailyMixArtistLine(card.mix);
  } else if (card.kind === 'daily') {
    title = t('dailyRecommendations');
    subtitle = t('dailyRecommendationsSubtitle');
  } else {
    title = t('artistMixTitle', { artist: card.artist.name });
    subtitle = t('artistMixSubtitle', { artist: card.artist.name });
  }

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <MixCover
        kind={card.kind}
        artistId={
          card.kind === 'artist' ? card.artist.id : card.kind === 'dailyMix' ? card.mix.artists[0]?.id : undefined
        }
        artistName={card.kind === 'artist' ? card.artist.name : undefined}
        mixNumber={card.kind === 'dailyMix' ? card.mix.number : undefined}
        size={CARD_SIZE}
      />
      <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={2}>
        {subtitle}
      </Text>
    </Pressable>
  );
});

/**
 * "Made for you" carousel on Home: the Daily Mixes (genre groups of the artists the user
 * plays), today's recommendations, and a mix for each of the user's most-played artists.
 * Hidden until there is at least one artist to build from.
 */
export function PersonalMixesSection() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const artists = useTopArtists(MAX_ARTIST_MIXES);
  const dailyMixes = useDailyMixes();

  const cards = useMemo<MixCard[]>(
    () => [
      ...dailyMixes.map((mix) => ({ kind: 'dailyMix' as const, mix })),
      { kind: 'daily' as const },
      ...artists.map((artist) => ({ kind: 'artist' as const, artist })),
    ],
    [artists, dailyMixes],
  );

  const renderCard = useCallback(({ item }: { item: MixCard }) => <MixCardTile card={item} />, []);

  if (artists.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('madeForYou')}</Text>
      <FlatList
        horizontal
        data={cards}
        keyExtractor={cardKey}
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
