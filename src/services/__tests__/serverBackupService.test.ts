const mockFiles = new Map<string, string>();
jest.mock('expo-file-system', () => {
  class File {
    name: string;
    constructor(_dir: unknown, name: string) {
      this.name = name;
    }
    get exists() {
      return mockFiles.has(this.name);
    }
    write(content: string) {
      mockFiles.set(this.name, content);
    }
    async base64() {
      return mockFiles.get(this.name) ?? '';
    }
    delete() {
      mockFiles.delete(this.name);
    }
  }
  return { File };
});

const mockRestoreBackup = jest.fn();
const mockListBackups = jest.fn();
const mockCreateBackup = jest.fn();
jest.mock('../backupService', () => ({
  BACKUP_FILE_SUFFIXES: ['.meta.json', '.scrobbles.gz', '.mbid.gz', '.exclusions.gz', '.bookmarks.gz'],
  getBackupDirectory: () => 'backups',
  listBackups: (...a: unknown[]) => mockListBackups(...a),
  restoreBackup: (...a: unknown[]) => mockRestoreBackup(...a),
  createBackup: () => mockCreateBackup(),
  pruneBackups: jest.fn(async () => undefined),
  makeBackupIdentityKey: (url: string, user: string) => `${url}|${user}`,
}));

const mockApi = {
  getPlaylists: jest.fn(),
  getPlaylist: jest.fn(),
  createPlaylist: jest.fn(),
  updatePlaylist: jest.fn(),
};
jest.mock('../subsonicService', () => ({
  SERVER_BACKUP_PLAYLIST_NAME: 'TARSMusic backup (não apagar)',
  getApi: () => mockApi,
  buildPostApi: () => mockApi,
}));

jest.mock('../../store/persistence/kvStorage', () => require('../../store/persistence/__mocks__/kvStorage'));

import { authStore } from '../../store/authStore';
import { backupStore } from '../../store/backupStore';
import {
  SERVER_BACKUP_MARKER,
  parseServerBackup,
  restoreFromServerIfNewer,
  syncBackupWithServer,
  uploadBackupToServer,
} from '../serverBackupService';

const IDENTITY = 'https://music.example|dino';
const NAME = 'TARSMusic backup (não apagar)';
const bundle = (createdAt = '2026-11-01T00:00:00.000Z') => ({
  v: 1,
  createdAt,
  deviceId: 'other-phone',
  files: { '.meta.json': 'bWV0YQ==', '.scrobbles.gz': 'c2Nyb2JibGVz' },
});
const comment = (b: object) => SERVER_BACKUP_MARKER + JSON.stringify(b);

beforeEach(() => {
  jest.clearAllMocks();
  mockFiles.clear();
  authStore.setState({ serverUrl: 'https://music.example', primaryServerUrl: null, username: 'dino' } as never);
  backupStore.setState({ serverSyncedAt: {}, serverChecked: {}, lastBackupTimes: {}, autoBackupEnabled: true });
  mockApi.getPlaylists.mockResolvedValue({ playlists: { playlist: [] } });
});

describe('parseServerBackup', () => {
  it('reads a bundle and ignores anything else', () => {
    expect(parseServerBackup(comment(bundle()))?.createdAt).toBe('2026-11-01T00:00:00.000Z');
    expect(parseServerBackup('a normal playlist comment')).toBeNull();
    expect(parseServerBackup(`${SERVER_BACKUP_MARKER}{broken`)).toBeNull();
    expect(parseServerBackup(undefined)).toBeNull();
  });
});

