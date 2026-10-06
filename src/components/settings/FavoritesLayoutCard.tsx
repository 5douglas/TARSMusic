import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons/static';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../hooks/useTheme';
import { settingsStyles } from '../../styles/settingsStyles';
import {
  layoutPreferencesStore,
  type ItemLayout,
} from '../../store/layoutPreferencesStore';
import { SettingsSectionTitle } from './SettingsSectionTitle';

const ROWS: { key: 'favSongLayout' | 'favAlbumLayout' | 'favArtistLayout'; labelKey: string }[] = [
  { key: 'favSongLayout', labelKey: 'songs' },
  { key: 'favAlbumLayout', labelKey: 'albums' },
  { key: 'favArtistLayout', labelKey: 'artists' },
];

export function FavoritesLayoutCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const favSongLayout = layoutPreferencesStore((s) => s.favSongLayout);
  const favAlbumLayout = layoutPreferencesStore((s) => s.favAlbumLayout);
  const favArtistLayout = layoutPreferencesStore((s) => s.favArtistLayout);
  const setFavSongLayout = layoutPreferencesStore((s) => s.setFavSongLayout);
  const setFavAlbumLayout = layoutPreferencesStore((s) => s.setFavAlbumLayout);
  const setFavArtistLayout = layoutPreferencesStore((s) => s.setFavArtistLayout);

  const values: Record<string, ItemLayout> = {
    favSongLayout,
    favAlbumLayout,
    favArtistLayout,
  };
  const setters: Record<string, (l: ItemLayout) => void> = {
    favSongLayout: setFavSongLayout,
    favAlbumLayout: setFavAlbumLayout,
    favArtistLayout: setFavArtistLayout,
  };

  return (
    <View style={settingsStyles.section}>
      <SettingsSectionTitle>{t('favoritesLayout')}</SettingsSectionTitle>
      <View style={styles.card}>
        {ROWS.map((row) => {
          const current = values[row.key];
          const setLayout = setters[row.key];
          return (
            <View
              key={row.key}
              style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <Text style={[styles.label, { color: colors.textPrimary }]}>{t(row.labelKey)}</Text>
              <View style={styles.icons}>
                <Pressable
                  onPress={() => setLayout('list')}
                  hitSlop={8}
                  style={({ pressed }) => pressed && settingsStyles.pressed}
                >
                  <MaterialCommunityIcons
                    name="view-list-outline"
                    size={22}
                    color={current === 'list' ? colors.primary : colors.textSecondary}
                  />
                </Pressable>
                <Pressable
                  onPress={() => setLayout('grid')}
                  hitSlop={8}
                  style={({ pressed }) => pressed && settingsStyles.pressed}
                >
                  <MaterialCommunityIcons
                    name="view-grid-outline"
                    size={22}
                    color={current === 'grid' ? colors.primary : colors.textSecondary}
                  />
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  label: { fontSize: 16 },
  icons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
});
