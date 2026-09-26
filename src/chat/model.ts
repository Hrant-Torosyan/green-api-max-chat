/** Numeric MAX chat id kept as a string, e.g. "10000000". */
export type ChatId = string;

export type FailureReason =
  | 'network'
  | 'rejected'
  | 'rateLimited'
  | 'accountSuspended'
  | 'quotaExceeded'
  | 'noAccount'
  | 'notDelivered'
  | 'interrupted';

export type OutgoingStatus =
  { type: 'sending' } | { type: 'sent' } | { type: 'failed'; reason: FailureReason };

interface IncomingMessage {
  direction: 'incoming';
  /** Server-assigned message id. */
  id: string;
  text: string;
  sentAt: number;
}

export interface OutgoingMessage {
  direction: 'outgoing';
  /** Generated locally; stays the same across retries. */
  id: string;
  /** Id of the latest successful send attempt. */
  serverId: string | null;
  text: string;
  sentAt: number;
  status: OutgoingStatus;
}

export type Message = IncomingMessage | OutgoingMessage;

export interface Chat {
  id: ChatId;
  /** Digits only, e.g. "79991234567". */
  phone: string;
  name: string | null;
  messages: Message[];
}
