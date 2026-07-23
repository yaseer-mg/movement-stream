export default function StreamControls({
  title,
  setTitle,
  description,
  setDescription,
  events,
  selectedEvent,
  setSelectedEvent,
  isLive,
  onGoLive,
  onEndStream,
  streamTitle,
  duration,
  viewerCount,
  starting,
  ending,
}) {
  return (
    <div className="space-y-5">
      {/* Title */}
      <div>
        <label className="text-brand-light-muted text-xs block mb-1">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Stream title"
          disabled={isLive}
          className="w-full bg-brand-dark border border-brand-dark-border rounded-md px-3 py-2 text-sm text-white placeholder:text-brand-light-muted focus:outline-none focus:border-brand-green focus:ring-1 focus:ring-brand-green/30 disabled:opacity-50"
        />
      </div>

      {/* Description */}
      <div>
        <label className="text-brand-light-muted text-xs block mb-1">Description</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description"
          disabled={isLive}
          className="w-full bg-brand-dark border border-brand-dark-border rounded-md px-3 py-2 text-sm text-white placeholder:text-brand-light-muted focus:outline-none focus:border-brand-green focus:ring-1 focus:ring-brand-green/30 disabled:opacity-50"
        />
      </div>

      {/* Event selector */}
      <div>
        <label className="text-brand-light-muted text-xs block mb-1">Event</label>
        <select
          value={selectedEvent}
          onChange={(e) => setSelectedEvent(e.target.value)}
          disabled={isLive}
          className="w-full bg-brand-dark border border-brand-dark-border rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-green focus:ring-1 focus:ring-brand-green/30 disabled:opacity-50"
        >
          <option value="">No event linked</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>{e.title}</option>
          ))}
        </select>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        {!isLive ? (
          <button
            onClick={onGoLive}
            disabled={!title || starting}
            className="flex-1 px-4 py-3 bg-brand-red text-white text-sm font-semibold rounded-md hover:bg-brand-red-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {starting ? 'Starting...' : 'Go Live'}
          </button>
        ) : (
          <button
            onClick={onEndStream}
            disabled={ending}
            className="flex-1 px-4 py-3 bg-brand-dark-border text-white text-sm font-semibold rounded-md hover:bg-brand-surface transition-colors disabled:opacity-50"
          >
            {ending ? 'Ending...' : 'End Stream'}
          </button>
        )}
      </div>

      {/* Status */}
      <div className="border-t border-brand-dark-border pt-4 space-y-2">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isLive ? 'bg-brand-red' : 'bg-brand-light-muted'}`} />
          <span className="text-sm text-white font-medium">{isLive ? 'LIVE' : 'OFFLINE'}</span>
          {streamTitle && isLive && <span className="text-xs text-brand-light-dim">{streamTitle}</span>}
        </div>
        {isLive && (
          <div className="flex gap-6 text-xs text-brand-light-dim">
            <span>Duration: {duration}</span>
            <span>Viewers: {viewerCount}</span>
          </div>
        )}
      </div>
    </div>
  );
}
