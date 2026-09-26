import { z } from 'zod';

// The CSP forbids eval; without this zod probes `new Function` and the browser reports a violation.
z.config({ jitless: true });

const instanceStateSchema = z.enum([
  'authorized',
  'notAuthorized',
  'blocked',
  'starting',
  'suspended',
  'pendingPassword',
]);

export type InstanceState = z.infer<typeof instanceStateSchema>;

const yesNoSchema = z.enum(['yes', 'no']);

export const stateInstanceResponseSchema = z.object({ stateInstance: instanceStateSchema });

export const settingsResponseSchema = z.object({
  webhookUrl: z.string().nullish(),
  incomingWebhook: yesNoSchema,
  outgoingWebhook: yesNoSchema,
});

export const checkAccountResponseSchema = z.union([
  z.object({ exist: z.literal(true), chatId: z.string().min(1) }),
  z.object({ exist: z.literal(false) }),
  // HTTP 200 with a failure, e.g. when the instance is not authorized.
  z.object({ status: z.literal(false), reason: z.string() }),
]);

export const sendMessageResponseSchema = z.object({ idMessage: z.string().min(1) });

export const receiveNotificationResponseSchema = z.object({
  receiptId: z.number().int(),
  body: z.unknown(),
});

export const deleteNotificationResponseSchema = z.object({ result: z.boolean() });

export const notificationTypeSchema = z.object({ typeWebhook: z.string() });

export const incomingMessageTypeSchema = z.object({
  messageData: z.object({ typeMessage: z.string() }),
});

const senderDataSchema = z.object({
  chatId: z.string().min(1),
  senderName: z.string().optional(),
  senderContactName: z.string().optional(),
});

export const incomingTextMessageSchema = z.object({
  idMessage: z.string().min(1),
  timestamp: z.number().int(),
  senderData: senderDataSchema,
  messageData: z.discriminatedUnion('typeMessage', [
    z.object({
      typeMessage: z.literal('textMessage'),
      textMessageData: z.object({ textMessage: z.string() }),
    }),
    z.object({
      typeMessage: z.literal('extendedTextMessage'),
      extendedTextMessageData: z.object({ text: z.string() }),
    }),
  ]),
});

export const outgoingMessageStatusSchema = z.object({
  chatId: z.string().min(1),
  idMessage: z.string().min(1),
  status: z.string(),
});

export const stateInstanceChangedSchema = z.object({ stateInstance: instanceStateSchema });
