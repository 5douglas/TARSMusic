import { Platform, StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../hooks/useTheme';
import { settingsStyles } from '../../styles/settingsStyles';
import { playbackSettingsStore } from '../../store/playbackSettingsStore';
import { SettingsSectionTitle } from './SettingsSectionTitle';

/**
 * Android: show the synced-lyrics line being sung on the lock screen and in the
 * home-screen widget (modules/expo-player-widget). Renders null on iOS.
 */
export function LockScreenLyricsCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const enabled = playbackSettingsStore((s) => s.lockScreenLyrics);
  const setEnabled = playbackSettingsStore((s) => s.setLockScreenLyrics);

  if (Platform.OS !== 'android') return null;

  return (
    <View style={settingsStyles.section}>
      <SettingsSectionTitle>{t('lockScreenLyrics')}</SettingsSectionTitle>
      <Text style={[styles.sectionHint, { color: colors.textSecondary }]}>
        {t('lockScreenLyricsHint')}
      </Text>
      <View style={[settingsStyles.card, settingsStyles.cardPadded, { backgroundColor: colors.card }]}>
        <View style={styles.row}>
          <Text style={[settingsStyles.infoLabel, { color: colors.textPrimary }]}>
            {t('lockScreenLyricsToggle')}
          </Text>
          <Switch
            value={enabled}
            onValueChange={setEnabled}
            trackColor={{ false: colors.border, true: colors.primary }}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHint: {
    fontSize: 12,
    marginBottom: 10,
    marginLeft: 4,
    lineHeight: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
