import { warnInDev } from '../devLog';
import type { GreenApiClient } from './client';
import { GreenApiError, type GreenApiErrorKind } from './errors';
import type { InboundEvent } from './notifications';

export type PollingStatus = 'live' | 'reconnecting';

interface PollOptions {
  client: Pick<GreenApiClient, 'receiveNotification' | 'deleteNotification'>;
  onEvent: (event: InboundEvent) => void;
  onStatusChange: (status: PollingStatus) => void;
  signal: AbortSignal;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000] as const;
const MAX_BACKOFF_MS = 15000;
// An empty receive normally waits for receiveTimeout; if the server answers early, don't spin.
const MIN_EMPTY_POLL_MS = 1000;

/** Retrying cannot fix these; the user has to change credentials or instance settings. */
const FATAL_KINDS: ReadonlySet<GreenApiErrorKind> = new Set([
  'unauthorized',
  'instanceNotFound',
  'webhookUrlConfigured',
]);

// Every received notification is deleted, even one the app ignores or fails to handle:
// the queue is FIFO and would stay stuck on it otherwise.
export async function pollNotifications({
  client,
  onEvent,
  onStatusChange,
  signal,
  sleep = abortableSleep,
}: PollOptions): Promise<void> {
  let failures = 0;
  let status: PollingStatus | null = null;
  const report = (next: PollingStatus) => {
    if (next !== status && !signal.aborted) {
      status = next;
      onStatusChange(next);
    }
  };

  while (!signal.aborted) {
    try {
      const startedAt = Date.now();
      const notification = await client.receiveNotification(signal);
      if (signal.aborted) return;

      if (notification) {
        if (notification.event) {
          try {
            onEvent(notification.event);
          } catch (error) {
            warnInDev('Failed to handle a notification; deleting it anyway', error);
          }
        }
        await client.deleteNotification(notification.receiptId, signal);
      } else {
        const elapsed = Date.now() - startedAt;
        if (elapsed < MIN_EMPTY_POLL_MS) await sleep(MIN_EMPTY_POLL_MS - elapsed, signal);
      }

      failures = 0;
      report('live');
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof GreenApiError && FATAL_KINDS.has(error.kind)) throw error;

      // A failed delete lands here too: the next receive returns the same notification, and
      // handling it again is harmless because every handler is idempotent.
      warnInDev('Notification polling failed; retrying', error);
      report('reconnecting');
      await sleep(BACKOFF_MS[failures] ?? MAX_BACKOFF_MS, signal);
      failures += 1;
    }
  }
}

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
  });
}
