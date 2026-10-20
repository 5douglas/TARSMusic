import { fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({ colors: { textPrimary: '#fff', textSecondary: '#888', primary: '#1D9BF0' } }),
}));

import { DiscoverConnectHint } from '../DiscoverConnectHint';

describe('DiscoverConnectHint', () => {
  it('opens the Discover settings', () => {
    render(<DiscoverConnectHint />);
    fireEvent.press(screen.getByText('Open Discover settings'));
    expect(mockPush).toHaveBeenCalledWith('/settings-discover');
  });
});
