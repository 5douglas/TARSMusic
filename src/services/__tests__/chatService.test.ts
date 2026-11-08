const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

jest.mock('../subsonicService', () => ({
  getSubsonicAuthHeaders: jest.fn(async () => ({
    'X-Subsonic-User': 'douglas',
    'X-Subsonic-Token': 'tok',
    'X-Subsonic-Salt': 'salt',
  })),
}));
jest.mock('../../store/persistence/kvStorage', () =>
  require('../../store/persistence/__mocks__/kvStorage'),
);

import { discoverSettingsStore } from '../../store/discoverSettingsStore';
import {
  addContact,
  fetchConversations,
  fetchMessages,
  fetchUnreadCount,
  isChatConfigured,
  removeContact,
  sendChatMessage,
} from '../chatService';

const BASE = 'https://discover.example.com';

beforeEach(() => {
  mockFetch.mockReset();
  discoverSettingsStore.setState({ baseUrl: BASE, token: 'secret' });
});

it('is configured by the Discover address alone', () => {
  expect(isChatConfigured()).toBe(true);
  discoverSettingsStore.setState({ token: null });
  expect(isChatConfigured()).toBe(true);
  discoverSettingsStore.setState({ baseUrl: null });
  expect(isChatConfigured()).toBe(false);
});

it('sends the Subsonic credentials to <discover>/chat', async () => {
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
  await fetchConversations();
  const [url, init] = mockFetch.mock.calls[0];
  expect(url).toBe(`${BASE}/chat/conversations`);
  expect(init.method).toBe('GET');
  expect(init.headers).toEqual({ 'X-Subsonic-User': 'douglas', 'X-Subsonic-Token': 'tok', 'X-Subsonic-Salt': 'salt' });
});

it('builds message paging queries', async () => {
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
  await fetchMessages('ana', { after: 5 });
  await fetchMessages('ana', { before: 9 });
  expect(mockFetch.mock.calls[0][0]).toBe(`${BASE}/chat/messages?with=ana&after=5`);
  expect(mockFetch.mock.calls[1][0]).toBe(`${BASE}/chat/messages?with=ana&before=9`);
});

it('posts a message with a share card', async () => {
  const message = { id: 1, from: 'douglas', to: 'ana', text: '', share: null, sentAt: 1, readAt: null };
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({ message }) });
  const share = { kind: 'album' as const, id: 'al1', title: 'Album' };
  await expect(sendChatMessage('ana', { share })).resolves.toEqual(message);
  const init = mockFetch.mock.calls[0][1];
  expect(init.method).toBe('POST');
  expect(JSON.parse(init.body)).toEqual({ to: 'ana', share });
  expect(init.headers['Content-Type']).toBe('application/json');
});

it('adds and removes contacts', async () => {
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  await expect(addContact('ana')).resolves.toBe(true);
  await expect(removeContact('a b')).resolves.toBe(true);
  expect(mockFetch.mock.calls[1][0]).toBe(`${BASE}/chat/contacts/a%20b`);
  expect(mockFetch.mock.calls[1][1].method).toBe('DELETE');
});

it('returns null on HTTP errors and when offline', async () => {
  mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
  await expect(fetchUnreadCount()).resolves.toBeNull();
  mockFetch.mockRejectedValueOnce(new Error('offline'));
  await expect(fetchConversations()).resolves.toBeNull();
});

it('does nothing without a Discover address', async () => {
  discoverSettingsStore.setState({ baseUrl: null });
  await expect(fetchConversations()).resolves.toBeNull();
  expect(mockFetch).not.toHaveBeenCalled();
});
