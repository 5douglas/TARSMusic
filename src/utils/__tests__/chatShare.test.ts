jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

import { router } from 'expo-router';

import { openChatShare, parseChatShareParam } from '../chatShare';

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
