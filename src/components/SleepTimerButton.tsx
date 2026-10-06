import Ionicons from "@react-native-vector-icons/ionicons/static";
import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../hooks/useTheme';
import { sleepTimerStore } from '../store/sleepTimerStore';

export const SleepTimerButton = memo(function SleepTimerButton() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const endTime = sleepTimerStore((s) => s.endTime);
  const endOfTrack = sleepTimerStore((s) => s.endOfTrack);
  const showSheet = sleepTimerStore((s) => s.showSheet);

  const isActive = endTime != null || endOfTrack;

  const handlePress = useCallback(() => {
    showSheet();
  }, [showSheet]);

  const iconColor = isActive ? colors.primary : colors.textPrimary;

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={t('sleepTimer')}
      style={({ pressed }) => [
        styles.container,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name={isActive ? 'moon' : 'moon-outline'} size={20} color={iconColor} />
      {isActive && endOfTrack && (
        <View style={[styles.dot, { backgroundColor: colors.primary }]} />
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginLeft: 2,
  },
  pressed: {
    opacity: 0.6,
  },
});
