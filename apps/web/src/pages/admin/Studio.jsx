import { useEffect, useState, useRef } from 'react';
import AdminLayout from '../../components/ui/AdminLayout';
import CameraPreview from '../../components/studio/CameraPreview';
import StreamControls from '../../components/studio/StreamControls';
import AudioMeter from '../../components/studio/AudioMeter';
import useWebRTC from '../../hooks/useWebRTC';
import useStream from '../../hooks/useStream';
import { getAllEvents } from '../../services/events.service';

function formatDuration(startedAt) {
  if (!startedAt) return '0:00';
  const diff = Date.now() - new Date(startedAt).getTime();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export default function Studio() {
  const videoRef = useRef(null);
  const { cameraReady, audioLevel, isLive, error, stream, startCamera, startScreenShare, goLive, endLive, clearError } = useWebRTC();
  const { viewerCount, startedAt, isLive: streamLive, setStreamStatus } = useStream();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedEvent, setSelectedEvent] = useState('');
  const [events, setEvents] = useState([]);
  const [source, setSource] = useState('camera');
  const [duration, setDuration] = useState('0:00');
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    getAllEvents({ status: 'upcoming' }).then(setEvents).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isLive || !startedAt) return;
    const id = setInterval(() => setDuration(formatDuration(startedAt)), 1000);
    return () => clearInterval(id);
  }, [isLive, startedAt]);

  const handleStartCamera = async () => {
    setSource('camera');
    await startCamera(videoRef.current);
  };

  const handleStartScreen = async () => {
    setSource('screen');
    await startScreenShare(videoRef.current);
  };

  const handleGoLive = async () => {
    setStarting(true);
    const ok = await goLive({ title, description, event_id: selectedEvent || undefined });
    setStarting(false);
  };

  const handleEndStream = async () => {
    if (!window.confirm('End the current stream?')) return;
    setEnding(true);
    await endLive();
    setEnding(false);
  };

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold text-white mb-6">Broadcast Studio</h1>

      {error && (
        <div className="bg-brand-red/10 border border-brand-red/30 rounded-lg p-3 mb-4 flex items-center justify-between">
          <p className="text-brand-red text-sm">{error}</p>
          <button onClick={clearError} className="text-brand-red text-xs hover:text-white">Dismiss</button>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left: Camera preview + audio */}
        <div className="flex-1 space-y-4">
          <CameraPreview stream={stream} mirrored={source === 'camera'} />

          {/* Source selector */}
          <div className="flex gap-2">
            <button
              onClick={handleStartCamera}
              className={`flex-1 px-3 py-2 text-sm rounded-md border transition-colors ${
                source === 'camera' && cameraReady
                  ? 'border-brand-green text-brand-green bg-brand-green/10'
                  : 'border-brand-dark-border text-brand-light-dim hover:text-white hover:border-brand-light-dim'
              }`}
            >
              Camera
            </button>
            <button
              onClick={handleStartScreen}
              className={`flex-1 px-3 py-2 text-sm rounded-md border transition-colors ${
                source === 'screen' && cameraReady
                  ? 'border-brand-green text-brand-green bg-brand-green/10'
                  : 'border-brand-dark-border text-brand-light-dim hover:text-white hover:border-brand-light-dim'
              }`}
            >
              Screen Share
            </button>
          </div>

          <AudioMeter level={audioLevel} />
        </div>

        {/* Right: Stream controls */}
        <div className="w-full lg:w-96 bg-brand-dark-card border border-brand-dark-border rounded-lg p-5">
          <StreamControls
            title={title}
            setTitle={setTitle}
            description={description}
            setDescription={setDescription}
            events={events}
            selectedEvent={selectedEvent}
            setSelectedEvent={setSelectedEvent}
            isLive={isLive || streamLive}
            onGoLive={handleGoLive}
            onEndStream={handleEndStream}
            streamTitle={title}
            duration={duration}
            viewerCount={viewerCount}
            starting={starting}
            ending={ending}
          />
        </div>
      </div>
    </AdminLayout>
  );
}
