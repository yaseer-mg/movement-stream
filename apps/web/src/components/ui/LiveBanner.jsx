import { useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useStreamStore } from '../../store';
import { getStreamStatus } from '../../services/stream.service';
import useWebSocket from '../../hooks/useWebSocket';

export default function LiveBanner() {
  // Selector-based reads keep the callbacks below stable, so the
  // status refetch doesn't re-run on every broadcast.
  const isLive = useStreamStore((s) => s.isLive);
  const title = useStreamStore((s) => s.title);
  const viewerCount = useStreamStore((s) => s.viewerCount);
  const setIsLive = useStreamStore((s) => s.setIsLive);
  const setStreamStatus = useStreamStore((s) => s.setStreamStatus);

  const handleMessage = useCallback((msg) => {
    switch (msg.type) {
      case 'stream.live':
        setStreamStatus({ ...msg.data, is_live: true });
        break;
      case 'stream.ended':
        setIsLive(false);
        break;
      case 'stream.viewers_update':
        useStreamStore.setState({ viewerCount: msg.data.viewer_count });
        break;
      case 'stream.camera_switch':
        useStreamStore.setState({ activeCamera: msg.data.active_camera });
        break;
    }
  }, [setIsLive, setStreamStatus]);

  const handleOpen = useCallback(() => {
    getStreamStatus().then((status) => {
      if (status) setStreamStatus(status);
    }).catch(() => {});
  }, [setStreamStatus]);

  useWebSocket(handleMessage, handleOpen);

  useEffect(() => {
    handleOpen();
  }, [handleOpen]);

  if (!isLive) return null;

  return (
    <div className="bg-brand-green/10 border border-brand-green/30 rounded-lg p-4 sm:p-6 flex items-center justify-between gap-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <span className="w-3 h-3 rounded-full bg-brand-red animate-pulse-live" />
        <div>
          <div className="flex items-center gap-2">
            <span className="text-brand-red text-xs font-semibold uppercase tracking-wider">LIVE NOW</span>
            <span className="text-brand-light-muted text-xs">
              {viewerCount} viewer{viewerCount !== 1 ? 's' : ''}
            </span>
          </div>
          <h3 className="text-white text-sm sm:text-base font-medium mt-0.5">{title}</h3>
        </div>
      </div>
      <Link
        to="/watch"
        className="shrink-0 px-4 py-2 rounded-md bg-brand-red text-white text-sm font-semibold hover:bg-brand-red-light transition-colors"
      >
        Watch
      </Link>
    </div>
  );
}
