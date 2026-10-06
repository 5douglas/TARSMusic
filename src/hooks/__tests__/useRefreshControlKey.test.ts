import { renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { useRefreshControlKey } from '../useRefreshControlKey';

describe('useRefreshControlKey', () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
  });

  it('returns 1 after first mount on iOS to force a remount', () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    const { result } = renderHook(() => useRefreshControlKey());
    // useEffect runs synchronously during render in @testing-library/react-native,
    // so by the time renderHook returns, the bumped value is already exposed.
    expect(result.current).toBe(1);
  });

  it('stays at 0 on Android', () => {
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    const { result } = renderHook(() => useRefreshControlKey());
    expect(result.current).toBe(0);
  });
});
