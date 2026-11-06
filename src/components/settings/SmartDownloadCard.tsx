import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useCallback } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../hooks/useTheme';
import { useThemedAlert } from '../../hooks/useThemedAlert';
import { removeSmartDownloads, runSmartDownload } from '../../services/smartDownloadService';
import {
  SMART_DOWNLOAD_SIZE_OPTIONS_GB,
  SMART_DOWNLOAD_TOP_COUNTS,
  smartDownloadStore,
} from '../../store/smartDownloadStore';
import { settingsStyles } from '../../styles/settingsStyles';
import { formatBytes } from '../../utils/formatters';
import { SettingsSectionTitle } from './SettingsSectionTitle';

function OptionChips<T extends number>({
  options,
  value,
  format,
  onSelect,
}: {
  options: readonly T[];
  value: number;
  format: (v: T) => string;
  onSelect: (v: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.chips}>
      {options.map((opt) => {
        const selected = opt === value;
        return (
          <Pressable
            key={opt}
            onPress={() => onSelect(opt)}
            style={({ pressed }) => [
              styles.chip,
              selected
                ? { backgroundColor: colors.primary, borderColor: colors.primary }
                : { borderColor: colors.border },
              pressed && settingsStyles.pressed,
            ]}
          >
            <Text style={[styles.chipText, { color: selected ? '#fff' : colors.textPrimary }]}>
              {format(opt)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SmartDownloadCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { confirm } = useThemedAlert();

  const enabled = smartDownloadStore((s) => s.enabled);
  const includeFavorites = smartDownloadStore((s) => s.includeFavorites);
  const includeMostPlayed = smartDownloadStore((s) => s.includeMostPlayed);
  const mostPlayedCount = smartDownloadStore((s) => s.mostPlayedCount);
  const wifiOnly = smartDownloadStore((s) => s.wifiOnly);
  const maxSizeGB = smartDownloadStore((s) => s.maxSizeGB);
  const ownedCount = smartDownloadStore((s) => s.ownedSongIds.length);
  const lastResult = smartDownloadStore((s) => s.lastResult);
  const running = smartDownloadStore((s) => s.running);

  const handleToggleEnabled = useCallback(
    (next: boolean) => {
      smartDownloadStore.getState().setEnabled(next);
      if (next || smartDownloadStore.getState().ownedSongIds.length === 0) return;
      confirm({
        title: t('smartDownloadRemoveTitle'),
        message: t('smartDownloadRemoveBody', {
          count: smartDownloadStore.getState().ownedSongIds.length,
        }),
        confirmLabel: t('remove'),
        destructive: true,
        onConfirm: () => { void removeSmartDownloads(); },
      });
    },
    [confirm, t],
  );

  const row = (label: string, value: boolean, onChange: (v: boolean) => void) => (
    <View style={[settingsStyles.infoRow, { borderBottomColor: colors.border }]}>
      <Text style={[settingsStyles.infoLabel, { color: colors.textPrimary }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.primary }}
      />
    </View>
  );

  return (
    <View style={settingsStyles.section}>
      <SettingsSectionTitle>{t('smartDownload')}</SettingsSectionTitle>
      <View style={[settingsStyles.card, settingsStyles.cardPadded, { backgroundColor: colors.card }]}>
        {row(t('smartDownloadEnable'), enabled, handleToggleEnabled)}
        <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('smartDownloadHint')}</Text>

        {enabled && (
          <>
            {row(t('smartDownloadFavorites'), includeFavorites, (v) =>
              smartDownloadStore.getState().setIncludeFavorites(v),
            )}
            {row(t('smartDownloadMostPlayed'), includeMostPlayed, (v) =>
              smartDownloadStore.getState().setIncludeMostPlayed(v),
            )}
            {includeMostPlayed && (
              <View style={styles.optionBlock}>
                <Text style={[styles.optionLabel, { color: colors.textPrimary }]}>
                  {t('smartDownloadTopCount')}
                </Text>
                <OptionChips
                  options={SMART_DOWNLOAD_TOP_COUNTS}
                  value={mostPlayedCount}
                  format={(v) => String(v)}
                  onSelect={(v) => smartDownloadStore.getState().setMostPlayedCount(v)}
                />
              </View>
            )}
            {row(t('smartDownloadWifiOnly'), wifiOnly, (v) =>
              smartDownloadStore.getState().setWifiOnly(v),
            )}
            <View style={styles.optionBlock}>
              <Text style={[styles.optionLabel, { color: colors.textPrimary }]}>
                {t('smartDownloadMaxSize')}
              </Text>
              <OptionChips
                options={SMART_DOWNLOAD_SIZE_OPTIONS_GB}
                value={maxSizeGB}
                format={(v) => `${v} GB`}
                onSelect={(v) => smartDownloadStore.getState().setMaxSizeGB(v)}
              />
            </View>

            <View style={settingsStyles.offlineNotice}>
              {running ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
              )}
              <Text style={[settingsStyles.offlineNoticeText, { color: colors.textSecondary }]}>
                {running
                  ? t('smartDownloadRunning')
                  : lastResult
                    ? t('smartDownloadStatus', {
                        count: lastResult.selected,
                        size: formatBytes(lastResult.estimatedBytes),
                      }) +
                      (lastResult.skippedForSpace > 0
                        ? ` ${t('smartDownloadSkipped', { count: lastResult.skippedForSpace })}`
                        : '')
                    : wifiOnly
                      ? t('smartDownloadWaitingWifi')
                      : t('smartDownloadWaiting')}
              </Text>
            </View>

            <View style={settingsStyles.actionRow}>
              <Pressable
                onPress={() => { void runSmartDownload({ force: true }); }}
                disabled={running}
                style={({ pressed }) => [
                  settingsStyles.actionRowButton,
                  { backgroundColor: colors.primary },
                  (running || pressed) && settingsStyles.pressed,
                ]}
              >
                <Ionicons name="sync-outline" size={18} color="#fff" />
                <Text style={[settingsStyles.actionRowButtonText, { color: '#fff' }]}>
                  {t('smartDownloadUpdateNow')}
                </Text>
              </Pressable>
            </View>
          </>
        )}

        {!enabled && ownedCount > 0 && (
          <View style={settingsStyles.actionRow}>
            <Pressable
              onPress={() => { void removeSmartDownloads(); }}
              style={({ pressed }) => [
                settingsStyles.actionRowButton,
                { borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth },
                pressed && settingsStyles.pressed,
              ]}
            >
              <Text style={[settingsStyles.actionRowButtonText, { color: colors.textPrimary }]}>
                {t('smartDownloadRemoveButton', { count: ownedCount })}
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 13, lineHeight: 18, paddingTop: 8, paddingBottom: 4 },
  optionBlock: { paddingTop: 12 },
  optionLabel: { fontSize: 16, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: { fontSize: 14, fontWeight: '600' },
});
