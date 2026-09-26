import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Message } from '../chat/model';
import { MessageList } from './MessageList';

const sentAt = new Date(2026, 8, 25, 14, 5).getTime();

function outgoing(id: string, status: Extract<Message, { direction: 'outgoing' }>['status']) {
  return { direction: 'outgoing', id, serverId: null, text: `out ${id}`, sentAt, status } as const;
}

describe('MessageList', () => {
  it('renders messages in order with their outgoing status', () => {
    render(
      <MessageList
        onRetry={vi.fn()}
        messages={[
          { direction: 'incoming', id: 'in-1', text: 'Привет\nкак дела?', sentAt },
          outgoing('a', { type: 'sending' }),
          outgoing('b', { type: 'sent' }),
          outgoing('c', { type: 'failed', reason: 'noAccount' }),
        ]}
      />,
    );

    const items = within(screen.getByRole('log')).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent('Привет как дела?');
    expect(items[1]).toHaveTextContent('Отправляется');
    expect(items[2]).toHaveTextContent('Отправлено');
    expect(items[3]).toHaveTextContent('У получателя нет аккаунта MAX');
    expect(items[0]).not.toHaveTextContent('Отправ');
  });

  it('offers retry only for failed messages', async () => {
    const onRetry = vi.fn();
    const failed = outgoing('c', { type: 'failed', reason: 'network' });
    render(
      <MessageList
        onRetry={onRetry}
        messages={[outgoing('a', { type: 'sending' }), outgoing('b', { type: 'sent' }), failed]}
      />,
    );

    const retry = screen.getByRole('button', { name: 'Повторить' });
    expect(screen.getAllByRole('button')).toHaveLength(1);
    await userEvent.setup().click(retry);
    expect(onRetry).toHaveBeenCalledWith(failed);
  });
});
