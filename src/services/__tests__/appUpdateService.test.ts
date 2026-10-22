const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '8.1.9' } },
}));

const mockDownload = jest.fn();
jest.mock('expo-file-system', () => {
  class File {
    uri: string;
    constructor(_dir: unknown, name: string) {
      this.uri = `file:///cache/${name}`;
    }
    static downloadFileAsync = (...args: unknown[]) => mockDownload(...args);
  }
  return { File, Paths: { cache: 'cache' } };
});

const mockStartActivity = jest.fn();
jest.mock('expo-intent-launcher', () => ({
  startActivityAsync: (...args: unknown[]) => mockStartActivity(...args),
}));

import { Platform } from 'react-native';

import { processingOverlayStore } from '../../store/processingOverlayStore';
import { themedAlertStore } from '../../store/themedAlertStore';
import {
  checkForUpdate,
  checkForUpdateInteractive,
  downloadAndInstall,
  isNewerVersion,
  parseVersion,
} from '../appUpdateService';

const release = (over: Record<string, unknown> = {}) => ({
  tag_name: 'v8.2.0',
  body: 'Artist page and daily mixes',
  draft: false,
  prerelease: false,
  assets: [
    { name: 'checksums.txt', browser_download_url: 'https://example.com/sums' },
    { name: 'TARSMusic-8.2.0.apk', browser_download_url: 'https://example.com/app.apk' },
  ],
  ...over,
});

beforeEach(() => {
  mockFetch.mockReset();
  mockDownload.mockReset();
  mockStartActivity.mockReset();
  jest.replaceProperty(Platform, 'OS', 'android');
  themedAlertStore.setState({ visible: false, buttons: [] });
});

afterEach(() => {
  jest.restoreAllMocks();
  // Clears the overlay's pending timers.
  processingOverlayStore.getState().hide();
});

describe('version comparison', () => {
  it('parses tags with or without a leading v', () => {
    expect(parseVersion('v8.2.0')).toEqual([8, 2, 0]);
    expect(parseVersion('8.1.9')).toEqual([8, 1, 9]);
    expect(parseVersion('latest')).toBeNull();
  });

  it('compares numerically, padding missing parts', () => {
    expect(isNewerVersion('v8.2.0', '8.1.9')).toBe(true);
    expect(isNewerVersion('8.1.10', '8.1.9')).toBe(true);
    expect(isNewerVersion('8.1', '8.1.0')).toBe(false);
    expect(isNewerVersion('8.1.9', '8.1.9')).toBe(false);
    expect(isNewerVersion('8.0.12', '8.1.9')).toBe(false);
    expect(isNewerVersion('nightly', '8.1.9')).toBe(false);
  });
});

describe('checkForUpdate', () => {
  it('returns the newer release with its APK', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => release() });
    await expect(checkForUpdate()).resolves.toEqual({
      version: '8.2.0',
      notes: 'Artist page and daily mixes',
      apkUrl: 'https://example.com/app.apk',
    });
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.github.com/repos/5douglas/TARSMusic/releases/latest');
  });

  it('ignores releases that are not newer, have no APK, or are prereleases', async () => {
    for (const body of [
      release({ tag_name: 'v8.1.9' }),
      release({ assets: [] }),
      release({ prerelease: true }),
    ]) {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => body });
      await expect(checkForUpdate()).resolves.toBeNull();
    }
  });

  it('returns null with no release yet or offline', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(checkForUpdate()).resolves.toBeNull();
    mockFetch.mockRejectedValueOnce(new Error('offline'));
    await expect(checkForUpdate()).resolves.toBeNull();
  });

  it('never checks off Android', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    await expect(checkForUpdate()).resolves.toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('downloadAndInstall', () => {
  it('downloads the APK and opens the installer with read access to it', async () => {
    mockDownload.mockResolvedValue({ contentUri: 'content://app/TARSMusic-8.2.0.apk' });
    await downloadAndInstall({ version: '8.2.0', notes: '', apkUrl: 'https://example.com/app.apk' });
    expect(mockDownload).toHaveBeenCalledWith(
      'https://example.com/app.apk',
      expect.objectContaining({ uri: 'file:///cache/TARSMusic-8.2.0.apk' }),
      { idempotent: true },
    );
    expect(mockStartActivity).toHaveBeenCalledWith('android.intent.action.VIEW', {
      data: 'content://app/TARSMusic-8.2.0.apk',
      type: 'application/vnd.android.package-archive',
      flags: 1,
    });
  });

  it('reports a failed download and does not open the installer', async () => {
    const showError = jest.spyOn(processingOverlayStore.getState(), 'showError');
    mockDownload.mockRejectedValue(new Error('network'));
    await downloadAndInstall({ version: '8.2.0', notes: '', apkUrl: 'https://example.com/app.apk' });
    expect(mockStartActivity).not.toHaveBeenCalled();
    expect(showError).toHaveBeenCalled();
  });
});

describe('checkForUpdateInteractive', () => {
  it('offers a found update in an alert', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => release() });
    await checkForUpdateInteractive();
    const alert = themedAlertStore.getState();
    expect(alert.visible).toBe(true);
    expect(alert.buttons).toHaveLength(2);
  });

  it('says it is up to date otherwise', async () => {
    const showSuccess = jest.spyOn(processingOverlayStore.getState(), 'showSuccess');
    mockFetch.mockResolvedValue({ ok: true, json: async () => release({ tag_name: 'v8.1.9' }) });
    await checkForUpdateInteractive();
    expect(showSuccess).toHaveBeenCalled();
    expect(themedAlertStore.getState().visible).toBe(false);
  });
});
