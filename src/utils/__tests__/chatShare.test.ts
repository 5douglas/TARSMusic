jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../services/playerService', () => ({ playTrack: jest.fn() }));
jest.mock('../../services/subsonicService', () => ({ getSong: jest.fn() }));

import { router } from 'expo-router';

import { getSong } from '../../services/subsonicService';
import { playTrack } from '../../services/playerService';
import { openChatShare, openChatShareTarget, parseChatShareParam } from '../chatShare';

beforeEach(() => jest.clearAllMocks());

it('round-trips the share through the route param', () => {
  const share = { kind: 'artist' as const, id: 'ar1', title: 'Djavan' };
  openChatShare(share);
  const arg = (router.push as jest.Mock).mock.calls[0][0];
  expect(arg.pathname).toBe('/chat-send');
  expect(parseChatShareParam(arg.params.share)).toEqual(share);
});

it('rejects malformed params', () => {
  expect(parseChatShareParam(undefined)).toBeNull();
  expect(parseChatShareParam('not json')).toBeNull();
  expect(parseChatShareParam(JSON.stringify({ kind: 'video', id: 'x' }))).toBeNull();
});

it('opens pages and plays songs', async () => {
  await openChatShareTarget({ kind: 'album', id: 'al1' });
  expect(router.push).toHaveBeenCalledWith('/album/al1');
  const song = { id: 's1' };
  (getSong as jest.Mock).mockResolvedValue(song);
  await openChatShareTarget({ kind: 'song', id: 's1' });
  expect(playTrack).toHaveBeenCalledWith(song, [song]);
});
