const mockPlayers: Array<{
  uri: string;
  play: jest.Mock;
  remove: jest.Mock;
  emit: (status: { didJustFinish: boolean }) => void;
}> = [];

jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(({ uri }: { uri: string }) => {
    let listener: (s: { didJustFinish: boolean }) => void = () => {};
    const p = {
      uri,
      play: jest.fn(),
      remove: jest.fn(),
      addListener: jest.fn((_event: string, cb: typeof listener) => {
        listener = cb;
      }),
      emit: (s: { didJustFinish: boolean }) => listener(s),
    };
    mockPlayers.push(p);
    return p;
  }),
}));

jest.mock('../playerService', () => ({ togglePlayPause: jest.fn(async () => {}) }));
jest.mock('../../store/persistence/kvStorage', () =>
  require('../../store/persistence/__mocks__/kvStorage'),
);

import { discoverPreviewStore } from '../../store/discoverPreviewStore';
import { discoverSettingsStore } from '../../store/discoverSettingsStore';
import { playerStore } from '../../store/playerStore';
import { stopDiscoverPreview, toggleDiscoverPreview } from '../discoverPreviewService';
import { togglePlayPause } from '../playerService';

beforeEach(() => {
  stopDiscoverPreview();
  mockPlayers.length = 0;
  jest.mocked(togglePlayPause).mockClear();
  discoverSettingsStore.setState({ baseUrl: 'https://d.example.com', token: 't' });
  playerStore.setState({ playbackState: 'idle' });
});

describe('toggleDiscoverPreview', () => {
  it('plays the backend preview url and marks it playing', async () => {
    await toggleDiscoverPreview(7);
    expect(mockPlayers).toHaveLength(1);
    expect(mockPlayers[0].uri).toBe('https://d.example.com/preview/7?token=t');
    expect(mockPlayers[0].play).toHaveBeenCalled();
    expect(discoverPreviewStore.getState().playingId).toBe(7);
    expect(togglePlayPause).not.toHaveBeenCalled();
  });

  it('pauses the main player when it is playing', async () => {
    playerStore.setState({ playbackState: 'playing' });
    await toggleDiscoverPreview(7);
    expect(togglePlayPause).toHaveBeenCalledTimes(1);
  });

  it('stops when the same preview is toggled again', async () => {
    await toggleDiscoverPreview(7);
    await toggleDiscoverPreview(7);
    expect(mockPlayers).toHaveLength(1);
    expect(mockPlayers[0].remove).toHaveBeenCalled();
    expect(discoverPreviewStore.getState().playingId).toBeNull();
  });

  it('switches to another preview, releasing the previous player', async () => {
    await toggleDiscoverPreview(7);
    await toggleDiscoverPreview(8);
    expect(mockPlayers[0].remove).toHaveBeenCalled();
    expect(discoverPreviewStore.getState().playingId).toBe(8);
  });

  it('clears the playing state when the preview finishes', async () => {
    await toggleDiscoverPreview(7);
    mockPlayers[0].emit({ didJustFinish: false });
    expect(discoverPreviewStore.getState().playingId).toBe(7);
    mockPlayers[0].emit({ didJustFinish: true });
    expect(discoverPreviewStore.getState().playingId).toBeNull();
  });

  it('ignores a finish event from a replaced player', async () => {
    await toggleDiscoverPreview(7);
    await toggleDiscoverPreview(8);
    mockPlayers[0].emit({ didJustFinish: true });
    expect(discoverPreviewStore.getState().playingId).toBe(8);
  });

  it('does nothing when unconfigured', async () => {
    discoverSettingsStore.setState({ baseUrl: null });
    await toggleDiscoverPreview(7);
    expect(mockPlayers).toHaveLength(0);
  });
});
