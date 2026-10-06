import { Platform } from 'react-native';
import { useEffect, useState } from 'react';

/**
 * Workaround for facebook/react-native#56343 — on iOS Fabric the
 * RefreshControl `tintColor` and `title` props are not applied on the
 * initial mount, leaving the spinner invisible against dark backgrounds
 * until something forces it to re-render.
 *
 * Use the returned value as the `key` prop on a `<RefreshControl>` so it
 * remounts once after the first render commits. The bump is iOS-only;
 * Android always returns the stable `0` key.
 */
export function useRefreshControlKey(): number {
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    setKey(1);
  }, []);

  return key;
}
