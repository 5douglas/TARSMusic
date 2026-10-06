import { useCallback, useMemo } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../hooks/useTheme';
import { settingsStyles } from '../../styles/settingsStyles';
import {
  playbackSettingsStore,
  SKIP_INTERVALS,
  type SkipInterval,
} from '../../store/playbackSettingsStore';
import { updateRemoteCapabilities } from '../../services/playerService';
import { DropdownRow, type DropdownOption } from './DropdownRow';
import { SettingsSectionTitle } from './SettingsSectionTitle';

export function SkipIntervalsCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const skipBackwardInterval = playbackSettingsStore((s) => s.skipBackwardInterval);
  const skipForwardInterval = playbackSettingsStore((s) => s.skipForwardInterval);
  const setSkipBackwardInterval = playbackSettingsStore((s) => s.setSkipBackwardInterval);
  const setSkipForwardInterval = playbackSettingsStore((s) => s.setSkipForwardInterval);

  const options: DropdownOption<SkipInterval>[] = useMemo(
    () => SKIP_INTERVALS.map((v) => ({ value: v, label: t('secondsValue', { count: v }) })),
    [t],
  );

  const handleBackwardChange = useCallback(
    (value: SkipInterval) => {
      setSkipBackwardInterval(value);
      updateRemoteCapabilities();
    },
    [setSkipBackwardInterval],
  );

  const handleForwardChange = useCallback(
    (value: SkipInterval) => {
      setSkipForwardInterval(value);
      updateRemoteCapabilities();
    },
    [setSkipForwardInterval],
  );

  return (
    <View style={settingsStyles.section}>
      <SettingsSectionTitle>{t('skipIntervals')}</SettingsSectionTitle>
      <View style={[settingsStyles.card, { backgroundColor: colors.card }]}>
        <DropdownRow
          label={t('skipBackward')}
          value={skipBackwardInterval}
          options={options}
          onChange={handleBackwardChange}
        />
        <DropdownRow
          label={t('skipForward')}
          value={skipForwardInterval}
          options={options}
          onChange={handleForwardChange}
          isLast
        />
      </View>
    </View>
  );
}
