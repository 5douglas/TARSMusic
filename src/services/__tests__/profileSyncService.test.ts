const mockFiles = new Map<string, string>();
jest.mock('expo-file-system', () => {
  class File {
    uri: string;
    constructor(dirOrUri: unknown, name?: string) {
      this.uri = name ? `file:///docs/${name}` : String(dirOrUri);
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    write(content: string) {
      mockFiles.set(this.uri, content);
    }
    async base64() {
      return mockFiles.get(this.uri) ?? '';
    }
    delete() {
      mockFiles.delete(this.uri);
    }
  }
  return { File, Paths: { document: 'docs' } };
});

const mockApi = {
  getPlaylists: jest.fn(),
  getPlaylist: jest.fn(),
  createPlaylist: jest.fn(),
  updatePlaylist: jest.fn(),
};
let mockLoggedIn = true;
jest.mock('../subsonicService', () => ({
  SERVER_PROFILE_PLAYLIST_NAME: 'TARSMusic perfil (não apagar)',
  getApi: () => (mockLoggedIn ? mockApi : null),
}));
jest.mock('../../store/persistence/kvStorage', () => require('../../store/persistence/__mocks__/kvStorage'));

import { authStore } from '../../store/authStore';
import { profileStore } from '../../store/profileStore';
import {
  SERVER_PROFILE_MARKER,
  parseServerProfile,
  pushProfileToServer,
  syncProfileWithServer,
} from '../profileSyncService';

const NAME = 'TARSMusic perfil (não apagar)';
const comment = (o: object) => SERVER_PROFILE_MARKER + JSON.stringify(o);

beforeEach(() => {
  jest.clearAllMocks();
  mockFiles.clear();
  mockLoggedIn = true;
  authStore.setState({ username: 'dino' } as never);
  profileStore.setState({ avatarUri: null, avatarVersion: 0, avatarUpdatedAt: null, avatarDirty: false });
  mockApi.getPlaylists.mockResolvedValue({ playlists: { playlist: [] } });
});

describe('parseServerProfile', () => {
  it('reads an envelope and ignores anything else', () => {
    expect(parseServerProfile(comment({ v: 1, updatedAt: '2026-11-07T00:00:00Z', avatar: 'abc' }))?.avatar).toBe('abc');
    expect(parseServerProfile('just a comment')).toBeNull();
    expect(parseServerProfile(`${SERVER_PROFILE_MARKER}{oops`)).toBeNull();
    expect(parseServerProfile(comment({ v: 1, updatedAt: 'x', avatar: 5 }))).toBeNull();
  });
});

describe('pushProfileToServer', () => {
  it('creates the private playlist and stores the picture in its comment', async () => {
    mockFiles.set('file:///docs/a.jpg', 'SlBFRw==');
    profileStore.getState().setAvatar('file:///docs/a.jpg');
    mockApi.getPlaylists
      .mockResolvedValueOnce({ playlists: { playlist: [] } })
      .mockResolvedValueOnce({ playlists: { playlist: [{ id: 'p1', name: NAME, owner: 'dino' }] } });

    await expect(pushProfileToServer()).resolves.toBe(true);

    expect(mockApi.createPlaylist).toHaveBeenCalledWith({ name: NAME });
    const args = mockApi.updatePlaylist.mock.calls[0][0];
    expect(args).toMatchObject({ playlistId: 'p1', public: false });
    expect(parseServerProfile(args.comment)).toEqual({
      v: 1,
      updatedAt: profileStore.getState().avatarUpdatedAt,
      avatar: 'SlBFRw==',
    });
    expect(profileStore.getState().avatarDirty).toBe(false);
  });

  it('keeps the change pending when the server is unreachable', async () => {
    mockFiles.set('file:///docs/a.jpg', 'SlBFRw==');
    profileStore.getState().setAvatar('file:///docs/a.jpg');
    mockApi.getPlaylists.mockRejectedValue(new Error('offline'));
    await expect(pushProfileToServer()).resolves.toBe(false);
    expect(profileStore.getState().avatarDirty).toBe(true);
  });
});

describe('syncProfileWithServer', () => {
  const onServer = (profile: object) => {
    mockApi.getPlaylists.mockResolvedValue({ playlists: { playlist: [{ id: 'p1', name: NAME, owner: 'dino' }] } });
    mockApi.getPlaylist.mockResolvedValue({ playlist: { comment: comment(profile) } });
  };

  it('takes a newer picture from another device', async () => {
    onServer({ v: 1, updatedAt: '2026-11-07T10:00:00.000Z', avatar: 'TkVX' });
    await syncProfileWithServer();
    const state = profileStore.getState();
    expect(state.avatarUri).toMatch(/^file:\/\/\/docs\/profile-avatar-/);
    expect(mockFiles.get(state.avatarUri!)).toBe('TkVX');
    expect(state.avatarUpdatedAt).toBe('2026-11-07T10:00:00.000Z');
    expect(state.avatarDirty).toBe(false);
    expect(mockApi.updatePlaylist).not.toHaveBeenCalled();
  });

  it('removes the picture here when it was removed on another device', async () => {
    mockFiles.set('file:///docs/old.jpg', 'T0xE');
    profileStore.setState({ avatarUri: 'file:///docs/old.jpg', avatarUpdatedAt: '2026-11-01T00:00:00.000Z' });
    onServer({ v: 1, updatedAt: '2026-11-07T10:00:00.000Z', avatar: null });
    await syncProfileWithServer();
    expect(profileStore.getState().avatarUri).toBeNull();
    expect(mockFiles.has('file:///docs/old.jpg')).toBe(false);
  });

  it('sends a newer local change that did not reach the server', async () => {
    mockFiles.set('file:///docs/me.jpg', 'TUU=');
    profileStore.setState({ avatarUri: 'file:///docs/me.jpg', avatarUpdatedAt: '2026-11-07T12:00:00.000Z', avatarDirty: true });
    onServer({ v: 1, updatedAt: '2026-11-07T10:00:00.000Z', avatar: 'T0xE' });
    await syncProfileWithServer();
    expect(parseServerProfile(mockApi.updatePlaylist.mock.calls[0][0].comment)?.avatar).toBe('TUU=');
    expect(profileStore.getState().avatarUri).toBe('file:///docs/me.jpg');
  });

  it('uploads a picture chosen before syncing existed', async () => {
    mockFiles.set('file:///docs/me.jpg', 'TUU=');
    profileStore.setState({ avatarUri: 'file:///docs/me.jpg' });
    mockApi.getPlaylists
      .mockResolvedValueOnce({ playlists: { playlist: [] } })
      .mockResolvedValueOnce({ playlists: { playlist: [] } })
      .mockResolvedValueOnce({ playlists: { playlist: [{ id: 'p1', name: NAME, owner: 'dino' }] } });
    await syncProfileWithServer();
    expect(mockApi.updatePlaylist).toHaveBeenCalledWith(expect.objectContaining({ playlistId: 'p1' }));
    expect(profileStore.getState().avatarDirty).toBe(false);
  });

  it('ignores another user’s playlist with the same name', async () => {
    mockApi.getPlaylists.mockResolvedValue({ playlists: { playlist: [{ id: 'p9', name: NAME, owner: 'someone' }] } });
    await syncProfileWithServer();
    expect(mockApi.getPlaylist).not.toHaveBeenCalled();
    expect(profileStore.getState().avatarUri).toBeNull();
  });

  it('does nothing while signed out', async () => {
    mockLoggedIn = false;
    await syncProfileWithServer();
    expect(mockApi.getPlaylists).not.toHaveBeenCalled();
  });
});
