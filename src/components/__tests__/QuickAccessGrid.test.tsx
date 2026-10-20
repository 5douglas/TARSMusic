import { fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../CachedImage', () => ({ CachedImage: () => null }));
jest.mock('../../hooks/useTheme', () => ({ useTheme: () => ({ colors: { card: '#181818', textPrimary: '#fff' } }) }));

import { QuickAccessGrid } from '../QuickAccessGrid';

const album = (i: number) => ({ id: `al-${i}`, name: `Album ${i}`, coverArt: `c-${i}` }) as never;

describe('QuickAccessGrid', () => {
  it('shows at most six tiles and opens the album', () => {
    render(<QuickAccessGrid albums={Array.from({ length: 8 }, (_, i) => album(i))} />);
    expect(screen.getByText('Album 5')).toBeTruthy();
    expect(screen.queryByText('Album 6')).toBeNull();
    fireEvent.press(screen.getByLabelText('Album 2'));
    expect(mockPush).toHaveBeenCalledWith('/album/al-2');
  });

  it('renders nothing without albums', () => {
    const { toJSON } = render(<QuickAccessGrid albums={[]} />);
    expect(toJSON()).toBeNull();
  });
});
