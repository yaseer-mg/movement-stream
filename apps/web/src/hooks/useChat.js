import { useEffect, useCallback } from 'react';
import { useChatStore } from '../store';
import { getChatHistory } from '../services/chat.service';
import useWebSocket from './useWebSocket';

export default function useChat(streamId) {
  // Stable action references. Depending on the whole store object here
  // caused an infinite loop: setMessages changed the store, the store
  // object changed identity, the effect re-ran, and it fetched again.
  const addMessage = useChatStore((s) => s.addMessage);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const setMessages = useChatStore((s) => s.setMessages);

  const handleMessage = useCallback((msg) => {
    switch (msg.type) {
      case 'chat.message':
        addMessage(msg.data);
        break;
      case 'chat.message_deleted':
        deleteMessage(msg.data.message_id);
        break;
    }
  }, [addMessage, deleteMessage]);

  useWebSocket(handleMessage);

  // Re-runs when the stream id first arrives (or changes), so chat
  // history loads for viewers who were already on the page at go-live.
  useEffect(() => {
    if (!streamId) return;
    let cancelled = false;
    getChatHistory(streamId)
      .then((messages) => {
        if (!cancelled) setMessages(messages);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [streamId, setMessages]);

  return useChatStore();
}
