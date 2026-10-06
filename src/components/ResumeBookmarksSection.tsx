import Ionicons from "@react-native-vector-icons/ionicons/static";
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { BookmarkCard } from './BookmarkCard';
import { useTheme } from '../hooks/useTheme';
import { bookmarksStore, type PlayQueueBookmark } from '../store/bookmarksStore';

const CARD_WIDTH = 240;
const CARD_GAP = 12;
const HORIZONTAL_DRAW_DISTANCE = 300;

export function ResumeBookmarksSection() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const bookmarks = bookmarksStore((s) => s.bookmarks);

  const recent = useMemo(
    () =>
      Object.values(bookmarks)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 3),
    [bookmarks],
  );

  const renderItem = useCallback(
    ({ item }: { item: PlayQueueBookmark }) => (
      <BookmarkCard bookmark={item} width={CARD_WIDTH} />
    ),
    [],
  );
  const keyExtractor = useCallback((item: PlayQueueBookmark) => item.id, []);
  const onSeeMore = useCallback(() => {
    router.push('/bookmarks');
  }, [router]);

  if (recent.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Pressable
          onPress={onSeeMore}
          style={({ pressed }) => [
            { flex: 1 },
            pressed && styles.iconButtonPressed,
          ]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('bookmarks')}
        >
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            {t('resumeListening')}
          </Text>
        </Pressable>
        <View style={styles.sectionHeaderActions}>
          <Pressable
            onPress={onSeeMore}
            style={({ pressed }) => [
              styles.iconButton,
              pressed && styles.iconButtonPressed,
            ]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('bookmarks')}
          >
            <Ionicons
              name="chevron-forward"
              size={24}
              color={colors.textSecondary}
            />
          </Pressable>
        </View>
      </View>
      <FlashList
        data={recent}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.horizontalList}
        ItemSeparatorComponent={() => <View style={{ width: CARD_GAP }} />}
        drawDistance={HORIZONTAL_DRAW_DISTANCE}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '700',
  },
  sectionHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconButton: {
    padding: 4,
  },
  iconButtonPressed: {
    opacity: 0.6,
  },
  horizontalList: {
    paddingRight: 16,
  },
});
