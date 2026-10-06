import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: 'dark',
    colors: {
      background: '#121212',
      primary: '#1D9BF0',
    },
  }),
}));

jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return {
    LinearGradient: (props: Record<string, unknown>) => (
      <View testID="linear-gradient" {...props} />
    ),
  };
});

// Must import after mocks
const { GradientBackground } = require('../GradientBackground');

describe('GradientBackground', () => {
  it('renders children', () => {
    const { getByText } = render(
      <GradientBackground>
        <Text>Hello</Text>
      </GradientBackground>
    );
    expect(getByText('Hello')).toBeTruthy();
  });

  it('renders a LinearGradient overlay', () => {
    const { getByTestId } = render(
      <GradientBackground>
        <Text>Content</Text>
      </GradientBackground>
    );
    expect(getByTestId('linear-gradient')).toBeTruthy();
  });

  it('passes multi-stop opaque gradient colors for dark theme', () => {
    const { getByTestId } = render(
      <GradientBackground>
        <Text>Content</Text>
      </GradientBackground>
    );
    const gradient = getByTestId('linear-gradient');
    const colors = gradient.props.colors as string[];
    // 5 stops: opaque blends from tinted background to pure background
    expect(colors).toHaveLength(5);
    // First stop: background mixed 15% toward primary (opaque, no alpha)
    expect(colors[0]).not.toContain('00'); // not transparent
    expect(colors[0]).toHaveLength(7); // #RRGGBB, no alpha suffix
    // Last stop: pure background
    expect(colors[4]).toBe('#121212');
  });

  it('passes 5 gradient locations from 0 to 0.6', () => {
    const { getByTestId } = render(
      <GradientBackground>
        <Text>Content</Text>
      </GradientBackground>
    );
    const gradient = getByTestId('linear-gradient');
    expect(gradient.props.locations).toEqual([0, 0.12, 0.28, 0.45, 0.6]);
  });

  it('sets pointerEvents none on gradient', () => {
    const { getByTestId } = render(
      <GradientBackground>
        <Text>Content</Text>
      </GradientBackground>
    );
    const gradient = getByTestId('linear-gradient');
    expect(gradient.props.pointerEvents).toBe('none');
  });

  it('uses lower alpha for light theme', () => {
    // Override mock for this test
    const useThemeMock = require('../../hooks/useTheme').useTheme;
    const original = useThemeMock();
    jest.spyOn(require('../../hooks/useTheme'), 'useTheme').mockReturnValue({
      ...original,
      theme: 'light',
      colors: { background: '#f5f5f5', primary: '#1D9BF0' },
    });

    const { getByTestId } = render(
      <GradientBackground>
        <Text>Content</Text>
      </GradientBackground>
    );
    const gradient = getByTestId('linear-gradient');
    const colors = gradient.props.colors as string[];
    // Light theme: peak 10% mix, all opaque
    expect(colors[0]).toHaveLength(7); // #RRGGBB, no alpha suffix
    // Last stop: pure background
    expect(colors[4]).toBe('#f5f5f5');

    // Restore
    jest.restoreAllMocks();
  });

  it('accepts custom style prop', () => {
    const { toJSON } = render(
      <GradientBackground style={{ paddingTop: 20 }}>
        <Text>Content</Text>
      </GradientBackground>
    );
    const root = toJSON() as import('react-test-renderer').ReactTestRendererJSON;
    const flatStyle = Array.isArray(root.props.style)
      ? Object.assign({}, ...root.props.style.filter(Boolean))
      : root.props.style;
    expect(flatStyle.paddingTop).toBe(20);
  });
});
