import Ionicons from '@react-native-vector-icons/ionicons/static';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../hooks/useTheme';
import { settingsStyles } from '../../styles/settingsStyles';
import { type ThemePreference } from '../../store/themeStore';
import { SettingsSectionTitle } from './SettingsSectionTitle';

const OPTIONS: { value: ThemePreference; labelKey: string; icon: 'phone-portrait-outline' | 'sunny-outline' | 'moon-outline' }[] = [
  { value: 'system', labelKey: 'themeSystem', icon: 'phone-portrait-outline' },
  { value: 'light', labelKey: 'themeLight', icon: 'sunny-outline' },
  { value: 'dark', labelKey: 'themeDark', icon: 'moon-outline' },
];

export function ThemeCard() {
  const { t } = useTranslation();
  const { colors, preference, setThemePreference } = useTheme();

  return (
    <View style={settingsStyles.section}>
      <SettingsSectionTitle>{t('appearance')}</SettingsSectionTitle>
      <View style={styles.card}>
        {OPTIONS.map((opt) => {
          const isSelected = preference === opt.value;
          return (
            <Pressable
              key={opt.value}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: colors.card, borderColor: colors.border },
                pressed && settingsStyles.pressed,
              ]}
              onPress={() => setThemePreference(opt.value)}
            >
              <View style={styles.rowContent}>
                <Ionicons
                  name={opt.icon}
                  size={22}
                  color={isSelected ? colors.primary : colors.textSecondary}
                />
                <Text style={[styles.label, { color: colors.textPrimary }]}>
                  {t(opt.labelKey)}
                </Text>
              </View>
              {isSelected && (
                <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  label: {
    fontSize: 16,
  },
});
