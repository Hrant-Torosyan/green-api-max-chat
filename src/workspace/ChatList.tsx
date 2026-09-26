import { useId } from 'react';
import type { Chat, ChatId } from '../chat/model';
import { formatPhoneNumber } from '../chat/phone';
import { formatChatListTime } from './time';
import styles from './ChatList.module.css';

interface ChatListProps {
  chats: Chat[];
  activeChatId: ChatId | null;
  onSelect: (chatId: ChatId) => void;
}

export function ChatList({ chats, activeChatId, onSelect }: ChatListProps) {
  if (chats.length === 0) {
    return <p className={styles.empty}>Чатов пока нет. Введите номер телефона, чтобы начать.</p>;
  }

  return (
    <nav aria-label="Чаты">
      <ul className={styles.list}>
        {chats.map((chat) => (
          <ChatListItem
            key={chat.id}
            chat={chat}
            active={chat.id === activeChatId}
            onSelect={onSelect}
          />
        ))}
      </ul>
    </nav>
  );
}

interface ChatListItemProps {
  chat: Chat;
  active: boolean;
  onSelect: (chatId: ChatId) => void;
}

function ChatListItem({ chat, active, onSelect }: ChatListItemProps) {
  const titleId = useId();
  const previewId = useId();
  const phone = formatPhoneNumber(chat.phone);
  const lastMessage = chat.messages.at(-1);
  const preview = lastMessage
    ? `${lastMessage.direction === 'outgoing' ? 'Вы: ' : ''}${lastMessage.text}`
    : chat.name && phone;

  return (
    <li>
      <button
        type="button"
        className={styles.item}
        data-chat-id={chat.id}
        aria-current={active ? 'true' : undefined}
        aria-labelledby={titleId}
        aria-describedby={preview ? previewId : undefined}
        onClick={() => onSelect(chat.id)}
      >
        <span className={styles.row}>
          <span id={titleId} className={styles.title}>
            {chat.name ?? phone}
          </span>
          {lastMessage && (
            <time className={styles.time} dateTime={new Date(lastMessage.sentAt).toISOString()}>
              {formatChatListTime(lastMessage.sentAt)}
            </time>
          )}
        </span>
        {preview && (
          <span id={previewId} className={styles.preview}>
            {preview}
          </span>
        )}
      </button>
    </li>
  );
}
