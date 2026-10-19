import Ionicons from "@react-native-vector-icons/ionicons/static";
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useIsFocused } from "expo-router/react-navigation";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { EmptyState } from '../components/EmptyState';
import { SegmentControl } from '../components/SegmentControl';
import { useTheme } from '../hooks/useTheme';
import { stopDiscoverPreview, toggleDiscoverPreview } from '../services/discoverPreviewService';
import {
  fetchDiscoverPlaylist,
  queueDiscoverDownload,
  type DiscoverItem,
  type DiscoverPlaylist,
  type DiscoverPlaylistKind,
} from '../services/discoverService';
import { discoverPreviewStore } from '../store/discoverPreviewStore';
import { discoverSettingsStore } from '../store/discoverSettingsStore';
import { playbackToastStore } from '../store/playbackToastStore';
import { searchStore } from '../store/searchStore';
import { themedAlertStore } from '../store/themedAlertStore';
import { formatTrackDuration } from '../utils/formatters';

const SEGMENT_KEYS = [
  { key: 'new-releases', labelKey: 'discoverNewReleases' },
  { key: 'recommended', labelKey: 'discoverForYou' },
  { key: 'charts-br', labelKey: 'discoverTopBrazil' },
  { key: 'charts-global', labelKey: 'discoverTopGlobal' },
] as const;

const SEGMENT_HEIGHT = 52;

/* ------------------------------------------------------------------ */
/*  Row                                                               */
/* ------------------------------------------------------------------ */

