import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

import { useTheme } from '../hooks/useTheme';

export interface MoreOptionsButtonProps {
  /** Called when the button is pressed */
  onPress: () => void;
  /** Dot color override (defaults to theme textPrimary) */
  color?: string;
  /** Dot diameter (defaults to 4) */
  dotSize?: number;
}

/**
 * A reusable "more options" button rendering three horizontal dots.
 * Uses plain Views instead of an icon font to guarantee perfect centering.
 */
export const MoreOptionsButton = memo(function MoreOptionsButton({
  onPress,
  color,
  dotSize = 4,
}: MoreOptionsButtonProps) {
  const { colors } = useTheme();
  const dotColor = color ?? colors.textPrimary;

  const dotStyle = {
    width: dotSize,
    height: dotSize,
    borderRadius: dotSize / 2,
    backgroundColor: dotColor,
  };

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.button,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.dots}>
        <View style={dotStyle} />
        <View style={dotStyle} />
        <View style={dotStyle} />
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 1,
  },
  pressed: {
    opacity: 0.6,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
