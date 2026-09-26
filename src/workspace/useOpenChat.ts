import { useCallback, type Dispatch } from 'react';
import { findChatByPhone, type ChatAction, type ChatsState } from '../chat/chatReducer';
import { warnInDev } from '../devLog';
import type { GreenApiClient } from '../green-api/client';
import { GreenApiError, type GreenApiErrorKind } from '../green-api/errors';

export type OpenChatProblem =
  | { type: 'noAccount' }
  | { type: 'requestFailed'; kind: GreenApiErrorKind }
  | { type: 'unexpectedError' };

export type OpenChatResult = { ok: true } | { ok: false; problem: OpenChatProblem };

export function useOpenChat(
  client: Pick<GreenApiClient, 'checkAccount'>,
  state: ChatsState,
  dispatch: Dispatch<ChatAction>,
) {
  return useCallback(
    async (phone: string): Promise<OpenChatResult> => {
      // CheckAccount is rate-limited and counts towards the plan quota, so a known chat is reused.
      const known = findChatByPhone(state, phone);
      if (known) {
        dispatch({ type: 'chatOpened', chatId: known.id, phone });
        return { ok: true };
      }

      try {
        // The chat id must come from CheckAccount: sending to phone@c.us makes replies arrive
        // under a different id.
        const account = await client.checkAccount(phone);
        if (!account.exists) return { ok: false, problem: { type: 'noAccount' } };
        dispatch({ type: 'chatOpened', chatId: account.chatId, phone });
        return { ok: true };
      } catch (error) {
        if (error instanceof GreenApiError) {
          return { ok: false, problem: { type: 'requestFailed', kind: error.kind } };
        }
        warnInDev('Unexpected error while opening a chat', error);
        return { ok: false, problem: { type: 'unexpectedError' } };
      }
    },
    [client, state, dispatch],
  );
}
