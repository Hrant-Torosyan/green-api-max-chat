import { act, renderHook } from '@testing-library/react';
import type { Message, OutgoingMessage } from '../chat/model';
import { GreenApiError, type GreenApiErrorKind } from '../green-api/errors';
import { useChats } from './useChats';
import { useSendMessage } from './useSendMessage';

const CHAT = '10000000';

/** A sendMessage fake whose calls resolve or reject only when the test says so. */
function controllableSend() {
  const calls: { text: string; resolve: (id: string) => void; reject: (e: unknown) => void }[] = [];
  const sendMessage = vi.fn(
    (_chatId: string, text: string) =>
      new Promise<string>((resolve, reject) => {
        calls.push({ text, resolve, reject });
      }),
  );
  return { sendMessage, calls };
}

function setup() {
  const client = controllableSend();
  const { result } = renderHook(() => {
    const { activeChat, dispatch } = useChats('1103123456');
    const { send, retry } = useSendMessage(client, dispatch);
    return { messages: activeChat?.messages ?? [], send, retry, dispatch };
  });
  act(() => result.current.dispatch({ type: 'chatOpened', chatId: CHAT, phone: '79991234567' }));

  function outgoing(index: number): OutgoingMessage {
    const message: Message | undefined = result.current.messages[index];
    if (message?.direction !== 'outgoing') throw new Error(`No outgoing message at ${index}`);
    return message;
  }

  return {
    client,
    outgoing,
    messages: () => result.current.messages,
    send: (text: string) => act(() => result.current.send(CHAT, text)),
    retry: (message: OutgoingMessage) => act(() => result.current.retry(CHAT, message)),
    settle: (fn: () => void) =>
      act(async () => {
        fn();
        await Promise.resolve();
      }),
  };
}

function apiError(kind: GreenApiErrorKind) {
  return new GreenApiError('sendMessage', kind);
}

describe('useSendMessage', () => {
  it('shows the message as sending, then sent with the server id', async () => {
    const { client, outgoing, send, settle } = setup();

    send('Привет');
    expect(outgoing(0)).toMatchObject({
      text: 'Привет',
      serverId: null,
      status: { type: 'sending' },
    });
    expect(client.sendMessage).toHaveBeenCalledWith(CHAT, 'Привет');

    await settle(() => client.calls[0]?.resolve('server-1'));
    expect(outgoing(0)).toMatchObject({ serverId: 'server-1', status: { type: 'sent' } });
  });

  it('sends the text exactly as typed and ignores blank text', () => {
    const { client, messages, send } = setup();

    send('   ');
    expect(messages()).toHaveLength(0);

    send('  отступ\n');
    expect(client.sendMessage).toHaveBeenCalledOnce();
    expect(client.sendMessage).toHaveBeenCalledWith(CHAT, '  отступ\n');
  });

  it.each<[GreenApiErrorKind, string]>([
    ['network', 'network'],
    ['server', 'network'],
    ['timeout', 'interrupted'],
    ['invalidResponse', 'interrupted'],
    ['quotaExceeded', 'quotaExceeded'],
    ['accountSuspended', 'accountSuspended'],
    ['rateLimited', 'rateLimited'],
    ['unauthorized', 'rejected'],
  ])('marks the message failed on %s (%s)', async (kind, reason) => {
    const { client, outgoing, send, settle } = setup();
    send('Привет');
    await settle(() => client.calls[0]?.reject(apiError(kind)));
    expect(outgoing(0).status).toEqual({ type: 'failed', reason });
  });

  it('keeps concurrent sends independent when they finish out of order', async () => {
    const { client, outgoing, send, settle } = setup();
    send('A');
    send('B');
    expect(client.sendMessage).toHaveBeenCalledTimes(2);

    await settle(() => client.calls[1]?.resolve('server-B'));
    expect(outgoing(0).status).toEqual({ type: 'sending' });
    expect(outgoing(1)).toMatchObject({ serverId: 'server-B', status: { type: 'sent' } });

    await settle(() => client.calls[0]?.reject(apiError('network')));
    expect(outgoing(0).status).toEqual({ type: 'failed', reason: 'network' });
    expect(outgoing(1).status).toEqual({ type: 'sent' });
  });

  it('retries in place with the same text and records the new server id', async () => {
    const { client, outgoing, messages, send, retry, settle } = setup();
    send('A');
    send('B');
    await settle(() => client.calls[0]?.reject(apiError('network')));
    await settle(() => client.calls[1]?.resolve('server-B'));
    const failedId = outgoing(0).id;

    retry(outgoing(0));
    expect(outgoing(0)).toMatchObject({ id: failedId, status: { type: 'sending' } });
    expect(client.sendMessage).toHaveBeenLastCalledWith(CHAT, 'A');

    await settle(() => client.calls[2]?.resolve('server-A2'));
    expect(messages().map((message) => message.text)).toEqual(['A', 'B']);
    expect(outgoing(0)).toMatchObject({ serverId: 'server-A2', status: { type: 'sent' } });
  });

  it('can fail again after a retry', async () => {
    const { client, outgoing, send, retry, settle } = setup();
    send('A');
    await settle(() => client.calls[0]?.reject(apiError('network')));

    retry(outgoing(0));
    await settle(() => client.calls[1]?.reject(apiError('quotaExceeded')));
    expect(outgoing(0).status).toEqual({ type: 'failed', reason: 'quotaExceeded' });
  });

  it('sends once when retry is clicked twice', async () => {
    const { client, outgoing, send, retry, settle } = setup();
    send('A');
    await settle(() => client.calls[0]?.reject(apiError('network')));
    const staleFailed = outgoing(0);

    retry(staleFailed);
    retry(staleFailed);

    expect(client.sendMessage).toHaveBeenCalledTimes(2);
  });
});
