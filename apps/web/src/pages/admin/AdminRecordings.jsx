import { useEffect, useState } from 'react';
import AdminLayout from '../../components/ui/AdminLayout';
import {
  getAllRecordings,
  updateRecording,
  deleteRecording,
} from '../../services/recordings.service';

function formatDuration(secs) {
  if (!secs) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
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

function formatSize(bytes) {
  if (!bytes) return '—';
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(1)} MB`;
}

export default function AdminRecordings() {
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ title: '', description: '' });

  const refresh = () => {
    getAllRecordings()
      .then(setRecordings)
      .catch(() => setRecordings([]))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  const startEdit = (r) => {
    setEditingId(r.id);
    setEditForm({ title: r.title || '', description: r.description || '' });
  };

  const saveEdit = async (id) => {
    try {
      await updateRecording(id, {
        title: editForm.title,
        description: editForm.description,
      });
      setEditingId(null);
      refresh();
    } catch {}
  };

  const togglePublic = async (r) => {
    try {
      await updateRecording(r.id, { is_public: !r.is_public });
      refresh();
    } catch {}
  };

  const handleDelete = async (r) => {
    if (!window.confirm(`Delete "${r.title || 'Untitled Recording'}"? This cannot be undone.`)) return;
    try {
      await deleteRecording(r.id);
      refresh();
    } catch {}
  };

  const inputClass =
    'w-full px-2 py-1 rounded-md bg-brand-surface border border-brand-dark-border text-white text-sm focus:outline-none focus:border-brand-green transition-colors';

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Recordings</h1>
          <p className="text-brand-light-muted text-sm mt-1">
            {recordings.length} recording{recordings.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div className="bg-brand-dark-card border border-brand-dark-border rounded-lg overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
          </div>
        ) : recordings.length === 0 ? (
          <p className="text-brand-light-muted text-sm text-center py-16">
            No recordings yet. They appear here automatically after a stream ends.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-brand-dark-border text-xs uppercase tracking-wide text-brand-light-muted">
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Event</th>
                  <th className="px-4 py-3 font-medium">Recorded</th>
                  <th className="px-4 py-3 font-medium">Duration</th>
                  <th className="px-4 py-3 font-medium">Size</th>
                  <th className="px-4 py-3 font-medium">Public</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-dark-border">
                {recordings.map((r) => (
                  <tr key={r.id} className="hover:bg-brand-surface/50">
                    <td className="px-4 py-3 max-w-xs">
                      {editingId === r.id ? (
                        <div className="flex flex-col gap-2">
                          <input
                            type="text"
                            value={editForm.title}
                            onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                            className={inputClass}
                          />
                          <textarea
                            value={editForm.description}
                            onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                            rows={1}
                            placeholder="Description"
                            className={`${inputClass} resize-y`}
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => saveEdit(r.id)}
                              className="text-xs text-brand-green-400 hover:text-brand-green-300"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="text-xs text-brand-light-muted hover:text-white"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <a
                            href={r.file_url || `/recordings/${r.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-white text-sm truncate hover:text-brand-green-400"
                            title={r.title}
                          >
                            {r.title || 'Untitled Recording'}
                          </a>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-brand-light-dim text-sm">{r.event_title || '—'}</td>
                    <td className="px-4 py-3 text-brand-light-dim text-sm">{formatDate(r.recorded_at)}</td>
                    <td className="px-4 py-3 text-brand-light-dim text-sm">{formatDuration(r.duration_secs)}</td>
                    <td className="px-4 py-3 text-brand-light-dim text-sm">{formatSize(r.file_size_bytes)}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => togglePublic(r)}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${
                          r.is_public
                            ? 'bg-brand-green/10 text-brand-green'
                            : 'bg-brand-surface text-brand-light-muted hover:text-white'
                        }`}
                        title={r.is_public ? 'Click to make private' : 'Click to make public'}
                      >
                        {r.is_public ? 'Public' : 'Private'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-3">
                        <button
                          onClick={() => startEdit(r)}
                          className="text-xs text-brand-green-400 hover:text-brand-green-300"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(r)}
                          className="text-xs text-brand-light-muted hover:text-brand-red"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}