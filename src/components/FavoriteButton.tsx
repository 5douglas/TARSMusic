import Ionicons from "@react-native-vector-icons/ionicons/static";
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { useIsStarred } from '../hooks/useIsStarred';
import { useTheme } from '../hooks/useTheme';
import { toggleStar } from '../services/moreOptionsService';
import { offlineModeStore } from '../store/offlineModeStore';

export interface FavoriteButtonProps {
  trackId: string;
  size?: number;
  /** `heart` (default) or Spotify's `add`: a (+) that turns into a filled check once saved. */
  variant?: 'heart' | 'add';
  /** Container padding/spacing — varies per player surface. */
  style?: StyleProp<ViewStyle>;
}

/** Heart toggle for a song. Disabled offline. Shared across all player surfaces. */
export const FavoriteButton = memo(function FavoriteButton({
  trackId,
  size = 24,
  variant = 'heart',
  style,
}: FavoriteButtonProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const starred = useIsStarred('song', trackId);
  const offlineMode = offlineModeStore((s) => s.offlineMode);

  const handleToggle = useCallback(() => {
    toggleStar('song', trackId);
  }, [trackId]);

  return (
    <Pressable
      onPress={handleToggle}
      disabled={offlineMode}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={starred ? t('removeFromFavorites') : t('addToFavorites')}
      style={({ pressed }) => [
        style,
        pressed && !offlineMode && styles.pressed,
        offlineMode && styles.disabled,
      ]}
    >
      {variant === 'add' ? (
        <Ionicons
          name={starred ? 'checkmark-circle' : 'add-circle-outline'}
          size={size}
          color={starred ? colors.primary : colors.textPrimary}
        />
      ) : (
        <Ionicons
          name={starred ? 'heart' : 'heart-outline'}
          size={size}
          color={starred ? colors.red : colors.textSecondary}
        />
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.6,
  },
  disabled: {
    opacity: 0.4,
  },
});
