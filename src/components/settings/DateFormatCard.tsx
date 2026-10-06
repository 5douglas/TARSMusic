import { useMemo } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../hooks/useTheme';
import { settingsStyles } from '../../styles/settingsStyles';
import {
  layoutPreferencesStore,
  type DateFormat,
} from '../../store/layoutPreferencesStore';
import { DropdownRow, type DropdownOption } from './DropdownRow';
import { SettingsSectionTitle } from './SettingsSectionTitle';

const OPTION_KEYS: { value: DateFormat; labelKey: string; example: string }[] = [
  { value: 'yyyy/mm/dd', labelKey: 'dateFormatMonthDay', example: '02/21' },
  { value: 'yyyy/dd/mm', labelKey: 'dateFormatDayMonth', example: '21/02' },
];

export function DateFormatCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const value = layoutPreferencesStore((s) => s.dateFormat);
  const setValue = layoutPreferencesStore((s) => s.setDateFormat);

  const options: DropdownOption<DateFormat>[] = useMemo(
    () => OPTION_KEYS.map((o) => ({
      value: o.value,
      label: `${t(o.labelKey)} (${o.example})`,
    })),
    [t],
  );

  return (
    <View style={settingsStyles.section}>
      <SettingsSectionTitle>{t('dateFormat')}</SettingsSectionTitle>
      <View style={[settingsStyles.card, { backgroundColor: colors.card }]}>
        <DropdownRow value={value} options={options} onChange={setValue} isLast />
      </View>
    </View>
  );
}
