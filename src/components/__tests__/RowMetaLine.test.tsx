/**
 * Tests for `RowMetaLine` — the shared trailing-metadata layout used by
 * every list-row component. Verifies slot reservation, conditional
 * rendering, accessibility labels, and the `tabular-nums` style on the
 * duration text.
 */

jest.mock('../../store/persistence/kvStorage', () =>
  require('../../store/persistence/__mocks__/kvStorage'),
);

jest.mock('../DownloadedIcon', () => {
  const { View } = require('react-native');
  return {
    DownloadedIcon: ({ circleColor }: { circleColor: string }) => (
      <View testID={`download-icon-${circleColor}`} />
    ),
  };
});

// Mock the full StarRating module to avoid pulling in
// react-native-reanimated worklets / gesture-handler from `StarRatingInput`,
// which the bare jest preset doesn't initialise.
jest.mock('../StarRating', () => {
  const { Text, View } = require('react-native');
  return {
    StarRatingDisplay: () => <View />,
    CompactRatingBadge: ({ rating, iconColor, textColor }: { rating: number; iconColor: string; textColor?: string }) => (
      <View>
        <Text accessibilityLabel="star-icon" testID={`badge-icon-${iconColor}`} />
        <Text accessibilityLabel="rating-digit" testID={`badge-digit-${textColor ?? iconColor}`}>{rating}</Text>
      </View>
    ),
  };
});

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    colors: {
      primary: '#1D9BF0',
      red: '#E0245E',
      orange: '#FFA500',
      partialDownload: '#FFA500',
      textPrimary: '#fff',
      textSecondary: '#888',
    },
  }),
}));

import React from 'react';
import { Text, View } from 'react-native';
import { render } from '@testing-library/react-native';

import {
  DURATION_SLOT_WIDTH,
  ICON_SLOT_WIDTH,
  RATING_SLOT_WIDTH,
  RowMetaLine,
} from '../RowMetaLine';

function findStyleEntry<T>(
  node: import('react-test-renderer').ReactTestRendererJSON,
  predicate: (entry: T) => boolean,
): T | undefined {
  const styles = Array.isArray(node.props.style)
    ? node.props.style.flat(Infinity)
    : [node.props.style];
  return styles.find((s: unknown) => s && typeof s === 'object' && predicate(s as T)) as
    | T
    | undefined;
}

function findAllByStyle<T>(
  root: import('react-test-renderer').ReactTestInstance,
  predicate: (entry: T) => boolean,
): import('react-test-renderer').ReactTestInstance[] {
  return root.findAll((n) => {
    const style = n.props.style;
    if (!style) return false;
    const list = Array.isArray(style) ? style.flat(Infinity) : [style];
    return list.some((s: unknown) => s && typeof s === 'object' && predicate(s as T));
  });
}

