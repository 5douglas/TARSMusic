import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../hooks/useTheme';
import { settingsStyles } from '../../styles/settingsStyles';
import { mbidOverrideStore } from '../../store/mbidOverrideStore';
import { SettingsSectionTitle } from './SettingsSectionTitle';

export function MetadataCorrectionsCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();

  const artistOverrideCount = mbidOverrideStore((s) =>
    Object.values(s.overrides).filter((o) => o.type === 'artist').length,
  );
  const albumOverrideCount = mbidOverrideStore((s) =>
    Object.values(s.overrides).filter((o) => o.type === 'album').length,
  );

  return (
    <View style={settingsStyles.section}>
      <SettingsSectionTitle>{t('metadataCorrections')}</SettingsSectionTitle>
      <View style={[settingsStyles.card, settingsStyles.cardPadded, { backgroundColor: colors.card }]}>
        <View style={[settingsStyles.infoRow, { borderBottomColor: colors.border }]}>
          <Text style={[settingsStyles.infoLabel, { color: colors.textPrimary }]}>{t('artistOverrides')}</Text>
          <Text style={[settingsStyles.infoValue, { color: colors.textSecondary }]}>
            {artistOverrideCount}
          </Text>
        </View>
        <View style={[settingsStyles.infoRow, { borderBottomColor: colors.border }]}>
          <Text style={[settingsStyles.infoLabel, { color: colors.textPrimary }]}>{t('albumOverrides')}</Text>
          <Text style={[settingsStyles.infoValue, { color: colors.textSecondary }]}>
            {albumOverrideCount}
          </Text>
        </View>
        <Pressable
          onPress={() => router.push('/mbid-override-browser')}
          style={({ pressed }) => [
            settingsStyles.navRow,
            { borderTopColor: colors.border },
            pressed && settingsStyles.pressed,
          ]}
        >
          <View style={settingsStyles.navRowLeft}>
            <Ionicons name="finger-print-outline" size={18} color={colors.textPrimary} />
            <Text style={[settingsStyles.navRowText, { color: colors.textPrimary }]}>
              {t('browseMbidOverrides')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </Pressable>
      </View>
    </View>
  );
}
