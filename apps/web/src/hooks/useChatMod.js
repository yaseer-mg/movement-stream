import { useEffect, useCallback } from 'react';
import { useChatStore } from '../store';
import { getChatHistory } from '../services/chat.service';
import useWebSocket from './useWebSocket';

export default function useChatMod(streamId) {
  const addMessage = useChatStore((s) => s.addMessage);
  const markDeleted = useChatStore((s) => s.markDeleted);
  const setMessages = useChatStore((s) => s.setMessages);

  const handleMessage = useCallback((msg) => {
    switch (msg.type) {
      case 'chat.message':
        addMessage(msg.data);
        break;
      case 'chat.message_deleted':
        markDeleted(msg.data.message_id);
        break;
    }
  }, [addMessage, markDeleted]);

  useWebSocket(handleMessage);

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
