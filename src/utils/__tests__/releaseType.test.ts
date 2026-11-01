import { releaseKind, sortReleasesNewestFirst } from '../releaseType';

describe('releaseKind', () => {
  it('uses the server release type tags first', () => {
    expect(releaseKind({ songCount: 12, duration: 3000, releaseTypes: ['Single'] })).toBe('single');
    expect(releaseKind({ songCount: 2, duration: 400, releaseTypes: ['album'] })).toBe('album');
    expect(releaseKind({ songCount: 5, duration: 900, releaseTypes: ['EP'] })).toBe('ep');
    expect(releaseKind({ songCount: 20, duration: 4000, isCompilation: true })).toBe('compilation');
  });

  it('guesses from track count and length without tags', () => {
    expect(releaseKind({ songCount: 1, duration: 200 })).toBe('single');
    expect(releaseKind({ songCount: 3, duration: 600 })).toBe('single');
    expect(releaseKind({ songCount: 5, duration: 1200 })).toBe('ep');
    expect(releaseKind({ songCount: 5, duration: 2400 })).toBe('album');
    expect(releaseKind({ songCount: 10, duration: 2400 })).toBe('album');
  });
});

describe('sortReleasesNewestFirst', () => {
  it('puts newer years first and unknown years last', () => {
    const sorted = sortReleasesNewestFirst([{ year: 2001 }, {}, { year: 2020 }]);
    expect(sorted.map((r) => r.year)).toEqual([2020, 2001, undefined]);
  });
});
