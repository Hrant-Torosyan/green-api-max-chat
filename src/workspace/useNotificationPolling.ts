import { useEffect, useEffectEvent, useState } from 'react';
import type { GreenApiClient } from '../green-api/client';
import { GreenApiError } from '../green-api/errors';
import type { InboundEvent } from '../green-api/notifications';
import { pollNotifications, type PollingStatus } from '../green-api/pollNotifications';

export function useNotificationPolling(
  client: Pick<GreenApiClient, 'receiveNotification' | 'deleteNotification'>,
  onEvent: (event: InboundEvent) => void,
  onFatalError: (error: GreenApiError) => void,
): PollingStatus | null {
  const [status, setStatus] = useState<PollingStatus | null>(null);
  const handleEvent = useEffectEvent(onEvent);
  const handleFatalError = useEffectEvent(onFatalError);

  useEffect(() => {
    const controller = new AbortController();
    pollNotifications({
      client,
      onEvent: handleEvent,
      onStatusChange: setStatus,
      signal: controller.signal,
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      if (error instanceof GreenApiError) handleFatalError(error);
    });
    return () => controller.abort();
  }, [client]);

  return status;
}
