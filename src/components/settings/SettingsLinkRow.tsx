import Ionicons from '@react-native-vector-icons/ionicons/static';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import type { IoniconsName } from '../../utils/iconNames';

/**
 * Visual row primitive used by the settings index screen. Renders a
 * rounded card with an accent-colored icon, label + subtitle, and a
 * trailing chevron.
 */
export function SettingsLinkRow({
  label,
  subtitle,
  icon,
  onPress,
}: {
  label: string;
  subtitle: string;
  icon: IoniconsName;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.card },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.left}>
        <Ionicons name={icon} size={20} color={colors.primary} style={styles.icon} />
        <View style={styles.text}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>{label}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  icon: {
    marginTop: 2,
    alignSelf: 'flex-start',
  },
  text: { flex: 1 },
  label: { fontSize: 16, fontWeight: '500' },
  subtitle: { fontSize: 12, marginTop: 2 },
  pressed: { opacity: 0.8 },
});
