export default function StatCard({ label, value, icon, bgClass = 'bg-brand-green/10', textClass = 'text-brand-green' }) {
  return (
    <div className="bg-brand-dark-card border border-brand-dark-border rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-brand-light-muted text-xs uppercase tracking-wide">{label}</p>
          <p className="text-white text-2xl font-bold mt-1">{value}</p>
        </div>
        {icon && (
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${bgClass}`}>
            <svg className={`w-5 h-5 ${textClass}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}
