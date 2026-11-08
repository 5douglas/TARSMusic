import Ionicons from '@react-native-vector-icons/ionicons/static';
import { type Href, useRouter } from 'expo-router';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../hooks/useTheme';

const TABS: Array<{ href: Href; icon: 'home' | 'search' | 'compass' | 'library'; label: string }> = [
  { href: '/(tabs)', icon: 'home', label: 'home' },
  { href: '/(tabs)/search', icon: 'search', label: 'search' },
  { href: '/(tabs)/discover', icon: 'compass', label: 'discover' },
  { href: '/(tabs)/library', icon: 'library', label: 'yourLibrary' },
];

/**
 * The app's bottom tabs on a screen opened over them (a playlist, a mix, an album...), so
 * the player and the tabs stay at the bottom as on the tab screens. None is highlighted:
 * the screen belongs to no tab; a press goes back to that tab.
 */
export const StackTabBar = memo(function StackTabBar() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <View style={[styles.bar, { backgroundColor: colors.background }]} accessibilityRole="tablist">
      {TABS.map((tab) => (
        <Pressable
          key={tab.label}
          onPress={() => router.dismissTo(tab.href)}
          style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
          accessibilityRole="tab"
          accessibilityLabel={t(tab.label)}
        >
          <Ionicons name={tab.icon} size={24} color={colors.textSecondary} />
          <Text style={[styles.label, { color: colors.textSecondary }]} numberOfLines={1}>
            {t(tab.label)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    paddingTop: 6,
    paddingBottom: 4,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minHeight: 48,
  },
  label: {
    fontSize: 10,
    fontWeight: '500',
  },
  pressed: {
    opacity: 0.6,
  },
});
