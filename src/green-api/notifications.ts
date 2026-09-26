import type { ChatId, FailureReason } from '../chat/model';
import { warnInDev } from '../devLog';
import {
  incomingMessageTypeSchema,
  incomingTextMessageSchema,
  notificationTypeSchema,
  outgoingMessageStatusSchema,
  stateInstanceChangedSchema,
  type InstanceState,
} from './schemas';

export type InboundEvent =
  | {
      type: 'messageReceived';
      chatId: ChatId;
      messageId: string;
      text: string;
      sentAt: number;
      senderName: string | null;
    }
  | {
      type: 'deliveryFailed';
      chatId: ChatId;
      serverId: string;
      reason: Extract<FailureReason, 'noAccount' | 'notDelivered'>;
    }
  | { type: 'instanceStateChanged'; state: InstanceState }
  | { type: 'quotaExceeded' };

const TEXT_MESSAGE_TYPES = new Set(['textMessage', 'extendedTextMessage']);

export function toInboundEvent(body: unknown): InboundEvent | null {
  const notification = notificationTypeSchema.safeParse(body);
  if (!notification.success) return malformed('notification', body);

  switch (notification.data.typeWebhook) {
    case 'incomingMessageReceived':
      return toIncomingMessage(body);
    case 'outgoingMessageStatus':
      return toDeliveryFailure(body);
    case 'stateInstanceChanged': {
      const parsed = stateInstanceChangedSchema.safeParse(body);
      if (!parsed.success) return malformed('stateInstanceChanged', body);
      return { type: 'instanceStateChanged', state: parsed.data.stateInstance };
    }
    case 'quotaExceeded':
      return { type: 'quotaExceeded' };
    default:
      return null;
  }
}

function toIncomingMessage(body: unknown): InboundEvent | null {
  const messageType = incomingMessageTypeSchema.safeParse(body);
  if (!messageType.success) return malformed('incomingMessageReceived', body);
  if (!TEXT_MESSAGE_TYPES.has(messageType.data.messageData.typeMessage)) return null;

  const parsed = incomingTextMessageSchema.safeParse(body);
  if (!parsed.success) return malformed('incomingMessageReceived', body);

  const { idMessage, timestamp, senderData, messageData } = parsed.data;
  return {
    type: 'messageReceived',
    chatId: senderData.chatId,
    messageId: idMessage,
    text:
      messageData.typeMessage === 'textMessage'
        ? messageData.textMessageData.textMessage
        : messageData.extendedTextMessageData.text,
    sentAt: timestamp * 1000,
    senderName: senderData.senderContactName?.trim() || senderData.senderName?.trim() || null,
  };
}

function toDeliveryFailure(body: unknown): InboundEvent | null {
  const parsed = outgoingMessageStatusSchema.safeParse(body);
  if (!parsed.success) return malformed('outgoingMessageStatus', body);

  const { chatId, idMessage, status } = parsed.data;
  if (status !== 'failed' && status !== 'noAccount') return null;

  return {
    type: 'deliveryFailed',
    chatId,
    serverId: idMessage,
    reason: status === 'noAccount' ? 'noAccount' : 'notDelivered',
  };
}

function malformed(kind: string, body: unknown): null {
  warnInDev(`Ignoring malformed ${kind} notification`, body);
  return null;
}
