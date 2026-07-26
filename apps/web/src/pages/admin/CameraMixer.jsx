import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import AdminLayout from '../../components/ui/AdminLayout';
import CameraSlot from '../../components/mixer/CameraSlot';
import useStream from '../../hooks/useStream';
import { switchCamera } from '../../services/stream.service';

const CAMERA_SLOTS = [
  { slot: 'cam1', label: 'Main Stage' },
  { slot: 'cam2', label: 'Wide Angle' },
  { slot: 'cam3', label: 'Speaker Closeup' },
];

const HLS_URL = import.meta.env.VITE_HLS_URL || 'http://localhost:8080/live/stream.m3u8';

export default function CameraMixer() {
  const { isLive, activeCamera } = useStream();
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (!videoRef.current) return;

    if (Hls.isSupported()) {
      const hls = new Hls({
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 6,
      });
      hlsRef.current = hls;
      hls.loadSource(HLS_URL);
      hls.attachMedia(videoRef.current);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        videoRef.current?.play().catch(() => {});
      });
      return () => { hls.destroy(); hlsRef.current = null; };
    } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      videoRef.current.src = HLS_URL;
    }
  }, []);

  const handleSwitch = async (slot) => {
    if (switching || slot === activeCamera) return;
    setSwitching(true);
    try {
      await switchCamera(slot);
    } catch {
    } finally {
      setSwitching(false);
    }
  };

  return (
    <AdminLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Camera Mixer</h1>
          <p className="text-brand-light-muted text-sm mt-1">Switch between live camera feeds</p>
        </div>
        {isLive && (
          <div className="flex items-center gap-2 bg-brand-red/10 border border-brand-red/30 rounded-lg px-3 py-1.5">
            <span className="w-2 h-2 rounded-full bg-brand-red animate-pulse-live" />
            <span className="text-brand-red text-sm font-semibold">LIVE</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Program Output — left side, spans 2 cols */}
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-brand-dark-border bg-brand-dark-card overflow-hidden">
            <div className="px-4 py-3 border-b border-brand-dark-border flex items-center justify-between">
              <h2 className="text-white text-sm font-semibold">Program Output</h2>
              <span className="text-brand-light-muted text-xs">What viewers see</span>
            </div>
            <div className="aspect-video bg-black flex items-center justify-center">
              <video
                ref={videoRef}
                className="w-full h-full object-contain"
                muted
                playsInline
              />
            </div>
          </div>
        </div>

        {/* Camera Sources — right side */}
        <div className="lg:col-span-1">
          <div className="rounded-lg border border-brand-dark-border bg-brand-dark-card overflow-hidden h-full">
            <div className="px-4 py-3 border-b border-brand-dark-border">
              <h2 className="text-white text-sm font-semibold">Camera Sources</h2>
            </div>
            <div className="p-4 space-y-4">
              {CAMERA_SLOTS.map((cam) => {
                const isActive = activeCamera === cam.slot;
                const isConnected = isActive || cam.slot === 'cam1';
                return (
                  <CameraSlot
                    key={cam.slot}
                    slot={cam.slot}
                    label={cam.label}
                    isActive={isActive}
                    isConnected={isConnected}
                    operatorName={null}
                    onSwitch={handleSwitch}
                  />
                );
              })}
              {switching && (
                <p className="text-brand-light-muted text-xs text-center animate-pulse">Switching camera...</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
