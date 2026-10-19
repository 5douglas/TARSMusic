import Ionicons from "@react-native-vector-icons/ionicons/static";
import { Image } from 'expo-image';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../hooks/useTheme';
import { formatTrackDuration } from '../utils/formatters';

import type { DiscoverAlbum, DiscoverArtist, DiscoverItem } from '../services/discoverService';

function InLibraryBadge() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <Text style={[styles.badge, { color: colors.green, borderColor: colors.green }]}>
      {t('discoverInLibrary')}
    </Text>
  );
}

function DownloadIconButton({
  onPress,
  onLongPress,
  hint,
}: {
  onPress: () => void;
  onLongPress?: () => void;
  hint?: string;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      hitSlop={8}
      style={({ pressed }) => [styles.downloadButton, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={t('discoverDownload')}
      accessibilityHint={hint}
    >
      <Ionicons name="cloud-download-outline" size={24} color={colors.primary} />
    </Pressable>
  );
}

/** A Deezer track: tap the cover for the 30s preview, the cloud to download (long press = album). */
export const DiscoverTrackRow = memo(function DiscoverTrackRow({
  item,
  playing,
  onPreview,
  onDownload,
}: {
  item: DiscoverItem;
  playing: boolean;
  onPreview: (item: DiscoverItem) => void;
  onDownload: (item: DiscoverItem, wholeAlbum: boolean) => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const detail = item.reason ?? (item.release_date ? `${item.record_type ?? ''} ${item.release_date}`.trim() : null);

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => onPreview(item)}
        style={styles.coverWrap}
        accessibilityRole="button"
        accessibilityLabel={playing ? t('discoverStopPreview') : t('discoverPlayPreview')}
      >
        <Image source={item.cover_small ?? undefined} style={styles.cover} />
        <View style={styles.coverOverlay}>
          <Ionicons name={playing ? 'stop' : 'play'} size={20} color="#fff" />
        </View>
      </Pressable>
      <View style={styles.info}>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
          {item.position != null ? `${item.position}. ` : ''}
          {item.title}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
          {item.artist} · {item.album} · {formatTrackDuration(item.duration)}
        </Text>
        <View style={styles.metaLine}>
          {item.in_library && <InLibraryBadge />}
          {detail != null && (
            <Text style={[styles.detail, { color: colors.textSecondary }]} numberOfLines={1}>
              {detail}
            </Text>
          )}
        </View>
      </View>
      <DownloadIconButton
        onPress={() => onDownload(item, false)}
        onLongPress={item.album_link ? () => onDownload(item, true) : undefined}
        hint={item.album_link ? t('discoverDownloadHint') : undefined}
      />
    </View>
  );
});

/** A Deezer album or artist: tap to open it; albums also carry a download button. */
export const DiscoverEntityRow = memo(function DiscoverEntityRow({
  item,
  onOpen,
  onDownload,
}: {
  item: DiscoverAlbum | DiscoverArtist;
  onOpen: (item: DiscoverAlbum | DiscoverArtist) => void;
  onDownload?: (item: DiscoverAlbum) => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const subtitle =
    item.type === 'album'
      ? [item.artist, item.record_type, item.release_date?.slice(0, 4)].filter(Boolean).join(' · ')
      : t('discoverFans', { count: item.fans ?? 0 });

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => onOpen(item)}
        style={styles.openArea}
        accessibilityRole="button"
        accessibilityLabel={item.title}
      >
        <Image
          source={item.cover_small ?? undefined}
          style={[styles.cover, item.type === 'artist' && styles.round]}
        />
        <View style={styles.info}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
            {subtitle}
          </Text>
          {item.in_library && (
            <View style={styles.metaLine}>
              <InLibraryBadge />
            </View>
          )}
        </View>
      </Pressable>
      {item.type === 'album' && onDownload ? (
        <DownloadIconButton onPress={() => onDownload(item)} />
      ) : (
        <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 12,
  },
  openArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  coverWrap: {
    width: 52,
    height: 52,
    borderRadius: 4,
    overflow: 'hidden',
  },
  cover: {
    width: 52,
    height: 52,
    borderRadius: 4,
  },
  round: {
    borderRadius: 26,
  },
  coverOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 15,
    fontWeight: '500',
  },
  subtitle: {
    fontSize: 13,
  },
  metaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  badge: {
    fontSize: 10,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 6,
    overflow: 'hidden',
  },
  detail: {
    fontSize: 12,
    flexShrink: 1,
  },
  downloadButton: {
    padding: 4,
  },
  pressed: {
    opacity: 0.5,
  },
});
