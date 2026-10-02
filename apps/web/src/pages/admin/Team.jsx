import { useCallback, useEffect, useState } from 'react';
import AdminLayout from '../../components/ui/AdminLayout';
import { getStaff, createStaff } from '../../services/auth.service';
import useAuth from '../../hooks/useAuth';

const STAFF_ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'camera_op', label: 'Camera Operator' },
  { value: 'super_admin', label: 'Super Admin' },
];

const ROLE_STYLES = {
  super_admin: 'bg-brand-green text-white',
  admin: 'bg-brand-green/20 text-brand-green',
  camera_op: 'bg-brand-surface text-brand-light-dim',
  viewer: 'bg-brand-surface text-brand-light-dim',
};

const EMPTY_FORM = { email: '', password: '', display_name: '', role: 'admin' };

export default function Team() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const isSuperAdmin = user?.role === 'super_admin';

  const refresh = useCallback(async () => {
    try {
      setUsers(await getStaff());
      setError('');
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to load the team.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const created = await createStaff(form);
      setForm(EMPTY_FORM);
      setSuccess(`${created.display_name} (${created.role.replace('_', ' ')}) created.`);
      await refresh();
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to create the account.');
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'w-full px-3 py-2 rounded-md bg-brand-surface border border-brand-dark-border text-white placeholder-brand-light-muted focus:outline-none focus:border-brand-green transition-colors text-sm';

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Team</h1>
        <p className="text-brand-light-muted text-sm">
          Accounts that can sign in to the control room. Viewers do not need an account here.
        </p>
      </div>

      {error && <p className="text-sm text-brand-red mb-4">{error}</p>}
      {success && <p className="text-sm text-brand-green mb-4">{success}</p>}

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-brand-dark-card border border-brand-dark-border rounded-lg p-6 h-fit">
          <h2 className="text-lg font-semibold text-white mb-4">Create staff account</h2>

          {!isSuperAdmin ? (
            <p className="text-sm text-brand-light-muted">
              Only a super admin can create staff accounts.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-brand-light-dim mb-1">Display name</label>
                <input
                  value={form.display_name}
                  onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                  required
                  className={inputClass}
                  placeholder="Ada Okafor"
                />
              </div>
              <div>
                <label className="block text-sm text-brand-light-dim mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  className={inputClass}
                  placeholder="ada@movement.ng"
                />
              </div>
              <div>
                <label className="block text-sm text-brand-light-dim mb-1">Temporary password</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                  minLength={8}
                  className={inputClass}
                  placeholder="At least 8 characters"
                />
              </div>
              <div>
                <label className="block text-sm text-brand-light-dim mb-1">Role</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className={inputClass}
                >
                  {STAFF_ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-md bg-brand-green text-white text-sm font-semibold hover:bg-brand-green-light transition-colors disabled:opacity-50"
              >
                {saving ? 'Creating…' : 'Create account'}
              </button>
            </form>
          )}
        </div>

        <div className="bg-brand-dark-card border border-brand-dark-border rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Accounts</h2>

          {loading ? (
            <p className="text-sm text-brand-light-muted">Loading…</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-brand-light-muted">No accounts yet.</p>
          ) : (
            <ul className="space-y-3">
              {users.map((u) => (
                <li
                  key={u.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-brand-dark-border px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{u.display_name}</p>
                    <p className="text-xs text-brand-light-muted truncate">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!u.is_active && (
                      <span className="px-2 py-0.5 rounded-full text-xxs font-semibold bg-brand-red/20 text-brand-red">
                        Inactive
                      </span>
                    )}
                    <span
                      className={`px-2 py-0.5 rounded-full text-xxs font-semibold ${
                        ROLE_STYLES[u.role] || ROLE_STYLES.viewer
                      }`}
                    >
                      {u.role.replace('_', ' ')}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
