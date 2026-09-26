import type { InstanceSettings, InstanceState } from '../green-api/client';
import { GreenApiError } from '../green-api/errors';
import { checkInstance } from './checkInstance';

const goodSettings: InstanceSettings = {
  webhookUrlConfigured: false,
  incomingWebhookEnabled: true,
  outgoingWebhookEnabled: true,
};

function fakeClient(state: InstanceState, settings: Partial<InstanceSettings> = {}) {
  return {
    getStateInstance: vi.fn(() => Promise.resolve(state)),
    getSettings: vi.fn(() => Promise.resolve({ ...goodSettings, ...settings })),
  };
}

describe('checkInstance', () => {
  it('accepts an authorized instance with the required settings', async () => {
    await expect(checkInstance(fakeClient('authorized'))).resolves.toEqual({
      ok: true,
      instanceState: 'authorized',
      warnings: [],
    });
  });

  it('connects with warnings for a suspended account and disabled statuses', async () => {
    const result = await checkInstance(fakeClient('suspended', { outgoingWebhookEnabled: false }));
    expect(result).toEqual({
      ok: true,
      instanceState: 'suspended',
      warnings: ['accountSuspended', 'outgoingWebhookDisabled'],
    });
  });

  it.each<InstanceState>(['notAuthorized', 'blocked', 'starting', 'pendingPassword'])(
    'rejects an instance in state %s without reading settings',
    async (state) => {
      const client = fakeClient(state);
      await expect(checkInstance(client)).resolves.toEqual({
        ok: false,
        problem: { type: 'instanceNotReady', state },
      });
      expect(client.getSettings).not.toHaveBeenCalled();
    },
  );

  it('blocks a configured webhook URL', async () => {
    const result = await checkInstance(fakeClient('authorized', { webhookUrlConfigured: true }));
    expect(result).toEqual({ ok: false, problem: { type: 'webhookUrlConfigured' } });
  });

  it('blocks disabled incoming notifications', async () => {
    const result = await checkInstance(fakeClient('authorized', { incomingWebhookEnabled: false }));
    expect(result).toEqual({ ok: false, problem: { type: 'incomingWebhookDisabled' } });
  });

  it('reports an API failure by its kind', async () => {
    const client = fakeClient('authorized');
    client.getStateInstance.mockRejectedValueOnce(
      new GreenApiError('getStateInstance', 'unauthorized', { status: 401 }),
    );
    await expect(checkInstance(client)).resolves.toEqual({
      ok: false,
      problem: { type: 'requestFailed', kind: 'unauthorized' },
    });
  });

  it('turns an unexpected exception into a problem instead of throwing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const client = fakeClient('authorized');
    client.getSettings.mockRejectedValueOnce(new Error('bug'));
    await expect(checkInstance(client)).resolves.toEqual({
      ok: false,
      problem: { type: 'unexpectedError' },
    });
  });

  it('passes the abort signal to both requests', async () => {
    const client = fakeClient('authorized');
    const { signal } = new AbortController();
    await checkInstance(client, signal);
    expect(client.getStateInstance).toHaveBeenCalledWith(signal);
    expect(client.getSettings).toHaveBeenCalledWith(signal);
  });
});