describe('restoreFromServerIfNewer', () => {
  it('marks the server checked when it holds no backup', async () => {
    await expect(restoreFromServerIfNewer()).resolves.toBeNull();
    expect(backupStore.getState().serverChecked[IDENTITY]).toBe(true);
    expect(mockRestoreBackup).not.toHaveBeenCalled();
  });

  it('merges a new server backup and cleans up the unpacked files', async () => {
    mockApi.getPlaylists.mockResolvedValue({ playlists: { playlist: [{ id: 'p1', name: NAME, owner: 'dino' }] } });
    mockApi.getPlaylist.mockResolvedValue({ playlist: { comment: comment(bundle()) } });
    mockListBackups.mockImplementation(async () => {
      const stem = [...mockFiles.keys()][0].replace('.meta.json', '');
      return { current: [{ stem }], other: [] };
    });
    mockRestoreBackup.mockResolvedValue({ scrobbleCount: 3 });

    const counts = await restoreFromServerIfNewer();

    expect(mockRestoreBackup).toHaveBeenCalledWith(expect.objectContaining({ stem: expect.stringMatching(/^server-/) }), 'merge');
    expect(counts).toEqual({ scrobbleCount: 3 });
    expect(backupStore.getState().serverSyncedAt[IDENTITY]).toBe('2026-11-01T00:00:00.000Z');
    expect(backupStore.getState().serverChecked[IDENTITY]).toBe(true);
    expect(mockFiles.size).toBe(0);
  });

  it('skips a backup it already merged or wrote', async () => {
    backupStore.getState().setServerSynced(IDENTITY, '2026-11-01T00:00:00.000Z');
    mockApi.getPlaylists.mockResolvedValue({ playlists: { playlist: [{ id: 'p1', name: NAME, owner: 'dino' }] } });
    mockApi.getPlaylist.mockResolvedValue({ playlist: { comment: comment(bundle()) } });
    await restoreFromServerIfNewer();
    expect(mockRestoreBackup).not.toHaveBeenCalled();
  });

  it('ignores another user’s playlist with the same name', async () => {
    mockApi.getPlaylists.mockResolvedValue({ playlists: { playlist: [{ id: 'p9', name: NAME, owner: 'someone' }] } });
    await restoreFromServerIfNewer();
    expect(mockApi.getPlaylist).not.toHaveBeenCalled();
  });
});

describe('uploadBackupToServer', () => {
  beforeEach(() => {
    mockFiles.set('backup-1.meta.json', 'bWV0YQ==');
    mockFiles.set('backup-1.scrobbles.gz', 'c2M=');
  });

  it('never overwrites the server before merging it', async () => {
    await expect(uploadBackupToServer('backup-1')).resolves.toBe(false);
    expect(mockApi.updatePlaylist).not.toHaveBeenCalled();
  });

  it('creates the private playlist and stores the bundle in its comment', async () => {
    backupStore.getState().setServerChecked(IDENTITY, true);
    mockApi.getPlaylists
      .mockResolvedValueOnce({ playlists: { playlist: [] } })
      .mockResolvedValueOnce({ playlists: { playlist: [{ id: 'new', name: NAME, owner: 'dino' }] } });

    await expect(uploadBackupToServer('backup-1')).resolves.toBe(true);

    expect(mockApi.createPlaylist).toHaveBeenCalledWith({ name: NAME });
    const args = mockApi.updatePlaylist.mock.calls[0][0];
    expect(args).toMatchObject({ playlistId: 'new', public: false });
    const sent = parseServerBackup(args.comment);
    expect(sent?.files).toEqual({ '.meta.json': 'bWV0YQ==', '.scrobbles.gz': 'c2M=' });
    expect(backupStore.getState().serverSyncedAt[IDENTITY]).toBe(sent?.createdAt);
  });
});

describe('syncBackupWithServer', () => {
  it('merges, then backs up and uploads when the last backup is old', async () => {
    mockCreateBackup.mockImplementation(async () => {
      mockFiles.set('backup-2.meta.json', 'bWV0YQ==');
      return 'backup-2';
    });
    mockApi.getPlaylists.mockResolvedValue({ playlists: { playlist: [{ id: 'p1', name: NAME, owner: 'dino' }] } });
    mockApi.getPlaylist.mockResolvedValue({ playlist: { comment: '' } });

    await syncBackupWithServer();

    expect(mockCreateBackup).toHaveBeenCalled();
    expect(mockApi.updatePlaylist).toHaveBeenCalledWith(expect.objectContaining({ playlistId: 'p1' }));
  });

  it('leaves a recent backup alone', async () => {
    backupStore.getState().setLastBackupTime(IDENTITY, Date.now() - 60_000);
    await syncBackupWithServer();
    expect(mockCreateBackup).not.toHaveBeenCalled();
  });

  it('does not upload when the server could not be read', async () => {
    mockApi.getPlaylists.mockRejectedValue(new Error('offline'));
    await syncBackupWithServer();
    expect(mockCreateBackup).not.toHaveBeenCalled();
    expect(mockApi.updatePlaylist).not.toHaveBeenCalled();
  });
});
