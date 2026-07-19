import { useEffect, useRef, useCallback } from 'react';
import { useStreamStore } from '../store';
import { getStreamStatus } from '../services/stream.service';

export default function useStream() {
  const store = useStreamStore();
  const wsRef = useRef(null);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = import.meta.env.VITE_WS_URL || `${protocol}//localhost:4000/ws`;

    getStreamStatus().then((status) => {
      if (status) store.setStreamStatus(status);
    }).catch(() => {});

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          switch (msg.type) {
            case 'stream.live':
              store.setStreamStatus({ ...msg.data, is_live: true });
              break;
            case 'stream.ended':
              store.setIsLive(false);
              store.setTitle(null);
              break;
            case 'stream.camera_switch':
              store.setActiveCamera(msg.data.active_camera);
              break;
            case 'stream.viewers_update':
              useStreamStore.setState({ viewerCount: msg.data.viewer_count });
              break;
            case 'stream.chat_enabled':
              useStreamStore.setState({ chatEnabled: true });
              break;
            case 'stream.chat_disabled':
              useStreamStore.setState({ chatEnabled: false });
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
    connect();
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  return store;
}
