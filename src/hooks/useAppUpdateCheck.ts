import { useEffect, useRef } from 'react';

import { checkForUpdate, promptUpdate } from '../services/appUpdateService';
import { runWhenIdle } from '../utils/runWhenIdle';

/**
 * Looks for a newer GitHub release once per app launch, after startup has settled and the
 * user is signed in, and offers it. Android only (`checkForUpdate` returns null elsewhere).
 */
export function useAppUpdateCheck(ready: boolean): void {
  const checkedRef = useRef(false);

  useEffect(() => {
    if (!ready || checkedRef.current) return;
    return runWhenIdle(async () => {
      checkedRef.current = true;
      const update = await checkForUpdate();
      if (update) promptUpdate(update);
    }, { timeout: 5000 });
  }, [ready]);
}
