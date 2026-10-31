import Ionicons from "@react-native-vector-icons/ionicons/static";
// SDK 56 codemod gap: `expo-router/js-tabs` (the public entry) doesn't
// re-export BottomTabHeaderProps. Use the deeper path until upstream
// surfaces it at js-tabs.
import type { BottomTabHeaderProps } from "expo-router/build/react-navigation/bottom-tabs";
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dimensions,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CreatePlaylistSheet } from './CreatePlaylistSheet';
import { FilterBar } from './FilterBar';
import { DARK_MIX, GRADIENT_LOCATIONS, GRADIENT_MIX_CURVE, LIGHT_MIX } from './GradientBackground';
import { ProfileAvatar } from './ProfileAvatar';
import { useTheme } from '../hooks/useTheme';
import { mixHexColors } from '../utils/colors';
import { offlineModeStore } from '../store/offlineModeStore';
import { profileStore } from '../store/profileStore';
import { recentSearchStore } from '../store/recentSearchStore';
import { searchStore } from '../store/searchStore';

const SCREEN_HEIGHT = Dimensions.get('window').height;

const DEBOUNCE_MS = 500;

export function SearchableHeader({ route }: BottomTabHeaderProps) {
  const { t } = useTranslation();
  const { theme, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const offlineMode = offlineModeStore((s) => s.offlineMode);

  const query = searchStore((s) => s.query);
  const setQuery = searchStore((s) => s.setQuery);
  const performSearch = searchStore((s) => s.performSearch);
  const showOverlay = searchStore((s) => s.showOverlay);
  const clear = searchStore((s) => s.clear);
  // On the search tab, results are shown inline -- no overlay needed
  const isSearchTab = route.name === 'search';

  const handleChangeText = useCallback(
    (text: string) => {
      setQuery(text);

      if (debounceTimer.current) clearTimeout(debounceTimer.current);

      if (text.trim()) {
        if (!isSearchTab) showOverlay();
        debounceTimer.current = setTimeout(() => {
          performSearch();
        }, DEBOUNCE_MS);
      } else {
        // Emptied the box (backspaced to nothing) — wipe results too, so they
        // don't reappear the moment the next query starts.
        clear();
      }
    },
    [setQuery, performSearch, showOverlay, clear, isSearchTab]
  );

  const handleFocus = useCallback(() => {
    if (query.trim() && !isSearchTab) {
      showOverlay();
    }
  }, [query, showOverlay, isSearchTab]);

  const handleSubmitEditing = useCallback(() => {
    // Pressing the search/return key is an explicit "run this search now" — cancel
    // the pending debounce and fire, rather than letting the timer land later.
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    if (query.trim()) void performSearch();
    recentSearchStore.getState().record(query);
    Keyboard.dismiss();
  }, [query, performSearch]);

  const handleClear = useCallback(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    // `clear()` (not `setQuery('')`) so the previous results are wiped too —
    // otherwise stale hits linger and reappear the instant you retype.
    clear();
    inputRef.current?.blur();
    Keyboard.dismiss();
  }, [clear]);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  // Spotify-style top row: the profile picture (opens the profile menu), the tab's title,
  // and on Your Library the search and "+" (new playlist) actions.
  const titleKey = route.name === 'library' ? 'yourLibrary' : route.name === 'search' ? 'search' : null;
  const isLibrary = route.name === 'library';
  const [createVisible, setCreateVisible] = useState(false);
  const closeCreate = useCallback(() => setCreateVisible(false), []);
  const topRow = (
    <View style={styles.titleRow}>
      <Pressable
        onPress={() => profileStore.getState().openMenu()}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t('profileMenu')}
      >
        <ProfileAvatar size={32} />
      </Pressable>
      {titleKey && (
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
          {t(titleKey)}
        </Text>
      )}
      {isLibrary && (
        <>
          <Pressable
            onPress={() => router.navigate('/search')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('search')}
          >
            <Ionicons name="search" size={24} color={colors.textPrimary} />
          </Pressable>
          {!offlineMode && (
            <Pressable
              onPress={() => setCreateVisible(true)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('newPlaylist')}
            >
              <Ionicons name="add" size={28} color={colors.textPrimary} />
            </Pressable>
          )}
          <CreatePlaylistSheet visible={createVisible} onClose={closeCreate} />
        </>
      )}
    </View>
  );

  const headerContent = (
    <>
      {topRow}
      {isSearchTab && (
      <View style={styles.row}>
        <View
          style={[styles.inputContainer, { backgroundColor: colors.inputBg }]}
        >
          <Ionicons
            name="search"
            size={18}
            color={colors.textSecondary}
            style={styles.searchIcon}
          />
          <TextInput
            ref={inputRef}
            style={[styles.input, { color: colors.textPrimary }]}
            placeholder={offlineMode ? t('offlineSearchPlaceholder') : t('searchPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            value={query}
            onChangeText={handleChangeText}
            onFocus={handleFocus}
            onSubmitEditing={handleSubmitEditing}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <Pressable onPress={handleClear} hitSlop={8} style={styles.clearButton}>
              <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
            </Pressable>
          )}
        </View>
      </View>
      )}
      {/* Your Library has its own Spotify chips under the header, so no filter bar there. */}
      {!isLibrary && <FilterBar routeName={route.name} />}
    </>
  );

  // Match the GradientBackground gradient so the header blends seamlessly on Android
  const gradientColors = useMemo(() => {
    if (Platform.OS === 'ios') return undefined;
    const peak = theme === 'dark' ? DARK_MIX : LIGHT_MIX;
    return GRADIENT_MIX_CURVE.map((m) =>
      mixHexColors(colors.background, colors.primary, peak * m)
    ) as [string, string, ...string[]];
  }, [theme, colors.primary, colors.background]);

  const containerStyle = [styles.container, { paddingTop: insets.top }];

  if (Platform.OS === 'ios') {
    return (
      <BlurView
        tint={theme === 'dark' ? 'dark' : 'light'}
        intensity={80}
        style={containerStyle}
      >
        {headerContent}
      </BlurView>
    );
  }

  return (
    <View style={[...containerStyle, styles.androidContainer]}>
      <LinearGradient
        colors={gradientColors!}
        locations={GRADIENT_LOCATIONS}
        style={styles.androidGradient}
        pointerEvents="none"
      />
      {headerContent}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 8,
  },
  androidContainer: {
    overflow: 'hidden',
  },
  androidGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  title: {
    flex: 1,
    fontSize: 24,
    fontWeight: '800',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    height: 38,
    paddingHorizontal: 10,
  },
  searchIcon: {
    marginRight: 6,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
  },
  clearButton: {
    marginLeft: 6,
  },
});
