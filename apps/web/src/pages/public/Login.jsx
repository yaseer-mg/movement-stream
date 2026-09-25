import { useEffect, useState } from 'react';
import { useNavigate, Navigate, useLocation } from 'react-router-dom';
import Navbar from '../../components/ui/Navbar';
import Footer from '../../components/ui/Footer';
import { useAuthContext } from '../../context/AuthContext';

export default function Login() {
  const { isAuthenticated, loading, login, register, user } = useAuthContext();
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAuthenticated) return;
    const role = user?.role;
    const dest =
      location.state?.from ||
      (role === 'super_admin' || role === 'admin'
        ? '/admin'
        : role === 'camera_op'
          ? '/camera'
          : '/');
    navigate(dest, { replace: true });
  }, [isAuthenticated, user, navigate, location.state]);

  if (!loading && isAuthenticated) {
    const role = user?.role;
    const dest =
      location.state?.from ||
      (role === 'super_admin' || role === 'admin'
        ? '/admin'
        : role === 'camera_op'
          ? '/camera'
          : '/');
    return <Navigate to={dest} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'register') {
        await register({ email, password, display_name: displayName });
      } else {
        await login({ email, password });
      }
    } catch (err) {
      setError(
        err?.response?.data?.error || 'Something went wrong. Please try again.'
      );
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 pt-16">
        <div className="max-w-md mx-auto px-4 sm:px-6 py-12">
          <div className="bg-brand-dark-card border border-brand-dark-border rounded-lg p-6 sm:p-8">
            <h1 className="text-2xl font-bold text-white mb-1">
              {mode === 'login' ? 'Welcome back' : 'Create an account'}
            </h1>
            <p className="text-brand-light-muted text-sm mb-6">
              {mode === 'login'
                ? 'Sign in to access the Movement Stream platform.'
                : 'Register to participate in live discussions.'}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <div>
                  <label className="block text-sm text-brand-light-dim mb-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-md bg-brand-surface border border-brand-dark-border text-white placeholder-brand-light-muted focus:outline-none focus:border-brand-green transition-colors"
                    placeholder="Your display name"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm text-brand-light-dim mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-md bg-brand-surface border border-brand-dark-border text-white placeholder-brand-light-muted focus:outline-none focus:border-brand-green transition-colors"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label className="block text-sm text-brand-light-dim mb-1">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full px-3 py-2 rounded-md bg-brand-surface border border-brand-dark-border text-white placeholder-brand-light-muted focus:outline-none focus:border-brand-green transition-colors"
                  placeholder="At least 8 characters"
                />
              </div>

              {error && (
                <p className="text-sm text-brand-red">{error}</p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full px-4 py-2 bg-brand-green text-white text-sm font-medium rounded-md hover:bg-brand-green-light transition-colors disabled:opacity-50"
              >
                {submitting
                  ? 'Please wait...'
                  : mode === 'login'
                    ? 'Sign In'
                    : 'Register'}
              </button>
            </form>

            <p className="text-sm text-brand-light-muted mt-6 text-center">
              {mode === 'login' ? (
                <>
                  Don't have an account?{' '}
                  <button
                    onClick={() => setMode('register')}
                    className="text-brand-green-400 hover:text-brand-green-300"
                  >
                    Register
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <button
                    onClick={() => setMode('login')}
                    className="text-brand-green-400 hover:text-brand-green-300"
                  >
                    Sign in
                  </button>
                </>
              )}
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}