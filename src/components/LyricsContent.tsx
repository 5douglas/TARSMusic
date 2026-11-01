import Ionicons from "@react-native-vector-icons/ionicons/static";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons/static";
import { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { SyncedLyricsView } from './SyncedLyricsView';
import { UnsyncedLyricsView } from './UnsyncedLyricsView';
import { useFakeLineTimings } from '../hooks/useFakeLineTimings';
import { useLyricsTranslation } from '../hooks/useLyricsTranslation';
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

/**
 * Translate toggle in the lyrics' top corner: "Translate" turns on a translation under each
 * line (into the phone's language); "Original" turns it off again.
 */
const TranslateButton = memo(function TranslateButton({
  enabled,
  loading,
  unavailable,
  onPress,
  backgroundColor,
  textColor,
}: {
  enabled: boolean;
  loading: boolean;
  unavailable: boolean;
  onPress: () => void;
  backgroundColor: string;
  textColor: string;
}) {
  const { t } = useTranslation();
  const label = !enabled
    ? t('lyricsTranslate')
    : unavailable
      ? t('lyricsTranslationUnavailable')
      : t('lyricsShowOriginal');
  return (
    <View style={styles.translateWrap} pointerEvents="box-none">
      <Pressable
        onPress={onPress}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: enabled }}
        testID="lyrics-translate-button"
        style={({ pressed }) => [
          styles.translateButton,
          { backgroundColor },
          pressed && styles.pressed,
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={textColor} style={styles.translateSpinner} />
        ) : (
          <Ionicons name="language" size={14} color={textColor} />
        )}
        <Text style={[styles.pillText, { color: textColor }]}>{label}</Text>
      </Pressable>
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
  const translation = useLyricsTranslation(lyricsData?.lines);
  const translateButton = (
    <TranslateButton
      enabled={translation.enabled}
      loading={translation.loading}
      unavailable={translation.unavailable}
      onPress={translation.toggle}
      backgroundColor={hexWithAlpha(colors.background, 0.55)}
      textColor={colors.textPrimary}
    />
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
        {translateButton}
        <SyncedLyricsView
          lines={lyricsData.lines}
          translations={translation.translations}
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
        {translateButton}
        <SyncedLyricsView
          lines={fakeLines}
          translations={translation.translations}
          offsetMs={lyricsData.offsetMs}
          source="fake"
          textColor={colors.textPrimary}
          pillBackgroundColor={hexWithAlpha(colors.background, 0.55)}
        />
      </View>
    );
  }

  return (
    <View style={styles.fakeContainer}>
      {translateButton}
      <UnsyncedLyricsView
        lines={lyricsData.lines}
        translations={translation.translations}
        textColor={colors.textPrimary}
      />
    </View>
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
  translateWrap: {
    position: 'absolute',
    top: 4,
    right: 12,
    zIndex: 3,
  },
  translateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  translateSpinner: {
    transform: [{ scale: 0.6 }],
    width: 14,
    height: 14,
  },
});
