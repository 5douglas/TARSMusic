import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Rect as SvgRect } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { type ThemeColors } from '../constants/theme';

const CELL_SIZE = 14;
const CELL_GAP = 3;
const CELL_RADIUS = 3;
const DAY_LABEL_WIDTH = 24;
const ROWS = 7;

interface HeatmapDatum {
  date: string;
  count: number;
}

interface ActivityHeatmapProps {
  data: HeatmapDatum[];
  colors: ThemeColors;
}

function interpolateColor(
  from: [number, number, number],
  to: [number, number, number],
  t: number
): string {
  const r = Math.round(from[0] + (to[0] - from[0]) * t);
  const g = Math.round(from[1] + (to[1] - from[1]) * t);
  const b = Math.round(from[2] + (to[2] - from[2]) * t);
  return `rgb(${r},${g},${b})`;
}

function parseColorToRgb(color: string): [number, number, number] {
  // Handle rgb(...) and rgba(...)
  const rgbMatch = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    return [parseInt(rgbMatch[1], 10), parseInt(rgbMatch[2], 10), parseInt(rgbMatch[3], 10)];
  }
  // Handle #hex
  const h = color.replace('#', '');
  if (h.length >= 6) {
    return [
      parseInt(h.substring(0, 2), 16),
      parseInt(h.substring(2, 4), 16),
      parseInt(h.substring(4, 6), 16),
    ];
  }
  // 3-char shorthand (#abc -> #aabbcc)
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ];
  }
  return [128, 128, 128];
}

const MONTH_LABEL_KEYS = ['monthJan', 'monthFeb', 'monthMar', 'monthApr', 'monthMay', 'monthJun', 'monthJul', 'monthAug', 'monthSep', 'monthOct', 'monthNov', 'monthDec'] as const;
const DAY_LABEL_KEYS = ['', 'dayMon', '', 'dayWed', '', 'dayFri', ''] as const;

export const ActivityHeatmap = memo(function ActivityHeatmap({ data, colors }: ActivityHeatmapProps) {
  const { t } = useTranslation();
  const weeks = Math.ceil(data.length / ROWS);

  const { cells, monthMarkers, maxCount } = useMemo(() => {
    let max = 0;
    for (const d of data) {
      if (d.count > max) max = d.count;
    }

    const cellList: {
      col: number;
      row: number;
      count: number;
      date: string;
    }[] = [];

    const markers: { col: number; labelKey: string }[] = [];
    let lastMonth = -1;

    for (let i = 0; i < data.length; i++) {
      const col = Math.floor(i / ROWS);
      const row = i % ROWS;
      cellList.push({ col, row, count: data[i].count, date: data[i].date });

      const month = parseInt(data[i].date.substring(5, 7), 10) - 1;
      if (month !== lastMonth && row === 0) {
        markers.push({ col, labelKey: MONTH_LABEL_KEYS[month] });
        lastMonth = month;
      }
    }

    return { cells: cellList, monthMarkers: markers, maxCount: max };
  }, [data]);

  const primaryRgb = parseColorToRgb(colors.primary);
  const emptyRgb = parseColorToRgb(colors.border);

  const svgWidth = weeks * (CELL_SIZE + CELL_GAP) - CELL_GAP;
  const svgHeight = ROWS * (CELL_SIZE + CELL_GAP) - CELL_GAP;

  return (
    <View style={styles.container}>
      {/* Month labels */}
      <View style={[styles.monthRow, { paddingLeft: DAY_LABEL_WIDTH }]}>
        {monthMarkers.map((m, i) => (
          <Text
            key={`${m.labelKey}-${i}`}
            style={[
              styles.monthLabel,
              { color: colors.textSecondary },
              { position: 'absolute', left: DAY_LABEL_WIDTH + m.col * (CELL_SIZE + CELL_GAP) },
            ]}
          >
            {t(m.labelKey)}
          </Text>
        ))}
      </View>

      <View style={styles.gridRow}>
        {/* Day labels */}
        <View style={[styles.dayLabels, { width: DAY_LABEL_WIDTH }]}>
          {DAY_LABEL_KEYS.map((key, i) => (
            <View key={i} style={{ height: CELL_SIZE + CELL_GAP }}>
              <Text style={[styles.dayLabel, { color: colors.textSecondary }]}>{key ? t(key) : ''}</Text>
            </View>
          ))}
        </View>

        {/* Grid */}
        <Svg width={svgWidth} height={svgHeight}>
          {cells.map((cell) => {
            const x = cell.col * (CELL_SIZE + CELL_GAP);
            const y = cell.row * (CELL_SIZE + CELL_GAP);
            const intensity = maxCount > 0 ? cell.count / maxCount : 0;
            const fillColor =
              cell.count === 0
                ? interpolateColor(emptyRgb, emptyRgb, 0)
                : interpolateColor(emptyRgb, primaryRgb, 0.25 + intensity * 0.75);

            return (
              <SvgRect
                key={cell.date}
                x={x}
                y={y}
                width={CELL_SIZE}
                height={CELL_SIZE}
                rx={CELL_RADIUS}
                fill={fillColor}
                opacity={cell.count === 0 ? 0.4 : 1}
              />
            );
          })}
        </Svg>
      </View>

      {/* Legend */}
      <View style={styles.legendRow}>
        <Text style={[styles.legendText, { color: colors.textSecondary }]}>{t('less')}</Text>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <View
            key={t}
            style={[
              styles.legendCell,
              {
                backgroundColor:
                  t === 0
                    ? interpolateColor(emptyRgb, emptyRgb, 0)
                    : interpolateColor(emptyRgb, primaryRgb, 0.25 + t * 0.75),
                opacity: t === 0 ? 0.4 : 1,
              },
            ]}
          />
        ))}
        <Text style={[styles.legendText, { color: colors.textSecondary }]}>{t('more')}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  monthRow: {
    height: 16,
    position: 'relative',
  },
  monthLabel: {
    fontSize: 10,
    fontWeight: '500',
  },
  gridRow: {
    flexDirection: 'row',
  },
  dayLabels: {
    justifyContent: 'flex-start',
  },
  dayLabel: {
    fontSize: 10,
    fontWeight: '500',
    lineHeight: CELL_SIZE,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 6,
  },
  legendCell: {
    width: 12,
    height: 12,
    borderRadius: 2,
  },
  legendText: {
    fontSize: 10,
    fontWeight: '500',
  },
});
