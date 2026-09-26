import type { ChatsState } from './chat/chatReducer';
import {
  clearSession,
  disableAutoConnect,
  loadChats,
  loadCredentials,
  saveChats,
  saveCredentials,
} from './storage';

const credentials = {
  apiUrl: 'https://1103.api.green-api.com',
  idInstance: '1103123456',
  apiTokenInstance: 'token',
};

beforeEach(() => {
  sessionStorage.clear();
});

describe('credentials storage', () => {
  it('round-trips credentials through sessionStorage', () => {
    saveCredentials(credentials);
    expect(loadCredentials()).toEqual({ credentials, autoConnect: true });

    clearSession();
    expect(loadCredentials()).toBeNull();
  });

  it('keeps credentials but turns off auto-connect', () => {
    saveCredentials(credentials);
    disableAutoConnect();
    expect(loadCredentials()).toEqual({ credentials, autoConnect: false });
  });

  it('auto-connects with credentials saved before the flag existed', () => {
    sessionStorage.setItem('max-web-chat/credentials/v1', JSON.stringify(credentials));
    expect(loadCredentials()).toEqual({ credentials, autoConnect: true });
  });

  it('returns null when nothing is stored', () => {
    expect(loadCredentials()).toBeNull();
  });

  it.each([
    ['invalid JSON', '{not json'],
    ['a wrong shape', JSON.stringify({ apiUrl: 'https://x', idInstance: 1 })],
    ['a non-object', JSON.stringify('token')],
  ])('ignores %s', (_case, raw) => {
    sessionStorage.setItem('max-web-chat/credentials/v1', raw);
    expect(loadCredentials()).toBeNull();
  });

  it('keeps working when the browser blocks storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });

    expect(() => saveCredentials(credentials)).not.toThrow();
    expect(loadCredentials()).toBeNull();
  });
});

describe('chats storage', () => {
  const state: ChatsState = {
    activeChatId: '10000000',
    chats: [
      {
        id: '10000000',
        phone: '79991234567',
        name: 'Анна',
        messages: [
          { direction: 'incoming', id: 'in-1', text: 'Привет', sentAt: 1000 },
          {
            direction: 'outgoing',
            id: 'local-1',
            serverId: 'server-1',
            text: 'Ответ',
            sentAt: 2000,
            status: { type: 'sent' },
          },
          {
            direction: 'outgoing',
            id: 'local-2',
            serverId: null,
            text: 'Не ушло',
            sentAt: 3000,
            status: { type: 'failed', reason: 'network' },
          },
        ],
      },
    ],
  };

  it('round-trips chats for the same instance only', () => {
    saveChats('1103123456', state);
    expect(loadChats('1103123456')).toEqual(state);
    expect(loadChats('1103999999')).toBeNull();
  });

  it.each([
    ['invalid JSON', '{oops'],
    ['a missing instance id', JSON.stringify({ state })],
    [
      'an unknown message direction',
      JSON.stringify({
        idInstance: '1103123456',
        state: { ...state, chats: [{ ...state.chats[0], messages: [{ direction: 'sideways' }] }] },
      }),
    ],
    [
      'an unknown failure reason',
      JSON.stringify({
        idInstance: '1103123456',
        state: {
          activeChatId: null,
          chats: [
            {
              id: '1',
              phone: '79991234567',
              name: null,
              messages: [
                {
                  direction: 'outgoing',
                  id: 'a',
                  serverId: null,
                  text: 't',
                  sentAt: 1,
                  status: { type: 'failed', reason: 'gremlins' },
                },
              ],
            },
          ],
        },
      }),
    ],
  ])('ignores saved chats with %s', (_case, raw) => {
    sessionStorage.setItem('max-web-chat/chats/v1', raw);
    expect(loadChats('1103123456')).toBeNull();
  });

  it('clears chats and credentials together', () => {
    saveCredentials(credentials);
    saveChats('1103123456', state);

    clearSession();

    expect(loadCredentials()).toBeNull();
    expect(loadChats('1103123456')).toBeNull();
  });
});
