import Ionicons from "@react-native-vector-icons/ionicons/static";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { BottomSheet } from './BottomSheet';
import { CachedImage } from './CachedImage';
import { StarRatingInput } from './StarRating';
import { useTheme } from '../hooks/useTheme';
import { setRating as setRatingApi } from '../services/subsonicService';
import { ratingStore } from '../store/ratingStore';
import { setRatingStore } from '../store/setRatingStore';
import { minDelay } from '../utils/stringHelpers';

const COVER_SIZE = 300;
const MIN_SPINNER_MS = 600;
const SUCCESS_DELAY_MS = 600;
const ERROR_DELAY_MS = 2000;

type SaveState = 'idle' | 'saving' | 'success' | 'error';

export function SetRatingSheet() {
  const visible = setRatingStore((s) => s.visible);
  const entityType = setRatingStore((s) => s.entityType);
  const entityId = setRatingStore((s) => s.entityId);
  const entityName = setRatingStore((s) => s.entityName);
  const coverArtId = setRatingStore((s) => s.coverArtId);
  const currentRating = setRatingStore((s) => s.currentRating);
  const hide = setRatingStore((s) => s.hide);

  const { colors } = useTheme();
  const { t } = useTranslation();

  const [localRating, setLocalRating] = useState(currentRating);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const prevVisible = useRef(false);
  useEffect(() => {
    if (visible && !prevVisible.current) {
      setLocalRating(currentRating);
      setSaveState('idle');
    }
    prevVisible.current = visible;
  }, [visible, currentRating]);

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  const isBusy = saveState !== 'idle' && saveState !== 'error';

  const handleClose = useCallback(() => {
    if (isBusy) return;
    hide();
  }, [isBusy, hide]);

  const handleRatingChange = useCallback((newRating: number) => {
    setLocalRating(newRating);
  }, []);

  const handleClearRating = useCallback(() => {
    setLocalRating(0);
  }, []);

  const handleDone = useCallback(async () => {
    if (!entityId || !entityType) {
      hide();
      return;
    }

    if (localRating === currentRating) {
      hide();
      return;
    }

    if (closeTimer.current) clearTimeout(closeTimer.current);
    setSaveState('saving');

    const [result] = await Promise.allSettled([
      setRatingApi(entityId, localRating),
      minDelay(MIN_SPINNER_MS),
    ]);

    if (result.status === 'fulfilled') {
      ratingStore.getState().setOverride(entityId, localRating);

      setSaveState('success');
      closeTimer.current = setTimeout(() => {
        hide();
        setSaveState('idle');
      }, SUCCESS_DELAY_MS);
    } else {
      setSaveState('error');
      closeTimer.current = setTimeout(() => {
        setSaveState('idle');
      }, ERROR_DELAY_MS);
    }
  }, [entityId, entityType, localRating, currentRating, hide]);

  const typeLabel =
    entityType === 'song'
      ? t('song')
      : entityType === 'album'
        ? t('album')
        : t('artist');

  const ratingLabel =
    localRating > 0 ? t('ratingOfFive', { rating: localRating }) : t('notRated');

  const dynamicStyles = useMemo(
    () =>
      StyleSheet.create({
        title: { color: colors.textPrimary },
        subtitle: { color: colors.textSecondary },
        ratingLabel: { color: colors.textSecondary },
        clearButton: {
          borderColor: colors.border,
        },
        clearText: { color: colors.textPrimary },
        doneButton: { backgroundColor: colors.primary },
        doneButtonSuccess: { backgroundColor: colors.green },
        doneButtonError: { backgroundColor: colors.red },
      }),
    [colors],
  );

  return (
    <BottomSheet visible={visible} onClose={handleClose} closeable={!isBusy}>
      <View style={styles.header}>
          {coverArtId && (
            <CachedImage
              coverArtId={coverArtId}
              size={COVER_SIZE}
              style={styles.coverArt}
              resizeMode="cover"
            />
          )}
          <View style={styles.headerText}>
            <Text style={[styles.title, dynamicStyles.title]} numberOfLines={1}>
              {t('rateEntity', { type: typeLabel })}
            </Text>
            <Text style={[styles.subtitle, dynamicStyles.subtitle]} numberOfLines={1}>
              {entityName}
            </Text>
          </View>
        </View>

        <View style={styles.ratingSection} pointerEvents={isBusy ? 'none' : 'auto'}>
          <StarRatingInput
            rating={localRating}
            onRatingChange={handleRatingChange}
            size={40}
            color={colors.primary}
            emptyColor={colors.primary}
          />

          <Text style={[styles.ratingLabel, dynamicStyles.ratingLabel]}>
            {ratingLabel}
          </Text>
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={handleClearRating}
            disabled={localRating === 0 || isBusy}
            style={({ pressed }) => [
              styles.clearButton,
              dynamicStyles.clearButton,
              pressed && localRating > 0 && !isBusy && styles.buttonPressed,
              (localRating === 0 || isBusy) && styles.buttonDisabled,
            ]}
          >
            <Text style={[styles.clearText, dynamicStyles.clearText]}>
              {t('clearRating')}
            </Text>
          </Pressable>

          <Pressable
            onPress={handleDone}
            disabled={isBusy}
            style={({ pressed }) => [
              styles.doneButton,
              saveState === 'success'
                ? dynamicStyles.doneButtonSuccess
                : saveState === 'error'
                  ? dynamicStyles.doneButtonError
                  : dynamicStyles.doneButton,
              pressed && !isBusy && styles.buttonPressed,
            ]}
          >
            {saveState === 'saving' ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : saveState === 'success' ? (
              <Ionicons name="checkmark" size={20} color="#fff" />
            ) : saveState === 'error' ? (
              <View style={styles.doneErrorContent}>
                <Ionicons name="alert-circle" size={20} color="#fff" />
                <Text style={styles.doneText}>
                  {t('failedToSaveTapToRetry')}
                </Text>
              </View>
            ) : (
              <Text style={styles.doneText}>{t('save')}</Text>
            )}
          </Pressable>
        </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginBottom: 16,
  },
  coverArt: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: 'rgba(128,128,128,0.12)',
    marginRight: 12,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '400',
  },
  ratingSection: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  ratingLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 8,
  },
  actions: {
    paddingHorizontal: 4,
    marginTop: 16,
    gap: 8,
    marginBottom: 8,
  },
  clearButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    height: 48,
  },
  clearText: {
    fontSize: 16,
    fontWeight: '500',
  },
  doneButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    height: 48,
  },
  doneErrorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  doneText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
