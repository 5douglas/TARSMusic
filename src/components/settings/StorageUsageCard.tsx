import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { StorageUsageBar } from '../StorageUsageBar';
import { useTheme } from '../../hooks/useTheme';
import { settingsStyles } from '../../styles/settingsStyles';
import { SettingsSectionTitle } from './SettingsSectionTitle';

export function StorageUsageCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={settingsStyles.section}>
      <SettingsSectionTitle>{t('storageUsage')}</SettingsSectionTitle>
      <View style={[settingsStyles.card, settingsStyles.cardPadded, { backgroundColor: colors.card }]}>
        <StorageUsageBar />
      </View>
    </View>
  );
}
