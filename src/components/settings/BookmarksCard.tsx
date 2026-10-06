import { StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../hooks/useTheme';
import { settingsStyles } from '../../styles/settingsStyles';
import { bookmarksStore } from '../../store/bookmarksStore';
import { SettingsSectionTitle } from './SettingsSectionTitle';

export function BookmarksCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const autoName = bookmarksStore((s) => s.autoName);
  const setAutoName = bookmarksStore((s) => s.setAutoName);

  return (
    <View style={settingsStyles.section}>
      <SettingsSectionTitle>{t('bookmarksSettingsTitle')}</SettingsSectionTitle>
      <View style={[settingsStyles.card, { backgroundColor: colors.card }]}>
        <View style={styles.toggleRow}>
          <View style={styles.textWrap}>
            <Text style={[styles.label, { color: colors.textPrimary }]}>
              {t('autonameBookmarks')}
            </Text>
          </View>
          <Switch
            value={autoName}
            onValueChange={setAutoName}
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
});
