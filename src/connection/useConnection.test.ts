import { act, renderHook, waitFor } from '@testing-library/react';
import type { InstanceSettings, InstanceState } from '../green-api/client';
import { GreenApiError } from '../green-api/errors';
import { loadCredentials, saveCredentials } from '../storage';
import { useConnection } from './useConnection';

const client = vi.hoisted(() => ({
  getStateInstance: vi.fn<(signal?: AbortSignal) => Promise<InstanceState>>(),
  getSettings: vi.fn<(signal?: AbortSignal) => Promise<InstanceSettings>>(),
}));

vi.mock('../green-api/client', () => ({ createGreenApiClient: () => client }));

const credentials = {
  apiUrl: 'https://1103.api.green-api.com',
  idInstance: '1103123456',
  apiTokenInstance: 'token',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  sessionStorage.clear();
  client.getStateInstance.mockReset().mockResolvedValue('authorized');
  client.getSettings.mockReset().mockResolvedValue({
    webhookUrlConfigured: false,
    incomingWebhookEnabled: true,
    outgoingWebhookEnabled: false,
  });
});

describe('useConnection', () => {
  it('starts disconnected when nothing is stored', () => {
    const { result } = renderHook(() => useConnection());
    expect(result.current.state).toEqual({
      status: 'disconnected',
      credentials: null,
      problem: null,
    });
  });

  it('ignores stored credentials that are no longer valid', () => {
    saveCredentials({ ...credentials, apiUrl: 'http://insecure.example' });
    const { result } = renderHook(() => useConnection());
    expect(result.current.state.status).toBe('disconnected');
    expect(client.getStateInstance).not.toHaveBeenCalled();
  });

  it('connects, exposes the client and remembers the credentials', async () => {
    const stateInstance = deferred<InstanceState>();
    client.getStateInstance.mockReturnValueOnce(stateInstance.promise);
    const { result } = renderHook(() => useConnection());

    act(() => result.current.connect(credentials));
    expect(result.current.state).toEqual({ status: 'connecting', credentials });

    await act(async () => {
      stateInstance.resolve('authorized');
      await stateInstance.promise;
    });
    expect(result.current.state).toMatchObject({
      status: 'connected',
      credentials,
      instanceState: 'authorized',
      warnings: ['outgoingWebhookDisabled'],
      client,
    });
    expect(loadCredentials()?.credentials).toEqual(credentials);
  });

  it('does not remember credentials that failed', async () => {
    client.getStateInstance.mockRejectedValueOnce(
      new GreenApiError('getStateInstance', 'unauthorized', { status: 401 }),
    );
    const { result } = renderHook(() => useConnection());

    act(() => result.current.connect(credentials));
    await waitFor(() => expect(result.current.state.status).toBe('disconnected'));

    expect(result.current.state).toEqual({
      status: 'disconnected',
      credentials,
      problem: { type: 'requestFailed', kind: 'unauthorized' },
    });
    expect(loadCredentials()).toBeNull();
  });

  it('restores a stored session on start', async () => {
    saveCredentials(credentials);
    const { result } = renderHook(() => useConnection());

    expect(result.current.state).toEqual({ status: 'restoring', credentials });
    await waitFor(() => expect(result.current.state.status).toBe('connected'));
  });

  it('cancels the check abandoned by a StrictMode remount', async () => {
    saveCredentials(credentials);
    const { result } = renderHook(() => useConnection(), { reactStrictMode: true });

    await waitFor(() => expect(result.current.state.status).toBe('connected'));
    const signals = client.getStateInstance.mock.calls.map(([signal]) => signal?.aborted);
    expect(signals).toEqual([true, false]);
  });

  it('keeps the stored session when restoring fails, so a retry is possible', async () => {
    saveCredentials(credentials);
    client.getStateInstance.mockRejectedValueOnce(new GreenApiError('getStateInstance', 'network'));
    const { result } = renderHook(() => useConnection());

    await waitFor(() => expect(result.current.state.status).toBe('disconnected'));
    expect(result.current.state).toMatchObject({
      credentials,
      problem: { type: 'requestFailed', kind: 'network' },
    });
    expect(loadCredentials()?.credentials).toEqual(credentials);
  });

  it('applies only the latest connection attempt', async () => {
    const first = deferred<InstanceState>();
    client.getStateInstance.mockReturnValueOnce(first.promise).mockResolvedValueOnce('authorized');
    const { result } = renderHook(() => useConnection());
    const second = { ...credentials, idInstance: '1103999999' };

    act(() => result.current.connect(credentials));
    act(() => result.current.connect(second));
    await waitFor(() => expect(result.current.state.status).toBe('connected'));

    await act(async () => {
      first.resolve('notAuthorized');
      await first.promise;
    });
    expect(result.current.state).toMatchObject({ status: 'connected', credentials: second });
  });

  it('disconnect cancels a pending check and forgets the credentials', async () => {
    saveCredentials(credentials);
    const stateInstance = deferred<InstanceState>();
    client.getStateInstance.mockReturnValueOnce(stateInstance.promise);
    const { result } = renderHook(() => useConnection());

    act(() => result.current.disconnect());
    await act(async () => {
      stateInstance.resolve('authorized');
      await stateInstance.promise;
    });

    expect(result.current.state).toEqual({
      status: 'disconnected',
      credentials: null,
      problem: null,
    });
    expect(loadCredentials()).toBeNull();
  });

  describe('while connected', () => {
    async function connected() {
      const hook = renderHook(() => useConnection());
      act(() => hook.result.current.connect(credentials));
      await waitFor(() => expect(hook.result.current.state.status).toBe('connected'));
      return hook.result;
    }

    it('follows instance state changes', async () => {
      const result = await connected();

      act(() => result.current.setInstanceState('suspended'));
      expect(result.current.state).toMatchObject({
        instanceState: 'suspended',
        warnings: ['accountSuspended', 'outgoingWebhookDisabled'],
      });

      act(() => result.current.setInstanceState('notAuthorized'));
      expect(result.current.state).toMatchObject({
        instanceState: 'notAuthorized',
        warnings: ['outgoingWebhookDisabled'],
      });
    });

    it('does not reconnect on reload after a lost connection', async () => {
      const result = await connected();

      act(() => result.current.connectionLost({ type: 'requestFailed', kind: 'unauthorized' }));
      expect(result.current.state).toEqual({
        status: 'disconnected',
        credentials,
        problem: { type: 'requestFailed', kind: 'unauthorized' },
      });

      client.getStateInstance.mockClear();
      const reloaded = renderHook(() => useConnection());
      expect(reloaded.result.current.state).toEqual({
        status: 'disconnected',
        credentials,
        problem: null,
      });
      expect(client.getStateInstance).not.toHaveBeenCalled();
    });
  });
});
