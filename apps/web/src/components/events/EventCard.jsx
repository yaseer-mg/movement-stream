import { Link } from 'react-router-dom';

const statusStyles = {
  upcoming: 'bg-brand-gold/20 text-brand-gold border-brand-gold/30',
  live: 'bg-brand-red/20 text-brand-red border-brand-red/30',
  ended: 'bg-brand-dark-border text-brand-light-muted border-brand-dark-border',
  cancelled: 'bg-brand-dark-border text-brand-light-muted border-brand-dark-border',
};

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function EventCard({ event }) {
  const statusBadge = event.status === 'live' ? 'LIVE' : event.status.toUpperCase();

  return (
    <Link
      to={event.status === 'live' ? '/watch' : `/events/${event.id}`}
      className="block bg-brand-dark-card border border-brand-dark-border rounded-lg overflow-hidden hover:border-brand-green/40 transition-colors group"
    >
      {event.thumbnail_url ? (
        <div className="aspect-video bg-cover bg-center" style={{ backgroundImage: `url(${event.thumbnail_url})` }} />
      ) : (
        <div className="aspect-video bg-gradient-to-br from-brand-green-dark to-brand-dark flex items-center justify-center">
          <span className="text-brand-light-dim text-lg font-bold">Movement Stream</span>
        </div>
      )}

      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${statusStyles[event.status] || statusStyles.upcoming}`}>
            {statusBadge}
          </span>
          {event.is_featured && (
            <span className="text-xs text-brand-gold">Featured</span>
          )}
        </div>

        <h3 className="text-white text-sm font-semibold group-hover:text-brand-green-400 transition-colors">
          {event.title}
        </h3>

        {event.description && (
          <p className="text-brand-light-muted text-xs mt-1 line-clamp-2">{event.description}</p>
        )}

        <div className="flex items-center gap-3 mt-3 text-xs text-brand-light-dim">
          <span>{formatDate(event.starts_at)}</span>
          <span>{formatTime(event.starts_at)}</span>
        </div>

        {event.location && (
          <p className="text-brand-light-dim text-xs mt-1">{event.location}</p>
        )}
      </div>
    </Link>
  );
}
