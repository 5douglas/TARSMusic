import { useWindowDimensions } from 'react-native';

export const GRID_GAP = 10;
export const LIST_PADDING = 16;

/** Returns the number of grid columns for a given window width. */
export function getGridColumns(width: number): number {
  if (width >= 1200) return 5;
  if (width >= 900) return 4;
  if (width >= 600) return 3;
  return 2;
}

/** Returns the left/right padding for a grid item to distribute gaps evenly across N columns. */
export function getGridItemPadding(
  index: number,
  numColumns: number,
  gap: number,
): { paddingLeft: number; paddingRight: number } {
  const col = index % numColumns;
  return {
    paddingLeft: (col * gap) / numColumns,
    paddingRight: ((numColumns - 1 - col) * gap) / numColumns,
  };
}

/** Hook that returns the responsive grid column count based on current window width. */
export function useGridColumns(): number {
  const { width } = useWindowDimensions();
  return getGridColumns(width);
}
