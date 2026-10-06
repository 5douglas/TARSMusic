import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { type ThemeColors } from '../constants/theme';

interface PillToggleOption<K extends string> {
  key: K;
  label: string;
}

interface PillToggleProps<K extends string> {
  options: [PillToggleOption<K>, PillToggleOption<K>];
  selected: K;
  onSelect: (key: K) => void;
  colors: ThemeColors;
}

function PillToggleInner<K extends string>({
  options,
  selected,
  onSelect,
  colors,
}: PillToggleProps<K>) {
  const handlePressA = useCallback(() => onSelect(options[0].key), [onSelect, options]);
  const handlePressB = useCallback(() => onSelect(options[1].key), [onSelect, options]);

  return (
    <View style={[styles.container, { backgroundColor: colors.inputBg }]}>
      <Pressable
        onPress={handlePressA}
        style={[
          styles.half,
          selected === options[0].key && { backgroundColor: colors.primary },
        ]}
        accessibilityRole="button"
        accessibilityState={{ selected: selected === options[0].key }}
      >
        <Text
          style={[
            styles.label,
            selected === options[0].key
              ? styles.labelActive
              : { color: colors.textSecondary },
          ]}
          numberOfLines={1}
        >
          {options[0].label}
        </Text>
      </Pressable>
      <Pressable
        onPress={handlePressB}
        style={[
          styles.half,
          selected === options[1].key && { backgroundColor: colors.primary },
        ]}
        accessibilityRole="button"
        accessibilityState={{ selected: selected === options[1].key }}
      >
        <Text
          style={[
            styles.label,
            selected === options[1].key
              ? styles.labelActive
              : { color: colors.textSecondary },
          ]}
          numberOfLines={1}
        >
          {options[1].label}
        </Text>
      </Pressable>
    </View>
  );
}

export const PillToggle = memo(PillToggleInner) as typeof PillToggleInner;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: 16,
    overflow: 'hidden',
  },
  half: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
  },
  labelActive: {
    color: '#fff',
    fontWeight: '600',
  },
});
