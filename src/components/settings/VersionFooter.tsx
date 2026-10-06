import Constants from 'expo-constants';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../hooks/useTheme';
import { devOptionsStore } from '../../store/devOptionsStore';
import { processingOverlayStore } from '../../store/processingOverlayStore';
import { notificationAsync, selectionAsync } from '../../utils/haptics';

const APP_VERSION = Constants.expoConfig?.version ?? '?';
const BUILD_NUMBER =
  Platform.OS === 'ios'
    ? Constants.expoConfig?.ios?.buildNumber
    : String((Constants.expoConfig?.android?.versionCode ?? 0) % 1000);

const TAP_WINDOW_MS = 3000;
const TAP_COUNT_TO_ACTIVATE = 5;

/**
 * Tappable version label at the bottom of the settings index. Tapping
 * 5 times within {@link TAP_WINDOW_MS}ms activates developer options
 * (which unlocks the File Explorer + Logging entries in the settings
 * list). After the 2nd tap, a countdown replaces the version text so
 * the user gets feedback. No-op when developer options are already on.
 */
export function VersionFooter() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const devEnabled = devOptionsStore((s) => s.enabled);

  const tapTimestamps = useRef<number[]>([]);
  const countdownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [countdownText, setCountdownText] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (countdownTimer.current) clearTimeout(countdownTimer.current);
    };
  }, []);

  const handleTap = useCallback(() => {
    if (devEnabled) return;

    const now = Date.now();
    tapTimestamps.current.push(now);
    tapTimestamps.current = tapTimestamps.current.filter((ts) => now - ts < TAP_WINDOW_MS);

    const count = tapTimestamps.current.length;
    const remaining = TAP_COUNT_TO_ACTIVATE - count;

    if (countdownTimer.current) clearTimeout(countdownTimer.current);

    if (remaining <= 0) {
      tapTimestamps.current = [];
      setCountdownText(null);
      devOptionsStore.getState().enable();
      notificationAsync();
      processingOverlayStore.getState().showSuccess(t('developerOptionsActivated'));
    } else if (count >= 2) {
      selectionAsync();
      setCountdownText(t('devOptionsTapCountdown', { count: remaining }));
      countdownTimer.current = setTimeout(() => setCountdownText(null), TAP_WINDOW_MS);
    }
  }, [devEnabled, t]);

  return (
    <Pressable onPress={handleTap}>
      <Text style={[styles.text, { color: colors.textSecondary }]}>
        {countdownText ?? t('versionText', { version: APP_VERSION, build: BUILD_NUMBER })}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 20,
  },
});
