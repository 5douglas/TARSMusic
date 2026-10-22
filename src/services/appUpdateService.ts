/**
 * In-app updates for the sideloaded Android build: looks up the latest GitHub release of the
 * TARSMusic repo, downloads its APK into the cache and hands it to the system package
 * installer. Android always asks the user to confirm the install (and, the first time, to allow
 * installs from this app); the update only installs over the current app when the APK is
 * signed with the same key.
 */
import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';

import i18n from '../i18n/i18n';
import { processingOverlayStore } from '../store/processingOverlayStore';
import { themedAlertStore } from '../store/themedAlertStore';

export const UPDATE_REPO = '5douglas/TARSMusic';
const LATEST_RELEASE_URL = `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`;
const APK_MIME = 'application/vnd.android.package-archive';
/** `Intent.FLAG_GRANT_READ_URI_PERMISSION`, so the installer can read our content:// URI. */
const FLAG_GRANT_READ_URI_PERMISSION = 1;
const NOTES_MAX_CHARS = 600;

export interface AppUpdate {
  version: string;
  notes: string;
  apkUrl: string;
}

interface GithubRelease {
  tag_name?: string;
  body?: string | null;
  draft?: boolean;
  prerelease?: boolean;
  assets?: Array<{ name?: string; browser_download_url?: string }>;
}

export function currentAppVersion(): string {
  return Constants.expoConfig?.version ?? '0.0.0';
}

/** Numeric parts of a version or tag ("v8.2.0" → [8, 2, 0]); null when it has none. */
export function parseVersion(version: string): number[] | null {
  const match = version.trim().match(/^v?(\d+(?:\.\d+)*)/i);
  return match ? match[1].split('.').map(Number) : null;
}

export function isNewerVersion(remote: string, current: string): boolean {
  const a = parseVersion(remote);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

/** The latest release when it is newer than this build and carries an APK; null otherwise. */
export async function checkForUpdate(): Promise<AppUpdate | null> {
  if (Platform.OS !== 'android') return null;
  try {
    const res = await fetch(LATEST_RELEASE_URL, { headers: { Accept: 'application/vnd.github+json' } });
    // 404 until the first release is published.
    if (!res.ok) return null;
    const release = (await res.json()) as GithubRelease;
    if (!release.tag_name || release.draft || release.prerelease) return null;
    const apk = release.assets?.find((a) => a.name?.toLowerCase().endsWith('.apk') && a.browser_download_url);
    if (!apk?.browser_download_url) return null;
    if (!isNewerVersion(release.tag_name, currentAppVersion())) return null;
    return {
      version: release.tag_name.replace(/^v/i, ''),
      notes: (release.body ?? '').trim().slice(0, NOTES_MAX_CHARS),
      apkUrl: apk.browser_download_url,
    };
  } catch {
    // Offline or GitHub unreachable: try again next launch.
    return null;
  }
}

/** Downloads the APK and opens the system installer, which asks the user to confirm. */
export async function downloadAndInstall(update: AppUpdate): Promise<void> {
  const overlay = processingOverlayStore.getState();
  overlay.show(i18n.t('appUpdateDownloading'));
  try {
    const target = new File(Paths.cache, `TARSMusic-${update.version}.apk`);
    const apk = await File.downloadFileAsync(update.apkUrl, target, { idempotent: true });
    overlay.hide();
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: apk.contentUri,
      type: APK_MIME,
      flags: FLAG_GRANT_READ_URI_PERMISSION,
    });
  } catch {
    overlay.showError(i18n.t('appUpdateFailed'));
  }
}

/** Offers a found update in a themed alert. */
export function promptUpdate(update: AppUpdate): void {
  const message = [i18n.t('appUpdateAvailableBody', { version: update.version }), update.notes]
    .filter(Boolean)
    .join('\n\n');
  themedAlertStore.getState().show(i18n.t('appUpdateAvailable'), message, [
    { text: i18n.t('appUpdateLater'), style: 'cancel' },
    { text: i18n.t('appUpdateInstall'), onPress: () => { void downloadAndInstall(update); } },
  ]);
}

/** Manual "Check for updates": reports "up to date" when there is nothing newer. */
export async function checkForUpdateInteractive(): Promise<void> {
  const overlay = processingOverlayStore.getState();
  overlay.show(i18n.t('appUpdateChecking'));
  const update = await checkForUpdate();
  if (update) {
    overlay.hide();
    promptUpdate(update);
  } else {
    overlay.showSuccess(i18n.t('appUpdateUpToDate', { version: currentAppVersion() }));
  }
}
