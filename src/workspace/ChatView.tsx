import { useEffect, useId, useLayoutEffect, useRef } from 'react';
import type { Chat, OutgoingMessage } from '../chat/model';
import { formatPhoneNumber } from '../chat/phone';
import { Composer } from './Composer';
import { isSinglePaneLayout } from './layout';
import { MessageList } from './MessageList';
import styles from './ChatView.module.css';

interface ChatViewProps {
  chat: Chat;
  /** Only in the single-pane layout, where the chat replaces the list. */
  onBack?: () => void;
  onSend: (text: string) => void;
  onRetry: (message: OutgoingMessage) => void;
}

const STICK_TO_BOTTOM_PX = 80;

export function ChatView({ chat, onBack, onSend, onRetry }: ChatViewProps) {
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const phone = formatPhoneNumber(chat.phone);

  // Side by side, focus stays where the user acted (list or form); alone, the view takes it.
  useEffect(() => {
    if (isSinglePaneLayout()) titleRef.current?.focus();
  }, []);

  // Follow new messages unless the user has scrolled up to read history; always follow own sends.
  const lastMessage = chat.messages.at(-1);
  const lastMessageId = lastMessage?.id;
  const lastIsOutgoing = lastMessage?.direction === 'outgoing';
  useLayoutEffect(() => {
    const container = messagesRef.current;
    if (!container || lastMessageId === undefined) return;
    if (atBottom.current || lastIsOutgoing) container.scrollTop = container.scrollHeight;
  }, [lastMessageId, lastIsOutgoing]);

  // The retry button disappears once clicked, so focus moves on to where the user types next.
  function handleRetry(message: OutgoingMessage) {
    onRetry(message);
    composerRef.current?.focus();
  }

  function handleScroll() {
    const container = messagesRef.current;
    if (!container) return;
    atBottom.current =
      container.scrollHeight - container.scrollTop - container.clientHeight < STICK_TO_BOTTOM_PX;
  }

  return (
    <section className={styles.view} aria-labelledby={titleId}>
      <header className={styles.header}>
        {onBack && (
          <button
            type="button"
            className={styles.back}
            onClick={onBack}
            aria-label="К списку чатов"
          >
            ←
          </button>
        )}
        <div className={styles.identity}>
          <h2 id={titleId} ref={titleRef} tabIndex={-1} className={styles.title}>
            {chat.name ?? phone}
          </h2>
          {chat.name && <p className={styles.subtitle}>{phone}</p>}
        </div>
      </header>
      <div ref={messagesRef} className={styles.messages} onScroll={handleScroll}>
        <MessageList messages={chat.messages} onRetry={handleRetry} />
      </div>
      <Composer onSend={onSend} inputRef={composerRef} />
    </section>
  );
}
