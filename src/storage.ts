import { z } from 'zod';
import type { ChatsState } from './chat/chatReducer';
import type { FailureReason } from './chat/model';
import type { GreenApiCredentials } from './green-api/client';

const CREDENTIALS_KEY = 'max-web-chat/credentials/v1';
const CHATS_KEY = 'max-web-chat/chats/v1';

const credentialsSchema = z.object({
  apiUrl: z.string(),
  idInstance: z.string(),
  apiTokenInstance: z.string(),
  autoConnect: z.boolean().default(true),
});

const failureReasonSchema = z.enum([
  'network',
  'rejected',
  'rateLimited',
  'accountSuspended',
  'quotaExceeded',
  'noAccount',
  'notDelivered',
  'interrupted',
] satisfies FailureReason[]);

const messageSchema = z.discriminatedUnion('direction', [
  z.object({
    direction: z.literal('incoming'),
    id: z.string(),
    text: z.string(),
    sentAt: z.number(),
  }),
  z.object({
    direction: z.literal('outgoing'),
    id: z.string(),
    serverId: z.string().nullable(),
    text: z.string(),
    sentAt: z.number(),
    status: z.discriminatedUnion('type', [
      z.object({ type: z.literal('sending') }),
      z.object({ type: z.literal('sent') }),
      z.object({ type: z.literal('failed'), reason: failureReasonSchema }),
    ]),
  }),
]);

// Typed against the domain so the schema cannot drift from ChatsState unnoticed.
const chatsStateSchema: z.ZodType<ChatsState> = z.object({
  chats: z.array(
    z.object({
      id: z.string(),
      phone: z.string(),
      name: z.string().nullable(),
      messages: z.array(messageSchema),
    }),
  ),
  activeChatId: z.string().nullable(),
});

const savedChatsSchema = z.object({ idInstance: z.string(), state: chatsStateSchema });

export function loadCredentials(): {
  credentials: GreenApiCredentials;
  autoConnect: boolean;
} | null {
  const parsed = credentialsSchema.safeParse(read(CREDENTIALS_KEY));
  if (!parsed.success) return null;
  const { autoConnect, ...credentials } = parsed.data;
  return { credentials, autoConnect };
}

export function saveCredentials(credentials: GreenApiCredentials): void {
  write(CREDENTIALS_KEY, { ...credentials, autoConnect: true });
}

/** Keeps the credentials for the form, but a reload no longer reconnects with them. */
export function disableAutoConnect(): void {
  const stored = loadCredentials();
  if (stored) write(CREDENTIALS_KEY, { ...stored.credentials, autoConnect: false });
}

/** Chats are saved per instance, so another instance never sees them. */
export function loadChats(idInstance: string): ChatsState | null {
  const parsed = savedChatsSchema.safeParse(read(CHATS_KEY));
  return parsed.success && parsed.data.idInstance === idInstance ? parsed.data.state : null;
}

export function saveChats(idInstance: string, state: ChatsState): void {
  write(CHATS_KEY, { idInstance, state });
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(CREDENTIALS_KEY);
    sessionStorage.removeItem(CHATS_KEY);
  } catch {
    // Storage unavailable: nothing was persisted.
  }
}

function read(key: string): unknown {
  try {
    const raw = sessionStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable (e.g. blocked by the browser): the session just won't survive a reload.
  }
}
