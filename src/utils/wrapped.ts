/**
 * Wrapped (yearly / monthly listening recap) helpers. Pure: the screen feeds in the
 * SQL aggregates for the chosen window and the per-month totals.
 */
import type { Child } from '../services/subsonicService';
import type { AnalyticsAggregates, ListeningStats } from '../store/completedScrobbleStore';
import type { ScrobbleMonthTotal } from '../store/persistence/scrobbleAggregates';

export const WRAPPED_TOP_COUNT = 5;

/** `month` 1-12, or `null` for the whole year. Local time, end exclusive. */
export function wrappedRange(year: number, month: number | null): { since: number; until: number } {
  const since = new Date(year, month === null ? 0 : month - 1, 1).getTime();
  const until = new Date(year, month === null ? 12 : month, 1).getTime();
  return { since, until };
}

/** Years with history, newest first. */
export function wrappedYears(months: readonly ScrobbleMonthTotal[]): number[] {
  const years = new Set<number>();
  for (const m of months) {
    const y = Number(m.month.slice(0, 4));
    if (Number.isFinite(y) && y > 0) years.add(y);
  }
  return Array.from(years).sort((a, b) => b - a);
}

/** Totals for each month 1-12 of `year` (zero where there was no listening). */
export function wrappedYearMonths(
  months: readonly ScrobbleMonthTotal[],
  year: number,
): { month: number; plays: number; seconds: number }[] {
  const out = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, plays: 0, seconds: 0 }));
  const prefix = `${year}-`;
  for (const m of months) {
    if (!m.month.startsWith(prefix)) continue;
    const idx = Number(m.month.slice(5, 7)) - 1;
    if (idx >= 0 && idx < 12) out[idx] = { month: idx + 1, plays: m.plays, seconds: m.seconds };
  }
  return out;
}

export interface WrappedSummary {
  totalPlays: number;
  totalSeconds: number;
  uniqueArtists: number;
  uniqueAlbums: number;
  uniqueSongs: number;
  daysListened: number;
  topArtists: { artist: string; artistId?: string; count: number }[];
  topAlbums: { album: string; artist: string; albumId?: string; coverArt?: string; count: number }[];
  topSongs: { song: Child; count: number }[];
  topGenres: { genre: string; count: number }[];
  /** Hour of day (0-23) with the most plays, or null with no data. */
  peakHour: number | null;
  /** Day (`YYYY-MM-DD`) with the most plays, or null with no data. */
  busiestDay: { date: string; count: number } | null;
}

const byCountDesc = <T extends { count: number }>(a: T, b: T): number => b.count - a.count;

export function buildWrappedSummary(stats: ListeningStats, agg: AnalyticsAggregates): WrappedSummary {
  const topArtists = Object.entries(agg.artistCounts)
    .map(([artist, v]) => ({ artist, artistId: v.artistId, count: v.count }))
    .sort(byCountDesc)
    .slice(0, WRAPPED_TOP_COUNT);

  const topAlbums = Object.entries(agg.albumCounts)
    .map(([key, v]) => ({
      album: key.split('::')[0],
      artist: v.artist,
      albumId: v.albumId,
      coverArt: v.coverArt,
      count: v.count,
    }))
    .sort(byCountDesc)
    .slice(0, WRAPPED_TOP_COUNT);

  const topGenres = Object.entries(agg.genreCounts)
    .map(([genre, count]) => ({ genre, count }))
    .sort(byCountDesc)
    .slice(0, WRAPPED_TOP_COUNT);

  let peakHour: number | null = null;
  let peakCount = 0;
  agg.hourBuckets.forEach((c, h) => {
    if (c > peakCount) {
      peakCount = c;
      peakHour = h;
    }
  });

  let busiestDay: WrappedSummary['busiestDay'] = null;
  for (const [date, count] of Object.entries(agg.dayCounts)) {
    if (busiestDay === null || count > busiestDay.count) busiestDay = { date, count };
  }

  return {
    totalPlays: stats.totalPlays,
    totalSeconds: stats.totalListeningSeconds,
    uniqueArtists: Object.keys(agg.artistCounts).length,
    uniqueAlbums: Object.keys(agg.albumCounts).length,
    uniqueSongs: Object.keys(agg.songStats).length,
    daysListened: Object.keys(agg.dayCounts).length,
    topArtists,
    topAlbums,
    topSongs: agg.topSongs.slice(0, WRAPPED_TOP_COUNT),
    topGenres,
    peakHour,
    busiestDay,
  };
}
