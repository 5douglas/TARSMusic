import { useMemo } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../hooks/useTheme';
import { settingsStyles } from '../../styles/settingsStyles';
import {
  layoutPreferencesStore,
  type ArtistAlbumSortOrder,
} from '../../store/layoutPreferencesStore';
import { DropdownRow, type DropdownOption } from './DropdownRow';
import { SettingsSectionTitle } from './SettingsSectionTitle';

const OPTION_KEYS: { value: ArtistAlbumSortOrder; labelKey: string }[] = [
  { value: 'newest', labelKey: 'sortNewestFirst' },
  { value: 'oldest', labelKey: 'sortOldestFirst' },
];

export function ArtistAlbumSortOrderCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const value = layoutPreferencesStore((s) => s.artistAlbumSortOrder);
  const setValue = layoutPreferencesStore((s) => s.setArtistAlbumSortOrder);

  const options: DropdownOption<ArtistAlbumSortOrder>[] = useMemo(
    () => OPTION_KEYS.map((o) => ({ value: o.value, label: t(o.labelKey) })),
    [t],
  );

  return (
    <View style={settingsStyles.section}>
      <SettingsSectionTitle>{t('artistAlbumSortOrder')}</SettingsSectionTitle>
      <View style={[settingsStyles.card, { backgroundColor: colors.card }]}>
        <DropdownRow value={value} options={options} onChange={setValue} isLast />
      </View>
    </View>
  );
}
