import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { LanguageSelector } from '../LanguageSelector';
import { settingsStyles } from '../../styles/settingsStyles';
import { SettingsSectionTitle } from './SettingsSectionTitle';

export function LanguageCard() {
  const { t } = useTranslation();
  return (
    <View style={settingsStyles.section}>
      <SettingsSectionTitle>{t('language')}</SettingsSectionTitle>
      <LanguageSelector />
    </View>
  );
}
