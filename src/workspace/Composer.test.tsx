import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { MAX_MESSAGE_LENGTH } from '../chat/messageText';
import { Composer } from './Composer';

function renderComposer() {
  const onSend = vi.fn();
  render(<Composer onSend={onSend} inputRef={createRef()} />);
  return {
    onSend,
    user: userEvent.setup(),
    input: screen.getByRole('textbox', { name: 'Сообщение' }),
    button: screen.getByRole('button', { name: 'Отправить' }),
  };
}

describe('Composer', () => {
  it('sends on Enter, clears and keeps focus', async () => {
    const { onSend, user, input } = renderComposer();

    await user.type(input, 'Первое{Enter}');
    expect(onSend).toHaveBeenLastCalledWith('Первое');
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();

    await user.type(input, 'Второе{Enter}');
    expect(onSend).toHaveBeenLastCalledWith('Второе');
  });

  it('inserts a line break on Shift+Enter and sends the text as typed', async () => {
    const { onSend, user, input, button } = renderComposer();

    await user.type(input, '  строка 1{Shift>}{Enter}{/Shift}строка 2');
    expect(onSend).not.toHaveBeenCalled();

    await user.click(button);
    expect(onSend).toHaveBeenCalledWith('  строка 1\nстрока 2');
    expect(input).toHaveFocus();
  });

  it('does not send empty or whitespace-only text', async () => {
    const { onSend, user, input, button } = renderComposer();

    await user.type(input, '{Enter}');
    expect(button).toBeDisabled();

    await user.type(input, '   {Enter}');
    expect(onSend).not.toHaveBeenCalled();
    expect(button).toBeDisabled();
    expect(input).toHaveValue('   ');
  });

  it('blocks text over the limit and says why', async () => {
    const { onSend, user, input, button } = renderComposer();

    await user.click(input);
    await user.paste('a'.repeat(MAX_MESSAGE_LENGTH + 1));
    await user.keyboard('{Enter}');

    expect(onSend).not.toHaveBeenCalled();
    expect(button).toBeDisabled();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(
      `Сообщение длиннее ${MAX_MESSAGE_LENGTH} символов: ${MAX_MESSAGE_LENGTH + 1}`,
    );
  });
});
