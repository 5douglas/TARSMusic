import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  playbackSettingsStore,
  CROSSFADE_DURATIONS_MS,
  type CrossfadeDurationMs,
} from '../../store/playbackSettingsStore';
import { applyPlaybackMode } from '../../services/playerService';
import { DropdownRow, type DropdownOption } from './DropdownRow';
import { SettingsToggleCard } from './SettingsToggleCard';

/**
 * Song transition: a plain on/off switch for crossfade (off = gapless), with the
 * crossfade length shown only while it is on.
 */
export function PlaybackModeCard() {
  const { t } = useTranslation();
  const mode = playbackSettingsStore((s) => s.playbackMode);
  const durationMs = playbackSettingsStore((s) => s.crossfadeDurationMs);
  const setMode = playbackSettingsStore((s) => s.setPlaybackMode);
  const setDuration = playbackSettingsStore((s) => s.setCrossfadeDurationMs);

  const isCrossfade = mode === 'crossfade';

  const durationOptions: DropdownOption<CrossfadeDurationMs>[] = useMemo(
    () => CROSSFADE_DURATIONS_MS.map((ms) => ({ value: ms, label: t('secondsValue', { count: ms / 1000 }) })),
    [t],
  );

  const handleToggle = useCallback(
    (on: boolean) => {
      setMode(on ? 'crossfade' : 'gapless');
      void applyPlaybackMode();
    },
    [setMode],
  );

  const handleDurationChange = useCallback(
    (value: CrossfadeDurationMs) => {
      setDuration(value);
      void applyPlaybackMode();
    },
    [setDuration],
  );

  return (
    <SettingsToggleCard
      title={t('songTransitionTitle')}
      toggles={[
        {
          key: 'crossfade',
          label: t('crossfadeToggle'),
          hint: t('crossfadeToggleHint'),
          value: isCrossfade,
          onChange: handleToggle,
        },
      ]}
      footer={
        isCrossfade ? (
          <DropdownRow
            label={t('crossfadeDuration')}
            value={durationMs}
            options={durationOptions}
            onChange={handleDurationChange}
            isLast
          />
        ) : null
      }
    />
  );
}