describe('RowMetaLine', () => {
  describe('slot reservation', () => {
    it('reserves duration slot even when durationText is absent', () => {
      const { getByTestId } = render(<RowMetaLine slots={['duration']} />);
      expect(getByTestId('rowmetaline-slot-duration')).toBeTruthy();
    });

    it('reserves heart slot even when starred is false', () => {
      const { getByTestId } = render(<RowMetaLine slots={['heart']} starred={false} />);
      expect(getByTestId('rowmetaline-slot-heart')).toBeTruthy();
    });

    it('reserves rating slot even when rating is 0', () => {
      const { getByTestId } = render(<RowMetaLine slots={['rating']} rating={0} />);
      expect(getByTestId('rowmetaline-slot-rating')).toBeTruthy();
    });

    it('does not render slots that are not listed', () => {
      const { queryByTestId } = render(<RowMetaLine slots={['duration']} starred />);
      expect(queryByTestId('rowmetaline-slot-heart')).toBeNull();
      expect(queryByTestId('rowmetaline-slot-rating')).toBeNull();
      expect(queryByTestId('rowmetaline-slot-download')).toBeNull();
    });

    it('reserves all four slots when listed', () => {
      const { getByTestId } = render(
        <RowMetaLine slots={['rating', 'download', 'heart', 'duration']} />,
      );
      expect(getByTestId('rowmetaline-slot-rating')).toBeTruthy();
      expect(getByTestId('rowmetaline-slot-download')).toBeTruthy();
      expect(getByTestId('rowmetaline-slot-heart')).toBeTruthy();
      expect(getByTestId('rowmetaline-slot-duration')).toBeTruthy();
    });

    it('exposes slot-width constants for cross-component math', () => {
      // Sanity: constants are exported and within sensible bounds for
      // 12px icons + 12-14px text. Failing this test means a subsequent
      // theme/font-size change broke the assumed footprint.
      expect(ICON_SLOT_WIDTH).toBeGreaterThanOrEqual(20);
      expect(ICON_SLOT_WIDTH).toBeLessThanOrEqual(28);
      // Without the clock icon the slot only needs room for the bounded
      // duration text — wide enough for "23h 59m" / "99:59" at 14px.
      expect(DURATION_SLOT_WIDTH).toBeGreaterThanOrEqual(40);
      expect(DURATION_SLOT_WIDTH).toBeLessThanOrEqual(64);
      // Compact `★ N` rating: ~22-32px range.
      expect(RATING_SLOT_WIDTH).toBeGreaterThanOrEqual(22);
      expect(RATING_SLOT_WIDTH).toBeLessThanOrEqual(40);
    });
  });

  describe('conditional render of slot contents', () => {
    it('renders the heart icon when starred is true', () => {
      const { getByText } = render(<RowMetaLine slots={['heart']} starred />);
      expect(getByText('heart')).toBeTruthy();
    });

    it('renders no heart icon when starred is false', () => {
      const { queryByText } = render(<RowMetaLine slots={['heart']} starred={false} />);
      expect(queryByText('heart')).toBeNull();
    });

    it('renders the complete download icon for downloadStatus="complete"', () => {
      const { getByTestId, queryByTestId } = render(
        <RowMetaLine slots={['download']} downloadStatus="complete" />,
      );
      expect(getByTestId('download-icon-#1D9BF0')).toBeTruthy();
      expect(queryByTestId('download-icon-#FFA500')).toBeNull();
    });

    it('renders the partial download icon for downloadStatus="partial"', () => {
      const { getByTestId, queryByTestId } = render(
        <RowMetaLine slots={['download']} downloadStatus="partial" />,
      );
      expect(getByTestId('download-icon-#FFA500')).toBeTruthy();
      expect(queryByTestId('download-icon-#1D9BF0')).toBeNull();
    });

    it('renders nothing in the download slot for downloadStatus="none"', () => {
      const { queryByTestId } = render(
        <RowMetaLine slots={['download']} downloadStatus="none" />,
      );
      expect(queryByTestId('download-icon-#1D9BF0')).toBeNull();
      expect(queryByTestId('download-icon-#FFA500')).toBeNull();
    });

    it('renders the compact rating glyph when rating > 0', () => {
      const { getByText, getByLabelText } = render(<RowMetaLine slots={['rating']} rating={4} />);
      expect(getByLabelText('star-icon')).toBeTruthy();
      expect(getByText('4')).toBeTruthy();
    });

    it('renders no rating glyph when rating is 0', () => {
      const { queryByLabelText } = render(<RowMetaLine slots={['rating']} rating={0} />);
      expect(queryByLabelText('star-icon')).toBeNull();
    });

    it('renders the duration text when durationText is provided (no clock icon)', () => {
      const { getByText, queryByText } = render(
        <RowMetaLine slots={['duration']} durationText="1h15m" />,
      );
      expect(getByText('1h15m')).toBeTruthy();
      // Clock icon was dropped to widen the title column on song/track rows.
      expect(queryByText('time-outline')).toBeNull();
    });

    it('renders nothing in the duration slot when durationText is absent', () => {
      const { queryByText } = render(<RowMetaLine slots={['duration']} />);
      expect(queryByText('time-outline')).toBeNull();
    });
  });

  describe('duration text styling', () => {
    it('applies tabular-nums fontVariant', () => {
      const { getByText } = render(
        <RowMetaLine slots={['duration']} durationText="10:05" />,
      );
      const text = getByText('10:05');
      const styles = Array.isArray(text.props.style)
        ? text.props.style.flat(Infinity)
        : [text.props.style];
      const hasTabularNums = styles.some(
        (s: unknown) =>
          s &&
          typeof s === 'object' &&
          Array.isArray((s as { fontVariant?: string[] }).fontVariant) &&
          (s as { fontVariant: string[] }).fontVariant.includes('tabular-nums'),
      );
      expect(hasTabularNums).toBe(true);
    });

    it('right-aligns the duration text', () => {
      const { getByText } = render(
        <RowMetaLine slots={['duration']} durationText="10:05" />,
      );
      const text = getByText('10:05');
      const styles = Array.isArray(text.props.style)
        ? text.props.style.flat(Infinity)
        : [text.props.style];
      const rightAligned = styles.some(
        (s: unknown) =>
          s && typeof s === 'object' && (s as { textAlign?: string }).textAlign === 'right',
      );
      expect(rightAligned).toBe(true);
    });

    it('honours durationColor override', () => {
      const { getByText } = render(
        <RowMetaLine
          slots={['duration']}
          durationText="10:05"
          durationColor="#FF00FF"
        />,
      );
      const text = getByText('10:05');
      const styles = Array.isArray(text.props.style)
        ? text.props.style.flat(Infinity)
        : [text.props.style];
      const colored = styles.some(
        (s: unknown) =>
          s && typeof s === 'object' && (s as { color?: string }).color === '#FF00FF',
      );
      expect(colored).toBe(true);
    });

    it('honours durationFontSize override', () => {
      const { getByText } = render(
        <RowMetaLine
          slots={['duration']}
          durationText="10:05"
          durationFontSize={14}
        />,
      );
      const text = getByText('10:05');
      const styles = Array.isArray(text.props.style)
        ? text.props.style.flat(Infinity)
        : [text.props.style];
      const sized = styles.some(
        (s: unknown) =>
          s && typeof s === 'object' && (s as { fontSize?: number }).fontSize === 14,
      );
      expect(sized).toBe(true);
    });
  });

  describe('leading slot', () => {
    it('renders the leading slot when provided', () => {
      const { getByText, getByTestId } = render(
        <RowMetaLine
          slots={['duration']}
          leading={<Text>13 tracks</Text>}
        />,
      );
      expect(getByText('13 tracks')).toBeTruthy();
      expect(getByTestId('rowmetaline-leading')).toBeTruthy();
    });

    it('omits the leading slot entirely when undefined', () => {
      const { queryByTestId } = render(<RowMetaLine slots={['duration']} />);
      expect(queryByTestId('rowmetaline-leading')).toBeNull();
    });
  });

  describe('accessibility', () => {
    it('labels the heart icon when rendered', () => {
      const { getByLabelText } = render(<RowMetaLine slots={['heart']} starred />);
      expect(getByLabelText('Favourite')).toBeTruthy();
    });

    it('labels the downloaded indicator', () => {
      const { getByLabelText } = render(
        <RowMetaLine slots={['download']} downloadStatus="complete" />,
      );
      expect(getByLabelText('Downloaded')).toBeTruthy();
    });

    it('labels the partially-downloaded indicator', () => {
      const { getByLabelText } = render(
        <RowMetaLine slots={['download']} downloadStatus="partial" />,
      );
      expect(getByLabelText('Partially downloaded')).toBeTruthy();
    });

    it('labels the rating', () => {
      const { getByLabelText } = render(<RowMetaLine slots={['rating']} rating={4} />);
      expect(getByLabelText('Rating 4 of 5')).toBeTruthy();
    });
  });
});
