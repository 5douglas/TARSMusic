/**
 * Translates lyrics line by line with Google Translate's public web endpoint (no key), into
 * the phone's language. Lines are sent together, one per line, and split back; when the
 * service merges or splits lines the result is discarded rather than shown misaligned.
 */
import { getLocales } from 'expo-localization';

const ENDPOINT = 'https://translate.googleapis.com/translate_a/single';

export interface LyricsTranslation {
  /** One translation per input line ('' for empty lines). */
  lines: string[];
  /** Language the service detected, e.g. 'en'. */
  sourceLang: string | null;
}

/** The phone's language code ('pt', 'es', …), English when unknown. */
export function targetLanguage(): string {
  try {
    return getLocales()[0]?.languageCode ?? 'en';
  } catch {
    return 'en';
  }
}

/** Joins the segments Google returns and splits them back into lines. */
export function parseGoogleTranslation(body: unknown): { text: string; sourceLang: string | null } | null {
  if (!Array.isArray(body) || !Array.isArray(body[0])) return null;
  const text = (body[0] as unknown[])
    .map((seg) => (Array.isArray(seg) && typeof seg[0] === 'string' ? seg[0] : ''))
    .join('');
  const sourceLang = typeof body[2] === 'string' ? body[2] : null;
  return { text, sourceLang };
}

export async function translateLyrics(
  lines: string[],
  target = targetLanguage(),
): Promise<LyricsTranslation | null> {
  // Only the non-empty lines travel; the empty ones (pauses) keep their place.
  const indexes = lines.map((l, i) => (l.trim() ? i : -1)).filter((i) => i >= 0);
  if (indexes.length === 0) return { lines: lines.map(() => ''), sourceLang: null };
  const q = indexes.map((i) => lines[i].replace(/\n/g, ' ').trim()).join('\n');

  const res = await fetch(`${ENDPOINT}?client=gtx&sl=auto&tl=${encodeURIComponent(target)}&dt=t`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: `q=${encodeURIComponent(q)}`,
  });
  if (!res.ok) return null;
  const parsed = parseGoogleTranslation(await res.json());
  if (!parsed) return null;

  const translated = parsed.text.split('\n').map((l) => l.trim());
  if (translated.length !== indexes.length) return null;
  const out = lines.map(() => '');
  indexes.forEach((lineIndex, k) => {
    out[lineIndex] = translated[k];
  });
  return { lines: out, sourceLang: parsed.sourceLang };
}
