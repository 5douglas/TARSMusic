import { getGridColumns, getGridItemPadding } from '../useGridColumns';

/* ------------------------------------------------------------------ */
/*  getGridColumns                                                     */
/* ------------------------------------------------------------------ */

describe('getGridColumns', () => {
  it('returns 2 for iPhone portrait widths', () => {
    expect(getGridColumns(375)).toBe(2);
    expect(getGridColumns(390)).toBe(2);
    expect(getGridColumns(430)).toBe(2);
    expect(getGridColumns(599)).toBe(2);
  });

  it('returns 3 for iPhone landscape / small iPad portrait', () => {
    expect(getGridColumns(600)).toBe(3);
    expect(getGridColumns(667)).toBe(3);
    expect(getGridColumns(768)).toBe(3);
    expect(getGridColumns(834)).toBe(3);
    expect(getGridColumns(899)).toBe(3);
  });

  it('returns 4 for iPad portrait / iPad landscape', () => {
    expect(getGridColumns(900)).toBe(4);
    expect(getGridColumns(1024)).toBe(4);
    expect(getGridColumns(1112)).toBe(4);
    expect(getGridColumns(1199)).toBe(4);
  });

  it('returns 5 for iPad Pro landscape and wider', () => {
    expect(getGridColumns(1200)).toBe(5);
    expect(getGridColumns(1366)).toBe(5);
    expect(getGridColumns(2000)).toBe(5);
  });

  it('handles edge case of very small width', () => {
    expect(getGridColumns(320)).toBe(2);
    expect(getGridColumns(0)).toBe(2);
  });
});

/* ------------------------------------------------------------------ */
/*  getGridItemPadding                                                 */
/* ------------------------------------------------------------------ */

describe('getGridItemPadding', () => {
  it('distributes gap correctly for 2 columns', () => {
    expect(getGridItemPadding(0, 2, 10)).toEqual({ paddingLeft: 0, paddingRight: 5 });
    expect(getGridItemPadding(1, 2, 10)).toEqual({ paddingLeft: 5, paddingRight: 0 });
    // wraps around
    expect(getGridItemPadding(2, 2, 10)).toEqual({ paddingLeft: 0, paddingRight: 5 });
    expect(getGridItemPadding(3, 2, 10)).toEqual({ paddingLeft: 5, paddingRight: 0 });
  });

  it('distributes gap correctly for 3 columns', () => {
    const col0 = getGridItemPadding(0, 3, 10);
    const col1 = getGridItemPadding(1, 3, 10);
    const col2 = getGridItemPadding(2, 3, 10);

    expect(col0.paddingLeft).toBeCloseTo(0);
    expect(col0.paddingRight).toBeCloseTo(6.667, 2);
    expect(col1.paddingLeft).toBeCloseTo(3.333, 2);
    expect(col1.paddingRight).toBeCloseTo(3.333, 2);
    expect(col2.paddingLeft).toBeCloseTo(6.667, 2);
    expect(col2.paddingRight).toBeCloseTo(0);
  });

  it('distributes gap correctly for 4 columns', () => {
    const col0 = getGridItemPadding(0, 4, 10);
    const col1 = getGridItemPadding(1, 4, 10);
    const col2 = getGridItemPadding(2, 4, 10);
    const col3 = getGridItemPadding(3, 4, 10);

    expect(col0).toEqual({ paddingLeft: 0, paddingRight: 7.5 });
    expect(col1).toEqual({ paddingLeft: 2.5, paddingRight: 5 });
    expect(col2).toEqual({ paddingLeft: 5, paddingRight: 2.5 });
    expect(col3).toEqual({ paddingLeft: 7.5, paddingRight: 0 });
  });

  it('produces equal total padding per column (equal card widths)', () => {
    for (const numColumns of [2, 3, 4, 5]) {
      const totals = [];
      for (let i = 0; i < numColumns; i++) {
        const { paddingLeft, paddingRight } = getGridItemPadding(i, numColumns, 10);
        totals.push(paddingLeft + paddingRight);
      }
      for (const total of totals) {
        expect(total).toBeCloseTo(totals[0]);
      }
    }
  });

  it('handles gap of 0', () => {
    expect(getGridItemPadding(0, 3, 0)).toEqual({ paddingLeft: 0, paddingRight: 0 });
    expect(getGridItemPadding(1, 3, 0)).toEqual({ paddingLeft: 0, paddingRight: 0 });
    expect(getGridItemPadding(2, 3, 0)).toEqual({ paddingLeft: 0, paddingRight: 0 });
  });

  it('distributes gap correctly for 5 columns', () => {
    const col0 = getGridItemPadding(0, 5, 10);
    const col4 = getGridItemPadding(4, 5, 10);

    expect(col0).toEqual({ paddingLeft: 0, paddingRight: 8 });
    expect(col4).toEqual({ paddingLeft: 8, paddingRight: 0 });
  });
});

/* ------------------------------------------------------------------ */
/*  useGridColumns                                                     */
/* ------------------------------------------------------------------ */

jest.mock('react-native', () => ({
  useWindowDimensions: jest.fn(() => ({ width: 375, height: 812 })),
}));

import { useWindowDimensions } from 'react-native';
import { renderHook } from '@testing-library/react-native';
import { useGridColumns } from '../useGridColumns';

const mockUseWindowDimensions = useWindowDimensions as jest.Mock;

describe('useGridColumns', () => {
  it('returns 2 for iPhone portrait width', () => {
    mockUseWindowDimensions.mockReturnValue({ width: 390, height: 844 });
    const { result } = renderHook(() => useGridColumns());
    expect(result.current).toBe(2);
  });

  it('returns 3 for iPad mini portrait width', () => {
    mockUseWindowDimensions.mockReturnValue({ width: 768, height: 1024 });
    const { result } = renderHook(() => useGridColumns());
    expect(result.current).toBe(3);
  });

  it('returns 4 for iPad landscape width', () => {
    mockUseWindowDimensions.mockReturnValue({ width: 1024, height: 768 });
    const { result } = renderHook(() => useGridColumns());
    expect(result.current).toBe(4);
  });

  it('returns 5 for iPad Pro landscape width', () => {
    mockUseWindowDimensions.mockReturnValue({ width: 1366, height: 1024 });
    const { result } = renderHook(() => useGridColumns());
    expect(result.current).toBe(5);
  });
});
