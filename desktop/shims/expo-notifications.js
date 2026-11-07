// expo-notifications on the browser Notification API, which Electron shows as
// Windows toast notifications. Covers the subset the app uses.
const { useEffect, useState } = require('react');

const shown = new Map();
const responseListeners = new Set();
let lastResponse;
let counter = 0;

function focusWindow() {
  try {
    window.focus();
  } catch {
    /* ignore */
  }
}

function present(identifier, content) {
  if (typeof Notification === 'undefined') return;
  const n = new Notification(content.title || 'TARSMusic', { body: content.body || '', silent: false });
  shown.set(identifier, n);
  n.onclick = () => {
    focusWindow();
    lastResponse = {
      actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
      notification: { date: Date.now(), request: { identifier, content, trigger: null } },
    };
    for (const l of responseListeners) l(lastResponse);
  };
  n.onclose = () => shown.delete(identifier);
}

async function scheduleNotificationAsync({ content = {}, trigger, identifier } = {}) {
  const id = identifier || `tars-${Date.now()}-${++counter}`;
  const seconds = trigger && typeof trigger === 'object' && trigger.seconds ? trigger.seconds : 0;
  if (seconds > 0) {
    const timer = setTimeout(() => present(id, content), seconds * 1000);
    shown.set(id, { close: () => clearTimeout(timer) });
  } else {
    present(id, content);
  }
  return id;
}

async function dismissNotificationAsync(id) {
  const n = shown.get(id);
  if (n) n.close();
  shown.delete(id);
}

const granted = { status: 'granted', granted: true, canAskAgain: true, expires: 'never' };

function useLastNotificationResponse() {
  const [response, setResponse] = useState(lastResponse);
  useEffect(() => {
    responseListeners.add(setResponse);
    return () => responseListeners.delete(setResponse);
  }, []);
  return response;
}

module.exports = {
  __esModule: true,
  setNotificationHandler: () => {},
  getPermissionsAsync: async () => granted,
  requestPermissionsAsync: async () => granted,
  scheduleNotificationAsync,
  dismissNotificationAsync,
  dismissAllNotificationsAsync: async () => {
    for (const n of shown.values()) n.close();
    shown.clear();
  },
  cancelScheduledNotificationAsync: dismissNotificationAsync,
  setNotificationChannelAsync: async () => null,
  getLastNotificationResponseAsync: async () => lastResponse ?? null,
  addNotificationResponseReceivedListener: (l) => {
    responseListeners.add(l);
    return { remove: () => responseListeners.delete(l) };
  },
  useLastNotificationResponse,
  AndroidImportance: { UNKNOWN: 0, UNSPECIFIED: 1, NONE: 2, MIN: 3, LOW: 4, DEFAULT: 5, HIGH: 6, MAX: 7 },
  SchedulableTriggerInputTypes: {
    CALENDAR: 'calendar',
    DAILY: 'daily',
    WEEKLY: 'weekly',
    MONTHLY: 'monthly',
    YEARLY: 'yearly',
    DATE: 'date',
    TIME_INTERVAL: 'timeInterval',
  },
};
