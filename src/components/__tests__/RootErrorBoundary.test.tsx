import { render, fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';

import { RootErrorBoundary } from '../RootErrorBoundary';
import { darkTheme } from '../../constants/theme';

function Boom(): null {
  throw new Error('boom');
}

describe('RootErrorBoundary', () => {
  it('renders children when there is no error', () => {
    const { getByText } = render(
      <RootErrorBoundary colors={darkTheme}>
        <Text>child content</Text>
      </RootErrorBoundary>,
    );
    expect(getByText('child content')).toBeTruthy();
  });

  it('shows the fallback on a render throw and recovers on retry', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { getByText, queryByText, rerender } = render(
      <RootErrorBoundary colors={darkTheme}>
        <Boom />
      </RootErrorBoundary>,
    );

    expect(getByText('Something went wrong')).toBeTruthy();
    expect(getByText('boom')).toBeTruthy();

    // Swap in a non-throwing child, then retry — the boundary resets and
    // renders the recovered tree.
    rerender(
      <RootErrorBoundary colors={darkTheme}>
        <Text>recovered</Text>
      </RootErrorBoundary>,
    );
    fireEvent.press(getByText('Try again'));

    expect(queryByText('Something went wrong')).toBeNull();
    expect(getByText('recovered')).toBeTruthy();
    spy.mockRestore();
  });
});
