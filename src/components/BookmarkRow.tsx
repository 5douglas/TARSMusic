import Ionicons from "@react-native-vector-icons/ionicons/static";
import { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { MarqueeText } from './MarqueeText';
import { SwipeableRow, type SwipeAction } from './SwipeableRow';
import { useTheme } from '../hooks/useTheme';
import {
  bookmarkCurrentTrack,
  bookmarkQueuePosition,
  bookmarkTimes,
  restoreBookmark,
} from '../services/bookmarkService';
import { bookmarkSheetStore } from '../store/bookmarkSheetStore';
import { bookmarksStore, type PlayQueueBookmark } from '../store/bookmarksStore';
import { formatCompactDuration } from '../utils/formatters';
import { timeAgo } from '../utils/stringHelpers';

export const BookmarkRow = memo(function BookmarkRow({
  bookmark,
}: {
  bookmark: PlayQueueBookmark;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  // Whole-queue math walks the entire stored queue; compute once per bookmark.
  const {
    subtitle,
    tracksLabel,
    createdText,
    elapsedText,
    remainingText,
    percent,
    currentIndex,
  } = useMemo(() => {
    const cur = bookmarkCurrentTrack(bookmark);
    const pos = bookmarkQueuePosition(bookmark);
    const times = bookmarkTimes(bookmark);
    const pct = times.totalSec > 0 ? Math.round((times.elapsedSec / times.totalSec) * 100) : 0;
    return {
      subtitle: t('bookmarkSubtitle', {
        title: cur?.title ?? '',
        artist: cur?.artist ?? t('unknownArtist'),
      }),
      tracksLabel: t('trackWithCount', { count: pos.total }),
      createdText: timeAgo(bookmark.createdAt, t),
      elapsedText: formatCompactDuration(times.elapsedSec),
      remainingText: formatCompactDuration(times.remainingSec),
      percent: pct,
      currentIndex: pos.index - 1,
    };
  }, [bookmark, t]);

  const toggleExpanded = useCallback(() => setExpanded((e) => !e), []);

  const leftActions: SwipeAction[] = useMemo(
    () => [
      {
        icon: 'trash',
        color: colors.red,
        label: t('delete'),
        onPress: () => bookmarksStore.getState().removeBookmark(bookmark.id),
        removesRow: true,
      },
    ],
    [bookmark.id, colors.red, t],
  );

  const rightActions: SwipeAction[] = useMemo(
    () => [
      {
        icon: 'pencil',
        iconFamily: 'mdi' as const,
        color: colors.primary,
        label: t('rename'),
        onPress: () =>
          bookmarkSheetStore.getState().showRename(bookmark.id, bookmark.name),
      },
    ],
    [bookmark.id, bookmark.name, colors.primary, t],
  );

  return (
    <SwipeableRow
      leftActions={leftActions}
      rightActions={rightActions}
      enableFullSwipeLeft
      rowGap={8}
      onPress={() => void restoreBookmark(bookmark)}
    >
      <View style={styles.row}>
        {/* Title (marquee if long) + created time, top-right */}
        <View style={styles.headerRow}>
          <View style={styles.nameWrap}>
            <MarqueeText style={[styles.name, { color: colors.textPrimary }]}>
              {bookmark.name}
            </MarqueeText>
          </View>
          <Text style={[styles.created, { color: colors.textSecondary }]} numberOfLines={1}>
            {createdText}
          </Text>
        </View>

        {/* "Listening to X by Y" — up to two lines, then ellipsis */}
        <Text
          style={[styles.subtitle, { color: colors.textSecondary }]}
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          {subtitle}
        </Text>

        {/* Progress bar with centered %, elapsed/remaining beneath at each end */}
        <View style={styles.barWrap}>
          <View style={[styles.barTrack, { backgroundColor: colors.border }]} />
          <View
            style={[styles.barFill, { width: `${percent}%`, backgroundColor: colors.primary }]}
          />
          <View
            style={[styles.percentChip, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Text style={[styles.percentText, { color: colors.textPrimary }]}>{percent}%</Text>
          </View>
        </View>
        <View style={styles.timeRow}>
          <Text style={[styles.timeText, styles.timeLeft, { color: colors.textSecondary }]} numberOfLines={1}>
            {elapsedText}
          </Text>
          <Text style={[styles.timeText, styles.timeRight, { color: colors.textSecondary }]} numberOfLines={1}>
            {remainingText}
          </Text>
        </View>

        {/* Expandable track list — collapsed by default */}
        <Pressable
          onPress={toggleExpanded}
          style={styles.expandHeader}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={tracksLabel}
        >
          <Ionicons name="musical-notes-outline" size={14} color={colors.primary} />
          <Text style={[styles.expandLabel, { color: colors.textPrimary }]}>{tracksLabel}</Text>
          <View style={styles.expandSpacer} />
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.textSecondary}
          />
        </Pressable>

        {expanded && (
          <View style={[styles.trackList, { borderTopColor: colors.border }]}>
            {bookmark.queue.map((track, i) => {
              const isCurrent = i === currentIndex;
              return (
                <View key={`${track.id}-${i}`} style={styles.trackRow}>
                  <View style={styles.trackLeading}>
                    {isCurrent ? (
                      <Ionicons name="musical-note" size={13} color={colors.primary} />
                    ) : (
                      <Text style={[styles.trackNum, { color: colors.textSecondary }]}>
                        {i + 1}
                      </Text>
                    )}
                  </View>
                  <Text
                    style={[
                      styles.trackTitle,
                      { color: isCurrent ? colors.primary : colors.textPrimary },
                      isCurrent && styles.trackTitleCurrent,
                    ]}
                    numberOfLines={1}
                  >
                    {track.title}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </SwipeableRow>
  );
});

const styles = StyleSheet.create({
  row: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  nameWrap: {
    flex: 1,
    marginRight: 8,
    overflow: 'hidden',
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
  },
  created: {
    fontSize: 11,
    flexShrink: 0,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },
  barWrap: {
    height: 18,
    marginTop: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  barTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 9,
  },
  barFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 9,
  },
  percentChip: {
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
  },
  percentText: {
    fontSize: 11,
    fontWeight: '700',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  timeLeft: {
    flex: 1,
    textAlign: 'left',
  },
  timeRight: {
    flex: 1,
    textAlign: 'right',
  },
  timeText: {
    fontSize: 11,
  },
  expandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 4,
  },
  expandLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  expandSpacer: {
    flex: 1,
  },
  trackList: {
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
  },
  trackLeading: {
    width: 22,
    alignItems: 'center',
  },
  trackNum: {
    fontSize: 12,
  },
  trackTitle: {
    flex: 1,
    fontSize: 14,
    marginLeft: 8,
  },
  trackTitleCurrent: {
    fontWeight: '600',
  },
});
