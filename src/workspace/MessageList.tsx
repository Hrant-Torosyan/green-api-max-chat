import type { FailureReason, Message, OutgoingMessage, OutgoingStatus } from '../chat/model';
import { formatMessageTime } from './time';
import styles from './MessageList.module.css';

interface MessageListProps {
  messages: Message[];
  onRetry: (message: OutgoingMessage) => void;
}

const FAILURE_TEXT: Record<FailureReason, string> = {
  network: 'Нет связи с сервером',
  rejected: 'Сервер отклонил сообщение',
  rateLimited: 'Слишком много запросов, попробуйте позже',
  accountSuspended: 'Аккаунт временно ограничен',
  quotaExceeded: 'Исчерпан лимит тарифа',
  noAccount: 'У получателя нет аккаунта MAX',
  notDelivered: 'Сообщение не доставлено',
  interrupted: 'Отправка не подтверждена',
};

export function MessageList({ messages, onRetry }: MessageListProps) {
  if (messages.length === 0) {
    return <p className={styles.empty}>Сообщений пока нет</p>;
  }

  return (
    <ol className={styles.list} role="log" aria-label="Сообщения">
      {messages.map((message) => (
        <li
          key={message.id}
          className={[styles.bubble, styles[message.direction]].filter(Boolean).join(' ')}
        >
          <p className={styles.text}>{message.text}</p>
          <p className={styles.meta}>
            <time dateTime={new Date(message.sentAt).toISOString()}>
              {formatMessageTime(message.sentAt)}
            </time>
            {message.direction === 'outgoing' && <StatusLabel status={message.status} />}
          </p>
          {message.direction === 'outgoing' && message.status.type === 'failed' && (
            <button type="button" className={styles.retry} onClick={() => onRetry(message)}>
              Повторить
            </button>
          )}
        </li>
      ))}
    </ol>
  );
}

function StatusLabel({ status }: { status: OutgoingStatus }) {
  switch (status.type) {
    case 'sending':
      return <span>Отправляется</span>;
    case 'sent':
      return <span>Отправлено</span>;
    case 'failed':
      return <span className={styles.failed}>{FAILURE_TEXT[status.reason]}</span>;
  }
}
