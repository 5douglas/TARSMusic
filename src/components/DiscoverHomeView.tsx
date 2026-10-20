import Ionicons from "@react-native-vector-icons/ionicons/static";
import { Image } from 'expo-image';
import { memo, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { EmptyState } from './EmptyState';
import { useDiscoverActions } from '../hooks/useDiscoverActions';
import { useTheme } from '../hooks/useTheme';
import { fetchDiscoverHome, type DiscoverCard, type DiscoverHome } from '../services/discoverService';

const SECTION_TITLE_KEYS = {
  releases: 'discoverNewReleases',
  mixes: 'discoverMixes',
  charts: 'discoverCharts',
} as const;

const CARD_SIZE = 140;

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

/** Discover home: carousels of release, mix and chart cards, each opening its own playlist. */
export function DiscoverHomeView({ topInset }: { topInset: number }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { handleOpen } = useDiscoverActions();
  const [home, setHome] = useState<DiscoverHome | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (refresh: boolean) => {
    const res = await fetchDiscoverHome(refresh);
    if (res || !refresh) setHome(res);
  }, []);

  useEffect(() => {
    let alive = true;
    void load(false).finally(() => {
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load(true);
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const renderCard = useCallback(
    ({ item }: { item: DiscoverCard }) => <HomeCard card={item} onOpen={handleOpen} />,
    [handleOpen],
  );

  let body;
  if (loading) {
    body = (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
        <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('discoverLoading')}</Text>
      </View>
    );
  } else if (!home) {
    body = (
      <EmptyState icon="cloud-offline-outline" title={t('discoverLoadFailed')} subtitle={t('discoverLoadFailedHint')}>
        <Pressable onPress={() => void handleRefresh()} accessibilityRole="button" style={styles.retry}>
          <Text style={[styles.link, { color: colors.primary }]}>{t('retry')}</Text>
        </Pressable>
      </EmptyState>
    );
  } else {
    body = home.sections
      .filter((section) => section.items.length > 0)
      .map((section) => (
        <View key={section.id} style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            {t(SECTION_TITLE_KEYS[section.id])}
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
      ));
  }

  return (
    <ScrollView
      contentContainerStyle={{ paddingTop: topInset, paddingBottom: 32 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          progressViewOffset={topInset}
          tintColor={colors.primary}
        />
      }
    >
      {body}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    gap: 12,
    marginTop: 48,
  },
  hint: {
    fontSize: 13,
  },
  retry: {
    marginTop: 12,
  },
  link: {
    fontSize: 15,
    fontWeight: '600',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  carousel: {
    paddingHorizontal: 16,
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
    borderRadius: 8,
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
