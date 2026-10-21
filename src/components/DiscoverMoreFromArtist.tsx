import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { DiscoverCardTile } from './DiscoverHomeSections';
import { SectionTitle } from './SectionTitle';
import { useDiscoverActions } from '../hooks/useDiscoverActions';
import { useTheme } from '../hooks/useTheme';
import { fetchArtistMissing, type DiscoverAlbum, type DiscoverCard } from '../services/discoverService';
import { discoverSettingsStore } from '../store/discoverSettingsStore';
import { offlineModeStore } from '../store/offlineModeStore';

/**
 * Artist page row: this artist's Deezer releases the library is missing, each opening its
 * Deezer album page to preview and download. Hidden offline, without a discover server, or
 * when nothing is missing.
 */
export function DiscoverMoreFromArtist({ name, style }: { name: string; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { handleOpen } = useDiscoverActions();
  const offlineMode = offlineModeStore((s) => s.offlineMode);
  const configured = discoverSettingsStore((s) => !!s.baseUrl && !!s.token);
  const [albums, setAlbums] = useState<DiscoverAlbum[]>([]);

  useEffect(() => {
    setAlbums([]);
    if (offlineMode || !configured || !name) return;
    let alive = true;
    void fetchArtistMissing(name).then((res) => {
      if (alive && res) setAlbums(res.items);
    });
    return () => {
      alive = false;
    };
  }, [name, offlineMode, configured]);

  const renderItem = useCallback(
    ({ item }: { item: DiscoverCard }) => <DiscoverCardTile card={item} onOpen={handleOpen} />,
    [handleOpen],
  );

  if (albums.length === 0) return null;
  return (
    <View style={style}>
      <SectionTitle title={t('discoverMoreFromArtist', { artist: name })} color={colors.label} />
      <FlatList
        horizontal
        data={albums}
        keyExtractor={(a) => String(a.id)}
        renderItem={renderItem}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.carousel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  carousel: {
    gap: 12,
  },
});
