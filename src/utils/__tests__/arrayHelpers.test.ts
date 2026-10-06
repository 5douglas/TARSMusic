import { shuffleArray } from '../arrayHelpers';

describe('shuffleArray', () => {
  it('returns a new array (not the same reference)', () => {
    const original = [1, 2, 3, 4, 5];
    const result = shuffleArray(original);
    expect(result).not.toBe(original);
  });

  it('does not mutate the original array', () => {
    const original = [1, 2, 3, 4, 5];
    const copy = [...original];
    shuffleArray(original);
    expect(original).toEqual(copy);
  });

  it('preserves all elements', () => {
    const original = [10, 20, 30, 40, 50];
    const result = shuffleArray(original);
    expect(result.sort((a, b) => a - b)).toEqual(original.sort((a, b) => a - b));
  });

  it('returns the same length', () => {
    const original = [1, 2, 3, 4, 5];
    expect(shuffleArray(original)).toHaveLength(original.length);
  });

  it('handles an empty array', () => {
    expect(shuffleArray([])).toEqual([]);
  });

  it('handles a single-element array', () => {
    expect(shuffleArray([42])).toEqual([42]);
  });

  it('handles a two-element array', () => {
    const original = ['a', 'b'];
    const result = shuffleArray(original);
    expect(result).toHaveLength(2);
    expect(result.sort()).toEqual(['a', 'b']);
  });

  it('works with readonly arrays', () => {
    const original: readonly number[] = [1, 2, 3];
    const result = shuffleArray(original);
    expect(result).toHaveLength(3);
    expect(result.sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  it('eventually produces a different order (statistical)', () => {
    const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    let sawDifferentOrder = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      const result = shuffleArray(original);
      if (result.some((val, idx) => val !== original[idx])) {
        sawDifferentOrder = true;
        break;
      }
    }
    expect(sawDifferentOrder).toBe(true);
  });
});
