import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import Navbar from "../../components/ui/Navbar";
import Footer from "../../components/ui/Footer";
import RecordingPlayer from "../../components/player/RecordingPlayer";
import { getRecording } from "../../services/recordings.service";

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDuration(secs) {
  if (!secs) return "0:00";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}h ${pad(m)}m ${pad(s)}s` : `${m}m ${pad(s)}s`;
}

function formatFileSize(bytes) {
  if (!bytes) return "Unknown";
  const mb = bytes / (1024 * 1024);
  return mb > 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
}

export default function RecordingDetail() {
  const { id } = useParams();
  const [recording, setRecording] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    getRecording(id)
      .then(setRecording)
      .catch(() => setError("Recording not found"))
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

  if (error || !recording) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 pt-16 flex items-center justify-center">
          <div className="text-center">
            <p className="text-white text-lg">{error || "Recording not found"}</p>
            <Link to="/recordings" className="text-brand-green-400 text-sm mt-2 inline-block hover:text-brand-green-300">
              Back to recordings
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
          {recording.file_url && (
            <RecordingPlayer src={recording.file_url} poster={recording.thumbnail_url} />
          )}

          <div className="mt-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-4">
              {recording.title || "Untitled Recording"}
            </h1>

            <div className="flex flex-wrap gap-6 text-sm text-brand-light-dim mb-6">
              {recording.recorded_at && (
                <div>
                  <p className="text-brand-light-muted text-xs">Recorded on</p>
                  <p className="text-white">{formatDate(recording.recorded_at)}</p>
                </div>
              )}
              {recording.duration_secs > 0 && (
                <div>
                  <p className="text-brand-light-muted text-xs">Duration</p>
                  <p className="text-white">{formatDuration(recording.duration_secs)}</p>
                </div>
              )}
              {recording.file_size_bytes > 0 && (
                <div>
                  <p className="text-brand-light-muted text-xs">Size</p>
                  <p className="text-white">{formatFileSize(recording.file_size_bytes)}</p>
                </div>
              )}
            </div>

            {recording.description && (
              <p className="text-brand-light-dim leading-relaxed mb-6">
                {recording.description}
              </p>
            )}

            {recording.event_title && (
              <div className="p-4 bg-brand-dark-card border border-brand-dark-border rounded-lg">
                <p className="text-brand-light-muted text-xs mb-1">Part of event</p>
                <p className="text-white text-sm font-medium">{recording.event_title}</p>
              </div>
            )}
          </div>

          <div className="mt-8">
            <Link
              to="/recordings"
              className="px-4 py-2 border border-brand-dark-border text-brand-light-dim text-sm font-medium rounded-md hover:text-white hover:border-brand-light-dim transition-colors"
            >
              All recordings
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
