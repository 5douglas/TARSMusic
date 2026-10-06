/**
 * Calendar-date helpers. Produce / manipulate `YYYY-MM-DD` strings in
 * the device's LOCAL timezone, suitable for grouping playback history
 * into buckets a user recognises as "today / yesterday / Mon / ...".
 *
 * Why local-time: a "day" in stats UI is the user's calendar day, not
 * a UTC day. Two plays separated by midnight local should land in
 * different buckets even if they're a minute apart in UTC.
 *
 * Why component arithmetic (`new Date(y, m, d + n)`) instead of
 * `t ± n * 86_400_000`: DST. A local day can be 23 or 25 hours; fixed
 * millisecond steps skip or duplicate calendar dates around the
 * transition. Component arithmetic is the standard recommended form.
 */

export function dateKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function offsetDateKey(dk: string, offset: number): string {
  const [y, m, d] = dk.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d + offset).getTime());
}

/**
 * Calendar days between two timestamps in LOCAL time. Returns `0` for
 * same-day, `1` for "yesterday → today", etc. The from/to ordering
 * doesn't matter; the result is always non-negative.
 *
 * Bounded by `maxDays` so we don't walk forever on misconfigured input
 * (e.g. a scrobble with a corrupt future timestamp). Caller decides
 * what to do when the answer comes back as `maxDays + 1` (i.e. "more
 * than the bound, can't be sure").
 */
export function calendarDaysBetween(a: number, b: number, maxDays = 366): number {
  const aKey = dateKey(Math.min(a, b));
  const bKey = dateKey(Math.max(a, b));
  if (aKey === bKey) return 0;
  let key = aKey;
  let n = 0;
  while (key !== bKey && n <= maxDays) {
    key = offsetDateKey(key, 1);
    n++;
  }
  return n;
}
