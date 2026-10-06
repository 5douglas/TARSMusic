import Ionicons from "@react-native-vector-icons/ionicons/static";
import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { sleepTimerStore } from '../store/sleepTimerStore';

/** Format seconds into MM:SS or H:MM:SS. */
function formatCountdown(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export const SleepTimerCapsule = memo(function SleepTimerCapsule() {
  const { t } = useTranslation();
  const endTime = sleepTimerStore((s) => s.endTime);
  const endOfTrack = sleepTimerStore((s) => s.endOfTrack);
  const remaining = sleepTimerStore((s) => s.remaining);
  const showSheet = sleepTimerStore((s) => s.showSheet);

  const handlePress = useCallback(() => {
    showSheet();
  }, [showSheet]);

  if (endTime == null && !endOfTrack) {
    return null;
  }

  let label: string | null;
  if (endOfTrack && endTime == null) {
    label = t('sleepTimerEndOfTrack');
  } else if (remaining != null) {
    label = formatCountdown(remaining);
  } else {
    // endTime set but JS interval has not ticked yet — brief; render nothing.
    label = null;
  }

  if (label == null) {
    return null;
  }

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={t('sleepTimer')}
      style={({ pressed }) => [styles.capsule, pressed && styles.pressed]}
    >
      <Ionicons name="moon" size={14} color="#fff" />
      <Text style={styles.label} allowFontScaling={false}>
        {label}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    fontVariant: ['tabular-nums'],
  },
  pressed: {
    opacity: 0.6,
  },
});
