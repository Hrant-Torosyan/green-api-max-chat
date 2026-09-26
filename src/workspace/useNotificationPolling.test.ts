import { renderHook, waitFor } from '@testing-library/react';
import type { ReceivedNotification } from '../green-api/client';
import { GreenApiError } from '../green-api/errors';
import { useNotificationPolling } from './useNotificationPolling';

function hangingClient() {
  const signals: AbortSignal[] = [];
  return {
    signals,
    receiveNotification: vi.fn(
      (signal?: AbortSignal) =>
        new Promise<ReceivedNotification | null>((_resolve, reject) => {
          if (signal) signals.push(signal);
          signal?.addEventListener('abort', () =>
            reject(new GreenApiError('receiveNotification', 'aborted')),
          );
        }),
    ),
    deleteNotification: vi.fn(() => Promise.resolve(true)),
  };
}

describe('useNotificationPolling', () => {
  it('runs one loop under StrictMode and aborts it on unmount', async () => {
    const client = hangingClient();
    const { unmount } = renderHook(() => useNotificationPolling(client, vi.fn(), vi.fn()), {
      reactStrictMode: true,
    });

    await waitFor(() => expect(client.signals.length).toBeGreaterThan(0));
    expect(client.signals.filter((signal) => !signal.aborted)).toHaveLength(1);

    unmount();
    expect(client.signals.every((signal) => signal.aborted)).toBe(true);
  });

  it('reports a fatal error once and stops', async () => {
    const client = hangingClient();
    client.receiveNotification.mockRejectedValueOnce(
      new GreenApiError('receiveNotification', 'unauthorized', { status: 401 }),
    );
    const onFatalError = vi.fn();

    renderHook(() => useNotificationPolling(client, vi.fn(), onFatalError));

    await waitFor(() => expect(onFatalError).toHaveBeenCalledOnce());
    expect(onFatalError.mock.calls[0]?.[0]).toMatchObject({ kind: 'unauthorized' });
    expect(client.receiveNotification).toHaveBeenCalledOnce();
  });

  it('delivers events to the latest handler without restarting the loop', async () => {
    const client = hangingClient();
    client.receiveNotification.mockResolvedValueOnce({
      receiptId: 1,
      event: { type: 'quotaExceeded' },
    });
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ onEvent }) => useNotificationPolling(client, onEvent, vi.fn()),
      {
        initialProps: { onEvent: first },
      },
    );
    rerender({ onEvent: second });

    await waitFor(() =>
      expect(client.deleteNotification).toHaveBeenCalledWith(1, expect.any(AbortSignal)),
    );
    expect(second).toHaveBeenCalledWith({ type: 'quotaExceeded' });
    expect(first).not.toHaveBeenCalled();
  });
});
