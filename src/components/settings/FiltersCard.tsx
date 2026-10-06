import { StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../hooks/useTheme';
import { settingsStyles } from '../../styles/settingsStyles';
import { layoutPreferencesStore } from '../../store/layoutPreferencesStore';
import { SettingsSectionTitle } from './SettingsSectionTitle';

export function FiltersCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const value = layoutPreferencesStore((s) => s.includePartialInDownloadedFilter);
  const setValue = layoutPreferencesStore((s) => s.setIncludePartialInDownloadedFilter);

  return (
    <View style={settingsStyles.section}>
      <SettingsSectionTitle>{t('filters')}</SettingsSectionTitle>
      <View style={[settingsStyles.card, { backgroundColor: colors.card }]}>
        <View style={styles.row}>
          <View style={styles.textWrap}>
            <Text style={[styles.label, { color: colors.textPrimary }]}>
              {t('includePartialDownloads')}
            </Text>
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              {t('includePartialDownloadsHint')}
            </Text>
          </View>
          <Switch
            value={value}
            onValueChange={setValue}
            trackColor={{ false: colors.border, true: colors.primary }}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 16,
  },
  textWrap: { flex: 1 },
  label: { fontSize: 16 },
  hint: {
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
});
