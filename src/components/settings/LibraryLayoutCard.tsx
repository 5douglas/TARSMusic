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

const ROWS: { key: 'songLayout' | 'albumLayout' | 'artistLayout' | 'playlistLayout'; labelKey: string }[] = [
  { key: 'songLayout', labelKey: 'songs' },
  { key: 'albumLayout', labelKey: 'albums' },
  { key: 'artistLayout', labelKey: 'artists' },
  { key: 'playlistLayout', labelKey: 'playlists' },
];

export function LibraryLayoutCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const songLayout = layoutPreferencesStore((s) => s.songLayout);
  const albumLayout = layoutPreferencesStore((s) => s.albumLayout);
  const artistLayout = layoutPreferencesStore((s) => s.artistLayout);
  const playlistLayout = layoutPreferencesStore((s) => s.playlistLayout);
  const setSongLayout = layoutPreferencesStore((s) => s.setSongLayout);
  const setAlbumLayout = layoutPreferencesStore((s) => s.setAlbumLayout);
  const setArtistLayout = layoutPreferencesStore((s) => s.setArtistLayout);
  const setPlaylistLayout = layoutPreferencesStore((s) => s.setPlaylistLayout);

  const values: Record<string, ItemLayout> = {
    songLayout,
    albumLayout,
    artistLayout,
    playlistLayout,
  };
  const setters: Record<string, (l: ItemLayout) => void> = {
    songLayout: setSongLayout,
    albumLayout: setAlbumLayout,
    artistLayout: setArtistLayout,
    playlistLayout: setPlaylistLayout,
  };

  return (
    <View style={settingsStyles.section}>
      <SettingsSectionTitle>{t('libraryLayout')}</SettingsSectionTitle>
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
