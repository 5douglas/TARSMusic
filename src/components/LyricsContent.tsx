import Ionicons from "@react-native-vector-icons/ionicons/static";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons/static";
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { SyncedLyricsView } from './SyncedLyricsView';
import { UnsyncedLyricsView } from './UnsyncedLyricsView';
import { useFakeLineTimings } from '../hooks/useFakeLineTimings';
import { type LyricsData } from '../services/subsonicService';
import { type LyricsErrorKind } from '../store/lyricsStore';
import { hexWithAlpha } from '../utils/colors';

export interface LyricsContentProps {
  /**
   * Key prop used by the parent to remount `SyncedLyricsView` on track change.
   * Accepted here for documentation; the parent also passes it via `key`.
   */
  trackId?: string;
  lyricsData: LyricsData | null | undefined;
  lyricsLoading: boolean;
  lyricsError?: LyricsErrorKind | null;
  onRetry?: () => void;
  /** Track duration in seconds — when provided, enables fake-timing for unsynced lyrics. */
  durationSec?: number | null;
  colors: {
    textPrimary: string;
    textSecondary: string;
    border: string;
    background: string;
  };
}

/** Skeleton placeholder rows. The first entry sits at the active-line
 *  position (upper third of the viewport); opacity ramps down from there
 *  mirroring `LyricsLineRow`'s per-line fade so the placeholder looks
 *  like the real view, just wordless. */
const SKELETON_LINES: ReadonlyArray<{ width: number; opacity: number }> = [
  { width: 0.72, opacity: 1.0 },
  { width: 0.55, opacity: 0.65 },
  { width: 0.82, opacity: 0.45 },
  { width: 0.48, opacity: 0.30 },
  { width: 0.68, opacity: 0.22 },
  { width: 0.40, opacity: 0.16 },
];

/**
 * Small pill shown above the lyrics list — indicates whether the active
 * lyrics are real synced timings ("Synced lyrics") or derived-per-duration
 * estimates ("Approximate timing"). Same layout, position, and colour
 * treatment in both cases.
 */
const LyricsModePill = memo(function LyricsModePill({
  label,
  backgroundColor,
  textColor,
}: {
  label: string;
  backgroundColor: string;
  textColor: string;
}) {
  return (
    <View style={styles.pillWrap} pointerEvents="none">
      <View style={[styles.pill, { backgroundColor }]}>
        <Text style={[styles.pillText, { color: textColor }]}>{label}</Text>
      </View>
    </View>
  );
});

export const LyricsContent = memo(function LyricsContent({
  lyricsData,
  lyricsLoading,
  lyricsError,
  onRetry,
  durationSec,
  colors,
}: LyricsContentProps) {
  const { t } = useTranslation();
  const fakeLines = useFakeLineTimings(
    lyricsData && !lyricsData.synced ? lyricsData.lines : [],
    lyricsData && !lyricsData.synced ? durationSec : null,
  );

  if (lyricsError && !lyricsLoading) {
    return (
      <View style={styles.centerBlock}>
        <Ionicons
          name="cloud-offline-outline"
          size={36}
          color={colors.textSecondary}
          style={styles.errorIcon}
        />
        <Text style={[styles.centerText, { color: colors.textSecondary }]}>
          {lyricsError === 'timeout'
            ? t('lyricsTimedOut')
            : t('lyricsFailedToLoad')}
        </Text>
        {onRetry && (
          <Pressable
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel={t('retry')}
            style={({ pressed }) => [
              styles.retryButton,
              { borderColor: hexWithAlpha(colors.border, 0.5) },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.retryButtonText, { color: colors.textPrimary }]}>
              {t('retry')}
            </Text>
          </Pressable>
        )}
      </View>
    );
  }

  if (lyricsLoading) {
    return (
      <View style={styles.skeletonWrap}>
        {/* Top spacer pushes the first "active" skeleton bar to the same
            upper-third position real lyrics use (ACTIVE_LINE_VIEWPORT_RATIO
            ≈ 0.35 in SyncedLyricsView). Opacity ramp mirrors the per-line
            fade real lyrics apply by distance from the active line. */}
        <View style={styles.skeletonTopSpacer} />
        <View style={styles.skeletonContent}>
          {SKELETON_LINES.map((spec, i) => (
            <View
              key={i}
              style={[
                styles.skeletonLine,
                {
                  width: `${spec.width * 100}%`,
                  backgroundColor: hexWithAlpha(colors.border, 0.5),
                  opacity: spec.opacity,
                },
              ]}
            />
          ))}
        </View>
      </View>
    );
  }

  if (!lyricsData || lyricsData.lines.length === 0) {
    return (
      <View style={styles.centerBlock}>
        <MaterialCommunityIcons
          name="music-note-outline"
          size={36}
          color={colors.textSecondary}
          style={styles.errorIcon}
        />
        <Text style={[styles.centerText, { color: colors.textSecondary }]}>
          {t('lyricsNotAvailable')}
        </Text>
      </View>
    );
  }

  if (lyricsData.synced) {
    return (
      <View style={styles.fakeContainer}>
        <LyricsModePill
          label={t('lyricsSynced')}
          backgroundColor={hexWithAlpha(colors.background, 0.55)}
          textColor={colors.textPrimary}
        />
        <SyncedLyricsView
          lines={lyricsData.lines}
          offsetMs={lyricsData.offsetMs}
          source="structured"
          textColor={colors.textPrimary}
          pillBackgroundColor={hexWithAlpha(colors.background, 0.55)}
        />
      </View>
    );
  }

  if (fakeLines) {
    return (
      <View style={styles.fakeContainer}>
        <LyricsModePill
          label={t('lyricsApproximateTiming')}
          backgroundColor={hexWithAlpha(colors.background, 0.55)}
          textColor={colors.textPrimary}
        />
        <SyncedLyricsView
          lines={fakeLines}
          offsetMs={lyricsData.offsetMs}
          source="fake"
          textColor={colors.textPrimary}
          pillBackgroundColor={hexWithAlpha(colors.background, 0.55)}
        />
      </View>
    );
  }

  return (
    <UnsyncedLyricsView lines={lyricsData.lines} textColor={colors.textPrimary} />
  );
});

const styles = StyleSheet.create({
  centerBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  errorIcon: {
    marginBottom: 4,
  },
  centerText: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  retryButton: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  retryButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.6,
  },
  skeletonWrap: {
    flex: 1,
  },
  skeletonTopSpacer: {
    flex: 0.35,
  },
  skeletonContent: {
    flex: 0.65,
    paddingHorizontal: 16,
    gap: 28,
  },
  skeletonLine: {
    height: 28,
    borderRadius: 6,
  },
  fakeContainer: {
    flex: 1,
  },
  pillWrap: {
    position: 'absolute',
    top: 8,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 2,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
