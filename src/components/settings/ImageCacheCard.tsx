import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../hooks/useTheme';
import { settingsStyles } from '../../styles/settingsStyles';
import {
  cancelImageRefreshCycle,
  enqueueImageRefreshCycle,
  pauseImageQueue,
  resumeImageQueue,
  retryFailedImages,
  scanImageCache,
} from '../../services/imageCacheService';
import { imageDownloadQueueStore } from '../../store/imageDownloadQueueStore';
import {
  imageCacheStore,
  type MaxConcurrentImageDownloads,
} from '../../store/imageCacheStore';
import { offlineModeStore } from '../../store/offlineModeStore';
import { processingOverlayStore } from '../../store/processingOverlayStore';
import { formatBytes } from '../../utils/formatters';
import { minDelay } from '../../utils/stringHelpers';
import { SettingsSectionTitle } from './SettingsSectionTitle';

const IMAGE_CONCURRENT_OPTIONS: MaxConcurrentImageDownloads[] = [1, 3, 5, 10];

export function ImageCacheCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [sheetVisible, setSheetVisible] = useState(false);
  const [imageScanning, setImageScanning] = useState(false);

  const totalBytes = imageCacheStore((s) => s.totalBytes);
  const imageCount = imageCacheStore((s) => s.imageCount);
  const fileCount = imageCacheStore((s) => s.fileCount);
  const incompleteCount = imageCacheStore((s) => s.incompleteCount);
  const maxConcurrentImageDownloads = imageCacheStore((s) => s.maxConcurrentImageDownloads);

  const recacheCycleId = imageDownloadQueueStore((s) => s.cycleId);
  const recacheScope = imageDownloadQueueStore((s) => s.cycleScope);
  const recacheTotal = imageDownloadQueueStore((s) => s.cycleTotal);
  const recacheProcessed = imageDownloadQueueStore((s) => s.cycleProcessed);
  const recacheFailed = imageDownloadQueueStore((s) => s.cycleFailed);
  const recachePaused = imageDownloadQueueStore((s) => s.isPaused);
  const recacheActive = recacheCycleId !== null && recacheTotal > 0;

  const offlineMode = offlineModeStore((s) => s.offlineMode);

  const handleConcurrentSelect = useCallback((value: MaxConcurrentImageDownloads) => {
    imageCacheStore.getState().setMaxConcurrentImageDownloads(value);
    setSheetVisible(false);
  }, []);

  const handleRefreshAllCovers = useCallback(() => {
    if (recacheActive || offlineMode) return;
    void enqueueImageRefreshCycle('refresh-all');
  }, [recacheActive, offlineMode]);

  // Scan = reconcile FS↔SQL drift, repair incomplete covers, and remove the
  // ones that still can't be completed (server-reachable only). Shared by the
  // manual button (with overlay feedback) and the silent scan-on-open below.
  const handleImageScan = useCallback(async () => {
    if (imageScanning) return;
    setImageScanning(true);
    processingOverlayStore.getState().show(t('repairingImages'));
    const minShown = minDelay(1500);
    try {
      const outcome = await scanImageCache('settings');
      if (outcome.repaired === 0 && outcome.removed === 0 && outcome.failed === 0) {
        processingOverlayStore.getState().showSuccess(t('imageRepairNothingToDo'));
      } else if (outcome.failed > 0) {
        processingOverlayStore.getState().showSuccess(
          t('imageRepairCompleteWithFailures', {
            repaired: outcome.repaired,
            removed: outcome.removed,
            failed: outcome.failed,
          }),
        );
      } else {
        processingOverlayStore.getState().showSuccess(
          t('imageRepairComplete', { repaired: outcome.repaired, removed: outcome.removed }),
        );
      }
    } catch {
      processingOverlayStore.getState().showError(t('imageRepairFailed'));
    } finally {
      await minShown;
      setImageScanning(false);
    }
  }, [imageScanning, t]);

  // Silent scan when the user lands on this screen so the stats + cache are up
  // to date without a tap. Runs once per mount; the manual button stays
  // available for an explicit re-scan with visible feedback.
  const didAutoScan = useRef(false);
  useEffect(() => {
    if (didAutoScan.current) return;
    didAutoScan.current = true;
    void scanImageCache('settings-open').catch(() => { /* best-effort */ });
  }, []);

  return (
    <>
      <View style={settingsStyles.section}>
        <SettingsSectionTitle>{t('imageCache')}</SettingsSectionTitle>
        <View style={[settingsStyles.card, settingsStyles.cardPadded, { backgroundColor: colors.card }]}>
          <View style={[settingsStyles.infoRow, { borderBottomColor: colors.border }]}>
            <Text style={[settingsStyles.infoLabel, { color: colors.textPrimary }]}>{t('cachedImages')}</Text>
            <Text style={[settingsStyles.infoValue, { color: colors.textSecondary }]}>
              {t('imageCount', { count: imageCount })}
            </Text>
          </View>
          <View style={[settingsStyles.infoRow, { borderBottomColor: colors.border }]}>
            <Text style={[settingsStyles.infoLabel, { color: colors.textPrimary }]}>{t('variantFiles')}</Text>
            <Text style={[settingsStyles.infoValue, { color: colors.textSecondary }]}>
              {t('variantFileCount', { count: fileCount })}
            </Text>
          </View>
          <View style={[settingsStyles.infoRow, { borderBottomColor: colors.border }]}>
            <Text style={[settingsStyles.infoLabel, { color: colors.textPrimary }]}>{t('diskUsage')}</Text>
            <Text style={[settingsStyles.infoValue, { color: colors.textSecondary }]}>
              {formatBytes(totalBytes)}
            </Text>
          </View>
          <View style={[settingsStyles.infoRow, { borderBottomColor: colors.border }]}>
            <Text style={[settingsStyles.infoLabel, { color: colors.textPrimary }]}>
              {t('incompleteImages')}
            </Text>
            <Text
              style={[
                settingsStyles.infoValue,
                { color: incompleteCount > 0 ? colors.red : colors.textSecondary },
              ]}
            >
              {incompleteCount}
            </Text>
          </View>
          <Pressable
            onPress={() => setSheetVisible(true)}
            style={({ pressed }) => [
              settingsStyles.infoRow,
              { borderBottomColor: colors.border },
              pressed && settingsStyles.pressed,
            ]}
          >
            <Text style={[settingsStyles.infoLabel, { color: colors.textPrimary }]}>{t('concurrentDownloads')}</Text>
            <Text style={[settingsStyles.infoValue, { color: colors.primary }]}>
              {maxConcurrentImageDownloads}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/image-cache-browser')}
            style={({ pressed }) => [
              settingsStyles.navRow,
              { borderTopColor: colors.border },
              pressed && settingsStyles.pressed,
            ]}
          >
            <View style={settingsStyles.navRowLeft}>
              <Ionicons name="images-outline" size={18} color={colors.textPrimary} />
              <Text style={[settingsStyles.navRowText, { color: colors.textPrimary }]}>{t('browseImageCache')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </Pressable>
          <View style={settingsStyles.actionRow}>
            <Pressable
              onPress={handleImageScan}
              disabled={imageScanning}
              style={({ pressed }) => [
                settingsStyles.actionRowButton,
                { borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth },
                pressed && !imageScanning && settingsStyles.pressed,
                imageScanning && settingsStyles.disabled,
              ]}
            >
              {imageScanning ? (
                <ActivityIndicator size="small" color={colors.textPrimary} />
              ) : (
                <Ionicons name="search-outline" size={18} color={colors.textPrimary} />
              )}
              <Text style={[settingsStyles.actionRowButtonText, { color: colors.textPrimary }]}>
                {t('scan')}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleRefreshAllCovers}
              disabled={offlineMode || recacheActive}
              style={({ pressed }) => [
                settingsStyles.actionRowButton,
                { backgroundColor: colors.primary },
                pressed && !offlineMode && !recacheActive && settingsStyles.pressed,
                (offlineMode || recacheActive) && settingsStyles.disabled,
              ]}
            >
              <Ionicons name="refresh-outline" size={18} color="#fff" />
              <Text style={[settingsStyles.actionRowButtonText, { color: '#fff' }]}>
                {t('refresh')}
              </Text>
            </Pressable>
          </View>
          {recacheActive && (
            <View style={styles.refreshCycleContainer}>
              <Text style={[styles.refreshCycleHeader, { color: colors.textPrimary }]}>
                {recachePaused
                  ? t('imageCachePausedProgress', {
                      processed: recacheProcessed,
                      total: recacheTotal,
                    })
                  : recacheScope === 'refresh-all'
                  ? t('refreshingAllCachedCovers', {
                      processed: recacheProcessed,
                      total: recacheTotal,
                    })
                  : t('refreshingDownloadedMusicCovers', {
                      processed: recacheProcessed,
                      total: recacheTotal,
                    })}
              </Text>
              <View style={settingsStyles.actionRow}>
                <Pressable
                  onPress={recachePaused ? resumeImageQueue : pauseImageQueue}
                  style={({ pressed }) => [
                    settingsStyles.actionRowButton,
                    { borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth },
                    pressed && settingsStyles.pressed,
                  ]}
                >
                  <Ionicons
                    name={recachePaused ? 'play' : 'pause'}
                    size={18}
                    color={colors.textPrimary}
                  />
                  <Text style={[settingsStyles.actionRowButtonText, { color: colors.textPrimary }]}>
                    {recachePaused ? t('resume') : t('pause')}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={cancelImageRefreshCycle}
                  style={({ pressed }) => [
                    settingsStyles.actionRowButton,
                    { borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth },
                    pressed && settingsStyles.pressed,
                  ]}
                >
                  <Ionicons name="close" size={18} color={colors.textPrimary} />
                  <Text style={[settingsStyles.actionRowButtonText, { color: colors.textPrimary }]}>
                    {t('cancel')}
                  </Text>
                </Pressable>
              </View>
              {recacheFailed > 0 && (
                <Pressable
                  onPress={retryFailedImages}
                  style={({ pressed }) => [
                    styles.retryFailedRow,
                    pressed && settingsStyles.pressed,
                  ]}
                >
                  <Ionicons name="reload-outline" size={16} color={colors.primary} />
                  <Text style={[styles.retryFailedText, { color: colors.primary }]}>
                    {t('retryFailedCount', { count: recacheFailed })}
                  </Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      </View>

      <Modal
        visible={sheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSheetVisible(false)}
      >
        <Pressable
          style={settingsStyles.sheetBackdrop}
          onPress={() => setSheetVisible(false)}
        />
        <View
          style={[
            settingsStyles.sheet,
            { backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          <View style={[settingsStyles.sheetHandle, { backgroundColor: colors.border }]} />
          <Text style={[settingsStyles.sheetTitle, { color: colors.textPrimary }]}>
            {t('concurrentImageDownloads')}
          </Text>
          <Text style={[settingsStyles.sheetHint, { color: colors.textSecondary }]}>
            {t('concurrentImageDownloadsHint')}
          </Text>
          {IMAGE_CONCURRENT_OPTIONS.map((opt) => (
            <Pressable
              key={opt}
              onPress={() => handleConcurrentSelect(opt)}
              style={({ pressed }) => [
                settingsStyles.sheetOption,
                pressed && settingsStyles.pressed,
              ]}
            >
              <Text style={[settingsStyles.sheetOptionLabel, { color: colors.textPrimary }]}>
                {t('imageCount', { count: opt })}
              </Text>
              {maxConcurrentImageDownloads === opt && (
                <Ionicons name="checkmark" size={22} color={colors.primary} />
              )}
            </Pressable>
          ))}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  refreshCycleContainer: {
    marginTop: 12,
    gap: 8,
  },
  refreshCycleHeader: {
    fontSize: 14,
    fontWeight: '600',
  },
  retryFailedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  retryFailedText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
