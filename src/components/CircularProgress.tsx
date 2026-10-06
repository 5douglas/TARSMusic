/**
 * Animated circular progress indicator built on react-native-svg + Reanimated.
 *
 * Uses strokeDashoffset animation for smooth, jank-free progress
 * transitions. When a new progress value arrives mid-animation,
 * withTiming redirects smoothly from the current interpolated
 * position to the new target.
 *
 * On completion (progress >= 1) the ring fills, pulses twice, then
 * fires the optional onComplete callback.
 */

import { memo, useEffect } from 'react';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface CircularProgressProps {
  progress: number;
  size: number;
  strokeWidth: number;
  color: string;
  trackColor: string;
  onComplete?: () => void;
}

const FILL_DURATION = 1200;
const PULSE_SCALE = 1.25;
const PULSE_DURATION = 250;

export const CircularProgress = memo(function CircularProgress({
  progress,
  size,
  strokeWidth,
  color,
  trackColor,
  onComplete,
}: CircularProgressProps) {
  const half = size / 2;
  const radius = half - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;

  const animatedProgress = useSharedValue(Math.max(0, Math.min(1, progress)));
  const scale = useSharedValue(1);

  useEffect(() => {
    const target = Math.max(0, Math.min(1, progress));

    if (target >= 1) {
      animatedProgress.value = withTiming(1, {
        duration: FILL_DURATION,
        easing: Easing.out(Easing.cubic),
      }, (finished) => {
        if (finished) {
          scale.value = withSequence(
            withTiming(PULSE_SCALE, { duration: PULSE_DURATION }),
            withTiming(1, { duration: PULSE_DURATION }),
            withDelay(100, withTiming(PULSE_SCALE, { duration: PULSE_DURATION })),
            withTiming(1, { duration: PULSE_DURATION }, (pulseDone) => {
              if (pulseDone && onComplete) {
                runOnJS(onComplete)();
              }
            }),
          );
        }
      });
    } else {
      animatedProgress.value = withTiming(target, {
        duration: FILL_DURATION,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [progress, animatedProgress, scale, onComplete]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - animatedProgress.value),
  }));

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[{ width: size, height: size }, containerStyle]}>
      <Svg width={size} height={size}>
        <Circle
          cx={half}
          cy={half}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={half}
          cy={half}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          strokeLinecap="round"
          rotation={-90}
          origin={`${half}, ${half}`}
        />
      </Svg>
    </Animated.View>
  );
});
