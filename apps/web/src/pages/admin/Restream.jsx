import { useCallback, useEffect, useRef, useState } from 'react';
import AdminLayout from '../../components/ui/AdminLayout';
import {
  getRestreamStatus,
  createRestreamTarget,
  updateRestreamTarget,
  deleteRestreamTarget,
} from '../../services/restream.service';

const PLATFORMS = [
  { value: 'youtube', label: 'YouTube' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'custom', label: 'Custom (RTMP)' },
];

const STATUS_STYLES = {
  running: 'bg-brand-green text-white',
  starting: 'bg-brand-green/40 text-white',
  error: 'bg-brand-red text-white',
  stopped: 'bg-brand-surface text-brand-light-dim',
};

export default function Restream() {
  const [targets, setTargets] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const timerRef = useRef(null);

  const [form, setForm] = useState({
    name: '',
    platform: 'youtube',
    ingest_url: '',
    stream_key: '',
    enabled: true,
  });

  const refresh = useCallback(async (silent = true) => {
    try {
      const data = await getRestreamStatus();
      setTargets(data.targets);
      if (!silent) setError('');
    } catch (err) {
      if (!silent) setError(err?.response?.data?.error || 'Failed to load restream targets.');
    }
  }, []);

  useEffect(() => {
    refresh(false);
    timerRef.current = setInterval(() => refresh(true), 5000);
    return () => clearInterval(timerRef.current);
  }, [refresh]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await createRestreamTarget(form);
      setForm({ name: '', platform: 'youtube', ingest_url: '', stream_key: '', enabled: true });
      await refresh(false);
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to save target.');
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (target) => {
    try {
      await updateRestreamTarget(target.id, { enabled: !target.enabled });
      await refresh(false);
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to update target.');
    }
  };

  const remove = async (target) => {
    if (!window.confirm(`Remove "${target.name}"?`)) return;
    try {
      await deleteRestreamTarget(target.id);
      await refresh(false);
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to delete target.');
    }
  };

  const inputClass =
    'w-full px-3 py-2 rounded-md bg-brand-surface border border-brand-dark-border text-white placeholder-brand-light-muted focus:outline-none focus:border-brand-green transition-colors text-sm';

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Restream</h1>
        <p className="text-brand-light-muted text-sm">
          Push the live feed out to social platforms automatically whenever the stream goes live.
        </p>
      </div>

      {error && <p className="text-sm text-brand-red mb-4">{error}</p>}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Add target */}
        <div className="bg-brand-dark-card border border-brand-dark-border rounded-lg p-6 h-fit">
          <h2 className="text-lg font-semibold text-white mb-4">Add platform</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-brand-light-dim mb-1">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                className={inputClass}
                placeholder="YouTube Main Channel"
              />
            </div>
            <div>
              <label className="block text-sm text-brand-light-dim mb-1">Platform</label>
              <select
                value={form.platform}
                onChange={(e) => setForm({ ...form, platform: e.target.value })}
                className={inputClass}
              >
                {PLATFORMS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-brand-light-dim mb-1">RTMP Ingest URL</label>
              <input
                value={form.ingest_url}
                onChange={(e) => setForm({ ...form, ingest_url: e.target.value })}
                required
                pattern="rtmps?://.*"
                className={inputClass}
                placeholder="rtmp://a.rtmp.youtube.com/live2"
              />
            </div>
            <div>
              <label className="block text-sm text-brand-light-dim mb-1">Stream Key</label>
              <input
                value={form.stream_key}
                onChange={(e) => setForm({ ...form, stream_key: e.target.value })}
                required
                className={inputClass}
                placeholder="Your secret stream key"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-brand-light-dim">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                className="accent-brand-green"
              />
              Enabled (push on every Go Live)
            </label>
            <button
              type="submit"
              disabled={saving}
              className="w-full px-4 py-2 bg-brand-green text-white text-sm font-medium rounded-md hover:bg-brand-green-light transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Add Target'}
            </button>
          </form>
        </div>

        {/* Target list */}
        <div className="bg-brand-dark-card border border-brand-dark-border rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Configured targets</h2>

          {targets.length === 0 && (
            <p className="text-sm text-brand-light-muted">No targets yet. Add one on the left.</p>
          )}

          <div className="space-y-3">
            {targets.map((target) => (
              <div key={target.id} className="border border-brand-dark-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-semibold">{target.name}</span>
                    <span className="text-xs uppercase tracking-wide text-brand-light-dim">
                      {target.platform}
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${
                      STATUS_STYLES[target.runtime?.status] || STATUS_STYLES.stopped
                    }`}
                  >
                    {target.runtime?.status || 'stopped'}
                  </span>
                </div>

                <p className="text-sm text-brand-light-dim mb-1 break-all">{target.ingest_url}</p>
                <p className="text-xs text-brand-light-muted mb-3">
                  Key: {target.has_key ? target.key_hint : 'not set'}
                  {target.runtime?.status === 'error' && target.runtime?.lastError
                    ? ` · ${target.runtime.lastError}`
                    : ''}
                </p>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleEnabled(target)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      target.enabled
                        ? 'bg-brand-surface text-brand-light-dim hover:bg-brand-surface-hover'
                        : 'bg-brand-green/20 text-brand-green hover:bg-brand-green/30'
                    }`}
                  >
                    {target.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    onClick={() => remove(target)}
                    className="px-3 py-1.5 rounded-md text-sm text-brand-red hover:bg-brand-red/10 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}