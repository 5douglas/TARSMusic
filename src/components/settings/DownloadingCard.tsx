import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../hooks/useTheme';
import { settingsStyles } from '../../styles/settingsStyles';
import {
  FORMAT_PRESETS,
  playbackSettingsStore,
  type MaxBitRate,
  type StreamFormat,
} from '../../store/playbackSettingsStore';
import { streamFormatSheetStore } from '../../store/streamFormatSheetStore';
import { DropdownRow, type DropdownOption } from './DropdownRow';
import { SettingsSectionTitle } from './SettingsSectionTitle';

const BITRATE_LABEL_KEYS: { value: MaxBitRate; labelKey: string }[] = [
  { value: 64, labelKey: 'bitrate64' },
  { value: 128, labelKey: 'bitrate128' },
  { value: 192, labelKey: 'bitrate192' },
  { value: 256, labelKey: 'bitrate256' },
  { value: 320, labelKey: 'bitrate320' },
  { value: null, labelKey: 'bitrateNoLimit' },
];

function formatLabelFor(value: StreamFormat, t: (key: string) => string): string {
  const preset = FORMAT_PRESETS.find((p) => p.value === value);
  return preset ? t(preset.labelKey) : value;
}

export function DownloadingCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const downloadMaxBitRate = playbackSettingsStore((s) => s.downloadMaxBitRate);
  const downloadFormat = playbackSettingsStore((s) => s.downloadFormat);
  const setDownloadMaxBitRate = playbackSettingsStore((s) => s.setDownloadMaxBitRate);

  const options: DropdownOption<MaxBitRate>[] = useMemo(
    () => BITRATE_LABEL_KEYS.map((o) => ({ value: o.value, label: t(o.labelKey) })),
    [t],
  );

  return (
    <View style={settingsStyles.section}>
      <SettingsSectionTitle>{t('downloading')}</SettingsSectionTitle>
      <View style={[settingsStyles.card, { backgroundColor: colors.card }]}>
        <DropdownRow
          label={t('maxBitrate')}
          value={downloadMaxBitRate as MaxBitRate}
          options={options}
          onChange={setDownloadMaxBitRate}
        />
        <Pressable
          onPress={() => streamFormatSheetStore.getState().show('download')}
          style={({ pressed }) => [
            styles.formatRow,
            pressed && settingsStyles.pressed,
          ]}
        >
          <Text style={[styles.label, { color: colors.textPrimary }]}>{t('format')}</Text>
          <View style={styles.formatRight}>
            <Text style={[styles.label, { color: colors.textSecondary }]} numberOfLines={1}>
              {formatLabelFor(downloadFormat, t)}
            </Text>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </View>
        </Pressable>
      </View>
      <Text style={[styles.warning, { color: colors.textSecondary }]}>
        {t('formatCompatibilityWarning')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  formatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  formatRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontSize: 16,
  },
  warning: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 10,
    marginHorizontal: 4,
  },
});
