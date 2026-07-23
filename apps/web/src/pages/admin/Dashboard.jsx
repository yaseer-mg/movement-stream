import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/ui/AdminLayout';
import StatCard from '../../components/ui/StatCard';
import useStream from '../../hooks/useStream';
import { getAllEvents } from '../../services/events.service';
import { getAllRecordings } from '../../services/recordings.service';
import { endStream, switchCamera, toggleChat } from '../../services/stream.service';

function formatDuration(startedAt) {
  if (!startedAt) return '0:00';
  const diff = Date.now() - new Date(startedAt).getTime();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function Dashboard() {
  const stream = useStream();
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [recordings, setRecordings] = useState([]);
  const [duration, setDuration] = useState('0:00');
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    getAllEvents({ status: 'upcoming' }).then((e) => setEvents(e.slice(0, 5))).catch(() => {});
    getAllRecordings().then((r) => setRecordings(r.slice(0, 5))).catch(() => {});
  }, []);

  useEffect(() => {
    if (!stream.isLive) return;
    const id = setInterval(() => setDuration(formatDuration(stream.startedAt)), 1000);
    return () => clearInterval(id);
  }, [stream.isLive, stream.startedAt]);

  const handleEndStream = async () => {
    if (!window.confirm('End the current stream?')) return;
    setEnding(true);
    try {
      await endStream();
      stream.setIsLive(false);
    } catch {}
    setEnding(false);
  };

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold text-white mb-6">Dashboard</h1>

      {/* Stream status + quick actions */}
      <div className="bg-brand-dark-card border border-brand-dark-border rounded-lg p-5 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${stream.isLive ? 'bg-brand-red animate-pulse-live' : 'bg-brand-light-muted'}`} />
            <div>
              <p className="text-white text-lg font-semibold">
                {stream.isLive ? 'LIVE' : 'OFFLINE'}
              </p>
              {stream.isLive && stream.title && (
                <p className="text-brand-light-dim text-sm">{stream.title}</p>
              )}
            </div>
            {stream.isLive && (
              <span className="text-xs text-brand-light-dim font-mono bg-brand-surface px-2 py-0.5 rounded">
                {duration}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {!stream.isLive ? (
            <button
              onClick={() => navigate('/admin/studio')}
              className="px-4 py-2 bg-brand-green text-white text-sm font-medium rounded-md hover:bg-brand-green-light transition-colors"
            >
              Go Live
            </button>
          ) : (
            <button
              onClick={handleEndStream}
              disabled={ending}
              className="px-4 py-2 bg-brand-red text-white text-sm font-medium rounded-md hover:bg-brand-red-light transition-colors disabled:opacity-50"
            >
              {ending ? 'Ending...' : 'End Stream'}
            </button>
          )}
          <button
            onClick={() => navigate('/admin/mixer')}
            className="px-4 py-2 border border-brand-dark-border text-brand-light-dim text-sm rounded-md hover:text-white hover:border-brand-light-dim transition-colors"
          >
            Switch Camera
          </button>
          <button
            onClick={async () => {
              try { await toggleChat(!stream.chatEnabled); stream.setChatEnabled(!stream.chatEnabled); } catch {}
            }}
            className="px-4 py-2 border border-brand-dark-border text-brand-light-dim text-sm rounded-md hover:text-white hover:border-brand-light-dim transition-colors"
          >
            {stream.chatEnabled ? 'Disable Chat' : 'Enable Chat'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard
          label="Current Viewers"
          value={stream.viewerCount}
          bgClass="bg-brand-green/10"
          textClass="text-brand-green"
          icon="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        />
        <StatCard
          label="Peak Viewers"
          value={stream.peakViewers}
          bgClass="bg-brand-gold/10"
          textClass="text-brand-gold"
          icon="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
        />
        <StatCard
          label="Total Recordings"
          value={recordings.length}
          bgClass="bg-brand-red/10"
          textClass="text-brand-red"
          icon="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
        />
      </div>

      {/* Camera status + upcoming events + recent recordings */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Camera status */}
        <div className="bg-brand-dark-card border border-brand-dark-border rounded-lg p-5">
          <h2 className="text-white text-sm font-semibold mb-4">Cameras</h2>
          <div className="space-y-3">
            {['cam1', 'cam2', 'cam3'].map((slot) => (
              <div key={slot} className="flex items-center justify-between">
                <span className="text-brand-light-dim text-sm">{slot.toUpperCase()}</span>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${slot === stream.activeCamera ? 'bg-brand-green' : 'bg-brand-light-muted'}`} />
                  <span className="text-xs text-brand-light-muted">
                    {slot === stream.activeCamera ? 'ON AIR' : 'Standby'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming events */}
        <div className="bg-brand-dark-card border border-brand-dark-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white text-sm font-semibold">Upcoming Events</h2>
            <button onClick={() => navigate('/admin/events')} className="text-brand-green-400 text-xs hover:text-brand-green-300">View all</button>
          </div>
          {events.length === 0 ? (
            <p className="text-brand-light-muted text-xs">No upcoming events</p>
          ) : (
            <div className="space-y-3">
              {events.map((e) => (
                <div key={e.id} className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-white text-sm truncate">{e.title}</p>
                    <p className="text-brand-light-muted text-xs">{formatDate(e.starts_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent recordings */}
        <div className="bg-brand-dark-card border border-brand-dark-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white text-sm font-semibold">Recent Recordings</h2>
            <button onClick={() => navigate('/admin/recordings')} className="text-brand-green-400 text-xs hover:text-brand-green-300">View all</button>
          </div>
          {recordings.length === 0 ? (
            <p className="text-brand-light-muted text-xs">No recordings yet</p>
          ) : (
            <div className="space-y-3">
              {recordings.map((r) => (
                <div key={r.id} className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-white text-sm truncate">{r.title || 'Untitled'}</p>
                    <p className="text-brand-light-muted text-xs">{formatDate(r.recorded_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
