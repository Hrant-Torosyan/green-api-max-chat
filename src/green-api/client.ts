import { z } from 'zod';
import type { ChatId } from '../chat/model';
import { classifyHttpError, GreenApiError } from './errors';
import { toInboundEvent, type InboundEvent } from './notifications';
import {
  checkAccountResponseSchema,
  deleteNotificationResponseSchema,
  receiveNotificationResponseSchema,
  sendMessageResponseSchema,
  settingsResponseSchema,
  stateInstanceResponseSchema,
  type InstanceState,
} from './schemas';

export type { InstanceState };

export interface GreenApiCredentials {
  apiUrl: string;
  idInstance: string;
  apiTokenInstance: string;
}

export interface InstanceSettings {
  webhookUrlConfigured: boolean;
  incomingWebhookEnabled: boolean;
  outgoingWebhookEnabled: boolean;
}

export type CheckAccountResult = { exists: true; chatId: ChatId } | { exists: false };

export interface ReceivedNotification {
  receiptId: number;
  /** Null when the notification is not used by the app; it still has to be deleted. */
  event: InboundEvent | null;
}

export interface GreenApiClient {
  getStateInstance(signal?: AbortSignal): Promise<InstanceState>;
  getSettings(signal?: AbortSignal): Promise<InstanceSettings>;
  checkAccount(phone: string, signal?: AbortSignal): Promise<CheckAccountResult>;
  /** Resolves with the server-assigned message id. */
  sendMessage(chatId: ChatId, text: string, signal?: AbortSignal): Promise<string>;
  /** Waits up to RECEIVE_TIMEOUT_SECONDS; resolves with null when the queue stays empty. */
  receiveNotification(signal?: AbortSignal): Promise<ReceivedNotification | null>;
  /** Resolves with false when the notification was already deleted. */
  deleteNotification(receiptId: number, signal?: AbortSignal): Promise<boolean>;
}

/** Allowed range is 5–60 s. */
export const RECEIVE_TIMEOUT_SECONDS = 20;
const REQUEST_TIMEOUT_MS = 15_000;
const RECEIVE_REQUEST_TIMEOUT_MS = (RECEIVE_TIMEOUT_SECONDS + 10) * 1000;

interface RequestOptions<T> {
  method: string;
  httpMethod: 'GET' | 'POST' | 'DELETE';
  schema: z.ZodType<T>;
  pathSuffix?: string;
  query?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export function createGreenApiClient(credentials: GreenApiCredentials): GreenApiClient {
  const baseUrl = credentials.apiUrl.replace(/\/+$/, '');
  const token = credentials.apiTokenInstance;

  function buildUrl(method: string, pathSuffix = '', query: Record<string, string> = {}): URL {
    const path = `/waInstance${encodeURIComponent(credentials.idInstance)}/${method}/${encodeURIComponent(token)}`;
    let url: URL;
    try {
      url = new URL(`${baseUrl}${path}${pathSuffix}`);
    } catch {
      // The TypeError message would contain the full URL, including the token.
      throw new GreenApiError(method, 'invalidRequest', { details: 'apiUrl is not a valid URL' });
    }
    for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
    return url;
  }

  async function request<T>(options: RequestOptions<T>): Promise<T> {
    const { method, signal } = options;
    if (signal?.aborted) throw new GreenApiError(method, 'aborted');

    const url = buildUrl(method, options.pathSuffix, options.query);

    const controller = new AbortController();
    const abort = () => controller.abort();
    const timer = setTimeout(abort, options.timeoutMs ?? REQUEST_TIMEOUT_MS);
    signal?.addEventListener('abort', abort, { once: true });

    let status: number;
    let text: string;
    try {
      const response = await fetch(url, {
        method: options.httpMethod,
        signal: controller.signal,
        ...(options.body === undefined
          ? {}
          : {
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(options.body),
            }),
      });
      status = response.status;
      text = await response.text();
    } catch {
      // The underlying error is dropped on purpose: in some runtimes its message contains the URL.
      if (signal?.aborted) throw new GreenApiError(method, 'aborted');
      if (controller.signal.aborted) throw new GreenApiError(method, 'timeout');
      throw new GreenApiError(method, 'network');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }

    if (status < 200 || status >= 300) {
      throw new GreenApiError(method, classifyHttpError(status, text), {
        status,
        details: text.replaceAll(token, '***'),
      });
    }

    const parsed = options.schema.safeParse(parseJson(text));
    if (!parsed.success) {
      throw new GreenApiError(method, 'invalidResponse', {
        status,
        details: z.prettifyError(parsed.error),
      });
    }
    return parsed.data;
  }

  return {
    async getStateInstance(signal) {
      const response = await request({
        method: 'getStateInstance',
        httpMethod: 'GET',
        schema: stateInstanceResponseSchema,
        signal,
      });
      return response.stateInstance;
    },

    async getSettings(signal) {
      const response = await request({
        method: 'getSettings',
        httpMethod: 'GET',
        schema: settingsResponseSchema,
        signal,
      });
      return {
        webhookUrlConfigured: Boolean(response.webhookUrl),
        incomingWebhookEnabled: response.incomingWebhook === 'yes',
        outgoingWebhookEnabled: response.outgoingWebhook === 'yes',
      };
    },

    async checkAccount(phone, signal) {
      const response = await request({
        method: 'checkAccount',
        httpMethod: 'POST',
        schema: checkAccountResponseSchema,
        body: { phoneNumber: Number(phone) },
        signal,
      });

      if ('status' in response) {
        const kind = /limit/i.test(response.reason) ? 'phoneCheckLimit' : 'instanceUnavailable';
        throw new GreenApiError('checkAccount', kind, { details: response.reason });
      }
      return response.exist ? { exists: true, chatId: response.chatId } : { exists: false };
    },

    async sendMessage(chatId, text, signal) {
      const response = await request({
        method: 'sendMessage',
        httpMethod: 'POST',
        schema: sendMessageResponseSchema,
        body: { chatId, message: text },
        signal,
      });
      return response.idMessage;
    },

    async receiveNotification(signal) {
      try {
        const response = await request({
          method: 'receiveNotification',
          httpMethod: 'GET',
          schema: receiveNotificationResponseSchema.nullable(),
          query: { receiveTimeout: String(RECEIVE_TIMEOUT_SECONDS) },
          timeoutMs: RECEIVE_REQUEST_TIMEOUT_MS,
          signal,
        });
        if (response === null) return null;
        return { receiptId: response.receiptId, event: toInboundEvent(response.body) };
      } catch (error) {
        // A long poll that ends with 408 found nothing in the queue; it is not a failure.
        if (error instanceof GreenApiError && error.status === 408) return null;
        throw error;
      }
    },

    async deleteNotification(receiptId, signal) {
      try {
        const response = await request({
          method: 'deleteNotification',
          httpMethod: 'DELETE',
          schema: deleteNotificationResponseSchema,
          pathSuffix: `/${receiptId}`,
          signal,
        });
        return response.result;
      } catch (error) {
        // Documented as HTTP 500 "Cannot read properties of undefined (reading 'findUnAckedMessage')".
        if (error instanceof GreenApiError && error.details?.includes('findUnAckedMessage')) {
          return false;
        }
        throw error;
      }
    },
  };
}

function parseJson(text: string): unknown {
  if (text.trim() === '') return null;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
