const STATUS_STYLES = {
  ACTIVE:      { border: 'border-brand-green',  badge: 'bg-brand-green text-white',          label: 'ON AIR' },
  STANDBY:     { border: 'border-brand-gold',   badge: 'bg-brand-gold text-brand-dark',      label: 'READY' },
  DISCONNECTED:{ border: 'border-brand-dark-border', badge: 'bg-brand-dark-border text-brand-light-dim', label: 'OFF' },
};

export default function CameraSlot({ slot, label, isActive, isConnected, operatorName, onSwitch }) {
  const status = isActive ? 'ACTIVE' : isConnected ? 'STANDBY' : 'DISCONNECTED';
  const style = STATUS_STYLES[status];

  return (
    <div className={`rounded-lg border-2 ${style.border} bg-brand-dark-card overflow-hidden transition-colors`}>
      {/* Feed preview area */}
      <div className="aspect-video bg-brand-dark-lighter flex items-center justify-center relative">
        <svg className="w-10 h-10 text-brand-light-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
        </svg>

        {/* Status badge */}
        <span className={`absolute top-2 right-2 text-xxs font-bold px-2 py-0.5 rounded ${style.badge}`}>
          {style.label}
        </span>
      </div>

      {/* Info bar */}
      <div className="px-3 py-2.5 flex items-center justify-between">
        <div>
          <p className="text-white text-sm font-semibold">{label}</p>
          <p className="text-brand-light-muted text-xs">{slot.toUpperCase()}</p>
        </div>

        {isActive ? (
          <span className="text-brand-green text-xs font-bold tracking-wide">ACTIVE</span>
        ) : (
          <button
            onClick={() => onSwitch(slot)}
            disabled={!isConnected}
            className={`text-xs font-semibold px-3 py-1.5 rounded transition-colors ${
              isConnected
                ? 'bg-brand-green text-white hover:bg-brand-green-light'
                : 'bg-brand-dark-border text-brand-light-muted cursor-not-allowed'
            }`}
          >
            SWITCH
          </button>
        )}
      </div>
    </div>
  );
}
