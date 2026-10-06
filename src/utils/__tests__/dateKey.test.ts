import { calendarDaysBetween, dateKey, offsetDateKey } from '../dateKey';

describe('dateKey', () => {
  it('formats a timestamp as YYYY-MM-DD in local time', () => {
    // Local-time constructor pins the date components regardless of host TZ.
    const ts = new Date(2026, 4, 26, 14, 30).getTime();
    expect(dateKey(ts)).toBe('2026-05-26');
  });

  it('zero-pads single-digit months and days', () => {
    const ts = new Date(2026, 0, 5, 0, 0).getTime();
    expect(dateKey(ts)).toBe('2026-01-05');
  });
});

describe('offsetDateKey', () => {
  it('rolls back one day across month boundary', () => {
    expect(offsetDateKey('2026-06-01', -1)).toBe('2026-05-31');
  });

  it('rolls forward one day across year boundary', () => {
    expect(offsetDateKey('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('handles multi-day offsets', () => {
    expect(offsetDateKey('2026-05-26', -7)).toBe('2026-05-19');
    expect(offsetDateKey('2026-05-26', 14)).toBe('2026-06-09');
  });

  it('returns the same key when offset is 0', () => {
    expect(offsetDateKey('2026-05-26', 0)).toBe('2026-05-26');
  });
});

describe('calendarDaysBetween', () => {
  const ts = (y: number, mZero: number, d: number, h = 12) =>
    new Date(y, mZero, d, h).getTime();

  it('returns 0 for same calendar day even when wall-clock diff is large', () => {
    // 1 minute after midnight vs 1 minute before midnight on the same date.
    expect(calendarDaysBetween(ts(2026, 4, 26, 0), ts(2026, 4, 26, 23))).toBe(0);
  });

  it('returns 1 for adjacent calendar days', () => {
    expect(calendarDaysBetween(ts(2026, 4, 25), ts(2026, 4, 26))).toBe(1);
  });

  it('returns 2 for plays from "two days ago" even when only 28 hours elapsed', () => {
    // Scrobble at 11:30 PM Monday, viewing at 3:30 AM Wednesday — 28h elapsed
    // but the calendar count is 2 (Mon → Tue → Wed).
    const monNight = new Date(2026, 4, 25, 23, 30).getTime();
    const wedEarly = new Date(2026, 4, 27, 3, 30).getTime();
    expect(calendarDaysBetween(monNight, wedEarly)).toBe(2);
  });

  it('returns 1 (not 2) for plays "yesterday" even when 47 hours have elapsed', () => {
    // The bug-fix case: scrobble at 1 AM Mon, viewing at midnight Wed → 47h
    // but Monday IS yesterday (Tuesday) viewed from Tuesday/Wednesday boundary.
    // Calendar count Mon → Tue = 1.
    const monEarly = new Date(2026, 4, 25, 1, 0).getTime();
    const tueLate = new Date(2026, 4, 26, 23, 59).getTime();
    expect(calendarDaysBetween(monEarly, tueLate)).toBe(1);
  });

  it('is symmetric — order of arguments does not matter', () => {
    const a = ts(2026, 4, 25);
    const b = ts(2026, 4, 28);
    expect(calendarDaysBetween(a, b)).toBe(calendarDaysBetween(b, a));
  });

  it('caps at maxDays + 1 when the gap exceeds the bound', () => {
    const a = ts(2025, 0, 1);
    const b = ts(2026, 0, 1);
    expect(calendarDaysBetween(a, b, 8)).toBe(9);
  });
});
