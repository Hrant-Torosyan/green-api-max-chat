import type { Chat, ChatId, FailureReason, Message, OutgoingMessage } from './model';

export interface ChatsState {
  /** New chats and chats with a new message come first. */
  chats: Chat[];
  activeChatId: ChatId | null;
}

export type ChatAction =
  | { type: 'chatOpened'; chatId: ChatId; phone: string }
  | { type: 'chatSelected'; chatId: ChatId }
  | { type: 'chatClosed' }
  | { type: 'messageSubmitted'; chatId: ChatId; messageId: string; text: string; sentAt: number }
  | { type: 'messageSent'; chatId: ChatId; messageId: string; serverId: string }
  | { type: 'messageFailed'; chatId: ChatId; messageId: string; reason: FailureReason }
  | { type: 'messageRetried'; chatId: ChatId; messageId: string }
  | {
      type: 'incomingMessageReceived';
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
    };

export const initialChatsState: ChatsState = { chats: [], activeChatId: null };

export function chatReducer(state: ChatsState, action: ChatAction): ChatsState {
  switch (action.type) {
    case 'chatOpened': {
      const exists = state.chats.some((chat) => chat.id === action.chatId);
      const chats = exists
        ? state.chats
        : [{ id: action.chatId, phone: action.phone, name: null, messages: [] }, ...state.chats];
      return { chats, activeChatId: action.chatId };
    }

    case 'chatSelected':
      return state.chats.some((chat) => chat.id === action.chatId)
        ? { ...state, activeChatId: action.chatId }
        : state;

    case 'chatClosed':
      return { ...state, activeChatId: null };

    case 'messageSubmitted':
      return updateChatToTop(state, action.chatId, (chat) => ({
        ...chat,
        messages: [
          ...chat.messages,
          {
            direction: 'outgoing',
            id: action.messageId,
            serverId: null,
            text: action.text,
            sentAt: action.sentAt,
            status: { type: 'sending' },
          },
        ],
      }));

    case 'messageSent':
      return updateOutgoing(state, action.chatId, (message) =>
        message.id === action.messageId && message.status.type === 'sending'
          ? { ...message, serverId: action.serverId, status: { type: 'sent' } }
          : message,
      );

    case 'messageFailed':
      return updateOutgoing(state, action.chatId, (message) =>
        message.id === action.messageId && message.status.type === 'sending'
          ? { ...message, status: { type: 'failed', reason: action.reason } }
          : message,
      );

    case 'messageRetried':
      return updateOutgoing(state, action.chatId, (message) =>
        message.id === action.messageId && message.status.type === 'failed'
          ? { ...message, serverId: null, status: { type: 'sending' } }
          : message,
      );

    case 'deliveryFailed':
      return updateOutgoing(state, action.chatId, (message) =>
        message.serverId === action.serverId && message.status.type === 'sent'
          ? { ...message, status: { type: 'failed', reason: action.reason } }
          : message,
      );

    case 'incomingMessageReceived':
      return updateChatToTop(state, action.chatId, (chat) => {
        // Notifications are delivered at least once, so the same message can arrive again.
        const isDuplicate = chat.messages.some((message) => message.id === action.messageId);
        if (isDuplicate) return chat;

        return {
          ...chat,
          name: chat.name ?? action.senderName,
          messages: [
            ...chat.messages,
            {
              direction: 'incoming',
              id: action.messageId,
              text: action.text,
              sentAt: action.sentAt,
            },
          ],
        };
      });
  }
}

export function selectActiveChat(state: ChatsState): Chat | null {
  return state.chats.find((chat) => chat.id === state.activeChatId) ?? null;
}

export function findChatByPhone(state: ChatsState, phone: string): Chat | null {
  return state.chats.find((chat) => chat.phone === phone) ?? null;
}

/** The outcome of a send interrupted by a reload is unknown, so it is shown as failed, never resent. */
export function reviveChatsState(saved: ChatsState): ChatsState {
  return {
    ...saved,
    chats: saved.chats.map((chat) => ({
      ...chat,
      messages: chat.messages.map((message): Message =>
        message.direction === 'outgoing' && message.status.type === 'sending'
          ? { ...message, status: { type: 'failed', reason: 'interrupted' } }
          : message,
      ),
    })),
  };
}

/** Applies the update and moves the chat to the top, but only if something actually changed. */
function updateChatToTop(
  state: ChatsState,
  chatId: ChatId,
  update: (chat: Chat) => Chat,
): ChatsState {
  const updated = updateChat(state, chatId, update);
  if (updated === state) return state;
  const index = updated.chats.findIndex((chat) => chat.id === chatId);
  const chat = updated.chats[index];
  if (index <= 0 || !chat) return updated;
  return {
    ...updated,
    chats: [chat, ...updated.chats.slice(0, index), ...updated.chats.slice(index + 1)],
  };
}

function updateChat(state: ChatsState, chatId: ChatId, update: (chat: Chat) => Chat): ChatsState {
  let changed = false;
  const chats = state.chats.map((chat) => {
    if (chat.id !== chatId) return chat;
    const next = update(chat);
    if (next !== chat) changed = true;
    return next;
  });
  return changed ? { ...state, chats } : state;
}

function updateOutgoing(
  state: ChatsState,
  chatId: ChatId,
  update: (message: OutgoingMessage) => OutgoingMessage,
): ChatsState {
  return updateChat(state, chatId, (chat) => {
    let changed = false;
    const messages = chat.messages.map((message): Message => {
      if (message.direction !== 'outgoing') return message;
      const next = update(message);
      if (next !== message) changed = true;
      return next;
    });
    return changed ? { ...chat, messages } : chat;
  });
}
