import Ionicons from "@react-native-vector-icons/ionicons/static";
import { Image } from 'expo-image';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { useDiscoverActions } from '../hooks/useDiscoverActions';
import { useTheme } from '../hooks/useTheme';

import type { DiscoverCard, DiscoverHome } from '../services/discoverService';

const SECTION_TITLE_KEYS = {
  releases: 'discoverNewReleases',
  mixes: 'discoverMixes',
  charts: 'discoverCharts',
} as const;

const CARD_SIZE = 150;

const HomeCard = memo(function HomeCard({
  card,
  onOpen,
}: {
  card: DiscoverCard;
  onOpen: (card: DiscoverCard) => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  let subtitle: string;
  if (card.type === 'album') {
    subtitle = [card.artist, card.record_type].filter(Boolean).join(' · ');
  } else if (card.type === 'mix') {
    subtitle = t('discoverMixSubtitle', { artist: card.artist ?? '' });
  } else {
    subtitle = t('songCount', { count: card.count ?? 0 });
  }

  return (
    <Pressable
      onPress={() => onOpen(card)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={card.title}
    >
      <View>
        <Image
          source={card.cover_small ?? card.cover ?? undefined}
          style={[styles.cardCover, card.type === 'mix' && styles.round]}
        />
        {card.type === 'album' && card.in_library && (
          <View style={[styles.libraryDot, { backgroundColor: colors.green }]}>
            <Ionicons name="checkmark" size={12} color="#fff" />
          </View>
        )}
      </View>
      <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={2}>
        {card.title}
      </Text>
      <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
        {subtitle}
      </Text>
    </Pressable>
  );
});

export type DiscoverSectionId = DiscoverHome['sections'][number]['id'];

/**
 * Discover carousels (release, mix and chart cards) for embedding in Home. Renders the
 * sections named in `ids`, in that order, skipping empty ones.
 */
export function DiscoverHomeSections({ home, ids }: { home: DiscoverHome; ids: readonly DiscoverSectionId[] }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { handleOpen } = useDiscoverActions();

  const renderCard = useCallback(
    ({ item }: { item: DiscoverCard }) => <HomeCard card={item} onOpen={handleOpen} />,
    [handleOpen],
  );

  return (
    <>
      {ids.map((id) => {
        const section = home.sections.find((s) => s.id === id);
        if (!section || section.items.length === 0) return null;
        return (
          <View key={id} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              {t(SECTION_TITLE_KEYS[id])}
            </Text>
            <FlatList
              horizontal
              data={section.items}
              keyExtractor={(card) => `${card.type}-${card.id}`}
              renderItem={renderCard}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.carousel}
            />
          </View>
        );
      })}
    </>
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
  cardCover: {
    width: CARD_SIZE,
    height: CARD_SIZE,
    borderRadius: 6,
  },
  round: {
    borderRadius: CARD_SIZE / 2,
  },
  libraryDot: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 6,
  },
  cardSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
});
