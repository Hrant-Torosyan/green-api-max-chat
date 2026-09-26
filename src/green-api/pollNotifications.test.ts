import type { ReceivedNotification } from './client';
import { GreenApiError, type GreenApiErrorKind } from './errors';
import type { InboundEvent } from './notifications';
import { pollNotifications, type PollingStatus } from './pollNotifications';

type Step = ReceivedNotification | null | GreenApiError;

const message = (id: string): InboundEvent => ({
  type: 'messageReceived',
  chatId: '10000000',
  messageId: id,
  text: `text ${id}`,
  sentAt: 1000,
  senderName: null,
});

/**
 * receiveNotification plays the scripted steps in order, then waits until aborted, which is
 * how a real long poll behaves when the queue stays empty.
 */
function setup(steps: Step[], deleteFailures: GreenApiError[] = []) {
  const controller = new AbortController();
  const log: string[] = [];
  const statuses: PollingStatus[] = [];
  const sleeps: number[] = [];
  let active = 0;
  let maxActive = 0;

  const client = {
    receiveNotification: vi.fn(async (signal?: AbortSignal) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      try {
        const step = steps.shift();
        if (step === undefined) {
          await new Promise((resolve) => signal?.addEventListener('abort', resolve));
          throw new GreenApiError('receiveNotification', 'aborted');
        }
        if (step instanceof GreenApiError) throw step;
        log.push(step ? `receive ${step.receiptId}` : 'receive empty');
        return step;
      } finally {
        active -= 1;
      }
    }),
    deleteNotification: vi.fn((receiptId: number) => {
      const failure = deleteFailures.shift();
      if (failure) return Promise.reject(failure);
      log.push(`delete ${receiptId}`);
      return Promise.resolve(true);
    }),
  };

  const onEvent = vi.fn((event: InboundEvent) => {
    if (event.type === 'messageReceived') log.push(`handle ${event.messageId}`);
  });

  const run = pollNotifications({
    client,
    onEvent,
    onStatusChange: (status) => statuses.push(status),
    signal: controller.signal,
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
  });

  /** Waits until the loop is parked on the endless receive, i.e. the script is consumed. */
  async function idle() {
    await vi.waitFor(() => expect(steps).toHaveLength(0));
    await vi.waitFor(() => expect(active).toBe(1));
  }

  return {
    client,
    onEvent,
    log,
    statuses,
    sleeps,
    run,
    idle,
    stop: () => controller.abort(),
    maxActive: () => maxActive,
  };
}

const error = (kind: GreenApiErrorKind) => new GreenApiError('receiveNotification', kind);

/** An early empty receive must be followed by a pause of at most MIN_EMPTY_POLL_MS. */
const isPause = (ms: number) => ms > 0 && ms <= 1000;

describe('pollNotifications', () => {
  it('handles each notification, then deletes it, strictly in order', async () => {
    const poll = setup([
      { receiptId: 1, event: message('a') },
      null,
      { receiptId: 2, event: message('b') },
    ]);
    await poll.idle();

    expect(poll.log).toEqual([
      'receive 1',
      'handle a',
      'delete 1',
      'receive empty',
      'receive 2',
      'handle b',
      'delete 2',
    ]);
    expect(poll.maxActive()).toBe(1);
    expect(poll.sleeps).toHaveLength(1);
    expect(poll.sleeps.every(isPause)).toBe(true);
    poll.stop();
    await poll.run;
  });

  it('deletes notifications the app ignores or fails to handle', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const poll = setup([
      { receiptId: 1, event: null },
      { receiptId: 2, event: message('broken') },
      { receiptId: 3, event: message('c') },
    ]);
    poll.onEvent.mockImplementationOnce(() => {
      throw new Error('handler bug');
    });
    await poll.idle();

    expect(poll.client.deleteNotification.mock.calls.map(([id]) => id)).toEqual([1, 2, 3]);
    expect(poll.log).toContain('handle c');
    poll.stop();
    await poll.run;
  });

  it('backs off with a bounded delay on failures and resets after a success', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const poll = setup([
      error('network'),
      error('timeout'),
      error('server'),
      error('network'),
      error('network'),
      error('network'),
      { receiptId: 1, event: message('a') },
      error('network'),
    ]);
    await poll.idle();

    expect(poll.sleeps).toEqual([1000, 2000, 4000, 8000, 15000, 15000, 1000]);
    expect(poll.statuses).toEqual(['reconnecting', 'live', 'reconnecting']);
    poll.stop();
    await poll.run;
  });

  it('handles the same notification again when deleting it failed', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const notification = { receiptId: 7, event: message('a') };
    const poll = setup(
      [notification, notification],
      [new GreenApiError('deleteNotification', 'network')],
    );
    await poll.idle();

    expect(poll.log).toEqual(['receive 7', 'handle a', 'receive 7', 'handle a', 'delete 7']);
    expect(poll.sleeps).toEqual([1000]);
    poll.stop();
    await poll.run;
  });

  it('pauses after every empty receive that returns early, never spinning', async () => {
    const poll = setup([null, null, null]);
    await poll.idle();

    expect(poll.client.receiveNotification).toHaveBeenCalledTimes(4);
    expect(poll.sleeps).toHaveLength(3);
    expect(poll.sleeps.every(isPause)).toBe(true);
    expect(poll.statuses).toEqual(['live']);
    poll.stop();
    await poll.run;
  });

  it('does not pause while notifications keep arriving', async () => {
    const poll = setup([
      { receiptId: 1, event: message('a') },
      { receiptId: 2, event: null },
    ]);
    await poll.idle();

    expect(poll.sleeps).toEqual([]);
    poll.stop();
    await poll.run;
  });

  it.each<GreenApiErrorKind>(['unauthorized', 'instanceNotFound', 'webhookUrlConfigured'])(
    'stops with the error on %s',
    async (kind) => {
      const poll = setup([error(kind)]);
      await expect(poll.run).rejects.toMatchObject({ kind });
      expect(poll.client.receiveNotification).toHaveBeenCalledOnce();
    },
  );

  it('stops quietly when aborted during a pending receive', async () => {
    const poll = setup([]);
    await poll.idle();

    poll.stop();
    await expect(poll.run).resolves.toBeUndefined();
    expect(poll.client.receiveNotification).toHaveBeenCalledOnce();
    expect(poll.statuses).toEqual([]);
  });

  it('does not handle or delete a notification that arrives after abort', async () => {
    const controller = new AbortController();
    const onEvent = vi.fn();
    const client = {
      receiveNotification: vi.fn(() => {
        controller.abort();
        return Promise.resolve({ receiptId: 1, event: message('late') });
      }),
      deleteNotification: vi.fn(() => Promise.resolve(true)),
    };

    await pollNotifications({
      client,
      onEvent,
      onStatusChange: vi.fn(),
      signal: controller.signal,
    });

    expect(onEvent).not.toHaveBeenCalled();
    expect(client.deleteNotification).not.toHaveBeenCalled();
  });
});
