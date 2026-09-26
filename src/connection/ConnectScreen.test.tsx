import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { ConnectScreen } from './ConnectScreen';

function renderScreen(props: Partial<ComponentProps<typeof ConnectScreen>> = {}) {
  const onConnect = vi.fn();
  render(
    <ConnectScreen
      initialCredentials={null}
      connecting={false}
      problem={null}
      onConnect={onConnect}
      {...props}
    />,
  );
  return { onConnect, user: userEvent.setup() };
}

describe('ConnectScreen', () => {
  it('submits normalized credentials', async () => {
    const { onConnect, user } = renderScreen();

    await user.type(screen.getByLabelText('API URL'), 'https://1103.api.green-api.com/');
    await user.type(screen.getByLabelText('idInstance'), '1103123456');
    await user.type(screen.getByLabelText('apiTokenInstance'), 'token');
    await user.click(screen.getByRole('button', { name: 'Подключиться' }));

    expect(onConnect).toHaveBeenCalledWith({
      apiUrl: 'https://1103.api.green-api.com',
      idInstance: '1103123456',
      apiTokenInstance: 'token',
    });
  });

  it('shows field errors and focuses the first one', async () => {
    const { onConnect, user } = renderScreen();

    await user.type(screen.getByLabelText('API URL'), 'http://1103.api.green-api.com');
    await user.click(screen.getByRole('button', { name: 'Подключиться' }));

    expect(onConnect).not.toHaveBeenCalled();
    expect(screen.getByLabelText('API URL')).toHaveAccessibleDescription(
      'Адрес должен начинаться с https://.',
    );
    expect(screen.getByLabelText('idInstance')).toHaveAccessibleDescription('Заполните поле.');
    expect(screen.getByLabelText('API URL')).toHaveFocus();
  });

  it('locks the form while connecting without moving focus away', async () => {
    const { onConnect, user } = renderScreen({
      connecting: true,
      initialCredentials: {
        apiUrl: 'https://1103.api.green-api.com',
        idInstance: '1103123456',
        apiTokenInstance: 'token',
      },
    });
    const token = screen.getByLabelText('apiTokenInstance');
    const button = screen.getByRole('button', { name: 'Подключение…' });

    expect(token).toHaveAttribute('readonly');
    expect(button).toHaveAttribute('aria-disabled', 'true');

    await user.click(token);
    await user.keyboard('{Enter}');
    await user.click(button);
    expect(onConnect).not.toHaveBeenCalled();
    expect(button).toHaveFocus();
  });

  it('explains a blocking configuration problem', () => {
    renderScreen({ problem: { type: 'incomingWebhookDisabled' } });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'выключены уведомления о входящих сообщениях',
    );
  });

  it('prefills credentials from a failed restore', () => {
    renderScreen({
      initialCredentials: {
        apiUrl: 'https://1103.api.green-api.com',
        idInstance: '1103123456',
        apiTokenInstance: 'token',
      },
    });
    expect(screen.getByLabelText('idInstance')).toHaveValue('1103123456');
  });
});
