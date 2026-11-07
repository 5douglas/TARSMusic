import Ionicons from '@react-native-vector-icons/ionicons/static';
import i18next from 'i18next';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../hooks/useTheme';
import { useThemedAlert } from '../../hooks/useThemedAlert';
import { settingsStyles } from '../../styles/settingsStyles';
import { createBackup, makeBackupIdentityKey, pruneBackups } from '../../services/backupService';
import { restoreFromServerIfNewer, uploadBackupToServer } from '../../services/serverBackupService';
import { SERVER_BACKUP_PLAYLIST_NAME } from '../../services/subsonicService';
import { authStore } from '../../store/authStore';
import { backupStore } from '../../store/backupStore';
import { RestoreBackupSheet } from './RestoreBackupSheet';
import { SettingsSectionTitle } from './SettingsSectionTitle';

const formatDate = (value: string | number) =>
  new Date(value).toLocaleString(i18next.language, { dateStyle: 'medium', timeStyle: 'short' });

/**
 * The app's own data (listening history, stats, corrections, bookmarks) is backed up to the
 * music server (serverBackupService): every 6 h and on "Back up now", and merged back after
 * sign-in. Local copies stay available for a manual restore.
 */
export function BackupRestoreCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { alert } = useThemedAlert();

  const autoBackupEnabled = backupStore((s) => s.autoBackupEnabled);
  const serverUrl = authStore((s) => s.serverUrl);
  const primaryServerUrl = authStore((s) => s.primaryServerUrl);
  const username = authStore((s) => s.username);
  // Primary slot: a failover is a different address, not a different server.
  const identityUrl = primaryServerUrl ?? serverUrl;
  const identityKey = identityUrl && username ? makeBackupIdentityKey(identityUrl, username) : null;
  const lastServerSync = backupStore((s) => (identityKey ? s.serverSyncedAt[identityKey] ?? null : null));
  const serverHost = (() => {
    try {
      return identityUrl ? new URL(identityUrl).host : null;
    } catch {
      return identityUrl;
    }
  })();

  const [busy, setBusy] = useState<'backup' | 'restore' | null>(null);
  const [localSheetVisible, setLocalSheetVisible] = useState(false);

  const handleToggleAutoBackup = useCallback(() => {
    backupStore.getState().setAutoBackupEnabled(!autoBackupEnabled);
  }, [autoBackupEnabled]);

  const handleBackUpNow = useCallback(async () => {
    setBusy('backup');
    try {
      // Merge what the server holds first, so the copy sent back to it loses nothing.
      await restoreFromServerIfNewer();
      const stem = await createBackup();
      await pruneBackups();
      const uploaded = stem ? await uploadBackupToServer(stem) : false;
      if (uploaded) alert(t('serverBackupDone'), t('serverBackupDoneMessage'));
      else alert(t('backupFailed'), t('serverBackupFailedMessage'));
    } catch {
      alert(t('backupFailed'), t('serverBackupFailedMessage'));
    } finally {
      setBusy(null);
    }
  }, [alert, t]);

  const handleRestoreFromServer = useCallback(async () => {
    setBusy('restore');
    try {
      const counts = await restoreFromServerIfNewer(true);
      if (counts) {
        alert(t('serverRestoreDone'), t('serverRestoreDoneMessage', {
          plays: counts.scrobbleCount,
          bookmarks: counts.bookmarkCount,
        }));
      } else {
        alert(t('serverRestoreNothing'), t('serverRestoreNothingMessage'));
      }
    } catch {
      alert(t('serverRestoreFailed'), t('serverBackupFailedMessage'));
    } finally {
      setBusy(null);
    }
  }, [alert, t]);

  return (
    <>
      <View style={settingsStyles.section}>
        <SettingsSectionTitle>{t('serverBackupTitle')}</SettingsSectionTitle>
        <View style={[settingsStyles.card, settingsStyles.cardPadded, { backgroundColor: colors.card }]}>
          <View style={[settingsStyles.infoRow, { borderBottomColor: colors.border }]}>
            <Text style={[settingsStyles.infoLabel, { color: colors.textPrimary }]}>{t('serverAutoBackup')}</Text>
            <Switch
              value={autoBackupEnabled}
              onValueChange={handleToggleAutoBackup}
              trackColor={{ false: colors.border, true: colors.primary }}
              accessibilityLabel={t('serverAutoBackup')}
            />
          </View>
          <View style={[settingsStyles.infoRow, { borderBottomColor: colors.border }]}>
            <Text style={[settingsStyles.infoLabel, { color: colors.textPrimary }]}>{t('serverLastBackup')}</Text>
            <Text style={[settingsStyles.infoValue, { color: colors.textSecondary }]}>
              {lastServerSync ? formatDate(lastServerSync) : t('never')}
            </Text>
          </View>
          <View style={[settingsStyles.infoRow, { borderBottomColor: colors.border }]}>
            <Text style={[settingsStyles.infoLabel, { color: colors.textPrimary }]}>{t('serverBackupWhere')}</Text>
            <Text
              style={[settingsStyles.infoValue, styles.whereValue, { color: colors.textSecondary }]}
              numberOfLines={2}
            >
              {serverHost ?? '—'}
            </Text>
          </View>
          <View style={styles.buttonRow}>
            <Pressable
              onPress={handleBackUpNow}
              disabled={busy !== null}
              style={({ pressed }) => [
                styles.actionButton,
                { backgroundColor: colors.primary },
                pressed && busy === null && settingsStyles.pressed,
              ]}
            >
              {busy === 'backup' ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
                  <Text style={styles.actionButtonText}>{t('serverBackUpNow')}</Text>
                </>
              )}
            </Pressable>
            <Pressable
              onPress={handleRestoreFromServer}
              disabled={busy !== null}
              style={({ pressed }) => [
                styles.actionButton,
                { borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth },
                pressed && busy === null && settingsStyles.pressed,
              ]}
            >
              {busy === 'restore' ? (
                <ActivityIndicator size="small" color={colors.textPrimary} />
              ) : (
                <>
                  <Ionicons name="cloud-download-outline" size={18} color={colors.textPrimary} />
                  <Text style={[styles.actionButtonText, { color: colors.textPrimary }]}>
                    {t('serverRestore')}
                  </Text>
                </>
              )}
            </Pressable>
          </View>
          <Pressable
            onPress={() => setLocalSheetVisible(true)}
            style={({ pressed }) => [styles.localLink, pressed && settingsStyles.pressed]}
          >
            <Text style={[styles.localLinkText, { color: colors.primary }]}>{t('localBackupsLink')}</Text>
          </Pressable>
        </View>
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          {t('serverBackupDescription', { playlist: SERVER_BACKUP_PLAYLIST_NAME })}
        </Text>
      </View>

      <RestoreBackupSheet visible={localSheetVisible} onClose={() => setLocalSheetVisible(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  buttonRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: 10,
  },
  actionButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  whereValue: { flexShrink: 1, textAlign: 'right' },
  localLink: { alignSelf: 'center', paddingTop: 12, paddingBottom: 2 },
  localLinkText: { fontSize: 14, fontWeight: '500' },
  description: { fontSize: 12, lineHeight: 18, marginTop: 8, marginHorizontal: 4 },
});
