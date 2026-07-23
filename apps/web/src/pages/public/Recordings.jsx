import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../../components/ui/Navbar";
import Footer from "../../components/ui/Footer";
import { getAllRecordings } from "../../services/recordings.service";

function formatDuration(secs) {
  if (!secs) return "0:00";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function Recordings() {
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAllRecordings()
      .then(setRecordings)
      .catch(() => setRecordings([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 pt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-8">Recordings</h1>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
            </div>
          ) : recordings.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-brand-light-muted text-lg">No recordings yet</p>
              <p className="text-brand-light-muted text-sm mt-1">
                Recordings appear here after a live stream ends
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {recordings.map((rec) => (
                <Link
                  key={rec.id}
                  to={`/recordings/${rec.id}`}
                  className="block bg-brand-dark-card border border-brand-dark-border rounded-lg overflow-hidden hover:border-brand-green/40 transition-colors group"
                >
                  {rec.thumbnail_url ? (
                    <div
                      className="aspect-video bg-cover bg-center"
                      style={{ backgroundImage: `url(${rec.thumbnail_url})` }}
                    />
                  ) : (
                    <div className="aspect-video bg-gradient-to-br from-brand-green-dark to-brand-dark flex items-center justify-center">
                      <svg className="w-10 h-10 text-brand-light-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <polygon points="5,3 19,12 5,21" fill="currentColor" />
                      </svg>
                    </div>
                  )}

                  <div className="p-4">
                    <h3 className="text-white text-sm font-semibold group-hover:text-brand-green-400 transition-colors">
                      {rec.title || "Untitled Recording"}
                    </h3>

                    {rec.event_title && (
                      <p className="text-brand-light-dim text-xs mt-1">{rec.event_title}</p>
                    )}

                    <div className="flex items-center gap-3 mt-3 text-xs text-brand-light-dim">
                      {rec.duration_secs > 0 && (
                        <span className="flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12,6 12,12 16,14" />
                          </svg>
                          {formatDuration(rec.duration_secs)}
                        </span>
                      )}
                      {rec.recorded_at && (
                        <span>{formatDate(rec.recorded_at)}</span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
