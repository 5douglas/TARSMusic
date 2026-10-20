import Ionicons from "@react-native-vector-icons/ionicons/static";
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from './EmptyState';
import { useTheme } from '../hooks/useTheme';
import {
  fetchDownloadQueue,
  runQueueAction,
  type DiscoverQueue,
  type DiscoverQueueItem,
} from '../services/discoverService';
import { themedAlertStore } from '../store/themedAlertStore';

const POLL_MS = 3000;

type Group = 'active' | 'queued' | 'failed' | 'completed';

const GROUP_TITLE_KEYS: Record<Group, string> = {
  active: 'discoverDownloading',
  queued: 'discoverQueued',
  failed: 'discoverFailed',
  completed: 'discoverCompleted',
};

type Row =
  | { kind: 'header'; key: string; group: Group; count: number }
  | { kind: 'item'; key: string; group: Group; item: DiscoverQueueItem };

function buildRows(queue: DiscoverQueue): Row[] {
  const rows: Row[] = [];
  (['active', 'queued', 'failed', 'completed'] as const).forEach((group) => {
    if (queue[group].length === 0) return;
    rows.push({ kind: 'header', key: `h-${group}`, group, count: queue.counts[group] });
    for (const item of queue[group]) rows.push({ kind: 'item', key: item.uuid, group, item });
  });
  return rows;
}

const QueueRow = memo(function QueueRow({
  item,
  group,
  onAction,
}: {
  item: DiscoverQueueItem;
  group: Group;
  onAction: (action: 'remove' | 'retry', item: DiscoverQueueItem) => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const detail =
    item.size > 1 ? t('discoverQueueProgress', { done: item.downloaded, total: item.size }) : item.type;

  return (
    <View style={styles.row}>
      <Image source={item.cover ?? undefined} style={styles.cover} />
      <View style={styles.info}>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
          {item.artist} · {detail}
        </Text>
        {group === 'active' && (
          <View style={[styles.track, { backgroundColor: colors.inputBg }]}>
            <View
              testID="queue-progress"
              style={[styles.bar, { backgroundColor: colors.primary, width: `${Math.min(100, Math.max(0, item.progress))}%` }]}
            />
          </View>
        )}
      </View>
      {group === 'failed' && (
        <Pressable onPress={() => onAction('retry', item)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('retry')}>
          <Ionicons name="refresh" size={22} color={colors.primary} />
        </Pressable>
      )}
      {group !== 'completed' && group !== 'active' && (
        <Pressable onPress={() => onAction('remove', item)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('remove')}>
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </Pressable>
      )}
      {group === 'completed' && <Ionicons name="checkmark-circle" size={22} color={colors.green} />}
    </View>
  );
});

/** The deemix download queue: progress, queued, failed (retry/remove) and recent completions. */
export function DiscoverDownloads({ topInset, active }: { topInset: number; active: boolean }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [queue, setQueue] = useState<DiscoverQueue | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const res = await fetchDownloadQueue();
    setQueue(res);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!active) return;
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [active, load]);

  const act = useCallback(
    async (action: Parameters<typeof runQueueAction>[0], uuid?: string) => {
      const ok = await runQueueAction(action, uuid);
      if (!ok) themedAlertStore.getState().show(t('discoverQueueActionFailed'), undefined, [{ text: t('ok') }]);
      await load();
    },
    [load, t],
  );

  const handleRowAction = useCallback(
    (action: 'remove' | 'retry', item: DiscoverQueueItem) => void act(action, item.uuid),
    [act],
  );

  const handleCancelAll = useCallback(() => {
    themedAlertStore.getState().show(t('discoverCancelAllTitle'), t('discoverCancelAllBody'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('discoverCancelAll'), style: 'destructive', onPress: () => void act('cancel-all') },
    ]);
  }, [act, t]);

  const rows = useMemo(() => (queue ? buildRows(queue) : []), [queue]);

  const renderItem = useCallback(
    ({ item }: { item: Row }) =>
      item.kind === 'header' ? (
        <Text style={[styles.groupTitle, { color: colors.textPrimary }]}>
          {t(GROUP_TITLE_KEYS[item.group])} ({item.count})
        </Text>
      ) : (
        <QueueRow item={item.item} group={item.group} onAction={handleRowAction} />
      ),
    [colors, t, handleRowAction],
  );

  const pending = queue ? queue.counts.active + queue.counts.queued : 0;
  const finished = queue ? queue.counts.completed + queue.counts.failed : 0;
  const actions = queue ? (
    <View style={styles.actions}>
      <Pressable
        onPress={() => void act('clear-finished')}
        disabled={finished === 0}
        style={({ pressed }) => [styles.actionButton, { backgroundColor: colors.inputBg }, (pressed || finished === 0) && styles.pressed]}
        accessibilityRole="button"
      >
        <Text style={[styles.actionLabel, { color: colors.textPrimary }]}>{t('discoverClearFinished')}</Text>
      </Pressable>
      <Pressable
        onPress={handleCancelAll}
        disabled={pending === 0}
        style={({ pressed }) => [styles.actionButton, { backgroundColor: colors.inputBg }, (pressed || pending === 0) && styles.pressed]}
        accessibilityRole="button"
      >
        <Text style={[styles.actionLabel, { color: colors.red }]}>{t('discoverCancelAll')}</Text>
      </Pressable>
    </View>
  ) : null;

  let empty;
  if (!loaded) empty = <ActivityIndicator style={styles.spinner} color={colors.primary} />;
  else if (!queue) empty = <EmptyState icon="cloud-offline-outline" title={t('discoverLoadFailed')} subtitle={t('discoverLoadFailedHint')} />;
  else empty = <EmptyState icon="cloud-download-outline" title={t('discoverQueueEmpty')} />;

  return (
    <FlashList
      data={rows}
      keyExtractor={(row) => row.key}
      getItemType={(row) => row.kind}
      renderItem={renderItem}
      drawDistance={400}
      maintainVisibleContentPosition={{ disabled: true }}
      contentContainerStyle={{ paddingTop: topInset, paddingBottom: 32 }}
      ListHeaderComponent={actions}
      ListEmptyComponent={empty}
    />
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  actionButton: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.5,
  },
  groupTitle: {
    fontSize: 17,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 12,
  },
  cover: {
    width: 44,
    height: 44,
    borderRadius: 4,
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
  track: {
    height: 4,
    borderRadius: 2,
    marginTop: 6,
    overflow: 'hidden',
  },
  bar: {
    height: 4,
  },
  spinner: {
    marginTop: 32,
  },
});
