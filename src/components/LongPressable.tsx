/**
 * LongPressable – gesture wrapper for card components.
 *
 * Provides a scale-down animation on long-press begin (tactile squeeze),
 * fires haptic feedback when the gesture activates, and passes through
 * regular taps to the existing onPress handler.
 *
 * Does NOT handle swipe – use SwipeableRow for row components instead.
 */

import * as Haptics from '@/utils/haptics';
import { memo, useCallback, useMemo } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface LongPressableProps {
  /** Called on a regular tap. */
  onPress?: () => void;
  /** Called when the long-press gesture activates. */
  onLongPress?: () => void;
  children: React.ReactNode;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PRESS_SPRING = { damping: 14, stiffness: 300, mass: 0.5 };

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export const LongPressable = memo(function LongPressable({
  onPress,
  onLongPress,
  children,
}: LongPressableProps) {
  const scale = useSharedValue(1);

  const fireHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }, []);

  const fireSelectionHaptic = useCallback(() => {
    Haptics.selectionAsync();
  }, []);

  const handleLongPress = useCallback(() => {
    onLongPress?.();
  }, [onLongPress]);

  const handlePress = useCallback(() => {
    onPress?.();
  }, [onPress]);

  /* ---- Long-press gesture ---- */
  const longPressGesture = useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(400)
        .onBegin(() => {
          scale.value = withSpring(0.96, PRESS_SPRING);
        })
        .onStart(() => {
          scale.value = withSpring(1, PRESS_SPRING);
          if (onLongPress) {
            runOnJS(fireHaptic)();
            runOnJS(handleLongPress)();
          }
        })
        .onFinalize(() => {
          scale.value = withSpring(1, PRESS_SPRING);
        }),
    [onLongPress, scale, fireHaptic, handleLongPress],
  );

  /* ---- Tap gesture ---- */
  const tapGesture = useMemo(
    () =>
      Gesture.Tap().onEnd(() => {
        if (onPress) {
          runOnJS(fireSelectionHaptic)();
          runOnJS(handlePress)();
        }
      }),
    [onPress, handlePress, fireSelectionHaptic],
  );

  /* ---- Compose: tap has priority over long press ---- */
  const composed = useMemo(
    () => Gesture.Exclusive(longPressGesture, tapGesture),
    [longPressGesture, tapGesture],
  );

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={animStyle}>{children}</Animated.View>
    </GestureDetector>
  );
});
