import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CheckAccountResult, ReceivedNotification } from '../green-api/client';
import { GreenApiError } from '../green-api/errors';
import type { InboundEvent } from '../green-api/notifications';
import { Workspace } from './Workspace';

/** A notification queue the test fills while the workspace long-polls it. */
function fakeInbox() {
  const queue: (ReceivedNotification | GreenApiError)[] = [];
  let wake: (() => void) | null = null;
  let nextReceipt = 1;

  const receiveNotification = vi.fn(
    (signal?: AbortSignal) =>
      new Promise<ReceivedNotification | null>((resolve, reject) => {
        const take = () => {
          const next = queue.shift();
          if (!next) {
            wake = take;
            return;
          }
          wake = null;
          if (next instanceof GreenApiError) reject(next);
          else resolve(next);
        };
        signal?.addEventListener('abort', () =>
          reject(new GreenApiError('receiveNotification', 'aborted')),
        );
        take();
      }),
  );

  return {
    receiveNotification,
    deleteNotification: vi.fn(() => Promise.resolve(true)),
    push(item: InboundEvent | null | GreenApiError) {
      queue.push(item instanceof GreenApiError ? item : { receiptId: nextReceipt++, event: item });
      wake?.();
    },
  };
}

function renderWorkspace() {
  const inbox = fakeInbox();
  const client = {
    ...inbox,
    checkAccount: vi.fn((phone: string) =>
      Promise.resolve<CheckAccountResult>({ exists: true, chatId: `chat-${phone}` }),
    ),
    sendMessage: vi.fn(() => Promise.resolve('server-1')),
  };
  const onInstanceStateChange = vi.fn();
  const onFatalError = vi.fn();
  const { unmount } = render(
    <Workspace
      idInstance="1103123456"
      client={client}
      instanceStatus={<p>Инстанс 1103123456</p>}
      onInstanceStateChange={onInstanceStateChange}
      onFatalError={onFatalError}
    />,
  );
  return { client, inbox, onInstanceStateChange, onFatalError, unmount, user: userEvent.setup() };
}

function reply(chatId: string, messageId: string, text: string): InboundEvent {
  return { type: 'messageReceived', chatId, messageId, text, sentAt: Date.now(), senderName: null };
}

async function openChat(user: ReturnType<typeof userEvent.setup>, phone: string) {
  await user.type(screen.getByLabelText('Новый чат'), `${phone}{Enter}`);
}

