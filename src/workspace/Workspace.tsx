import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ChatId } from '../chat/model';
import type { GreenApiClient, InstanceState } from '../green-api/client';
import type { GreenApiErrorKind } from '../green-api/errors';
import type { InboundEvent } from '../green-api/notifications';
import { Alert } from '../ui/Alert';
import { describeApiError } from '../ui/errorText';
import { ChatList } from './ChatList';
import { ChatView } from './ChatView';
import { useSinglePaneLayout } from './layout';
import { NewChatForm } from './NewChatForm';
import { useChats } from './useChats';
import { useNotificationPolling } from './useNotificationPolling';
import { useOpenChat } from './useOpenChat';
import { useSendMessage } from './useSendMessage';
import styles from './Workspace.module.css';

interface WorkspaceProps {
  idInstance: string;
  client: Pick<
    GreenApiClient,
    'checkAccount' | 'sendMessage' | 'receiveNotification' | 'deleteNotification'
  >;
  instanceStatus: ReactNode;
  onInstanceStateChange: (state: InstanceState) => void;
  /** Receiving hit an error that retrying cannot fix. */
  onFatalError: (kind: GreenApiErrorKind) => void;
}

export function Workspace({
  idInstance,
  client,
  instanceStatus,
  onInstanceStateChange,
  onFatalError,
}: WorkspaceProps) {
  const { state, activeChat, dispatch } = useChats(idInstance);
  const singlePane = useSinglePaneLayout();
  const openChat = useOpenChat(client, state, dispatch);
  const { send, retry } = useSendMessage(client, dispatch);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const pollingStatus = useNotificationPolling(client, handleInboundEvent, (error) =>
    onFatalError(error.kind),
  );
  const chatListRef = useRef<HTMLDivElement>(null);
  const returnFocusTo = useRef<ChatId | null>(null);

  // In the single-pane layout "back" removes the focused button, so focus goes to the chat entry.
  useEffect(() => {
    if (activeChat || returnFocusTo.current === null) return;
    const chatId = returnFocusTo.current;
    returnFocusTo.current = null;
    chatListRef.current
      ?.querySelector<HTMLButtonElement>(`[data-chat-id="${CSS.escape(chatId)}"]`)
      ?.focus();
  }, [activeChat]);

  function handleInboundEvent(event: InboundEvent) {
    switch (event.type) {
      case 'messageReceived':
        dispatch({
          type: 'incomingMessageReceived',
          chatId: event.chatId,
          messageId: event.messageId,
          text: event.text,
          sentAt: event.sentAt,
          senderName: event.senderName,
        });
        return;
      case 'deliveryFailed':
        dispatch({
          type: 'deliveryFailed',
          chatId: event.chatId,
          serverId: event.serverId,
          reason: event.reason,
        });
        return;
      case 'instanceStateChanged':
        onInstanceStateChange(event.state);
        return;
      case 'quotaExceeded':
        setQuotaExceeded(true);
        return;
    }
  }

  function handleBack() {
    returnFocusTo.current = activeChat?.id ?? null;
    dispatch({ type: 'chatClosed' });
  }

  return (
    <div
      className={styles.workspace}
      data-layout={singlePane ? 'single' : 'split'}
      data-view={activeChat ? 'chat' : 'list'}
    >
      <aside className={styles.sidebar}>
        <div className={styles.section}>
          {instanceStatus}
          {pollingStatus === 'reconnecting' && (
            <p role="status" className={styles.notice}>
              Не удаётся получить новые сообщения. Повторяем попытку…
            </p>
          )}
          {quotaExceeded && <Alert tone="warning">{describeApiError('quotaExceeded')}</Alert>}
        </div>
        <div className={styles.section}>
          <NewChatForm onOpenChat={openChat} />
        </div>
        <div className={styles.chats} ref={chatListRef}>
          <ChatList
            chats={state.chats}
            activeChatId={state.activeChatId}
            onSelect={(chatId) => dispatch({ type: 'chatSelected', chatId })}
          />
        </div>
      </aside>
      <main className={styles.main}>
        {activeChat ? (
          <ChatView
            key={activeChat.id}
            chat={activeChat}
            onBack={singlePane ? handleBack : undefined}
            onSend={(text) => send(activeChat.id, text)}
            onRetry={(message) => retry(activeChat.id, message)}
          />
        ) : (
          <p className={styles.placeholder}>Выберите чат или начните новый по номеру телефона.</p>
        )}
      </main>
    </div>
  );
}
