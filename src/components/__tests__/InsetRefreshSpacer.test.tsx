import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: {
      View,
    },
    useSharedValue: (init: number) => ({ value: init }),
    useAnimatedStyle: (fn: () => object) => fn(),
    interpolate: (value: number, input: number[], output: number[]) => {
      // Simple linear interpolation for testing
      if (value <= input[0]) return output[0];
      if (value >= input[input.length - 1]) return output[output.length - 1];
      return output[0];
    },
  };
});

// Must import after mocks
const { InsetRefreshSpacer } = require('../InsetRefreshSpacer');

describe('InsetRefreshSpacer', () => {
  it('renders with the given height', () => {
    const scrollY = { value: 0 };
    const { toJSON } = render(
      <InsetRefreshSpacer height={80} refreshing={false} scrollY={scrollY} color="#1D9BF0" />
    );
    const root = toJSON() as import('react-test-renderer').ReactTestRendererJSON;
    const flatStyle = Array.isArray(root.props.style)
      ? Object.assign({}, ...root.props.style.filter(Boolean))
      : root.props.style;
    expect(flatStyle.height).toBe(80);
  });

  it('renders an ActivityIndicator with the given color', () => {
    const scrollY = { value: 0 };
    const { UNSAFE_getByType } = render(
      <InsetRefreshSpacer height={80} refreshing={true} scrollY={scrollY} color="#FF0000" />
    );
    const { ActivityIndicator } = require('react-native');
    const indicator = UNSAFE_getByType(ActivityIndicator);
    expect(indicator.props.color).toBe('#FF0000');
  });

  it('renders without crashing when not refreshing', () => {
    const scrollY = { value: 0 };
    const { toJSON } = render(
      <InsetRefreshSpacer height={60} refreshing={false} scrollY={scrollY} color="#1D9BF0" />
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders without crashing when refreshing', () => {
    const scrollY = { value: 0 };
    const { toJSON } = render(
      <InsetRefreshSpacer height={60} refreshing={true} scrollY={scrollY} color="#1D9BF0" />
    );
    expect(toJSON()).toBeTruthy();
  });

  it('uses different heights', () => {
    const scrollY = { value: 0 };
    const { toJSON: json1 } = render(
      <InsetRefreshSpacer height={100} refreshing={false} scrollY={scrollY} color="#1D9BF0" />
    );
    const { toJSON: json2 } = render(
      <InsetRefreshSpacer height={50} refreshing={false} scrollY={scrollY} color="#1D9BF0" />
    );
    const root1 = json1() as import('react-test-renderer').ReactTestRendererJSON;
    const root2 = json2() as import('react-test-renderer').ReactTestRendererJSON;
    const style1 = Array.isArray(root1.props.style)
      ? Object.assign({}, ...root1.props.style.filter(Boolean))
      : root1.props.style;
    const style2 = Array.isArray(root2.props.style)
      ? Object.assign({}, ...root2.props.style.filter(Boolean))
      : root2.props.style;
    expect(style1.height).toBe(100);
    expect(style2.height).toBe(50);
  });

  it('container has correct layout styles', () => {
    const scrollY = { value: 0 };
    const { toJSON } = render(
      <InsetRefreshSpacer height={80} refreshing={false} scrollY={scrollY} color="#1D9BF0" />
    );
    const root = toJSON() as import('react-test-renderer').ReactTestRendererJSON;
    const flatStyle = Array.isArray(root.props.style)
      ? Object.assign({}, ...root.props.style.filter(Boolean))
      : root.props.style;
    expect(flatStyle.justifyContent).toBe('flex-end');
    expect(flatStyle.alignItems).toBe('center');
    expect(flatStyle.paddingBottom).toBe(12);
  });
});