describe('Workspace', () => {
  it('shows the instance status and empty states before any chat is opened', () => {
    renderWorkspace();
    expect(screen.getByText('Инстанс 1103123456')).toBeInTheDocument();
    expect(screen.getByText(/Чатов пока нет/)).toBeInTheDocument();
    expect(screen.getByText(/Выберите чат/)).toBeInTheDocument();
  });

  it('opens chats, marks the selected one and switches between them', async () => {
    const { user } = renderWorkspace();

    await openChat(user, '+7 999 123-45-67');
    expect(screen.getByRole('heading', { name: '+7 999 123-45-67' })).toBeInTheDocument();
    expect(screen.getByText('Сообщений пока нет')).toBeInTheDocument();

    await openChat(user, '+375 29 123-45-67');
    const chats = within(screen.getByRole('navigation', { name: 'Чаты' }));
    expect(chats.getAllByRole('button').map((button) => button.textContent)).toEqual([
      '+375 29 123-45-67',
      '+7 999 123-45-67',
    ]);
    expect(chats.getByRole('button', { current: true })).toHaveTextContent('+375 29 123-45-67');

    await user.click(chats.getByRole('button', { name: '+7 999 123-45-67' }));
    expect(screen.getByRole('heading', { name: '+7 999 123-45-67' })).toBeInTheDocument();
    expect(chats.getByRole('button', { current: true })).toHaveTextContent('+7 999 123-45-67');
  });

  it('keeps focus where the user acted when list and chat are side by side', async () => {
    const { user } = renderWorkspace();

    await openChat(user, '+7 999 123-45-67');
    expect(screen.getByLabelText('Новый чат')).toHaveFocus();

    await openChat(user, '+375 29 123-45-67');
    const entry = screen.getByRole('button', { name: '+7 999 123-45-67' });
    await user.click(entry);
    expect(entry).toHaveFocus();
  });

  describe('single-pane layout', () => {
    beforeEach(() => {
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: true,
        media: query,
        addEventListener() {},
        removeEventListener() {},
      }));
    });

    it('moves focus to the opened chat and back to its list entry', async () => {
      const { user } = renderWorkspace();
      await openChat(user, '+7 999 123-45-67');
      expect(screen.getByRole('heading', { name: '+7 999 123-45-67' })).toHaveFocus();

      await user.click(screen.getByRole('button', { name: 'К списку чатов' }));

      expect(screen.getByText(/Выберите чат/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '+7 999 123-45-67' })).toHaveFocus();
    });
  });

  it('sends to the CheckAccount chat id and retries a failure', async () => {
    const { client, user } = renderWorkspace();
    client.sendMessage.mockRejectedValueOnce(new GreenApiError('sendMessage', 'network'));
    await openChat(user, '+7 999 123-45-67');

    await user.type(screen.getByRole('textbox', { name: 'Сообщение' }), 'Привет{Enter}');

    const log = within(screen.getByRole('log'));
    expect(await log.findByText('Нет связи с сервером')).toBeInTheDocument();
    expect(client.sendMessage).toHaveBeenCalledWith('chat-79991234567', 'Привет');

    await user.click(log.getByRole('button', { name: 'Повторить' }));
    expect(screen.getByRole('textbox', { name: 'Сообщение' })).toHaveFocus();
    expect(await log.findByText('Отправлено')).toBeInTheDocument();
    expect(log.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByRole('button', { name: '+7 999 123-45-67' })).toHaveAccessibleDescription(
      'Вы: Привет',
    );
  });

  describe('receiving', () => {
    it('shows replies, ignores unknown chats, deletes everything', async () => {
      const { inbox, client, user } = renderWorkspace();
      await openChat(user, '+7 999 123-45-67');
      await user.type(screen.getByRole('textbox', { name: 'Сообщение' }), 'Привет{Enter}');

      inbox.push(reply('chat-somebody-else', 'x-1', 'Чужое сообщение'));
      inbox.push(null);
      inbox.push(reply('chat-79991234567', 'r-1', 'Привет! Как дела?'));
      inbox.push(reply('chat-79991234567', 'r-1', 'Привет! Как дела?'));

      const log = within(screen.getByRole('log'));
      expect(await log.findByText('Привет! Как дела?')).toBeInTheDocument();
      await waitFor(() => expect(client.deleteNotification).toHaveBeenCalledTimes(4));
      expect(log.getAllByRole('listitem').map((item) => item.firstChild?.textContent)).toEqual([
        'Привет',
        'Привет! Как дела?',
      ]);
      expect(screen.queryByText('Чужое сообщение')).not.toBeInTheDocument();
      expect(within(screen.getByRole('navigation')).getAllByRole('button')).toHaveLength(1);
    });

    it('moves a chat with a new reply to the top of the list', async () => {
      const { inbox, user } = renderWorkspace();
      await openChat(user, '+7 999 123-45-67');
      await openChat(user, '+375 29 123-45-67');

      inbox.push(reply('chat-79991234567', 'r-1', 'Ответ'));

      const chats = within(screen.getByRole('navigation', { name: 'Чаты' }));
      await waitFor(() =>
        expect(chats.getAllByRole('button')[0]).toHaveAccessibleName('+7 999 123-45-67'),
      );
      expect(chats.getAllByRole('button')[0]).toHaveAccessibleDescription('Ответ');
    });

    it('applies a delivery failure only to its own attempt', async () => {
      const { inbox, client, user } = renderWorkspace();
      client.sendMessage.mockResolvedValueOnce('attempt-1').mockResolvedValueOnce('attempt-2');
      await openChat(user, '+7 999 123-45-67');
      await user.type(screen.getByRole('textbox', { name: 'Сообщение' }), 'Привет{Enter}');
      const log = within(screen.getByRole('log'));
      await log.findByText('Отправлено');

      const failure = (serverId: string): InboundEvent => ({
        type: 'deliveryFailed',
        chatId: 'chat-79991234567',
        serverId,
        reason: 'noAccount',
      });
      inbox.push(failure('unknown-id'));
      inbox.push(failure('attempt-1'));
      expect(await log.findByText('У получателя нет аккаунта MAX')).toBeInTheDocument();

      await user.click(log.getByRole('button', { name: 'Повторить' }));
      await log.findByText('Отправлено');
      inbox.push(failure('attempt-1'));
      await waitFor(() => expect(client.deleteNotification).toHaveBeenCalledTimes(3));
      expect(log.getByText('Отправлено')).toBeInTheDocument();
    });

    it('passes instance state changes up and shows an exceeded quota', async () => {
      const { inbox, onInstanceStateChange } = renderWorkspace();

      inbox.push({ type: 'instanceStateChanged', state: 'notAuthorized' });
      inbox.push({ type: 'quotaExceeded' });

      await waitFor(() => expect(onInstanceStateChange).toHaveBeenCalledWith('notAuthorized'));
      expect(await screen.findByText(/Исчерпан месячный лимит тарифа/)).toBeInTheDocument();
    });

    it('shows that it is reconnecting and reports errors retrying cannot fix', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const { inbox, onFatalError } = renderWorkspace();

      inbox.push(new GreenApiError('receiveNotification', 'network'));
      expect(
        await screen.findByText('Не удаётся получить новые сообщения. Повторяем попытку…'),
      ).toBeInTheDocument();

      inbox.push(new GreenApiError('receiveNotification', 'unauthorized', { status: 401 }));
      await waitFor(() => expect(onFatalError).toHaveBeenCalledWith('unauthorized'), {
        timeout: 3000,
      });
    });
  });

  describe('after a page reload', () => {
    it('restores chats and delivers a new reply to them', async () => {
      const first = renderWorkspace();
      await openChat(first.user, '+7 999 123-45-67');
      await first.user.type(screen.getByRole('textbox', { name: 'Сообщение' }), 'Привет{Enter}');
      await within(screen.getByRole('log')).findByText('Отправлено');
      first.unmount();

      const { inbox, client } = renderWorkspace();
      const log = within(screen.getByRole('log'));
      expect(screen.getByRole('heading', { name: '+7 999 123-45-67' })).toBeInTheDocument();
      expect(log.getByText('Привет')).toBeInTheDocument();
      expect(log.getByText('Отправлено')).toBeInTheDocument();

      inbox.push(reply('chat-somebody-else', 'x-1', 'Чужое сообщение'));
      inbox.push(reply('chat-79991234567', 'r-1', 'Ответ после перезагрузки'));
      inbox.push(reply('chat-79991234567', 'r-1', 'Ответ после перезагрузки'));

      expect(await log.findByText('Ответ после перезагрузки')).toBeInTheDocument();
      await waitFor(() => expect(client.deleteNotification).toHaveBeenCalledTimes(3));
      expect(log.getAllByRole('listitem')).toHaveLength(2);
      expect(screen.queryByText('Чужое сообщение')).not.toBeInTheDocument();
      expect(within(screen.getByRole('navigation')).getAllByRole('button')).toHaveLength(1);
    });

    it('shows an interrupted send as unconfirmed, without resending', async () => {
      const first = renderWorkspace();
      first.client.sendMessage.mockReturnValueOnce(new Promise(() => undefined));
      await openChat(first.user, '+7 999 123-45-67');
      await first.user.type(screen.getByRole('textbox', { name: 'Сообщение' }), 'Привет{Enter}');
      await within(screen.getByRole('log')).findByText('Отправляется');
      first.unmount();

      const { client } = renderWorkspace();
      const log = within(screen.getByRole('log'));
      expect(log.getByText('Отправка не подтверждена')).toBeInTheDocument();
      expect(log.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
      expect(client.sendMessage).not.toHaveBeenCalled();
    });
  });
});
