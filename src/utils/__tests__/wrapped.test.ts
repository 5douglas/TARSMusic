import type { AnalyticsAggregates } from '../../store/completedScrobbleStore';
import { buildWrappedSummary, wrappedRange, wrappedYearMonths, wrappedYears } from '../wrapped';

describe('wrappedRange', () => {
  it('covers the whole local year when month is null', () => {
    const { since, until } = wrappedRange(2026, null);
    expect(since).toBe(new Date(2026, 0, 1).getTime());
    expect(until).toBe(new Date(2027, 0, 1).getTime());
  });

  it('covers one local month, end exclusive (December rolls into next year)', () => {
    expect(wrappedRange(2026, 2)).toEqual({
      since: new Date(2026, 1, 1).getTime(),
      until: new Date(2026, 2, 1).getTime(),
    });
    expect(wrappedRange(2026, 12).until).toBe(new Date(2027, 0, 1).getTime());
  });
});

describe('wrappedYears / wrappedYearMonths', () => {
  const months = [
    { month: '2025-12', plays: 3, seconds: 600 },
    { month: '2026-01', plays: 5, seconds: 1000 },
    { month: '2026-11', plays: 2, seconds: 400 },
  ];

  it('lists years newest first', () => {
    expect(wrappedYears(months)).toEqual([2026, 2025]);
  });

  it('fills 12 months for a year, zero where empty', () => {
    const y = wrappedYearMonths(months, 2026);
    expect(y).toHaveLength(12);
    expect(y[0]).toEqual({ month: 1, plays: 5, seconds: 1000 });
    expect(y[10]).toEqual({ month: 11, plays: 2, seconds: 400 });
    expect(y[5]).toEqual({ month: 6, plays: 0, seconds: 0 });
  });
});

describe('buildWrappedSummary', () => {
  const hourBuckets = new Array<number>(24).fill(0);
  hourBuckets[22] = 4;
  hourBuckets[8] = 1;
  const agg: AnalyticsAggregates = {
    artistCounts: { A: { count: 2, artistId: 'ar-a' }, B: { count: 3 } },
    albumCounts: { 'X::A': { artist: 'A', count: 2, albumId: 'al-x' }, 'Y::B': { artist: 'B', count: 3 } },
    songStats: { s1: { count: 2 }, s2: { count: 3 } },
    topSongs: [],
    genreCounts: { Rock: 1, Jazz: 4 },
    hourBuckets,
    dayCounts: { '2026-01-02': 1, '2026-01-03': 4 },
  };

  it('ranks tops and finds peaks', () => {
    const s = buildWrappedSummary({ totalPlays: 5, totalListeningSeconds: 900, uniqueArtists: {} }, agg);
    expect(s.totalPlays).toBe(5);
    expect(s.totalSeconds).toBe(900);
    expect(s.topArtists.map((a) => a.artist)).toEqual(['B', 'A']);
    expect(s.topArtists[1].artistId).toBe('ar-a');
    expect(s.topAlbums[0]).toMatchObject({ album: 'Y', artist: 'B', count: 3 });
    expect(s.topGenres[0].genre).toBe('Jazz');
    expect(s.peakHour).toBe(22);
    expect(s.busiestDay).toEqual({ date: '2026-01-03', count: 4 });
    expect(s.uniqueSongs).toBe(2);
    expect(s.daysListened).toBe(2);
  });

  it('returns nulls for an empty window', () => {
    const s = buildWrappedSummary(
      { totalPlays: 0, totalListeningSeconds: 0, uniqueArtists: {} },
      { ...agg, artistCounts: {}, albumCounts: {}, songStats: {}, genreCounts: {}, hourBuckets: new Array(24).fill(0), dayCounts: {} },
    );
    expect(s.peakHour).toBeNull();
    expect(s.busiestDay).toBeNull();
    expect(s.topArtists).toEqual([]);
  });
});
