import { useCallback, useEffect, useRef, useState } from 'react';
import Navbar from '../../components/ui/Navbar';
import Footer from '../../components/ui/Footer';
import { useAuthContext } from '../../context/AuthContext';
import { getCameraSlots, connectCamera, disconnectCamera } from '../../services/camera.service';
import useWebSocket from '../../hooks/useWebSocket';

export default function CameraOp() {
  const { user } = useAuthContext();
  const [cameras, setCameras] = useState([]);
  const [controllable, setControllable] = useState([]);
  const [error, setError] = useState('');
  const [busySlot, setBusySlot] = useState(null);
  const timerRef = useRef(null);

  const refresh = useCallback(async (silent = true) => {
    try {
      const data = await getCameraSlots();
      setCameras(data.cameras);
      setControllable(data.controllable);
      if (!silent) setError('');
    } catch (err) {
      if (!silent) setError(err?.response?.data?.error || 'Failed to load camera status.');
    }
  }, []);

  useEffect(() => {
    refresh(false);
    timerRef.current = setInterval(() => refresh(true), 5000);
    return () => clearInterval(timerRef.current);
  }, [refresh]);

  // The API server broadcasts camera.connected / camera.disconnected for
  // every ingest connect and teardown, so the cards react immediately
  // instead of waiting out the poll interval. The REST refresh above
  // still owns label/ON AIR fields and covers anything missed offline.
  const applyCameraEvent = useCallback((msg) => {
    const event = msg?.type;
    if (event !== 'camera.connected' && event !== 'camera.disconnected') return;
    const slot = msg?.data?.slot;
    if (!slot) return;
    setCameras((prev) =>
      prev.map((camera) =>
        camera.slot === slot ? { ...camera, is_connected: event === 'camera.connected' } : camera
      )
    );
  }, []);

  useWebSocket(applyCameraEvent, () => refresh(true));

  const toggle = async (camera, targetState) => {
    setBusySlot(camera.slot);
    setError('');
    try {
      if (targetState) {
        await connectCamera(camera.slot);
      } else {
        await disconnectCamera(camera.slot);
      }
      await refresh(false);
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to update camera.');
    } finally {
      setBusySlot(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-brand-dark">
      <Navbar />

      <main className="flex-1 pt-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Camera Control</h1>
              <p className="text-brand-light-muted text-sm">
                Operated by {user?.display_name} · {user?.email}
              </p>
            </div>
            <button
              onClick={() => refresh(false)}
              className="px-3 py-1.5 rounded-md text-sm text-brand-light-dim hover:text-white hover:bg-brand-surface border border-brand-dark-border transition-colors"
            >
              Refresh
            </button>
          </div>

          {error && <p className="text-sm text-brand-red mb-4">{error}</p>}

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cameras.map((camera) => {
              const canControl = controllable.includes(camera.slot);
              const busy = busySlot === camera.slot;
              return (
                <div
                  key={camera.slot}
                  className="rounded-lg border border-brand-dark-border bg-brand-dark-card p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-semibold">{camera.label}</span>
                      <span className="text-xs text-brand-light-dim uppercase tracking-wide">{camera.slot}</span>
                    </div>
                    {camera.is_active && (
                      <span className="px-2 py-0.5 rounded-full bg-brand-green text-white text-xs font-semibold animate-pulse">
                        ON AIR
                      </span>
                    )}
                  </div>

                  <div className="text-sm text-brand-light-dim mb-4 space-y-1">
                    <p>
                      Connection:
                      <span className={`ml-1 ${camera.is_connected ? 'text-brand-green' : 'text-brand-red'}`}>
                        {camera.is_connected ? 'Online' : 'Offline'}
                      </span>
                    </p>
                    <p>
                      Last frame:
                      <span className="ml-1">
                        {camera.last_seen_at
                          ? new Date(camera.last_seen_at).toLocaleTimeString()
                          : '—'}
                      </span>
                    </p>
                    <p>
                      Stream:{' '}
                      <span className={camera.is_live ? 'text-brand-green' : 'text-brand-light-muted'}>
                        {camera.is_live ? 'Live' : 'Off air'}
                      </span>
                    </p>
                  </div>

                  {canControl ? (
                    <button
                      onClick={() => toggle(camera, !camera.is_connected)}
                      disabled={busy}
                      className={`w-full px-3 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 ${
                        camera.is_connected
                          ? 'bg-brand-red/10 text-brand-red border border-brand-red/30 hover:bg-brand-red/20'
                          : 'bg-brand-green text-white hover:bg-brand-green-light'
                      }`}
                    >
                      {busy ? 'Updating...' : camera.is_connected ? 'Disconnect Camera' : 'Connect Camera'}
                    </button>
                  ) : (
                    <p className="text-xs text-brand-light-muted text-center py-2">
                      Controlled by another operator
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}