import Ionicons from "@react-native-vector-icons/ionicons/static";
import { FlashList } from '@shopify/flash-list';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';

import { DiscoverEntityRow, DiscoverTrackRow } from './DiscoverRows';
import { EmptyState } from './EmptyState';
import { SegmentControl } from './SegmentControl';
import { useDiscoverActions } from '../hooks/useDiscoverActions';
import { useTheme } from '../hooks/useTheme';
import {
  searchDiscover,
  type DiscoverSearchResult,
  type DiscoverSearchType,
} from '../services/discoverService';

const TYPE_KEYS = [
  { key: 'track', labelKey: 'songs' },
  { key: 'album', labelKey: 'albums' },
  { key: 'artist', labelKey: 'artists' },
] as const;

const SEARCH_DEBOUNCE_MS = 400;

type ResultItem = DiscoverSearchResult['items'][number];

/** Deezer search (tracks / albums / artists) inside the Discover tab. */
export function DiscoverSearch({ topInset, playingId }: { topInset: number; playingId: number | null }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { handlePreview, handleTrackDownload, handleAlbumDownload, handleOpen } = useDiscoverActions();
  const [text, setText] = useState('');
  const [type, setType] = useState<DiscoverSearchType>('track');
  const [result, setResult] = useState<DiscoverSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const types = useMemo(() => TYPE_KEYS.map((k) => ({ key: k.key, label: t(k.labelKey) })), [t]);
  const query = text.trim();

  useEffect(() => {
    if (!query) {
      setResult(null);
      setFailed(false);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      setLoading(true);
      void searchDiscover(query, type).then((res) => {
        if (!alive) return;
        setResult(res);
        setFailed(!res);
        setLoading(false);
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, type]);

  const renderItem = useCallback(
    ({ item }: { item: ResultItem }) =>
      item.type === 'track' ? (
        <DiscoverTrackRow
          item={item}
          playing={item.id === playingId}
          onPreview={handlePreview}
          onDownload={handleTrackDownload}
        />
      ) : (
        <DiscoverEntityRow item={item} onOpen={handleOpen} onDownload={handleAlbumDownload} />
      ),
    [playingId, handlePreview, handleTrackDownload, handleAlbumDownload, handleOpen],
  );

  let empty = null;
  if (loading) empty = <ActivityIndicator style={styles.spinner} color={colors.primary} />;
  else if (failed) empty = <EmptyState icon="cloud-offline-outline" title={t('discoverLoadFailed')} subtitle={t('discoverLoadFailedHint')} />;
  else if (!query) empty = <EmptyState icon="search" title={t('discoverSearchHint')} />;
  else if (result) empty = <EmptyState icon="search" title={t('discoverNoResults')} />;

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={[styles.inputRow, { backgroundColor: colors.inputBg }]}>
        <Ionicons name="search" size={18} color={colors.textSecondary} />
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={t('discoverSearchPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          style={[styles.input, { color: colors.textPrimary }]}
          accessibilityLabel={t('discoverSearchPlaceholder')}
        />
      </View>
      <SegmentControl segments={types} selected={type} onSelect={setType} />
      <FlashList
        data={query && result?.type === type ? result.items : []}
        keyExtractor={(item) => `${item.type}-${item.id}`}
        renderItem={renderItem}
        extraData={playingId}
        drawDistance={400}
        keyboardShouldPersistTaps="handled"
        maintainVisibleContentPosition={{ disabled: true }}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={empty}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 4,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  input: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 15,
  },
  listContent: {
    paddingBottom: 32,
  },
  spinner: {
    marginTop: 32,
  },
});
