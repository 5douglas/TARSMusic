import Ionicons from "@react-native-vector-icons/ionicons/static";
import { memo, useCallback, useEffect, useRef } from 'react';
import { type LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

const SPRING_CONFIG = { damping: 14, stiffness: 200, mass: 0.8 };

const DEFAULT_MAX = 5;

/* ------------------------------------------------------------------ */
/*  StarRatingDisplay – compact, read-only                             */
/* ------------------------------------------------------------------ */

interface StarRatingDisplayProps {
  rating: number;
  maxStars?: number;
  size?: number;
  color: string;
  emptyColor: string;
}

export const StarRatingDisplay = memo(function StarRatingDisplay({
  rating,
  maxStars = DEFAULT_MAX,
  size = 14,
  color,
  emptyColor,
}: StarRatingDisplayProps) {
  const stars: React.ReactNode[] = [];
  for (let i = 1; i <= maxStars; i++) {
    const name =
      rating >= i
        ? 'star'
        : rating >= i - 0.5
          ? 'star-half'
          : 'star-outline';
    const iconColor = rating >= i - 0.5 ? color : emptyColor;
    stars.push(
      <Ionicons key={i} name={name} size={size} color={iconColor} style={styles.displayStar} />,
    );
  }
  return <View style={styles.displayRow}>{stars}</View>;
});

/* ------------------------------------------------------------------ */
/*  CompactRatingBadge – single star + integer for narrow contexts     */
/* ------------------------------------------------------------------ */

interface CompactRatingBadgeProps {
  rating: number;
  /** Font size for both the icon and the digit. Defaults to 12. */
  size?: number;
  /** Star icon colour. Defaults to the caller-provided primary. */
  iconColor: string;
  /** Digit colour. Defaults to `iconColor` if omitted. */
  textColor?: string;
}

/**
 * Compact `★ N` rating glyph for list rows and grid card overlays.
 * Matches the IMDB / Goodreads / Plexamp / foobar2000 convention. Detail
 * surfaces (`SetRatingSheet`, `MoreOptionsSheet`, etc.) keep the full
 * 5-star strip via `StarRatingDisplay`.
 */
export const CompactRatingBadge = memo(function CompactRatingBadge({
  rating,
  size = 12,
  iconColor,
  textColor,
}: CompactRatingBadgeProps) {
  return (
    <View style={styles.badgeRow}>
      <Ionicons name="star" size={size} color={iconColor} />
      <Text
        style={[
          styles.badgeText,
          { fontSize: size, color: textColor ?? iconColor },
        ]}
      >
        {rating}
      </Text>
    </View>
  );
});

/* ------------------------------------------------------------------ */
/*  StarRatingInput – interactive, gesture-driven                      */
/* ------------------------------------------------------------------ */

interface StarRatingInputProps {
  rating: number;
  onRatingChange: (rating: number) => void;
  maxStars?: number;
  size?: number;
  color: string;
  emptyColor: string;
  /** Snap granularity: 1 for whole stars, 0.5 for half stars. */
  step?: 0.5 | 1;
}

export const StarRatingInput = memo(function StarRatingInput({
  rating,
  onRatingChange,
  maxStars = DEFAULT_MAX,
  size = 40,
  color,
  emptyColor,
  step = 1,
}: StarRatingInputProps) {
  const starWidth = size + STAR_GAP;
  const totalWidth = maxStars * starWidth - STAR_GAP;

  const fillFraction = useSharedValue(rating / maxStars);
  const widthSV = useSharedValue(totalWidth);

  const onRatingChangeRef = useRef(onRatingChange);
  onRatingChangeRef.current = onRatingChange;

  const snapAndCommit = useCallback((frac: number) => {
    const raw = frac * maxStars;
    const snapped = Math.max(0, Math.min(maxStars, Math.ceil(raw / step) * step));
    onRatingChangeRef.current(snapped);
  }, [maxStars, step]);

  const snapFractionWorklet = (frac: number) => {
    'worklet';
    const raw = frac * maxStars;
    const snapped = Math.ceil(raw / step) * step;
    const clamped = Math.max(0, Math.min(maxStars, snapped));
    return clamped / maxStars;
  };

  const tapGesture = Gesture.Tap()
    .onEnd((e) => {
      'worklet';
      const frac = Math.max(0, Math.min(1, e.x / widthSV.value));
      fillFraction.value = withSpring(snapFractionWorklet(frac), SPRING_CONFIG);
      runOnJS(snapAndCommit)(frac);
    });

  const panGesture = Gesture.Pan()
    .activeOffsetX([-2, 2])
    .onUpdate((e) => {
      'worklet';
      const frac = Math.max(0, Math.min(1, e.x / widthSV.value));
      fillFraction.value = snapFractionWorklet(frac);
    })
    .onEnd((e) => {
      'worklet';
      const frac = Math.max(0, Math.min(1, e.x / widthSV.value));
      fillFraction.value = withSpring(snapFractionWorklet(frac), SPRING_CONFIG);
      runOnJS(snapAndCommit)(frac);
    })
    .onFinalize((_, success) => {
      'worklet';
      if (!success) {
        fillFraction.value = withSpring(snapFractionWorklet(fillFraction.value), SPRING_CONFIG);
      }
    });

  const gesture = Gesture.Race(panGesture, tapGesture);

  const fillStyle = useAnimatedStyle(() => ({
    width: interpolate(fillFraction.value, [0, 1], [0, widthSV.value], Extrapolation.CLAMP),
  }));

  useEffect(() => {
    fillFraction.value = withSpring(rating / maxStars, SPRING_CONFIG);
  }, [rating, maxStars, fillFraction]);

  const handleContainerLayout = useCallback(
    (e: LayoutChangeEvent) => {
      widthSV.value = e.nativeEvent.layout.width;
    },
    [widthSV],
  );

  const outlineStars: React.ReactNode[] = [];
  const filledStars: React.ReactNode[] = [];
  for (let i = 0; i < maxStars; i++) {
    const marginRight = i < maxStars - 1 ? STAR_GAP : 0;
    outlineStars.push(
      <Ionicons
        key={i}
        name="star-outline"
        size={size}
        color={emptyColor}
        style={{ marginRight }}
      />,
    );
    filledStars.push(
      <Ionicons
        key={i}
        name="star"
        size={size}
        color={color}
        style={{ marginRight }}
      />,
    );
  }

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={styles.inputContainer}
        onLayout={handleContainerLayout}
      >
        {/* Background: outline stars */}
        <View style={styles.starLayer} pointerEvents="none">
          {outlineStars}
        </View>
        {/* Foreground: filled stars clipped by animated width */}
        <Animated.View
          style={[styles.starLayer, styles.fillLayer, fillStyle]}
          pointerEvents="none"
        >
          {filledStars}
        </Animated.View>
      </View>
    </GestureDetector>
  );
});

const STAR_GAP = 4;

const styles = StyleSheet.create({
  displayRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  displayStar: {
    marginRight: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgeText: {
    marginLeft: 3,
    fontVariant: ['tabular-nums'],
  },
  inputContainer: {
    alignSelf: 'center',
    position: 'relative',
    paddingVertical: 12,
  },
  starLayer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fillLayer: {
    position: 'absolute',
    top: 12,
    left: 0,
    overflow: 'hidden',
  },
});
