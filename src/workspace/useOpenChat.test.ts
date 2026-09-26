import { act, renderHook } from '@testing-library/react';
import type { CheckAccountResult } from '../green-api/client';
import { GreenApiError } from '../green-api/errors';
import { useChats } from './useChats';
import { useOpenChat } from './useOpenChat';

function setup() {
  const client = { checkAccount: vi.fn<(phone: string) => Promise<CheckAccountResult>>() };
  const { result } = renderHook(() => {
    const { state, activeChat, dispatch } = useChats('1103123456');
    const openChat = useOpenChat(client, state, dispatch);
    return { chats: state.chats, activeChat, openChat, dispatch };
  });
  const open = (phone: string) => act(() => result.current.openChat(phone));
  return { client, result, open };
}

describe('useOpenChat', () => {
  it('opens a chat under the chat id returned by CheckAccount', async () => {
    const { client, result, open } = setup();
    client.checkAccount.mockResolvedValueOnce({ exists: true, chatId: '10000000' });

    await expect(open('79991234567')).resolves.toEqual({ ok: true });

    expect(client.checkAccount).toHaveBeenCalledWith('79991234567');
    expect(result.current.activeChat).toMatchObject({ id: '10000000', phone: '79991234567' });
  });

  it('keeps the most recently opened chat first and selects it', async () => {
    const { client, result, open } = setup();
    client.checkAccount
      .mockResolvedValueOnce({ exists: true, chatId: '10000000' })
      .mockResolvedValueOnce({ exists: true, chatId: '20000000' });

    await open('79991234567');
    await open('375291234567');

    expect(result.current.chats.map((chat) => chat.id)).toEqual(['20000000', '10000000']);
    expect(result.current.activeChat?.id).toBe('20000000');
  });

  it('reopens a known phone without another CheckAccount', async () => {
    const { client, result, open } = setup();
    client.checkAccount
      .mockResolvedValueOnce({ exists: true, chatId: '10000000' })
      .mockResolvedValueOnce({ exists: true, chatId: '20000000' });
    await open('79991234567');
    await open('375291234567');

    await expect(open('79991234567')).resolves.toEqual({ ok: true });

    expect(client.checkAccount).toHaveBeenCalledTimes(2);
    expect(result.current.activeChat?.id).toBe('10000000');
    expect(result.current.chats).toHaveLength(2);
  });

  it('does not duplicate a chat when two phones resolve to the same chat id', async () => {
    const { client, result, open } = setup();
    client.checkAccount.mockResolvedValue({ exists: true, chatId: '10000000' });

    await open('79991234567');
    await open('375291234567');

    expect(result.current.chats).toHaveLength(1);
  });

  it('reports a number without MAX and leaves the chats unchanged', async () => {
    const { client, result, open } = setup();
    client.checkAccount.mockResolvedValueOnce({ exists: false });

    await expect(open('79991234567')).resolves.toEqual({
      ok: false,
      problem: { type: 'noAccount' },
    });
    expect(result.current.chats).toEqual([]);
  });

  it('reports API failures by kind', async () => {
    const { client, open } = setup();
    client.checkAccount.mockRejectedValueOnce(new GreenApiError('checkAccount', 'phoneCheckLimit'));

    await expect(open('79991234567')).resolves.toEqual({
      ok: false,
      problem: { type: 'requestFailed', kind: 'phoneCheckLimit' },
    });
  });

  it('turns an unexpected exception into a problem', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { client, open } = setup();
    client.checkAccount.mockRejectedValueOnce(new Error('bug'));

    await expect(open('79991234567')).resolves.toEqual({
      ok: false,
      problem: { type: 'unexpectedError' },
    });
  });
});
