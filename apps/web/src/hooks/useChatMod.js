import { useEffect, useRef, useCallback } from 'react';
import { useChatStore } from '../store';
import { getChatHistory } from '../services/chat.service';

export default function useChatMod(streamId) {
  const store = useChatStore();
  const wsRef = useRef(null);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = import.meta.env.VITE_WS_URL || `${protocol}//localhost:4000/ws`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          switch (msg.type) {
            case 'chat.message':
              store.addMessage(msg.data);
              break;
            case 'chat.message_deleted':
              store.markDeleted(msg.data.message_id);
              break;
          }
        } catch {}
      };

      ws.onclose = () => {
        wsRef.current = null;
        setTimeout(connect, 5000);
      };
    } catch {}
  }, []);

  useEffect(() => {
    if (streamId) {
      getChatHistory(streamId).then(store.setMessages).catch(() => {});
    }
  }, [store, streamId]);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  return store;
}
