import { useEffect, useReducer } from 'react';
import {
  chatReducer,
  initialChatsState,
  reviveChatsState,
  selectActiveChat,
} from '../chat/chatReducer';
import { loadChats, saveChats } from '../storage';

// Restored in the reducer initializer, before polling starts, so a reply that arrives right
// after a reload finds its chat.
export function useChats(idInstance: string) {
  const [state, dispatch] = useReducer(chatReducer, idInstance, restoreChats);

  useEffect(() => {
    saveChats(idInstance, state);
  }, [idInstance, state]);

  return { state, activeChat: selectActiveChat(state), dispatch };
}

function restoreChats(idInstance: string) {
  const saved = loadChats(idInstance);
  return saved ? reviveChatsState(saved) : initialChatsState;
}
