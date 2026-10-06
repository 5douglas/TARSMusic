import React from 'react';
import { Text } from 'react-native';
import { render, act } from '@testing-library/react-native';

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: 'dark',
    colors: {
      background: '#121212',
      border: '#333333',
    },
  }),
}));

/* ------------------------------------------------------------------ */
/*  Local Reanimated mock                                              */
/*                                                                     */
/*  SplitLayout uses useSharedValue, useAnimatedStyle, withTiming,     */
/*  cancelAnimation, Easing, and Animated.View. The default jest-expo  */
/*  mock fires withTiming callbacks synchronously which would defeat   */
/*  the timer-based panelReady test, but our component does NOT use    */
/*  withTiming callbacks any more (the whole point of the fix), so a   */
/*  no-op shim is sufficient.                                          */
/* ------------------------------------------------------------------ */

jest.mock('react-native-reanimated', () => {
  const ReactRef = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View },
    // useSharedValue MUST return a stable reference across renders so that
    // useEffect dependency arrays containing it do not retrigger on every
    // render. Real Reanimated returns the same SharedValue instance.
    useSharedValue: (init: number) => {
      const ref = ReactRef.useRef({ value: init });
      return ref.current;
    },
    useAnimatedStyle: (fn: () => object) => fn(),
    withTiming: (val: number) => val,
    cancelAnimation: () => {},
    Easing: {
      out: (e: any) => e,
      in: (e: any) => e,
      inOut: (e: any) => e,
      cubic: (t: number) => t,
    },
  };
});

// Must import after mocks
const { SplitLayout } = require('../SplitLayout');

