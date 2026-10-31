import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProfileAvatar } from './ProfileAvatar';
import { useTheme } from '../hooks/useTheme';
import { checkForUpdateInteractive } from '../services/appUpdateService';
import { authStore } from '../store/authStore';
import { profileStore } from '../store/profileStore';
import type { IoniconsName } from '../utils/iconNames';

const DURATION = 220;

type MenuEntry = { key: string; labelKey: string; icon: IoniconsName; action: () => void };

/**
 * Spotify's side menu, opened from the avatar on Home, Search and Your Library: the profile
 * at the top, then listening stats, recents, downloads, updates and settings.
 */
export function ProfileMenu() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const visible = profileStore((s) => s.menuVisible);
  const username = authStore((s) => s.username);
  const panelWidth = Math.min(width * 0.85, 360);
  const progress = useSharedValue(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.value = withTiming(1, { duration: DURATION });
    } else if (mounted) {
      progress.value = withTiming(0, { duration: DURATION }, (done) => {
        if (done) runOnJS(setMounted)(false);
      });
    }
  }, [visible, mounted, progress]);

  const close = useCallback(() => profileStore.getState().closeMenu(), []);

  const go = useCallback(
    (path: string) => {
      close();
      router.push(path as never);
    },
    [close, router],
  );

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (progress.value - 1) * panelWidth }],
  }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value * 0.6 }));

  const entries: MenuEntry[] = [
    { key: 'stats', labelKey: 'profileListeningStats', icon: 'stats-chart-outline', action: () => go('/my-listening') },
    { key: 'recents', labelKey: 'profileRecents', icon: 'time-outline', action: () => go('/scrobble-browser') },
    { key: 'downloads', labelKey: 'deemixDownloads', icon: 'cloud-download-outline', action: () => go('/discover-downloads') },
    ...(Platform.OS === 'android'
      ? [{
          key: 'updates',
          labelKey: 'appUpdateCheck',
          icon: 'sparkles-outline' as IoniconsName,
          action: () => {
            close();
            void checkForUpdateInteractive();
          },
        }]
      : []),
    { key: 'settings', labelKey: 'profileSettings', icon: 'settings-outline', action: () => go('/settings') },
  ];

  if (!mounted) return null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={close} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel={t('close')} />
      </Animated.View>
      <Animated.View
        style={[
          styles.panel,
          { width: panelWidth, backgroundColor: colors.card, paddingTop: insets.top + 16, paddingBottom: insets.bottom },
          panelStyle,
        ]}
      >
        <Pressable
          onPress={() => go('/profile')}
          style={({ pressed }) => [styles.header, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <ProfileAvatar size={48} />
          <View style={styles.headerText}>
            <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
              {username ?? ''}
            </Text>
            <Text style={[styles.viewProfile, { color: colors.textSecondary }]}>{t('profileView')}</Text>
          </View>
        </Pressable>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        {entries.map((entry) => (
          <Pressable
            key={entry.key}
            onPress={entry.action}
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Ionicons name={entry.icon} size={24} color={colors.textPrimary} />
            <Text style={[styles.itemLabel, { color: colors.textPrimary }]}>{t(entry.labelKey)}</Text>
          </Pressable>
        ))}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    backgroundColor: '#000',
  },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerText: {
    flex: 1,
    marginLeft: 12,
  },
  name: {
    fontSize: 20,
    fontWeight: '800',
  },
  viewProfile: {
    fontSize: 13,
    marginTop: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  itemLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  pressed: {
    opacity: 0.6,
  },
});