const DiscoverRow = memo(function DiscoverRow({
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
          {item.in_library && (
            <Text style={[styles.badge, { color: colors.green, borderColor: colors.green }]}>
              {t('discoverInLibrary')}
            </Text>
          )}
          {detail != null && (
            <Text style={[styles.detail, { color: colors.textSecondary }]} numberOfLines={1}>
              {detail}
            </Text>
          )}
        </View>
      </View>
      <Pressable
        onPress={() => onDownload(item, false)}
        onLongPress={item.album_link ? () => onDownload(item, true) : undefined}
        hitSlop={8}
        style={({ pressed }) => [styles.downloadButton, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={t('discoverDownload')}
        accessibilityHint={item.album_link ? t('discoverDownloadHint') : undefined}
      >
        <Ionicons name="cloud-download-outline" size={24} color={colors.primary} />
      </Pressable>
    </View>
  );
});

/* ------------------------------------------------------------------ */
/*  Connection form                                                   */
/* ------------------------------------------------------------------ */

function DiscoverConnectionForm({ topInset }: { topInset: number }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [url, setUrl] = useState(discoverSettingsStore.getState().baseUrl ?? '');
  const [token, setToken] = useState('');

  const inputStyle = [styles.input, { color: colors.textPrimary, backgroundColor: colors.inputBg }];
  return (
    <View style={[styles.form, { paddingTop: topInset + 16 }]}>
      <Text style={[styles.formTitle, { color: colors.textPrimary }]}>{t('discoverConnectTitle')}</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('discoverConnectHint')}</Text>
      <TextInput
        value={url}
        onChangeText={setUrl}
        placeholder="https://discover.example.com"
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        style={inputStyle}
        accessibilityLabel={t('discoverServerUrl')}
      />
      <TextInput
        value={token}
        onChangeText={setToken}
        placeholder={t('discoverToken')}
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        style={inputStyle}
        accessibilityLabel={t('discoverToken')}
      />
      <Pressable
        onPress={() => discoverSettingsStore.getState().setConnection(url, token)}
        disabled={!url.trim() || !token.trim()}
        style={({ pressed }) => [
          styles.saveButton,
          { backgroundColor: colors.primary },
          (pressed || !url.trim() || !token.trim()) && styles.pressed,
        ]}
        accessibilityRole="button"
      >
        <Text style={styles.saveLabel}>{t('save')}</Text>
      </Pressable>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  DiscoverScreen                                                    */
/* ------------------------------------------------------------------ */

export function DiscoverScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const isFocused = useIsFocused();
  const headerHeight = searchStore((s) => s.headerHeight);
  const baseUrl = discoverSettingsStore((s) => s.baseUrl);
  const token = discoverSettingsStore((s) => s.token);
  const playingId = discoverPreviewStore((s) => s.playingId);
  const configured = !!baseUrl && !!token;

  const [segment, setSegment] = useState<DiscoverPlaylistKind>('new-releases');
  const [playlists, setPlaylists] = useState<Partial<Record<DiscoverPlaylistKind, DiscoverPlaylist>>>({});
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const segments = useMemo(
    () => SEGMENT_KEYS.map((s) => ({ key: s.key, label: t(s.labelKey) })),
    [t],
  );

  const load = useCallback(async (kind: DiscoverPlaylistKind, refresh: boolean) => {
    const result = await fetchDiscoverPlaylist(kind, refresh);
    if (result) setPlaylists((prev) => ({ ...prev, [kind]: result }));
    setFailed(!result);
  }, []);

  useEffect(() => {
    if (!configured || playlists[segment]) return;
    let alive = true;
    setLoading(true);
    setFailed(false);
    void load(segment, false).finally(() => {
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [configured, segment, playlists, load]);

  // Connection changed: drop playlists fetched from the previous backend.
  const connectionKey = `${baseUrl}|${token}`;
  const connectionRef = useRef(connectionKey);
  useEffect(() => {
    if (connectionRef.current === connectionKey) return;
    connectionRef.current = connectionKey;
    setPlaylists({});
  }, [connectionKey]);

  useEffect(() => {
    if (!isFocused) stopDiscoverPreview();
  }, [isFocused]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load(segment, true);
    } finally {
      setRefreshing(false);
    }
  }, [load, segment]);

  const handlePreview = useCallback((item: DiscoverItem) => {
    void toggleDiscoverPreview(item.id);
  }, []);

  const handleDownload = useCallback(
    (item: DiscoverItem, wholeAlbum: boolean) => {
      const url = wholeAlbum && item.album_link ? item.album_link : item.link;
      const name = wholeAlbum ? item.album : item.title;
      themedAlertStore.getState().show(
        wholeAlbum ? t('discoverDownloadAlbumTitle') : t('discoverDownloadTrackTitle'),
        `${name} · ${item.artist}`,
        [
          { text: t('cancel'), style: 'cancel' },
          {
            text: t('discoverDownload'),
            onPress: () => {
              void queueDiscoverDownload(url).then((ok) => {
                if (ok) playbackToastStore.getState().flashSuccess(t('discoverDownloadQueued'));
                else themedAlertStore.getState().show(t('discoverDownloadFailed'), undefined, [{ text: t('ok') }]);
              });
            },
          },
        ],
      );
    },
    [t],
  );

  const renderItem = useCallback(
    ({ item }: { item: DiscoverItem }) => (
      <DiscoverRow
        item={item}
        playing={item.id === playingId}
        onPreview={handlePreview}
        onDownload={handleDownload}
      />
    ),
    [playingId, handlePreview, handleDownload],
  );

  const contentInsetTop = headerHeight + SEGMENT_HEIGHT;

  if (!configured) {
    return <DiscoverConnectionForm topInset={headerHeight} />;
  }

  const current = playlists[segment];
  let body;
  if (!current && loading) {
    body = (
      <View style={[styles.center, { paddingTop: contentInsetTop }]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('discoverLoading')}</Text>
      </View>
    );
  } else if (!current) {
    body = (
      <View style={[styles.center, { paddingTop: contentInsetTop }]}>
        <EmptyState icon="cloud-offline-outline" title={t('discoverLoadFailed')} subtitle={failed ? t('discoverLoadFailedHint') : undefined}>
          <View style={styles.errorActions}>
            <Pressable onPress={() => void handleRefresh()} accessibilityRole="button">
              <Text style={[styles.link, { color: colors.primary }]}>{t('retry')}</Text>
            </Pressable>
            <Pressable onPress={() => discoverSettingsStore.getState().clearConnection()} accessibilityRole="button">
              <Text style={[styles.link, { color: colors.primary }]}>{t('discoverEditConnection')}</Text>
            </Pressable>
          </View>
        </EmptyState>
      </View>
    );
  } else {
    body = (
      <FlashList
        data={current.items}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        extraData={playingId}
        drawDistance={400}
        maintainVisibleContentPosition={{ disabled: true }}
        contentContainerStyle={{ paddingTop: contentInsetTop, paddingBottom: 32 }}
        ListHeaderComponent={
          current.description ? (
            <Text style={[styles.description, { color: colors.textSecondary }]}>{current.description}</Text>
          ) : null
        }
        ListEmptyComponent={<EmptyState icon="musical-notes-outline" title={t('discoverEmpty')} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            progressViewOffset={contentInsetTop}
            tintColor={colors.primary}
          />
        }
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.container}>{body}</View>
      <View style={[styles.segmentOverlay, { top: headerHeight }]}>
        <SegmentControl segments={segments} selected={segment} onSelect={setSegment} />
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles                                                            */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  segmentOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  description: {
    fontSize: 13,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 12,
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
  form: {
    flex: 1,
    paddingHorizontal: 24,
    gap: 12,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  input: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  saveButton: {
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  errorActions: {
    flexDirection: 'row',
    gap: 24,
    marginTop: 12,
  },
  link: {
    fontSize: 15,
    fontWeight: '600',
  },
});
