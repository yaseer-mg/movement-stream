const QUALITIES = [
  { label: "Auto", value: "auto" },
  { label: "1080p", value: "1080p" },
  { label: "720p", value: "720p" },
  { label: "480p", value: "480p" },
  { label: "240p", value: "240p" },
];

export default function QualitySelector({ currentQuality, onQualityChange }) {
  return (
    <div className="flex items-center gap-1">
      {QUALITIES.map((q) => (
        <button
          key={q.value}
          onClick={() => onQualityChange(q.value)}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            currentQuality === q.value
              ? "bg-brand-green text-white"
              : "bg-brand-surface text-brand-light-dim hover:bg-brand-surface-hover"
          }`}
        >
          {q.label}
        </button>
      ))}
    </div>
  );
}
