/**
 * Connects the app to Discover with the user's own Navidrome account, so nobody types a
 * backend token.
 *
 * The backend (navidrome-discover) checks the Subsonic credentials against its Navidrome
 * and answers with a short-lived session token signed with its own secret; the app keeps
 * only that token and renews it before it expires. No secret ships in the app.
 *
 * Credentials never go to a backend that does not serve the user's Navidrome: before the
 * automatic connection sends anything, the app asks the default backend which Navidrome
 * hosts it serves (as SHA-256 hashes) and stops unless the user's server is one of them.
 * A backend typed in Settings by the user is trusted by that choice.
 */
import * as Crypto from 'expo-crypto';

import { authStore } from '../store/authStore';
import { discoverSettingsStore } from '../store/discoverSettingsStore';
import { getSubsonicAuthHeaders } from './subsonicService';

/** The Discover backend that serves the TARSMusic Navidrome server. */
export const DEFAULT_DISCOVER_URL = 'https://discover.douglas.seg.br';

/** Renew a session this long before it expires. */
const RENEW_BEFORE_MS = 6 * 60 * 60 * 1000;
/** After the backend refused this account, wait this long before asking again. */
const REFUSED_RETRY_MS = 6 * 60 * 60 * 1000;

let inFlight: Promise<boolean> | null = null;
let refused: { account: string; at: number } | null = null;

function currentAccount(): { key: string; serverUrl: string } | null {
  const { isLoggedIn, primaryServerUrl, serverUrl, username } = authStore.getState();
  const url = primaryServerUrl ?? serverUrl;
  if (!isLoggedIn || !url || !username) return null;
  const normalized = url.trim().replace(/\/+$/, '').toLowerCase();
  return { key: `${normalized}|${username.toLowerCase()}`, serverUrl: normalized };
}

function hostOf(url: string): string | null {
  const match = /^[a-z]+:\/\/([^/?#]+)/i.exec(url.trim());
  if (!match) return null;
  // Drop userinfo; keep the port, since one host can run several servers.
  return match[1].replace(/^.*@/, '').toLowerCase();
}

async function sha256(text: string): Promise<string> {
  return (await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text)).toLowerCase();
}

/** True when the backend says it serves the Navidrome at `serverUrl`. */
async function backendServes(baseUrl: string, serverUrl: string): Promise<boolean> {
  const host = hostOf(serverUrl);
  if (!host) return false;
  try {
    const res = await fetch(`${baseUrl}/auth/info`);
    if (!res.ok) return false;
    const info = (await res.json()) as { navidrome_hosts_sha256?: unknown };
    const hashes = Array.isArray(info.navidrome_hosts_sha256) ? info.navidrome_hosts_sha256 : [];
    if (hashes.length === 0) return false;
    const mine = await sha256(host);
    return hashes.some((h) => typeof h === 'string' && h.toLowerCase() === mine);
  } catch {
    return false;
  }
}

type SessionResult = { token: string; expiresAt: number } | 'refused' | 'unreachable';

async function requestSession(baseUrl: string): Promise<SessionResult> {
  const auth = await getSubsonicAuthHeaders();
  if (!auth) return 'unreachable';
  try {
    const res = await fetch(`${baseUrl}/auth/session`, { method: 'POST', headers: auth });
    if (res.status === 401 || res.status === 403) return 'refused';
    if (!res.ok) return 'unreachable';
    const body = (await res.json()) as { token?: unknown; expires_at?: unknown };
    if (typeof body.token !== 'string' || typeof body.expires_at !== 'number') return 'unreachable';
    return { token: body.token, expiresAt: body.expires_at * 1000 };
  } catch {
    return 'unreachable';
  }
}

async function connect(force: boolean): Promise<boolean> {
  const store = discoverSettingsStore.getState();
  const account = currentAccount();

  // A static token from Settings (also every install from before sessions) stays as is.
  if (store.baseUrl && store.token && store.mode !== 'login') return true;
  if (!account) return false;

  const sameAccount = store.mode === 'login' && store.account === account.key;
  if (
    sameAccount &&
    !force &&
    store.token &&
    store.tokenExpiresAt != null &&
    store.tokenExpiresAt - Date.now() > RENEW_BEFORE_MS
  ) {
    return true;
  }

  // Another account, or the user disconnected on purpose: start from the default only
  // when automatic connection is allowed.
  let baseUrl: string;
  if (sameAccount && store.baseUrl) {
    baseUrl = store.baseUrl;
  } else {
    if (store.mode === 'login') store.clearConnection();
    if (store.autoConnectDisabled) return false;
    baseUrl = DEFAULT_DISCOVER_URL;
  }

  if (refused && refused.account === account.key && Date.now() - refused.at < REFUSED_RETRY_MS && !force) {
    return false;
  }
  if (baseUrl === DEFAULT_DISCOVER_URL && !(await backendServes(baseUrl, account.serverUrl))) {
    return false;
  }

  const result = await requestSession(baseUrl);
  if (result === 'refused') {
    refused = { account: account.key, at: Date.now() };
    discoverSettingsStore.getState().clearConnection();
    return false;
  }
  if (result === 'unreachable') {
    // Keep a still-valid session; the backend may be briefly down.
    const s = discoverSettingsStore.getState();
    return s.mode === 'login' && !!s.token && (s.tokenExpiresAt ?? 0) > Date.now();
  }
  refused = null;
  discoverSettingsStore.getState().setSession(baseUrl, result.token, result.expiresAt, account.key);
  return true;
}

/**
 * Makes sure the app holds a usable Discover credential for the logged-in account,
 * connecting or renewing as needed. `force` renews even a fresh session (after a 401).
 * Resolves true when a credential is in place. Concurrent calls share one attempt.
 */
export function ensureDiscoverSession(force = false): Promise<boolean> {
  if (!inFlight) {
    inFlight = connect(force).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

/** Connects to a backend the user typed, with their Navidrome login instead of a token. */
export async function connectWithLogin(baseUrl: string): Promise<boolean> {
  const account = currentAccount();
  const url = baseUrl.trim().replace(/\/+$/, '');
  if (!account || !url) return false;
  const result = await requestSession(url);
  if (typeof result === 'string') return false;
  discoverSettingsStore.getState().setSession(url, result.token, result.expiresAt, account.key);
  return true;
}

/** Disconnects and keeps the app from connecting again on its own. */
export function disconnectDiscover(): void {
  const store = discoverSettingsStore.getState();
  store.clearConnection();
  store.setAutoConnectDisabled(true);
}

/** Turns automatic connection back on and tries it now. */
export function enableAutoConnect(): Promise<boolean> {
  discoverSettingsStore.getState().setAutoConnectDisabled(false);
  refused = null;
  return ensureDiscoverSession(true);
}

/** Test hook: forget the module-scope state. */
export function resetDiscoverAuthForTests(): void {
  inFlight = null;
  refused = null;
}
