import {
  chatReducer,
  initialChatsState,
  reviveChatsState,
  selectActiveChat,
  type ChatAction,
  type ChatsState,
} from './chatReducer';
import type { Message, OutgoingStatus } from './model';

const CHAT = '10000000';
const OTHER_CHAT = '20000000';

const open: ChatAction = { type: 'chatOpened', chatId: CHAT, phone: '79991234567' };
const incoming: ChatAction = {
  type: 'incomingMessageReceived',
  chatId: CHAT,
  messageId: 'server-in-1',
  text: 'Hello back',
  sentAt: 2000,
  senderName: 'Ivan',
};

function submit(messageId: string): ChatAction {
  return { type: 'messageSubmitted', chatId: CHAT, messageId, text: 'Hi', sentAt: 1000 };
}

function sent(messageId: string, serverId: string): ChatAction {
  return { type: 'messageSent', chatId: CHAT, messageId, serverId };
}

function failed(messageId: string): ChatAction {
  return { type: 'messageFailed', chatId: CHAT, messageId, reason: 'network' };
}

function reduce(...actions: ChatAction[]): ChatsState {
  return actions.reduce(chatReducer, initialChatsState);
}

function messagesOf(state: ChatsState): Message[] {
  return state.chats.find((chat) => chat.id === CHAT)?.messages ?? [];
}

function statusOf(state: ChatsState, messageId: string): OutgoingStatus | undefined {
  const message = messagesOf(state).find((m) => m.id === messageId);
  return message?.direction === 'outgoing' ? message.status : undefined;
}

describe('chats', () => {
  it('opens a chat and makes it active', () => {
    expect(selectActiveChat(reduce(open))).toEqual({
      id: CHAT,
      phone: '79991234567',
      name: null,
      messages: [],
    });
  });

  it('reopening a known chat selects it without losing history', () => {
    const state = reduce(
      open,
      incoming,
      { type: 'chatOpened', chatId: OTHER_CHAT, phone: '375291234567' },
      open,
    );
    expect(state.chats.map((chat) => chat.id)).toEqual([OTHER_CHAT, CHAT]);
    expect(state.activeChatId).toBe(CHAT);
    expect(messagesOf(state)).toHaveLength(1);
  });
});

describe('outgoing messages', () => {
  it('goes from sending to sent and records the server id', () => {
    const submitted = reduce(open, submit('a'));
    expect(messagesOf(submitted)[0]).toMatchObject({ serverId: null, status: { type: 'sending' } });

    const confirmed = chatReducer(submitted, sent('a', 'server-a'));
    expect(messagesOf(confirmed)[0]).toMatchObject({
      serverId: 'server-a',
      status: { type: 'sent' },
    });
  });

  it('confirms parallel sends independently, keeping submission order', () => {
    const state = reduce(open, submit('a'), submit('b'), sent('b', 'server-b'), failed('a'));
    expect(messagesOf(state).map((message) => message.id)).toEqual(['a', 'b']);
    expect(statusOf(state, 'a')).toEqual({ type: 'failed', reason: 'network' });
    expect(statusOf(state, 'b')).toEqual({ type: 'sent' });
  });

  it('retries a failed send in place', () => {
    const state = reduce(open, submit('a'), failed('a'), {
      type: 'messageRetried',
      chatId: CHAT,
      messageId: 'a',
    });
    expect(messagesOf(state)).toHaveLength(1);
    expect(statusOf(state, 'a')).toEqual({ type: 'sending' });
  });

  it('marks a sent message as failed when a delivery failure is reported', () => {
    const state = reduce(open, submit('a'), sent('a', 'server-a'), {
      type: 'deliveryFailed',
      chatId: CHAT,
      serverId: 'server-a',
      reason: 'noAccount',
    });
    expect(statusOf(state, 'a')).toEqual({ type: 'failed', reason: 'noAccount' });
  });

  it('ignores a failure of an earlier attempt after a retry', () => {
    const deliveryFailed: ChatAction = {
      type: 'deliveryFailed',
      chatId: CHAT,
      serverId: 'server-a1',
      reason: 'notDelivered',
    };
    const state = reduce(
      open,
      submit('a'),
      sent('a', 'server-a1'),
      deliveryFailed,
      { type: 'messageRetried', chatId: CHAT, messageId: 'a' },
      sent('a', 'server-a2'),
      deliveryFailed,
    );
    expect(statusOf(state, 'a')).toEqual({ type: 'sent' });
  });

  it('ignores delivery failures for unknown server ids', () => {
    const before = reduce(open, submit('a'), sent('a', 'server-a'));
    const after = chatReducer(before, {
      type: 'deliveryFailed',
      chatId: CHAT,
      serverId: 'server-unknown',
      reason: 'notDelivered',
    });
    expect(after).toBe(before);
  });
});

describe('incoming messages', () => {
  it('appends the message and names the chat after the sender', () => {
    const state = reduce(open, submit('a'), incoming);
    expect(messagesOf(state).map((message) => message.direction)).toEqual(['outgoing', 'incoming']);
    expect(selectActiveChat(state)?.name).toBe('Ivan');
  });

  it('keeps the first known sender name', () => {
    const state = reduce(open, incoming, {
      ...incoming,
      messageId: 'server-in-2',
      senderName: 'Other',
    });
    expect(selectActiveChat(state)?.name).toBe('Ivan');
  });

  it('ignores a message it has already received', () => {
    const once = reduce(open, incoming);
    expect(chatReducer(once, incoming)).toBe(once);
  });

  it('ignores messages for chats that were not opened', () => {
    const before = reduce(open);
    expect(chatReducer(before, { ...incoming, chatId: OTHER_CHAT })).toBe(before);
  });
});

describe('chat order', () => {
  const openOther: ChatAction = { type: 'chatOpened', chatId: OTHER_CHAT, phone: '375291234567' };
  const order = (state: ChatsState) => state.chats.map((chat) => chat.id);

  it('moves a chat with a new incoming message to the top', () => {
    expect(order(reduce(open, openOther))).toEqual([OTHER_CHAT, CHAT]);
    expect(order(reduce(open, openOther, incoming))).toEqual([CHAT, OTHER_CHAT]);
  });

  it('moves a chat to the top when the user sends a message', () => {
    expect(order(reduce(open, openOther, submit('a')))).toEqual([CHAT, OTHER_CHAT]);
  });

  it('keeps the order for a duplicate message', () => {
    const before = reduce(open, incoming, openOther);
    expect(chatReducer(before, incoming)).toBe(before);
  });

  it('keeps the order for status updates', () => {
    const before = reduce(open, submit('a'), openOther);
    expect(order(chatReducer(before, sent('a', 'server-a')))).toEqual([OTHER_CHAT, CHAT]);
  });
});

describe('reviveChatsState', () => {
  it('marks sends interrupted by a reload as failed', () => {
    const saved = reduce(open, submit('a'), sent('a', 'server-a'), incoming, submit('b'));
    const revived = reviveChatsState(saved);

    expect(statusOf(revived, 'a')).toEqual({ type: 'sent' });
    expect(statusOf(revived, 'b')).toEqual({ type: 'failed', reason: 'interrupted' });
    expect(messagesOf(revived)).toHaveLength(3);
    expect(revived.activeChatId).toBe(CHAT);
  });
});