const SLIDE_DURATION = 350;

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('SplitLayout', () => {
  it('renders main content', () => {
    const { getByText } = render(
      <SplitLayout main={<Text>Main</Text>} panel={null} />
    );
    expect(getByText('Main')).toBeTruthy();
  });

  it('does not render panel when panel is null', () => {
    const { queryByText } = render(
      <SplitLayout main={<Text>Main</Text>} panel={null} />
    );
    expect(queryByText('Panel')).toBeNull();
  });

  it('renders panel content immediately when animate=false', () => {
    const { getByText } = render(
      <SplitLayout
        main={<Text>Main</Text>}
        panel={<Text>Panel</Text>}
        animate={false}
      />
    );
    expect(getByText('Panel')).toBeTruthy();
  });

  it('shows placeholder during enter animation, content after SLIDE_DURATION', () => {
    const { queryByText, getByText, rerender } = render(
      <SplitLayout
        main={<Text>Main</Text>}
        panel={null}
        panelPlaceholder={<Text>Placeholder</Text>}
      />
    );

    // Add the panel — enter animation begins
    rerender(
      <SplitLayout
        main={<Text>Main</Text>}
        panel={<Text>Panel</Text>}
        panelPlaceholder={<Text>Placeholder</Text>}
      />
    );

    // During the enter animation, the placeholder is shown and the panel
    // content has not yet been mounted.
    expect(getByText('Placeholder')).toBeTruthy();
    expect(queryByText('Panel')).toBeNull();

    // After SLIDE_DURATION the JS-side timer flips panelReady → content mounts.
    act(() => {
      jest.advanceTimersByTime(SLIDE_DURATION);
    });

    expect(getByText('Panel')).toBeTruthy();
  });

  it('mounts panel content immediately on initial render with animate=false', () => {
    const { getByText } = render(
      <SplitLayout
        main={<Text>Main</Text>}
        panel={<Text>Panel</Text>}
        panelPlaceholder={<Text>Placeholder</Text>}
        animate={false}
      />
    );

    // animate=false skips the placeholder phase entirely.
    expect(getByText('Panel')).toBeTruthy();
  });

  it('keeps panel content rendered through rapid hasPanel toggle (regression: cancelled-animation race)', () => {
    // This is the bug the fix targets: when `hasPanel` flickers
    // (e.g. queueLoading transitions during track replacement), the
    // worklet completion callback fires with `finished: false` and
    // `panelReady` would get stranded forever. Driving the transition
    // from a JS-side setTimeout immune to that race.
    const { rerender, queryByText, getByText } = render(
      <SplitLayout
        main={<Text>Main</Text>}
        panel={null}
        panelPlaceholder={<Text>Placeholder</Text>}
      />
    );

    // Begin enter animation
    rerender(
      <SplitLayout
        main={<Text>Main</Text>}
        panel={<Text>Panel</Text>}
        panelPlaceholder={<Text>Placeholder</Text>}
      />
    );

    // Mid-animation: hasPanel flips to false (the regression trigger)
    act(() => {
      jest.advanceTimersByTime(SLIDE_DURATION / 2);
    });
    rerender(
      <SplitLayout
        main={<Text>Main</Text>}
        panel={null}
        panelPlaceholder={<Text>Placeholder</Text>}
      />
    );

    // …and immediately back to true before the exit completes
    act(() => {
      jest.advanceTimersByTime(SLIDE_DURATION / 4);
    });
    rerender(
      <SplitLayout
        main={<Text>Main</Text>}
        panel={<Text>Panel</Text>}
        panelPlaceholder={<Text>Placeholder</Text>}
      />
    );

    // Still in the placeholder phase
    expect(queryByText('Panel')).toBeNull();
    expect(getByText('Placeholder')).toBeTruthy();

    // After the latest enter timer fires, panel content must mount.
    act(() => {
      jest.advanceTimersByTime(SLIDE_DURATION);
    });

    expect(getByText('Panel')).toBeTruthy();
  });

  it('unmounts panel after exit animation completes', () => {
    const { getByText, queryByText, rerender } = render(
      <SplitLayout
        main={<Text>Main</Text>}
        panel={<Text>Panel</Text>}
        animate={false}
      />
    );

    expect(getByText('Panel')).toBeTruthy();

    // Begin exit animation
    rerender(
      <SplitLayout main={<Text>Main</Text>} panel={null} animate={true} />
    );

    // During exit, the previous panel is still rendered (via lastPanelRef)
    expect(getByText('Panel')).toBeTruthy();

    // After SLIDE_DURATION the exit timer fires and the panel unmounts
    act(() => {
      jest.advanceTimersByTime(SLIDE_DURATION);
    });

    expect(queryByText('Panel')).toBeNull();
  });

  it('cancels exit unmount when panel re-appears mid-exit', () => {
    const { getByText, queryByText, rerender } = render(
      <SplitLayout
        main={<Text>Main</Text>}
        panel={<Text>Panel</Text>}
        animate={false}
      />
    );

    expect(getByText('Panel')).toBeTruthy();

    // Start exit animation
    rerender(
      <SplitLayout main={<Text>Main</Text>} panel={null} animate={true} />
    );

    // Mid-exit, re-add the panel before the unmount timer fires
    act(() => {
      jest.advanceTimersByTime(SLIDE_DURATION / 2);
    });
    rerender(
      <SplitLayout
        main={<Text>Main</Text>}
        panel={<Text>Panel</Text>}
        animate={true}
      />
    );

    // Advance well past the original exit timer — it must have been
    // cleared by the cleanup function so the panel does NOT unmount.
    act(() => {
      jest.advanceTimersByTime(SLIDE_DURATION * 2);
    });

    expect(getByText('Panel')).toBeTruthy();
    expect(queryByText('Placeholder')).toBeNull();
  });

  it('falls back to lastPanelRef during exit animation', () => {
    const { getByText, rerender } = render(
      <SplitLayout
        main={<Text>Main</Text>}
        panel={<Text>OriginalPanel</Text>}
        animate={false}
      />
    );

    expect(getByText('OriginalPanel')).toBeTruthy();

    // Start exit — panel becomes null
    rerender(
      <SplitLayout main={<Text>Main</Text>} panel={null} animate={true} />
    );

    // The original panel content remains rendered via lastPanelRef
    // until the exit timer unmounts the wrapper.
    expect(getByText('OriginalPanel')).toBeTruthy();
  });

  it('synchronously unmounts panel when transitioning to null with animate=false', () => {
    const { getByText, queryByText, rerender } = render(
      <SplitLayout
        main={<Text>Main</Text>}
        panel={<Text>Panel</Text>}
        animate={false}
      />
    );

    expect(getByText('Panel')).toBeTruthy();

    // Synchronous removal — no animation, no timer
    rerender(
      <SplitLayout main={<Text>Main</Text>} panel={null} animate={false} />
    );

    expect(queryByText('Panel')).toBeNull();
  });

  it('renders nothing for the panel slot when panelPlaceholder is omitted', () => {
    const { rerender, queryByText } = render(
      <SplitLayout main={<Text>Main</Text>} panel={null} />
    );

    rerender(
      <SplitLayout main={<Text>Main</Text>} panel={<Text>Panel</Text>} />
    );

    // No placeholder + still in enter animation → nothing in panel slot
    expect(queryByText('Panel')).toBeNull();

    act(() => {
      jest.advanceTimersByTime(SLIDE_DURATION);
    });

    expect(queryByText('Panel')).not.toBeNull();
  });
});
