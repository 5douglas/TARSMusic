import Ionicons from '@react-native-vector-icons/ionicons/static';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../hooks/useTheme';
import { settingsStyles } from '../../styles/settingsStyles';
import {
  playbackSettingsStore,
  type ArtistPlayMode,
} from '../../store/playbackSettingsStore';
import { SettingsSectionTitle } from './SettingsSectionTitle';

const OPTIONS: { value: ArtistPlayMode; labelKey: string }[] = [
  { value: 'topSongs', labelKey: 'topSongs' },
  { value: 'allSongs', labelKey: 'allSongs' },
];

export function ArtistPlayModeCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const value = playbackSettingsStore((s) => s.artistPlayMode);
  const setValue = playbackSettingsStore((s) => s.setArtistPlayMode);

  return (
    <View style={settingsStyles.section}>
      <SettingsSectionTitle>{t('artistPlayMode')}</SettingsSectionTitle>
      <Text style={[styles.hint, { color: colors.textSecondary }]}>
        {t('artistPlayModeDescription')}
      </Text>
      <View style={[settingsStyles.card, { backgroundColor: colors.card }]}>
        {OPTIONS.map((opt, index) => {
          const isActive = value === opt.value;
          const isLast = index === OPTIONS.length - 1;
          return (
            <Pressable
              key={opt.value}
              onPress={() => setValue(opt.value)}
              style={({ pressed }) => [
                styles.row,
                !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                pressed && settingsStyles.pressed,
              ]}
            >
              <Text style={[styles.label, { color: colors.textPrimary }]}>{t(opt.labelKey)}</Text>
              {isActive && <Ionicons name="checkmark" size={20} color={colors.primary} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: {
    fontSize: 12,
    marginBottom: 8,
    marginLeft: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  label: { fontSize: 16 },
});
