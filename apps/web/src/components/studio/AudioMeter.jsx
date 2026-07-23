export default function AudioMeter({ level = 0 }) {
  const bars = 12;

  return (
    <div>
      <p className="text-brand-light-muted text-xs mb-2">Audio Level</p>
      <div className="flex items-end gap-0.5 h-6">
        {Array.from({ length: bars }, (_, i) => {
          const threshold = (i + 1) / bars;
          const isActive = level >= threshold;
          const isRed = threshold > 0.85;
          return (
            <div
              key={i}
              className={`w-2 rounded-sm transition-colors ${
                isActive
                  ? isRed
                    ? 'bg-brand-red'
                    : 'bg-brand-green'
                  : 'bg-brand-dark-border'
              }`}
              style={{ height: `${40 + (i / bars) * 60}%` }}
            />
          );
        })}
      </div>
      <p className="text-2xs text-brand-light-muted mt-1">{Math.round(level * 100)}%</p>
    </div>
  );
}
