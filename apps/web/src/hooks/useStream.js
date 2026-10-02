import { useEffect, useCallback } from 'react';
import { useStreamStore } from '../store';
import { getStreamStatus } from '../services/stream.service';
import useWebSocket from './useWebSocket';

export default function useStream() {
  // Selectors, not the whole store. `useStreamStore()` returns a new
  // object on every state change, which would make these callbacks and
  // effects re-run on every broadcast. Store actions never change
  // identity, so selecting them keeps the deps stable.
  const setStreamStatus = useStreamStore((s) => s.setStreamStatus);
  const setIsLive = useStreamStore((s) => s.setIsLive);
  const setTitle = useStreamStore((s) => s.setTitle);
  const setActiveCamera = useStreamStore((s) => s.setActiveCamera);
  const setChatEnabled = useStreamStore((s) => s.setChatEnabled);

  const handleMessage = useCallback((msg) => {
    switch (msg.type) {
      case 'stream.live':
        setStreamStatus({ ...msg.data, is_live: true });
        break;
      case 'stream.ended':
        setIsLive(false);
        setTitle(null);
        setStreamStatus({ ended_at: msg.data?.ended_at ?? null });
        break;
      case 'stream.camera_switch':
        setActiveCamera(msg.data.active_camera);
        break;
      case 'stream.viewers_update':
        useStreamStore.setState({ viewerCount: msg.data.viewer_count });
        break;
      case 'stream.chat_enabled':
        setChatEnabled(true);
        break;
      case 'stream.chat_disabled':
        setChatEnabled(false);
        break;
    }
  }, [setActiveCamera, setChatEnabled, setIsLive, setStreamStatus, setTitle]);

  // Re-sync on every (re)connect so anything missed while the socket
  // was down is filled in from the REST source of truth.
  const handleOpen = useCallback(() => {
    getStreamStatus().then((status) => {
      if (status) setStreamStatus(status);
    }).catch(() => {});
  }, [setStreamStatus]);

  useWebSocket(handleMessage, handleOpen);

  useEffect(() => {
    handleOpen();
  }, [handleOpen]);

  return useStreamStore();
}
