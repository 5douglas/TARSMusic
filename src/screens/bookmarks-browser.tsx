import Ionicons from "@react-native-vector-icons/ionicons/static";
import { HeaderHeightContext } from "expo-router/react-navigation";
import { FlashList } from '@shopify/flash-list';
import { useCallback, useContext, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { BookmarkRow } from '../components/BookmarkRow';
import { BottomChrome } from '../components/BottomChrome';
import { EmptyState } from '../components/EmptyState';
import { GradientBackground } from '../components/GradientBackground';
import { closeOpenRow } from '../components/SwipeableRow';
import { useTheme } from '../hooks/useTheme';
import { bookmarkCurrentTrack } from '../services/bookmarkService';
import { bookmarksStore, type PlayQueueBookmark } from '../store/bookmarksStore';
import { settingsStyles } from '../styles/settingsStyles';

export function BookmarksBrowserScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const headerHeight = useContext(HeaderHeightContext) ?? 0;

  const sortOrder = bookmarksStore((s) => s.sortOrder);
  const setSortOrder = bookmarksStore((s) => s.setSortOrder);
  const bookmarks = bookmarksStore((s) => s.bookmarks);

  const [search, setSearch] = useState('');

  const toggleSort = useCallback(
    () => setSortOrder(sortOrder === 'newest' ? 'oldest' : 'newest'),
    [sortOrder, setSortOrder],
  );

  // Sort only depends on the set + order, so it survives keystrokes; the search
  // filter then runs over the already-sorted list.
  const sorted = useMemo(
    () =>
      Object.values(bookmarks).sort((a, b) =>
        sortOrder === 'newest' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt,
      ),
    [bookmarks, sortOrder],
  );

  const data = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sorted;
    return sorted.filter((b) => {
      const cur = bookmarkCurrentTrack(b);
      return (
        b.name.toLowerCase().includes(query) ||
        (cur?.title?.toLowerCase().includes(query) ?? false) ||
        (cur?.artist?.toLowerCase().includes(query) ?? false)
      );
    });
  }, [sorted, search]);

  const keyExtractor = useCallback((b: PlayQueueBookmark) => b.id, []);

  const renderItem = useCallback(
    ({ item }: { item: PlayQueueBookmark }) => <BookmarkRow bookmark={item} />,
    [],
  );

  const hasBookmarks = Object.keys(bookmarks).length > 0;

  const renderEmpty = useCallback(
    () =>
      hasBookmarks ? (
        <EmptyState icon="search-outline" title={t('noBookmarkMatches')} />
      ) : (
        <EmptyState
          icon="bookmark-outline"
          title={t('noBookmarks')}
          subtitle={t('noBookmarksSubtitle')}
        />
      ),
    [hasBookmarks, t],
  );

  return (
    <GradientBackground style={styles.container} scrollable>
      <View style={[styles.header, { paddingTop: headerHeight + 16 }]}>
        <View style={[settingsStyles.filterPill, { backgroundColor: colors.inputBg }]}>
          <Ionicons
            name="search"
            size={18}
            color={colors.textSecondary}
            style={settingsStyles.filterIcon}
          />
          <TextInput
            style={[settingsStyles.filterInput, { color: colors.textPrimary }]}
            placeholder={t('searchBookmarks')}
            placeholderTextColor={colors.textSecondary}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>
        <View style={styles.sortRow}>
          <Pressable
            onPress={toggleSort}
            style={({ pressed }) => [styles.sortButton, pressed && styles.pressed]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={sortOrder === 'newest' ? t('newest') : t('oldest')}
          >
            <Ionicons
              name={sortOrder === 'newest' ? 'arrow-down' : 'arrow-up'}
              size={14}
              color={colors.primary}
            />
            <Text style={[styles.sortLabel, { color: colors.textPrimary }]}>
              {sortOrder === 'newest' ? t('newest') : t('oldest')}
            </Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.list}>
        <FlashList
          data={data}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ListEmptyComponent={renderEmpty}
          onScrollBeginDrag={closeOpenRow}
        />
      </View>
      <BottomChrome withSafeAreaPadding />
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
  },
  sortRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 4,
    gap: 4,
  },
  sortLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.6,
  },
  list: {
    flex: 1,
  },
});
