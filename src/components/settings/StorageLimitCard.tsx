import Ionicons from '@react-native-vector-icons/ionicons/static';
import Slider from '@react-native-community/slider';
import { useCallback } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../hooks/useTheme';
import { settingsStyles } from '../../styles/settingsStyles';
import { checkStorageLimit, getFreeDiskSpace } from '../../services/storageService';
import { imageCacheStore } from '../../store/imageCacheStore';
import { musicCacheStore } from '../../store/musicCacheStore';
import { storageLimitStore, type StorageLimitMode } from '../../store/storageLimitStore';
import { formatBytes } from '../../utils/formatters';
import { SettingsSectionTitle } from './SettingsSectionTitle';

const BYTES_PER_GB = 1024 ** 3;

export function StorageLimitCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const limitMode = storageLimitStore((s) => s.limitMode);
  const maxCacheSizeGB = storageLimitStore((s) => s.maxCacheSizeGB);
  const imageBytes = imageCacheStore((s) => s.totalBytes);
  const musicBytes = musicCacheStore((s) => s.totalBytes);

  const freeDisk = getFreeDiskSpace();
  const currentCacheBytes = imageBytes + musicBytes;
  const availableGB = Math.floor((freeDisk + currentCacheBytes) / BYTES_PER_GB);
  const maxSliderGB = Math.max(availableGB, 1);

  const showSizeWarning =
    limitMode === 'fixed' &&
    maxCacheSizeGB > 0 &&
    maxCacheSizeGB * BYTES_PER_GB > freeDisk + currentCacheBytes;

  const availableForWarning = formatBytes(freeDisk + currentCacheBytes);

  const handleToggleLimitMode = useCallback(() => {
    const next: StorageLimitMode = limitMode === 'none' ? 'fixed' : 'none';
    storageLimitStore.getState().setLimitMode(next);
    if (next === 'fixed' && maxCacheSizeGB === 0) {
      storageLimitStore.getState().setMaxCacheSizeGB(Math.max(availableGB, 1));
    }
    checkStorageLimit();
  }, [limitMode, maxCacheSizeGB, availableGB]);

  const handleCacheSizeChange = useCallback((value: number) => {
    storageLimitStore.getState().setMaxCacheSizeGB(Math.round(value));
  }, []);

  const handleCacheSizeComplete = useCallback((value: number) => {
    storageLimitStore.getState().setMaxCacheSizeGB(Math.round(value));
    checkStorageLimit();
  }, []);

  return (
    <View style={settingsStyles.section}>
      <SettingsSectionTitle>{t('storageLimit')}</SettingsSectionTitle>
      <View style={[settingsStyles.card, settingsStyles.cardPadded, { backgroundColor: colors.card }]}>
        <View style={[settingsStyles.infoRow, { borderBottomColor: colors.border }]}>
          <Text style={[settingsStyles.infoLabel, { color: colors.textPrimary }]}>{t('limit')}</Text>
          <Switch
            value={limitMode === 'fixed'}
            onValueChange={handleToggleLimitMode}
            trackColor={{ false: colors.border, true: colors.primary }}
          />
        </View>

        {limitMode === 'fixed' && (
          <>
            <View style={styles.sliderSection}>
              <Text style={[styles.sliderLabel, { color: colors.textPrimary }]}>
                {t('maximumCacheSize')}
              </Text>
              <Text style={[styles.sliderValue, { color: colors.primary }]}>
                {maxCacheSizeGB} GB
              </Text>
            </View>
            <Slider
              style={styles.slider}
              minimumValue={1}
              maximumValue={maxSliderGB}
              step={1}
              value={maxCacheSizeGB}
              onValueChange={handleCacheSizeChange}
              onSlidingComplete={handleCacheSizeComplete}
              minimumTrackTintColor={colors.primary}
              maximumTrackTintColor={colors.border}
              thumbTintColor={colors.primary}
            />
            {showSizeWarning && (
              <View style={styles.warningRow}>
                <Ionicons name="warning" size={16} color={colors.red} style={styles.warningIcon} />
                <Text style={[styles.warningText, { color: colors.red }]}>
                  {t('storageLimitWarning', { selected: maxCacheSizeGB, available: availableForWarning })}
                </Text>
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sliderSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
  },
  sliderLabel: { fontSize: 16 },
  sliderValue: { fontSize: 16, fontWeight: '600' },
  slider: { width: '100%', height: 40 },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 8,
  },
  warningIcon: { marginTop: 2 },
  warningText: { fontSize: 13, lineHeight: 18, flex: 1 },
});
