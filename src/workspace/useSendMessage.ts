import { useCallback, useRef, type Dispatch } from 'react';
import type { ChatAction } from '../chat/chatReducer';
import { validateMessageText } from '../chat/messageText';
import type { ChatId, FailureReason, OutgoingMessage } from '../chat/model';
import { warnInDev } from '../devLog';
import type { GreenApiClient } from '../green-api/client';
import { GreenApiError } from '../green-api/errors';

export function useSendMessage(
  client: Pick<GreenApiClient, 'sendMessage'>,
  dispatch: Dispatch<ChatAction>,
) {
  // At most one request per message: a double-clicked retry must not send the text twice.
  const inFlight = useRef(new Set<string>());

  const deliver = useCallback(
    async (chatId: ChatId, messageId: string, text: string) => {
      inFlight.current.add(messageId);
      try {
        const serverId = await client.sendMessage(chatId, text);
        dispatch({ type: 'messageSent', chatId, messageId, serverId });
      } catch (error) {
        dispatch({ type: 'messageFailed', chatId, messageId, reason: toFailureReason(error) });
      } finally {
        inFlight.current.delete(messageId);
      }
    },
    [client, dispatch],
  );

  const send = useCallback(
    (chatId: ChatId, text: string) => {
      if (!validateMessageText(text).ok) return;
      const messageId = crypto.randomUUID();
      dispatch({ type: 'messageSubmitted', chatId, messageId, text, sentAt: Date.now() });
      void deliver(chatId, messageId, text);
    },
    [deliver, dispatch],
  );

  const retry = useCallback(
    (chatId: ChatId, message: OutgoingMessage) => {
      if (message.status.type !== 'failed' || inFlight.current.has(message.id)) return;
      dispatch({ type: 'messageRetried', chatId, messageId: message.id });
      void deliver(chatId, message.id, message.text);
    },
    [deliver, dispatch],
  );

  return { send, retry };
}

function toFailureReason(error: unknown): FailureReason {
  if (!(error instanceof GreenApiError)) {
    warnInDev('Unexpected error while sending a message', error);
    return 'rejected';
  }
  switch (error.kind) {
    case 'network':
    case 'server':
    case 'aborted':
      return 'network';
    // The request may have reached the server, so the message may have been sent.
    case 'timeout':
    case 'invalidResponse':
      return 'interrupted';
    case 'accountSuspended':
      return 'accountSuspended';
    case 'quotaExceeded':
      return 'quotaExceeded';
    case 'rateLimited':
      return 'rateLimited';
    case 'unauthorized':
    case 'instanceNotFound':
    case 'instanceUnavailable':
    case 'webhookUrlConfigured':
    case 'invalidRequest':
    case 'phoneCheckLimit':
      return 'rejected';
  }
}
