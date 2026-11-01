/** Synced-lyrics timing shared by the full-screen lyrics, the lyrics card and the line under the cover. */

/** Light a line this early so its highlight animation lands as the line is sung. */
export const LINE_LEAD_MS = 150;
/** Jitter allowance: a position this close behind the current line's start keeps it active
 *  instead of flicking back to the previous line. A larger jump back is a seek. */
const BACKWARD_TOLERANCE_MS = 400;
/**
 * Index of the line active at `ms` (lead already applied by the caller), -1 before the first
 * line. Holds `prev` when `ms` is only slightly behind its start, so clock jitter between the
 * extrapolated and the reported position never flicks the highlight backwards.
 */
export function pickActiveLine(lineStarts: readonly number[], ms: number, prev: number): number {
  if (lineStarts.length === 0 || ms < lineStarts[0]) {
    return prev === 0 && ms >= lineStarts[0] - BACKWARD_TOLERANCE_MS ? 0 : -1;
  }
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (lineStarts[mid] <= ms) lo = mid;
    else hi = mid - 1;
  }
  if (lo === prev - 1 && ms >= lineStarts[prev] - BACKWARD_TOLERANCE_MS) return prev;
  return lo;
}
