import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useCallback, useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../hooks/useTheme';
import { settingsStyles } from '../../styles/settingsStyles';
import {
  checkBatteryOptimization,
  requestBatteryOptimizationExemption,
} from '../../services/batteryOptimizationService';
import { batteryOptimizationStore } from '../../store/batteryOptimizationStore';
import { SettingsSectionTitle } from './SettingsSectionTitle';

/**
 * Android-only card. Returns null on iOS and when battery optimization
 * state hasn't loaded yet (mirroring the original `Platform.OS === 'android'
 * && batteryOptRestricted !== null` gate).
 */
export function BackgroundPlaybackCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const batteryOptRestricted = batteryOptimizationStore((s) => s.restricted);

  useEffect(() => {
    if (Platform.OS === 'android') {
      checkBatteryOptimization();
    }
  }, []);

  const handleRequestBatteryExemption = useCallback(async () => {
    await requestBatteryOptimizationExemption();
  }, []);

  if (Platform.OS !== 'android' || batteryOptRestricted === null) return null;

  return (
    <View style={settingsStyles.section}>
      <SettingsSectionTitle>{t('backgroundPlayback')}</SettingsSectionTitle>
      <View style={[settingsStyles.card, settingsStyles.cardPadded, { backgroundColor: colors.card }]}>
        <Pressable
          onPress={batteryOptRestricted ? handleRequestBatteryExemption : undefined}
          disabled={!batteryOptRestricted}
          style={({ pressed }) => [
            styles.row,
            pressed && batteryOptRestricted && settingsStyles.pressed,
          ]}
        >
          <View style={styles.textWrap}>
            <Text style={[styles.label, { color: colors.textPrimary }]}>
              {t('batteryOptimization')}
            </Text>
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              {batteryOptRestricted
                ? t('batteryOptimizationRestrictedHint')
                : t('batteryOptimizationOkHint')}
            </Text>
          </View>
          {batteryOptRestricted ? (
            <Ionicons name="warning-outline" size={22} color={colors.red} />
          ) : (
            <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  textWrap: { flex: 1, marginRight: 12 },
  label: { fontSize: 16, fontWeight: '500' },
  hint: { fontSize: 12, marginTop: 4, lineHeight: 16 },
});
