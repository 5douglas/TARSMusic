import { act, renderHook, waitFor } from '@testing-library/react-native';

const mockHome = jest.fn();
jest.mock('../../services/discoverService', () => ({
  fetchDiscoverHome: (...args: unknown[]) => mockHome(...args),
}));
jest.mock('../../store/persistence/kvStorage', () =>
  require('../../store/persistence/__mocks__/kvStorage'),
);

import { useDiscoverHome } from '../useDiscoverHome';
import { discoverSettingsStore } from '../../store/discoverSettingsStore';

const home = { updated: '', scanning: false, sections: [] };

beforeEach(() => {
  mockHome.mockReset();
  discoverSettingsStore.setState({ baseUrl: 'https://d.example.com', token: 'tok' });
});

describe('useDiscoverHome', () => {
  it('loads once when enabled and configured', async () => {
    mockHome.mockResolvedValue(home);
    const { result } = renderHook(() => useDiscoverHome(true));
    await waitFor(() => expect(result.current.home).toEqual(home));
    expect(mockHome).toHaveBeenCalledWith(false);
  });

  it('stays empty when disabled or unconfigured', () => {
    renderHook(() => useDiscoverHome(false));
    discoverSettingsStore.setState({ token: null });
    const { result } = renderHook(() => useDiscoverHome(true));
    expect(result.current.home).toBeNull();
    expect(mockHome).not.toHaveBeenCalled();
  });

  it('hides loaded sections while disabled', async () => {
    mockHome.mockResolvedValue(home);
    const { result, rerender } = renderHook(({ on }: { on: boolean }) => useDiscoverHome(on), { initialProps: { on: true } });
    await waitFor(() => expect(result.current.home).toEqual(home));
    rerender({ on: false });
    expect(result.current.home).toBeNull();
  });

  it('refreshes, keeping the old sections when the refresh fails', async () => {
    mockHome.mockResolvedValueOnce(home).mockResolvedValueOnce(null);
    const { result } = renderHook(() => useDiscoverHome(true));
    await waitFor(() => expect(result.current.home).toEqual(home));
    await act(async () => result.current.refresh());
    expect(mockHome).toHaveBeenLastCalledWith(true);
    expect(result.current.home).toEqual(home);
    mockHome.mockResolvedValueOnce({ ...home, scanning: true });
    await act(async () => result.current.refresh());
    expect(result.current.home?.scanning).toBe(true);
  });
});
