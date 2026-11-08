import i18n from '../i18n/i18n';

/** Time today, weekday this week, otherwise the date, in the app language. */
export function formatChatTime(ms: number, now: number = Date.now()): string {
  const date = new Date(ms);
  const today = new Date(now);
  const lang = i18n.language || undefined;
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
  }
  if (now - ms < 6 * 24 * 3600 * 1000) {
    return date.toLocaleDateString(lang, { weekday: 'short' });
  }
  return date.toLocaleDateString(lang, { day: '2-digit', month: '2-digit', year: '2-digit' });
}

/** Clock time of a message bubble. */
export function formatChatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString(i18n.language || undefined, { hour: '2-digit', minute: '2-digit' });
}
