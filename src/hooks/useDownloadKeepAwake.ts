import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect } from 'react';

import { musicCacheStore } from '../store/musicCacheStore';

const TAG = 'downloads';

export function useDownloadKeepAwake() {
  const hasActiveDownloads = musicCacheStore((s) =>
    s.downloadQueue.some((q) => q.status === 'queued' || q.status === 'downloading')
  );

  useEffect(() => {
    if (hasActiveDownloads) {
      activateKeepAwakeAsync(TAG).catch(() => { /* activity may be unavailable */ });
    } else {
      deactivateKeepAwake(TAG).catch(() => { /* activity may be unavailable */ });
    }
    return () => {
      deactivateKeepAwake(TAG).catch(() => { /* activity may be unavailable during backgrounding */ });
    };
  }, [hasActiveDownloads]);
}
