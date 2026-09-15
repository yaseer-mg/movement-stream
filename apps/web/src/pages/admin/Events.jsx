import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import AdminLayout from '../../components/ui/AdminLayout';
import {
  getAllEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
} from '../../services/events.service';

const STATUSES = ['upcoming', 'live', 'ended', 'cancelled'];

const EMPTY_FORM = {
  title: '',
  description: '',
  location: '',
  thumbnail_url: '',
  starts_at: '',
  ends_at: '',
  is_featured: false,
  status: 'upcoming',
};

function toLocalInput(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function StatusBadge({ status }) {
  const styles = {
    upcoming: 'bg-brand-surface text-brand-light-dim',
    live: 'bg-brand-red/10 text-brand-red',
    ended: 'bg-brand-surface text-brand-light-muted',
    cancelled: 'bg-brand-surface text-brand-light-muted line-through',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[status] || styles.upcoming}`}>
      {status}
    </span>
  );
}

function EventForm({ initial, onSubmit, onCancel }) {
  const [form, setForm] = useState(
    initial
      ? {
          ...EMPTY_FORM,
          ...initial,
          starts_at: toLocalInput(initial.starts_at),
          ends_at: toLocalInput(initial.ends_at),
        }
      : EMPTY_FORM
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await onSubmit({
        title: form.title,
        description: form.description || null,
        location: form.location || null,
        thumbnail_url: form.thumbnail_url || null,
        starts_at: toDate(form.starts_at),
        ends_at: toDate(form.ends_at),
        is_featured: form.is_featured,
        ...(initial ? { status: form.status } : {}),
      });
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not save event.');
      setSaving(false);
    }
  };

  const inputClass =
    'w-full px-3 py-2 rounded-md bg-brand-surface border border-brand-dark-border text-white placeholder-brand-light-muted focus:outline-none focus:border-brand-green transition-colors';
  const labelClass = 'block text-sm text-brand-light-dim mb-1';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={labelClass}>Title</label>
        <input type="text" value={form.title} onChange={set('title')} required placeholder="Event title" className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>Description</label>
        <textarea
          value={form.description}
          onChange={set('description')}
          rows={3}
          placeholder="What is this event about?"
          className={`${inputClass} resize-y`}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Location</label>
          <input type="text" value={form.location} onChange={set('location')} placeholder="Abuja" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Thumbnail URL</label>
          <input type="url" value={form.thumbnail_url} onChange={set('thumbnail_url')} placeholder="https://..." className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Starts At</label>
          <input type="datetime-local" value={form.starts_at} onChange={set('starts_at')} required className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Ends At</label>
          <input type="datetime-local" value={form.ends_at} onChange={set('ends_at')} className={inputClass} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <label className="flex items-center gap-2 text-sm text-brand-light-dim cursor-pointer">
          <input type="checkbox" checked={form.is_featured} onChange={set('is_featured')} className="accent-brand-green" />
          Feature on homepage
        </label>

        {initial && (
          <label className="flex items-center gap-2 text-sm text-brand-light-dim">
            Status
            <select value={form.status} onChange={set('status')} className="px-2 py-1 rounded-md bg-brand-surface border border-brand-dark-border text-white focus:outline-none focus:border-brand-green">
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {error && <p className="text-sm text-brand-red">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-brand-green text-white text-sm font-medium rounded-md hover:bg-brand-green-light transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : initial ? 'Save Changes' : 'Create Event'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-brand-dark-border text-brand-light-dim text-sm rounded-md hover:text-white hover:border-brand-light-dim transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function AdminEvents() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const isNew = location.pathname === '/admin/events/new';
  const isEditorPage = !!id || isNew;
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [initial, setInitial] = useState(null);
  const [loadError, setLoadError] = useState('');

  const refresh = useCallback(() => {
    setLoading(true);
    getAllEvents()
      .then(setEvents)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (id) {
      setInitial(null);
      getEvent(id)
        .then(setInitial)
        .catch(() => setLoadError('Could not load this event.'));
    } else if (isNew) {
      setInitial(null);
    } else {
      refresh();
    }
  }, [id, isNew, refresh]);

  const handleDelete = async (event) => {
    if (!window.confirm(`Delete "${event.title}"? This cannot be undone.`)) return;
    try {
      await deleteEvent(event.id);
      refresh();
    } catch {}
  };

  if (loadError) {
    return (
      <AdminLayout>
        <p className="text-brand-red">{loadError}</p>
        <button
          onClick={() => navigate('/admin/events')}
          className="mt-4 px-4 py-2 border border-brand-dark-border text-brand-light-dim text-sm rounded-md hover:text-white hover:border-brand-light-dim transition-colors"
        >
          Back to events
        </button>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {isEditorPage ? (id ? 'Edit Event' : 'New Event') : 'Events'}
          </h1>
          {!isEditorPage && (
            <p className="text-brand-light-muted text-sm mt-1">
              {events.length} event{events.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        {!isEditorPage && (
          <button
            onClick={() => navigate('/admin/events/new')}
            className="px-4 py-2 bg-brand-green text-white text-sm font-medium rounded-md hover:bg-brand-green-light transition-colors"
          >
            New Event
          </button>
        )}
      </div>

      {isEditorPage ? (
        <div className="bg-brand-dark-card border border-brand-dark-border rounded-lg p-6 max-w-2xl">
          {id && !initial ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-6 h-6 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <EventForm
              initial={initial}
              onSubmit={async (payload) => {
                if (id) {
                  await updateEvent(id, payload);
                } else {
                  await createEvent(payload);
                }
                navigate('/admin/events');
              }}
              onCancel={() => navigate('/admin/events')}
            />
          )}
        </div>
      ) : (
        <div className="bg-brand-dark-card border border-brand-dark-border rounded-lg overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
            </div>
          ) : events.length === 0 ? (
            <p className="text-brand-light-muted text-sm text-center py-16">
              No events yet. Click "New Event" to create one.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-brand-dark-border text-xs uppercase tracking-wide text-brand-light-muted">
                    <th className="px-4 py-3 font-medium">Title</th>
                    <th className="px-4 py-3 font-medium">Starts</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Featured</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-dark-border">
                  {events.map((event) => (
                    <tr key={event.id} className="hover:bg-brand-surface/50">
                      <td className="px-4 py-3 text-white text-sm max-w-xs truncate">{event.title}</td>
                      <td className="px-4 py-3 text-brand-light-dim text-sm">{formatDate(event.starts_at)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={event.status} />
                      </td>
                      <td className="px-4 py-3 text-brand-light-dim text-sm">{event.is_featured ? '★' : '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => navigate(`/admin/events/${event.id}`)}
                            className="text-xs text-brand-green-400 hover:text-brand-green-300"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(event)}
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
      )}
    </AdminLayout>
  );
}