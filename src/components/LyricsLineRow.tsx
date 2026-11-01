import { memo, useCallback } from 'react';
import { absoluteFill } from '../utils/styles';
import {
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  Easing,
  useDerivedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

interface LyricsLineRowProps {
  index: number;
  text: string;
  /** Translation shown under the line, a little smaller and dimmer. */
  translation?: string | null;
  activeIndex: SharedValue<number>;
  textColor: string;
  disabled?: boolean;
  onPress?: (index: number) => void;
  onLayout?: (index: number, y: number, h: number) => void;
}

/**
 * Opacity ramp: 1.0 / 0.65 / 0.45 / 0.30 / 0.20 by |distance| 0,1,2,3,≥4.
 * Scale ramp:   1.0 / 0.97 when active vs. not.
 * Weight crossfade via two stacked Animated.Text layers (600 + 800).
 */
// A soft ease-out, like Spotify: the line glows in over ~450 ms instead of snapping. The
// line is lit LINE_LEAD_MS early, so the fade still lands as it is sung.
const FADE = { duration: 450, easing: Easing.out(Easing.cubic) } as const;

export const LyricsLineRow = memo(function LyricsLineRow({
  index,
  text,
  translation,
  activeIndex,
  textColor,
  disabled,
  onPress,
  onLayout,
}: LyricsLineRowProps) {
  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { y, height } = e.nativeEvent.layout;
      onLayout?.(index, y, height);
    },
    [index, onLayout],
  );

  const handlePress = useCallback(() => {
    if (!disabled) onPress?.(index);
  }, [disabled, onPress, index]);

  // Opacity driven by distance from active line.
  const opacity = useDerivedValue(() => {
    const d = Math.abs(index - activeIndex.value);
    const target = d === 0 ? 1 : d === 1 ? 0.65 : d === 2 ? 0.45 : d === 3 ? 0.30 : 0.20;
    return withTiming(target, FADE);
  }, [index]);

  // Scale: 1.0 active, 0.96 otherwise.
  const scale = useDerivedValue(() => {
    const d = Math.abs(index - activeIndex.value);
    return withTiming(d === 0 ? 1 : 0.97, FADE);
  }, [index]);

  // Weight crossfade opacity for the "active" (800) layer.
  const activeLayerOpacity = useDerivedValue(() => {
    const isActive = Math.abs(index - activeIndex.value) === 0 ? 1 : 0;
    return withTiming(isActive, FADE);
  }, [index]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const activeLayerStyle = useAnimatedStyle(() => ({
    opacity: activeLayerOpacity.value,
  }));

  const inactiveLayerStyle = useAnimatedStyle(() => ({
    opacity: 1 - activeLayerOpacity.value,
  }));

  return (
    <Pressable
      onPress={handlePress}
      onLayout={handleLayout}
      disabled={disabled}
      style={styles.pressable}
    >
      <Animated.View style={[styles.row, containerStyle]}>
        <View style={styles.textStack}>
          <Animated.Text
            style={[
              styles.text,
              styles.textInactive,
              { color: textColor },
              inactiveLayerStyle,
            ]}
          >
            {text}
          </Animated.Text>
          <Animated.Text
            style={[
              styles.text,
              styles.textActive,
              styles.textOverlay,
              { color: textColor },
              activeLayerStyle,
            ]}
          >
            {text}
          </Animated.Text>
        </View>
        {!!translation && translation !== text && (
          <Animated.Text style={[styles.translation, { color: textColor }]}>
            {translation}
          </Animated.Text>
        )}
      </Animated.View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  pressable: {
    // Pressable wraps the row and must itself stretch so the row's
    // own alignSelf:stretch has a full-width parent to stretch into.
    alignSelf: 'stretch',
  },
  row: {
    // Stretch to fill the ScrollView's content width so the Text layers
    // below wrap at the viewport edge instead of overflowing. Without this
    // the row sizes to its intrinsic content width and long lines render
    // as a single off-screen string.
    alignSelf: 'stretch',
    marginVertical: 14,
    paddingHorizontal: 16,
    transformOrigin: '0% 50%',
  },
  textStack: {
    // Mirrors the row's stretch so the overlay (absoluteFillObject) layer
    // matches the inactive layer's wrapped height across all screen widths.
    alignSelf: 'stretch',
    position: 'relative',
  },
  text: {
    fontSize: 24,
    lineHeight: 32,
    textAlign: 'left',
  },
  textInactive: {
    fontWeight: '600',
  },
  textActive: {
    fontWeight: '800',
  },
  textOverlay: {
    ...absoluteFill,
  },
  translation: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '600',
    marginTop: 4,
    opacity: 0.7,
  },
});
