import { useMemo } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../hooks/useTheme';
import { settingsStyles } from '../../styles/settingsStyles';
import {
  layoutPreferencesStore,
  type AlbumSortOrder,
} from '../../store/layoutPreferencesStore';
import { DropdownRow, type DropdownOption } from './DropdownRow';
import { SettingsSectionTitle } from './SettingsSectionTitle';

const OPTION_KEYS: { value: AlbumSortOrder; labelKey: string }[] = [
  { value: 'artist', labelKey: 'sortArtistName' },
  { value: 'title', labelKey: 'sortAlbumTitle' },
];

export function AlbumSortOrderCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const value = layoutPreferencesStore((s) => s.albumSortOrder);
  const setValue = layoutPreferencesStore((s) => s.setAlbumSortOrder);

  const options: DropdownOption<AlbumSortOrder>[] = useMemo(
    () => OPTION_KEYS.map((o) => ({ value: o.value, label: t(o.labelKey) })),
    [t],
  );

  return (
    <View style={settingsStyles.section}>
      <SettingsSectionTitle>{t('albumSortOrder')}</SettingsSectionTitle>
      <View style={[settingsStyles.card, { backgroundColor: colors.card }]}>
        <DropdownRow value={value} options={options} onChange={setValue} isLast />
      </View>
    </View>
  );
}
