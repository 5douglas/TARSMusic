import { FlashList } from '@shopify/flash-list';
import { useIsFocused } from "expo-router/react-navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

import { DiscoverTrackRow } from '../components/DiscoverRows';
import { DiscoverSearch } from '../components/DiscoverSearch';
import { EmptyState } from '../components/EmptyState';
import { SegmentControl } from '../components/SegmentControl';
import { useDiscoverActions } from '../hooks/useDiscoverActions';
import { useTheme } from '../hooks/useTheme';
import { stopDiscoverPreview } from '../services/discoverPreviewService';
import {
  fetchDiscoverPlaylist,
  type DiscoverItem,
  type DiscoverPlaylist,
  type DiscoverPlaylistKind,
} from '../services/discoverService';
import { discoverPreviewStore } from '../store/discoverPreviewStore';
import { discoverSettingsStore } from '../store/discoverSettingsStore';
import { searchStore } from '../store/searchStore';

type DiscoverSegment = DiscoverPlaylistKind | 'search';

const SEGMENT_KEYS = [
  { key: 'new-releases', labelKey: 'discoverNewReleases' },
  { key: 'recommended', labelKey: 'discoverForYou' },
  { key: 'charts-br', labelKey: 'discoverTopBrazil' },
  { key: 'charts-global', labelKey: 'discoverTopGlobal' },
  { key: 'search', labelKey: 'search' },
] as const;

const SEGMENT_HEIGHT = 52;

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

  const { handlePreview, handleTrackDownload } = useDiscoverActions();
  const [segment, setSegment] = useState<DiscoverSegment>('new-releases');
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
    if (!configured || segment === 'search' || playlists[segment]) return;
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
    if (segment === 'search') return;
    setRefreshing(true);
    try {
      await load(segment, true);
    } finally {
      setRefreshing(false);
    }
  }, [load, segment]);

  const renderItem = useCallback(
    ({ item }: { item: DiscoverItem }) => (
      <DiscoverTrackRow
        item={item}
        playing={item.id === playingId}
        onPreview={handlePreview}
        onDownload={handleTrackDownload}
      />
    ),
    [playingId, handlePreview, handleTrackDownload],
  );

  const contentInsetTop = headerHeight + SEGMENT_HEIGHT;

  if (!configured) {
    return <DiscoverConnectionForm topInset={headerHeight} />;
  }

  const current = segment === 'search' ? undefined : playlists[segment];
  let body;
  if (segment === 'search') {
    body = <DiscoverSearch topInset={contentInsetTop} playingId={playingId} />;
  } else if (!current && loading) {
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
  subtitle: {
    fontSize: 13,
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
