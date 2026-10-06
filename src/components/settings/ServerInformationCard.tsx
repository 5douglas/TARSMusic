import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';

import { useTheme } from '../../hooks/useTheme';
import { settingsStyles } from '../../styles/settingsStyles';
import { serverInfoStore } from '../../store/serverInfoStore';
import { InfoRow } from '../InfoRow';
import { SettingsSectionTitle } from './SettingsSectionTitle';

export function ServerInformationCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const serverInfo = serverInfoStore(
    useShallow((s) => ({
      serverType: s.serverType,
      serverVersion: s.serverVersion,
      apiVersion: s.apiVersion,
      openSubsonic: s.openSubsonic,
      extensions: s.extensions,
    }))
  );

  const hasAnyInfo =
    serverInfo.serverType != null ||
    serverInfo.serverVersion != null ||
    serverInfo.apiVersion != null ||
    serverInfo.extensions.length > 0;

  return (
    <View style={settingsStyles.section}>
      <SettingsSectionTitle>{t('serverInformation')}</SettingsSectionTitle>
      {hasAnyInfo ? (
        <View style={[settingsStyles.card, settingsStyles.cardPadded, { backgroundColor: colors.card }]}>
          <InfoRow
            label={t('serverType')}
            value={serverInfo.serverType ?? (serverInfo.apiVersion != null ? 'Subsonic' : null)}
            labelColor={colors.textPrimary}
            valueColor={colors.textSecondary}
            borderColor={colors.border}
          />
          <InfoRow
            label={t('serverVersion')}
            value={serverInfo.serverVersion}
            labelColor={colors.textPrimary}
            valueColor={colors.textSecondary}
            borderColor={colors.border}
          />
          <InfoRow
            label={t('apiVersion')}
            value={serverInfo.apiVersion}
            labelColor={colors.textPrimary}
            valueColor={colors.textSecondary}
            borderColor={colors.border}
          />
          <View style={[settingsStyles.infoRow, { borderBottomColor: colors.border }]}>
            <Text style={[settingsStyles.infoLabel, { color: colors.textPrimary }]}>{t('openSubsonic')}</Text>
            <Text style={[settingsStyles.infoValue, { color: colors.textSecondary }]}>
              {serverInfo.openSubsonic ? t('yes') : t('no')}
            </Text>
          </View>
          {serverInfo.extensions.length > 0 && (
            <View style={[styles.extensionsBlock, { borderTopColor: colors.border }]}>
              <Text style={[styles.extensionsTitle, { color: colors.label }]}>
                {t('supportedExtensions')}
              </Text>
              {serverInfo.extensions.map((ext) => (
                <View key={ext.name} style={styles.extensionRow}>
                  <Text style={[styles.extensionName, { color: colors.textPrimary }]}>
                    {ext.name}
                  </Text>
                  <Text style={[styles.extensionVersions, { color: colors.textSecondary }]}>
                    v{ext.versions?.join(', ') ?? '—'}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      ) : (
        <Text style={[styles.placeholder, { color: colors.textSecondary }]}>
          {t('noServerInfoAvailable')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  extensionsBlock: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  extensionsTitle: { fontSize: 12, marginBottom: 8 },
  extensionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  extensionName: { fontSize: 14 },
  extensionVersions: { fontSize: 12 },
  placeholder: { fontSize: 16, fontStyle: 'italic', padding: 16 },
});
