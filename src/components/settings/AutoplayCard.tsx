import { StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../hooks/useTheme';
import { settingsStyles } from '../../styles/settingsStyles';
import { autoplayStore } from '../../store/autoplayStore';
import { SettingsSectionTitle } from './SettingsSectionTitle';

/** Infinite radio: keep playing similar songs when the queue runs out. */
export function AutoplayCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const autoplayEnabled = autoplayStore((s) => s.autoplayEnabled);
  const setAutoplayEnabled = autoplayStore((s) => s.setAutoplayEnabled);

  return (
    <View style={settingsStyles.section}>
      <SettingsSectionTitle>{t('autoplay')}</SettingsSectionTitle>
      <View style={[settingsStyles.card, { backgroundColor: colors.card }]}>
        <View style={styles.toggleRow}>
          <View style={styles.textWrap}>
            <Text style={[styles.label, { color: colors.textPrimary }]}>{t('autoplaySimilar')}</Text>
            <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('autoplaySimilarHint')}</Text>
          </View>
          <Switch
            value={autoplayEnabled}
            onValueChange={setAutoplayEnabled}
            trackColor={{ false: colors.border, true: colors.primary }}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  textWrap: {
    flex: 1,
  },
  label: {
    fontSize: 16,
  },
  hint: {
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
});
