import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../hooks/useTheme';
import { settingsStyles } from '../../styles/settingsStyles';
import { authStore } from '../../store/authStore';
import { EditServerUrlSheet } from './EditServerUrlSheet';
import { SettingsSectionTitle } from './SettingsSectionTitle';

/**
 * Server connection addresses (primary + optional secondary). Kept separate
 * from Account (identity/credentials) and Server Information (read-only facts):
 * an address is editable connection *config* — "where the server is" — not who
 * you are or what the server reports. The secondary address is consumed by the
 * Server Failover feature on the Connectivity screen (see hint).
 */
export function ServerAddressCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const serverUrl = authStore((s) => s.serverUrl);
  const primaryServerUrl = authStore((s) => s.primaryServerUrl);
  const secondaryServerUrl = authStore((s) => s.secondaryServerUrl);

  const [primaryUrlSheetVisible, setPrimaryUrlSheetVisible] = useState(false);
  const [secondaryUrlSheetVisible, setSecondaryUrlSheetVisible] = useState(false);

  return (
    <>
      <View style={settingsStyles.section}>
        <SettingsSectionTitle>{t('serverAddress')}</SettingsSectionTitle>
        <View style={[settingsStyles.card, settingsStyles.cardPadded, { backgroundColor: colors.card }]}>
          {/* Stacked rows: label and the (long) URL each get their own full-width
              line, so neither truncates into the other. */}
          <Pressable
            onPress={() => setPrimaryUrlSheetVisible(true)}
            style={({ pressed }) => [
              styles.urlRow,
              { borderBottomColor: colors.border },
              pressed && settingsStyles.pressed,
            ]}
          >
            <View style={styles.urlTextWrap}>
              <Text style={[styles.urlLabel, { color: colors.textPrimary }]}>
                {t('primaryServerUrl')}
              </Text>
              <Text
                style={[styles.urlValue, { color: colors.textSecondary }]}
                numberOfLines={1}
                ellipsizeMode="middle"
              >
                {primaryServerUrl ?? serverUrl ?? '—'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            onPress={() => setSecondaryUrlSheetVisible(true)}
            style={({ pressed }) => [styles.urlRow, pressed && settingsStyles.pressed]}
          >
            <View style={styles.urlTextWrap}>
              <Text style={[styles.urlLabel, { color: colors.textPrimary }]}>
                {t('secondaryServerUrl')}
              </Text>
              <Text
                style={[styles.urlValue, { color: colors.textSecondary }]}
                numberOfLines={1}
                ellipsizeMode="middle"
              >
                {secondaryServerUrl ?? t('notSet')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
          </Pressable>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            {t('serverAddressFailoverHint')}
          </Text>
        </View>
      </View>

      <EditServerUrlSheet
        visible={primaryUrlSheetVisible}
        onClose={() => setPrimaryUrlSheetVisible(false)}
        target="primary"
      />
      <EditServerUrlSheet
        visible={secondaryUrlSheetVisible}
        onClose={() => setSecondaryUrlSheetVisible(false)}
        target="secondary"
      />
    </>
  );
}

const styles = StyleSheet.create({
  urlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'transparent',
  },
  urlTextWrap: { flex: 1, marginRight: 12, gap: 3 },
  urlLabel: { fontSize: 16 },
  urlValue: { fontSize: 14 },
  hint: { fontSize: 12, lineHeight: 16, marginTop: 10 },
});
