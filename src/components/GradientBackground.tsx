import { HeaderHeightContext } from "expo-router/react-navigation";
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useContext, useMemo } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../hooks/useTheme';
import { mixHexColors } from '../utils/colors';

export const DARK_MIX = 0.15;
export const LIGHT_MIX = 0.10;

/** Eased multi-stop fade using opaque blended colors for a smooth transition. */
export const GRADIENT_LOCATIONS = [0, 0.12, 0.28, 0.45, 0.6] as const;
export const GRADIENT_MIX_CURVE = [1.0, 0.7, 0.35, 0.12, 0] as const;

export const GradientBackground = memo(function GradientBackground({
  children,
  style,
  scrollable = false,
}: {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  /** When true, skip container paddingTop so a child ScrollView/FlatList can scroll behind the header. */
  scrollable?: boolean;
}) {
  const { theme, colors } = useTheme();
  const headerHeight = useContext(HeaderHeightContext) ?? 0;

  const gradientColors = useMemo(() => {
    const peak = theme === 'dark' ? DARK_MIX : LIGHT_MIX;
    return GRADIENT_MIX_CURVE.map((m: number) =>
      mixHexColors(colors.background, colors.primary, peak * m)
    ) as [string, string, ...string[]];
  }, [theme, colors.primary, colors.background]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: scrollable ? 0 : headerHeight }, style]}>
      <LinearGradient
        colors={gradientColors}
        locations={GRADIENT_LOCATIONS}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
