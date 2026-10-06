import { memo, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useSharedValue, useAnimatedProps, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Rect as SvgRect } from 'react-native-svg';

import { type ThemeColors } from '../constants/theme';
import { hexWithAlpha } from '../utils/colors';

const AnimatedRect = Animated.createAnimatedComponent(SvgRect);

const CHART_HEIGHT = 120;
const BAR_RADIUS = 3;
const BAR_GAP = 1;
const LABEL_HEIGHT = 18;

interface BarDatum {
  value: number;
  label?: string;
}

interface MiniBarChartProps {
  data: BarDatum[];
  colors: ThemeColors;
  highlightIndex?: number;
  height?: number;
  accentColor?: string;
}

const AnimatedBar = memo(function AnimatedBar({
  x,
  width,
  maxHeight,
  value,
  maxValue,
  color,
  index,
}: {
  x: number;
  width: number;
  maxHeight: number;
  value: number;
  maxValue: number;
  color: string;
  index: number;
}) {
  const targetHeight = maxValue > 0 ? (value / maxValue) * maxHeight : 0;
  const animatedHeight = useSharedValue(0);

  useEffect(() => {
    animatedHeight.value = withDelay(
      Math.min(index * 8, 400),
      withTiming(targetHeight, { duration: 500 })
    );
  }, [animatedHeight, targetHeight, index]);

  const animatedProps = useAnimatedProps(() => ({
    y: maxHeight - animatedHeight.value,
    height: Math.max(animatedHeight.value, 0),
  }));

  if (value === 0) {
    return (
      <SvgRect
        x={x}
        y={maxHeight - 2}
        width={width}
        height={2}
        rx={1}
        fill={color}
        opacity={0.3}
      />
    );
  }

  return (
    <AnimatedRect
      x={x}
      width={width}
      rx={BAR_RADIUS}
      fill={color}
      animatedProps={animatedProps}
    />
  );
});

export const MiniBarChart = memo(function MiniBarChart({
  data,
  colors,
  highlightIndex,
  height = CHART_HEIGHT,
  accentColor,
}: MiniBarChartProps) {
  if (data.length === 0) return null;

  const maxValue = Math.max(...data.map((d) => d.value), 1);

  const barCount = data.length;
  const totalGap = BAR_GAP * (barCount - 1);
  const svgHeight = height;

  // Show labels for a subset to avoid crowding
  const labelInterval = barCount <= 10 ? 1 : barCount <= 20 ? 3 : Math.ceil(barCount / 8);
  const hasLabels = data.some((d) => d.label);
  const lastHasLabel = !!data[data.length - 1]?.label;

  return (
    <View style={styles.container}>
      <View style={{ height: svgHeight }}>
        <Svg width="100%" height={svgHeight} preserveAspectRatio="none" viewBox={`0 0 ${barCount * 8 + totalGap} ${svgHeight}`}>
          {data.map((d, i) => {
            const barWidth = 8;
            const x = i * (barWidth + BAR_GAP);
            // Highlight a single bar (e.g. the latest day / peak hour) by
            // dimming the others. When no highlight is requested every bar
            // renders at full strength.
            const base = accentColor ?? colors.primary;
            const barColor =
              highlightIndex == null || highlightIndex === i
                ? base
                : hexWithAlpha(base, 0.4);
            return (
              <AnimatedBar
                key={i}
                x={x}
                width={barWidth}
                maxHeight={svgHeight}
                value={d.value}
                maxValue={maxValue}
                color={barColor}
                index={i}
              />
            );
          })}
        </Svg>
      </View>
      {hasLabels && (
        <View style={[styles.labelRow, { width: '100%' }]}>
          {data.map((d, i) =>
            (i % labelInterval === 0 && (!lastHasLabel || data.length - 1 - i >= labelInterval)) || (i === data.length - 1 && lastHasLabel) ? (
              <Text
                key={i}
                style={[
                  styles.label,
                  { color: colors.textSecondary },
                  { left: `${(i / (data.length - 1)) * 100}%` },
                ]}
                numberOfLines={1}
              >
                {d.label}
              </Text>
            ) : null
          )}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  labelRow: {
    height: LABEL_HEIGHT,
    flexDirection: 'row',
    position: 'relative',
    marginTop: 6,
  },
  label: {
    fontSize: 10,
    fontWeight: '500',
    position: 'absolute',
    transform: [{ translateX: -12 }],
  },
});
