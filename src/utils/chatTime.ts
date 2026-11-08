import i18n from '../i18n/i18n';

/** The app language for date formatting ("pt" shows 24-hour times, "en" 12-hour). */
function lang(): string | undefined {
  return i18n.language || undefined;
}

/** Clock time of a message, in the phone's time zone. */
export function formatChatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString(lang(), { hour: '2-digit', minute: '2-digit' });
}

/** Time today, "Ontem"/weekday this week, otherwise the date, in the app language. */
export function formatChatTime(ms: number, now: number = Date.now()): string {
  const date = new Date(ms);
  const today = new Date(now);
  if (date.toDateString() === today.toDateString()) return formatChatClock(ms);
  if (now - ms < 6 * 24 * 3600 * 1000) {
    return date.toLocaleDateString(lang(), { weekday: 'short' });
  }
  return date.toLocaleDateString(lang(), { day: '2-digit', month: '2-digit', year: '2-digit' });
}

/** The day separator inside a conversation, e.g. "8 de novembro de 2026". */
export function formatChatDay(ms: number): string {
  return new Date(ms).toLocaleDateString(lang(), { day: 'numeric', month: 'long', year: 'numeric' });
}
