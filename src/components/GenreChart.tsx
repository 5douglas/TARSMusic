import { memo, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useSharedValue, useAnimatedProps, withTiming, withDelay } from 'react-native-reanimated';
import Svg, { Path as SvgPath, Circle as SvgCircle } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { type ThemeColors } from '../constants/theme';
import { VIZ_PALETTE } from '../constants/vizColors';

const AnimatedPath = Animated.createAnimatedComponent(SvgPath);

const SIZE = 180;
const STROKE_WIDTH = 28;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CENTER = SIZE / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface GenreSlice {
  genre: string;
  count: number;
  percentage: number;
}

interface GenreChartProps {
  data: GenreSlice[];
  totalPlays: number;
  colors: ThemeColors;
}

const ArcSegment = memo(function ArcSegment({
  offset,
  length,
  color,
  index,
}: {
  offset: number;
  length: number;
  color: string;
  index: number;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(index * 100, withTiming(1, { duration: 700 }));
  }, [progress, index]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: offset + length * (1 - progress.value),
  }));

  return (
    <AnimatedPath
      d={`M ${CENTER} ${STROKE_WIDTH / 2} A ${RADIUS} ${RADIUS} 0 1 1 ${CENTER - 0.001} ${STROKE_WIDTH / 2}`}
      fill="none"
      stroke={color}
      strokeWidth={STROKE_WIDTH}
      strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
      strokeLinecap="round"
      animatedProps={animatedProps}
    />
  );
});

export const GenreChart = memo(function GenreChart({ data, totalPlays, colors }: GenreChartProps) {
  const { t } = useTranslation();
  if (data.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          {t('noGenreDataAvailable')}
        </Text>
      </View>
    );
  }

  // Build arc segments
  let accumulatedOffset = 0;
  const segments = data.map((slice, i) => {
    const length = (slice.percentage / 100) * CIRCUMFERENCE;
    const gap = data.length > 1 ? 4 : 0;
    const adjustedLength = Math.max(length - gap, 2);
    const offset = -accumulatedOffset;
    accumulatedOffset += length;
    return {
      offset,
      length: adjustedLength,
      color: VIZ_PALETTE[i % VIZ_PALETTE.length],
      genre: slice.genre,
      count: slice.count,
      percentage: slice.percentage,
    };
  });

  return (
    <View style={styles.container}>
      <View style={styles.chartRow}>
        <Svg width={SIZE} height={SIZE}>
          <SvgCircle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke={colors.border}
            strokeWidth={STROKE_WIDTH}
            opacity={0.3}
          />
          {segments.map((seg, i) => (
            <ArcSegment
              key={seg.genre}
              offset={seg.offset}
              length={seg.length}
              color={seg.color}
              index={i}
            />
          ))}
        </Svg>
        <View style={styles.centerLabel}>
          <Text style={[styles.centerValue, { color: colors.textPrimary }]}>{totalPlays}</Text>
          <Text style={[styles.centerUnit, { color: colors.textSecondary }]}>{t('plays')}</Text>
        </View>
      </View>

      <View style={styles.legend}>
        {segments.map((seg) => (
          <View key={seg.genre} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: seg.color }]} />
            <Text style={[styles.legendLabel, { color: colors.textPrimary }]} numberOfLines={1}>
              {seg.genre}
            </Text>
            <Text style={[styles.legendValue, { color: colors.textSecondary }]}>
              {Math.round(seg.percentage)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 24,
  },
  chartRow: {
    width: SIZE,
    height: SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerLabel: {
    position: 'absolute',
    alignItems: 'center',
  },
  centerValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  centerUnit: {
    fontSize: 12,
    fontWeight: '500',
  },
  legend: {
    width: '100%',
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
  },
  legendValue: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
