import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../hooks/useTheme';
import { settingsStyles } from '../../styles/settingsStyles';
import {
  playbackSettingsStore,
  type RemoteControlMode,
} from '../../store/playbackSettingsStore';
import { updateRemoteCapabilities } from '../../services/playerService';
import { SettingsSectionTitle } from './SettingsSectionTitle';

const OPTIONS: { value: RemoteControlMode; labelKey: string; subtitleKey: string }[] = [
  { value: 'skip-track', labelKey: 'remoteNextPreviousTrack', subtitleKey: 'remoteNextPreviousTrackSubtitle' },
  { value: 'skip-interval', labelKey: 'remoteSkipForwardBackward', subtitleKey: 'remoteSkipForwardBackwardSubtitle' },
];

export function RemoteControlsCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const remoteControlMode = playbackSettingsStore((s) => s.remoteControlMode);
  const setRemoteControlMode = playbackSettingsStore((s) => s.setRemoteControlMode);

  const handleChange = useCallback(
    (mode: RemoteControlMode) => {
      setRemoteControlMode(mode);
      updateRemoteCapabilities();
    },
    [setRemoteControlMode],
  );

  return (
    <View style={settingsStyles.section}>
      <SettingsSectionTitle>{t('remoteControls')}</SettingsSectionTitle>
      <Text style={[styles.sectionHint, { color: colors.textSecondary }]}>
        {t('remoteControlsHint')}
      </Text>
      <View style={[settingsStyles.card, { backgroundColor: colors.card }]}>
        {OPTIONS.map((opt, index) => {
          const isActive = remoteControlMode === opt.value;
          const isLast = index === OPTIONS.length - 1;
          return (
            <Pressable
              key={opt.value}
              onPress={() => handleChange(opt.value)}
              style={({ pressed }) => [
                styles.radioRow,
                !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                pressed && settingsStyles.pressed,
              ]}
            >
              <View style={styles.textWrap}>
                <Text style={[styles.label, { color: colors.textPrimary }]}>
                  {t(opt.labelKey)}
                </Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  {t(opt.subtitleKey)}
                </Text>
              </View>
              {isActive && (
                <Ionicons name="checkmark" size={20} color={colors.primary} />
              )}
            </Pressable>
          );
        })}
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
  radioRow: {
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
  subtitle: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
});
