import { useEffect, useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import Navbar from '../../components/ui/Navbar';
import Footer from '../../components/ui/Footer';
import { getEvent } from '../../services/events.service';

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Countdown({ targetDate }) {
  const [remaining, setRemaining] = useState('');

  useEffect(() => {
    function update() {
      const diff = new Date(targetDate) - Date.now();
      if (diff <= 0) {
        setRemaining('');
        return;
      }
      const d = Math.floor(diff / (1000 * 60 * 60 * 24));
      const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);
      const parts = [];
      if (d > 0) parts.push(`${d}d`);
      if (h > 0) parts.push(`${h}h`);
      if (m > 0) parts.push(`${m}m`);
      parts.push(`${s}s`);
      setRemaining(parts.join(' '));
    }
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  if (!remaining) return null;

  return (
    <div className="mt-4">
      <p className="text-brand-light-muted text-sm">Starts in</p>
      <p className="text-white text-2xl font-bold font-mono tracking-wider">{remaining}</p>
    </div>
  );
}

const statusStyles = {
  upcoming: 'bg-brand-gold/20 text-brand-gold border-brand-gold/30',
  live: 'bg-brand-red/20 text-brand-red border-brand-red/30',
  ended: 'bg-brand-dark-border text-brand-light-muted border-brand-dark-border',
  cancelled: 'bg-brand-dark-border text-brand-light-muted border-brand-dark-border',
};

export default function EventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getEvent(id)
      .then(setEvent)
      .catch(() => setError('Event not found'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 pt-16 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
        </main>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 pt-16 flex items-center justify-center">
          <div className="text-center">
            <p className="text-white text-lg">{error || 'Event not found'}</p>
            <Link to="/events" className="text-brand-green-400 text-sm mt-2 inline-block hover:text-brand-green-300">
              Back to events
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 pt-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Thumbnail */}
          {event.thumbnail_url && (
            <div
              className="w-full aspect-video rounded-lg bg-cover bg-center mb-6"
              style={{ backgroundImage: `url(${event.thumbnail_url})` }}
            />
          )}

          {/* Status badge + title */}
          <div className="flex items-center gap-3 mb-3">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${statusStyles[event.status] || statusStyles.upcoming}`}>
              {event.status.toUpperCase()}
            </span>
            {event.is_featured && (
              <span className="text-xs text-brand-gold font-medium">Featured</span>
            )}
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">{event.title}</h1>

          {/* Details */}
          <div className="flex flex-wrap gap-4 text-sm text-brand-light-dim mb-6">
            <div>
              <p className="text-brand-light-muted text-xs">Date</p>
              <p className="text-white">{formatDate(event.starts_at)}</p>
            </div>
            <div>
              <p className="text-brand-light-muted text-xs">Time</p>
              <p className="text-white">{formatTime(event.starts_at)}</p>
            </div>
            {event.location && (
              <div>
                <p className="text-brand-light-muted text-xs">Location</p>
                <p className="text-white">{event.location}</p>
              </div>
            )}
          </div>

          {event.description && (
            <p className="text-brand-light-dim leading-relaxed mb-8">{event.description}</p>
          )}

          {/* Countdown */}
          {event.status === 'upcoming' && <Countdown targetDate={event.starts_at} />}

          {/* Action buttons */}
          <div className="mt-8 flex flex-wrap gap-3">
            {event.status === 'live' && (
              <button
                onClick={() => navigate('/watch')}
                className="px-6 py-3 bg-brand-red text-white font-semibold rounded-md hover:bg-brand-red-light transition-colors"
              >
                Watch Now
              </button>
            )}
            {event.status === 'ended' && (
              <Link
                to="/recordings"
                className="px-6 py-3 bg-brand-surface border border-brand-dark-border text-white font-semibold rounded-md hover:bg-brand-surface-hover transition-colors"
              >
                Watch Recording
              </Link>
            )}
            {event.status === 'upcoming' && (
              <Link
                to="/"
                className="px-6 py-3 bg-brand-green text-white font-semibold rounded-md hover:bg-brand-green-light transition-colors"
              >
                Add to Calendar
              </Link>
            )}
            <Link
              to="/events"
              className="px-6 py-3 border border-brand-dark-border text-brand-light-dim font-medium rounded-md hover:text-white hover:border-brand-light-dim transition-colors"
            >
              All Events
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
