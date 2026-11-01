import { useRouter } from 'expo-router';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { CachedImage } from './CachedImage';
import { LongPressable } from './LongPressable';
import { useTheme } from '../hooks/useTheme';
import { type AlbumID3 } from '../services/subsonicService';
import { moreOptionsStore } from '../store/moreOptionsStore';
import { releaseKind, releaseKindKey } from '../utils/releaseType';

const ROW_COVER = 76;
const CARD_COVER_SIZE = 300;

function useOpenRelease(album: AlbumID3) {
  const router = useRouter();
  const onPress = useCallback(() => router.push(`/album/${album.id}`), [album.id, router]);
  const onLongPress = useCallback(() => {
    moreOptionsStore.getState().show({ type: 'album', item: album });
  }, [album]);
  return { onPress, onLongPress };
}

/**
 * A release in the artist page's discography, as Spotify lists it: cover on the
 * left, title, then "Latest release · Single" or "2021 · Album".
 */
export const ReleaseRow = memo(function ReleaseRow({ album, latest }: { album: AlbumID3; latest?: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { onPress, onLongPress } = useOpenRelease(album);
  const kind = t(releaseKindKey(releaseKind(album)));
  const when = latest ? t('releaseLatest') : album.year ? String(album.year) : null;

  return (
    <LongPressable onPress={onPress} onLongPress={onLongPress}>
      <View style={styles.row}>
        <CachedImage coverArtId={album.coverArt} size={CARD_COVER_SIZE} style={styles.rowCover} resizeMode="cover" />
        <View style={styles.rowText}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
            {album.name}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
            {when ? `${when} · ${kind}` : kind}
          </Text>
        </View>
      </View>
    </LongPressable>
  );
});

/** A release as a square card, for horizontal shelves ("More by …"). */
export const ReleaseCard = memo(function ReleaseCard({ album, width }: { album: AlbumID3; width: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { onPress, onLongPress } = useOpenRelease(album);
  const kind = t(releaseKindKey(releaseKind(album)));

  return (
    <LongPressable onPress={onPress} onLongPress={onLongPress}>
      <View style={{ width }}>
        <CachedImage
          coverArtId={album.coverArt}
          size={CARD_COVER_SIZE}
          style={[styles.cardCover, { width, height: width }]}
          resizeMode="cover"
        />
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {album.name}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
          {album.year ? `${album.year} · ${kind}` : kind}
        </Text>
      </View>
    </LongPressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  rowCover: {
    width: ROW_COVER,
    height: ROW_COVER,
    borderRadius: 4,
    backgroundColor: 'rgba(128,128,128,0.12)',
  },
  rowText: {
    flex: 1,
    marginLeft: 14,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 3,
  },
  cardCover: {
    borderRadius: 4,
    backgroundColor: 'rgba(128,128,128,0.12)',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8,
  },
});
