/**
 * Module-scoped Intl.* helpers reused across the app.
 *
 * Why this file exists: Hermes on Android ARM64 has a documented perf bug
 * (https://github.com/facebook/hermes/issues/867) where every call to
 * `String.prototype.localeCompare` clones a fresh ICU `RuleBasedCollator`,
 * which can take 2–8 seconds per call for trivial strings on real devices.
 * A single `Array.prototype.sort` of a 10K-album library calls the
 * comparator ~280K times → JS thread monopolised for tens of seconds →
 * Android ANR via Fabric event-dispatch back-pressure. The same per-call
 * ICU init shape applies to `new Intl.DateTimeFormat(...)` constructed in
 * a hot render path.
 *
 * Cache the formatter / collator once and reuse it: one ICU clone at
 * first use instead of N clones per sort or per render.
 *
 * Usage:
 *   - sorts:        items.sort((a, b) => defaultCollator.compare(a, b))
 *   - sorts (case/accent insensitive):
 *                   items.sort((a, b) => baseCollator.compare(a, b))
 *   - date format:  getDateTimeFormat(locale, opts).format(date)
 *
 * `validate-intl.js` enforces this convention in CI — any new
 * `String.prototype.localeCompare` or `new Intl.DateTimeFormat(...)`
 * outside this file will fail the build.
 */

/** Locale-aware, case- AND accent-sensitive comparator. Use for IDs,
 *  timestamps, file paths — anything where "É" and "e" must NOT collide. */
export const defaultCollator = new Intl.Collator();

/** Locale-aware, case- and accent-INSENSITIVE comparator. Use for
 *  user-facing names where "Élise" / "elise" / "ELISE" should sort together. */
export const baseCollator = new Intl.Collator(undefined, { sensitivity: 'base' });

/** Cache keyed on (locale, options). The user can change locale at runtime
 *  via `localeStore`, so we can't use a single singleton — but we CAN cache
 *  one instance per (locale, options) combination so the same hot render path
 *  doesn't reconstruct the formatter every call. */
const dateTimeFormatCache = new Map<string, Intl.DateTimeFormat>();

export function getDateTimeFormat(
  locale: string | undefined,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = `${locale ?? ''}|${JSON.stringify(options)}`;
  let formatter = dateTimeFormatCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    dateTimeFormatCache.set(key, formatter);
  }
  return formatter;
}
