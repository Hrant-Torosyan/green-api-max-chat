import type { GreenApiClient, InstanceState } from '../green-api/client';
import { GreenApiError, type GreenApiErrorKind } from '../green-api/errors';
import { warnInDev } from '../devLog';

export type UsableInstanceState = Extract<InstanceState, 'authorized' | 'suspended'>;

export type ConnectionWarning = 'accountSuspended' | 'outgoingWebhookDisabled';

export type ConnectionProblem =
  | { type: 'requestFailed'; kind: GreenApiErrorKind }
  | { type: 'instanceNotReady'; state: Exclude<InstanceState, UsableInstanceState> }
  | { type: 'webhookUrlConfigured' }
  | { type: 'incomingWebhookDisabled' }
  | { type: 'unexpectedError' };

type InstanceCheckResult =
  | { ok: true; instanceState: UsableInstanceState; warnings: ConnectionWarning[] }
  | { ok: false; problem: ConnectionProblem };

export async function checkInstance(
  client: Pick<GreenApiClient, 'getStateInstance' | 'getSettings'>,
  signal?: AbortSignal,
): Promise<InstanceCheckResult> {
  try {
    const instanceState = await client.getStateInstance(signal);
    if (instanceState !== 'authorized' && instanceState !== 'suspended') {
      return { ok: false, problem: { type: 'instanceNotReady', state: instanceState } };
    }

    // ReceiveNotification only works with an empty webhook URL and incoming notifications on.
    const settings = await client.getSettings(signal);
    if (settings.webhookUrlConfigured) {
      return { ok: false, problem: { type: 'webhookUrlConfigured' } };
    }
    if (!settings.incomingWebhookEnabled) {
      return { ok: false, problem: { type: 'incomingWebhookDisabled' } };
    }

    const warnings: ConnectionWarning[] = [];
    if (instanceState === 'suspended') warnings.push('accountSuspended');
    if (!settings.outgoingWebhookEnabled) warnings.push('outgoingWebhookDisabled');
    return { ok: true, instanceState, warnings };
  } catch (error) {
    if (error instanceof GreenApiError) {
      return { ok: false, problem: { type: 'requestFailed', kind: error.kind } };
    }
    warnInDev('Unexpected error while checking the instance', error);
    return { ok: false, problem: { type: 'unexpectedError' } };
  }
}
