import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import type { InstanceSettings, InstanceState, ReceivedNotification } from './green-api/client';
import { GreenApiError } from './green-api/errors';

const client = vi.hoisted(() => ({
  getStateInstance: vi.fn<(signal?: AbortSignal) => Promise<InstanceState>>(),
  getSettings: vi.fn<(signal?: AbortSignal) => Promise<InstanceSettings>>(),
  receiveNotification: vi.fn<(signal?: AbortSignal) => Promise<ReceivedNotification | null>>(),
  deleteNotification: vi.fn(() => Promise.resolve(true)),
}));

/** An empty queue: the long poll only ends when the workspace aborts it. */
function waitForever(signal?: AbortSignal) {
  return new Promise<ReceivedNotification | null>((_resolve, reject) => {
    signal?.addEventListener('abort', () =>
      reject(new GreenApiError('receiveNotification', 'aborted')),
    );
  });
}

vi.mock('./green-api/client', () => ({ createGreenApiClient: () => client }));

beforeEach(() => {
  sessionStorage.clear();
  client.getStateInstance.mockReset().mockResolvedValue('authorized');
  client.getSettings.mockReset().mockResolvedValue({
    webhookUrlConfigured: false,
    incomingWebhookEnabled: true,
    outgoingWebhookEnabled: true,
  });
  client.receiveNotification.mockReset().mockImplementation(waitForever);
});

describe('App connection flow', () => {
  it('connect, retry, reload, disconnect', async () => {
    client.getStateInstance.mockRejectedValueOnce(
      new GreenApiError('getStateInstance', 'unauthorized', { status: 401 }),
    );
    const user = userEvent.setup();
    const { unmount } = render(<App />);

    await user.type(screen.getByLabelText('API URL'), 'https://1103.api.green-api.com');
    await user.type(screen.getByLabelText('idInstance'), '1103123456');
    await user.type(screen.getByLabelText('apiTokenInstance'), 'token{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent('Неверный токен доступа');

    await user.click(screen.getByRole('button', { name: 'Подключиться' }));
    expect(await screen.findByText('Инстанс 1103123456')).toBeInTheDocument();

    unmount();
    render(<App />);
    expect(screen.getByRole('status')).toHaveTextContent('Подключение…');
    expect(await screen.findByText('Инстанс 1103123456')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Отключиться' }));
    await waitFor(() => expect(screen.getByLabelText('apiTokenInstance')).toHaveValue(''));
    expect(sessionStorage.length).toBe(0);
  });

  it('instance state change, then a fatal receive error', async () => {
    sessionStorage.setItem(
      'max-web-chat/credentials/v1',
      JSON.stringify({
        apiUrl: 'https://1103.api.green-api.com',
        idInstance: '1103123456',
        apiTokenInstance: 'token',
      }),
    );
    let failReceive: (error: GreenApiError) => void = () => undefined;
    client.receiveNotification
      .mockResolvedValueOnce({
        receiptId: 1,
        event: { type: 'instanceStateChanged', state: 'notAuthorized' },
      })
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            failReceive = reject;
          }),
      );
    render(<App />);

    expect(await screen.findByText('Не авторизован')).toBeInTheDocument();
    expect(screen.getByText(/Отсканируйте QR-код/)).toBeInTheDocument();

    failReceive(new GreenApiError('receiveNotification', 'unauthorized', { status: 401 }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Неверный токен доступа');
    expect(screen.getByLabelText('idInstance')).toHaveValue('1103123456');
  });
});
