import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { OpenChatResult } from './useOpenChat';
import { NewChatForm } from './NewChatForm';

function renderForm(
  onOpenChat: (phone: string) => Promise<OpenChatResult> = vi.fn(() =>
    Promise.resolve<OpenChatResult>({ ok: true }),
  ),
) {
  render(<NewChatForm onOpenChat={onOpenChat} />);
  return { onOpenChat, user: userEvent.setup(), input: screen.getByLabelText('Новый чат') };
}

describe('NewChatForm', () => {
  it('opens a chat with the normalized number and clears the field', async () => {
    const { onOpenChat, user, input } = renderForm();

    await user.type(input, '8 (999) 123-45-67{Enter}');

    expect(onOpenChat).toHaveBeenCalledWith('79991234567');
    expect(input).toHaveValue('');
  });

  it.each([
    ['', 'Введите номер телефона.'],
    ['12345', 'Проверьте номер, например +7 999 123-45-67.'],
    ['+49 151 23456789', 'Поддерживаются только номера России (+7) и Беларуси (+375).'],
  ])('rejects %j without a request', async (value, message) => {
    const { onOpenChat, user, input } = renderForm();

    if (value) await user.type(input, value);
    await user.click(screen.getByRole('button', { name: 'Открыть' }));

    expect(onOpenChat).not.toHaveBeenCalled();
    expect(input).toHaveAccessibleDescription(message);
  });

  it('keeps the number and explains why the chat could not be opened', async () => {
    const { user, input } = renderForm(() =>
      Promise.resolve({ ok: false, problem: { type: 'noAccount' } }),
    );

    await user.type(input, '+7 999 123-45-67{Enter}');

    expect(input).toHaveAccessibleDescription('У этого номера нет аккаунта MAX.');
    expect(input).toHaveValue('+7 999 123-45-67');
  });

  it('does not submit twice while a lookup is pending', async () => {
    let finish: (result: OpenChatResult) => void = () => undefined;
    const onOpenChat = vi.fn(
      () =>
        new Promise<OpenChatResult>((resolve) => {
          finish = resolve;
        }),
    );
    const { user, input } = renderForm(onOpenChat);

    await user.type(input, '+7 999 123-45-67{Enter}');
    const button = screen.getByRole('button', { name: 'Поиск…' });
    await user.click(button);

    expect(onOpenChat).toHaveBeenCalledOnce();
    expect(button).toHaveAttribute('aria-disabled', 'true');
    finish({ ok: true });
    expect(await screen.findByRole('button', { name: 'Открыть' })).toBeInTheDocument();
  });
});
