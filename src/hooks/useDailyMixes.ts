import { useEffect } from 'react';

import { getDailyMixes } from '../services/dailyMixService';
import { completedScrobbleStore } from '../store/completedScrobbleStore';
import { personalMixStore, type DailyMixDefinition } from '../store/personalMixStore';
import { dateKey } from '../utils/dateKey';

/**
 * Today's Daily Mixes. Yesterday's stay on screen until today's are built (once the
 * listening history has loaded), and an empty history keeps retrying as plays come in.
 */
export function useDailyMixes(): DailyMixDefinition[] {
  const mixes = personalMixStore((s) => s.dailyMixes);
  const builtFor = personalMixStore((s) => s.dailyMixDate);
  const hydrated = completedScrobbleStore((s) => s.hasHydrated);
  const totalPlays = completedScrobbleStore((s) => s.stats.totalPlays);

  const today = dateKey(Date.now());
  const upToDate = builtFor === today && mixes.length > 0;
  useEffect(() => {
    if (!hydrated || upToDate) return;
    void getDailyMixes().catch(() => { /* retried on the next play or launch */ });
  }, [hydrated, upToDate, totalPlays, today]);

  return mixes;
}
