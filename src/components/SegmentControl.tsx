import { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { useTheme } from '../hooks/useTheme';

export interface Segment<K extends string = string> {
  key: K;
  label: string;
}

/** Spotify-style filter pills on one horizontally scrollable row. */
export const SegmentControl = memo(function SegmentControl<K extends string>({
  segments,
  selected,
  onSelect,
}: {
  segments: readonly Segment<K>[];
  selected: K;
  onSelect: (segment: K) => void;
}) {
  const { colors } = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.container}
    >
      {segments.map(({ key, label }) => {
        const isActive = selected === key;
        return (
          <Pressable
            key={key}
            onPress={() => onSelect(key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            style={[styles.pill, { backgroundColor: isActive ? colors.primary : colors.inputBg }]}
          >
            <Text
              style={[
                styles.label,
                { color: isActive ? '#fff' : colors.textPrimary },
                isActive && styles.labelActive,
              ]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}) as <K extends string>(props: {
  segments: readonly Segment<K>[];
  selected: K;
  onSelect: (segment: K) => void;
}) => React.JSX.Element;

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
  },
  container: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 8,
  },
  pill: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 16,
    justifyContent: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
  },
  labelActive: {
    fontWeight: '700',
  },
});
