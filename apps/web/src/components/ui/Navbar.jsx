import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';

export default function Navbar() {
  const { user, isAdmin, isAuthenticated, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    setOpen(false);
    logout();
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-brand-dark/80 backdrop-blur-md border-b border-brand-dark-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
            <div className="w-8 h-8 rounded-full bg-brand-green flex items-center justify-center">
              <span className="text-white text-xs font-bold">MS</span>
            </div>
            <span className="text-brand-light font-bold text-lg hidden sm:block">FAEEZ LIVE</span>
          </Link>

          <div className="hidden md:flex items-center gap-1 sm:gap-2">
            <NavLink to="/">Home</NavLink>
            <NavLink to="/watch">Watch</NavLink>
            <NavLink to="/events">Events</NavLink>
            <NavLink to="/recordings">Recordings</NavLink>

            <div className="w-px h-6 bg-brand-dark-border mx-2" />

            {isAuthenticated ? (
              <div className="flex items-center gap-2">
                <span className="text-brand-light-dim text-sm hidden sm:block">{user.display_name}</span>
                {(isAdmin || user.role === 'camera_op') && (
                  <Link
                    to={isAdmin ? '/admin' : '/camera'}
                    className="px-3 py-1.5 rounded-md bg-brand-green text-white text-sm font-medium hover:bg-brand-green-light transition-colors"
                  >
                    {isAdmin ? 'Admin' : 'Camera'}
                  </Link>
                )}
                <button onClick={handleLogout} className="px-3 py-1.5 rounded-md text-sm text-brand-light-dim hover:text-brand-light hover:bg-brand-surface transition-colors">
                  Logout
                </button>
              </div>
            ) : (
              <Link to="/login" className="px-4 py-1.5 rounded-md bg-brand-green text-white text-sm font-medium hover:bg-brand-green-light transition-colors">
                Sign In
              </Link>
            )}
          </div>

          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            className="md:hidden p-2 -mr-2 rounded-md text-brand-light-dim hover:text-white hover:bg-brand-surface transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              {open ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <div className="md:hidden border-t border-brand-dark-border bg-brand-dark/95 backdrop-blur-md">
          <div className="px-4 py-3 space-y-1">
            <MobileNavLink to="/">Home</MobileNavLink>
            <MobileNavLink to="/watch">Watch</MobileNavLink>
            <MobileNavLink to="/events">Events</MobileNavLink>
            <MobileNavLink to="/recordings">Recordings</MobileNavLink>

            <div className="h-px bg-brand-dark-border my-2" />

            {isAuthenticated ? (
              <div className="space-y-2 pt-1">
                <p className="px-3 text-xs text-brand-light-muted">{user.display_name}</p>
                {(isAdmin || user.role === 'camera_op') && (
                  <Link
                    to={isAdmin ? '/admin' : '/camera'}
                    onClick={() => setOpen(false)}
                    className="block px-3 py-2.5 rounded-md bg-brand-green text-white text-sm font-medium hover:bg-brand-green-light transition-colors"
                  >
                    {isAdmin ? 'Admin' : 'Camera'}
                  </Link>
                )}
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-3 py-2.5 rounded-md text-sm text-brand-light-dim hover:text-white hover:bg-brand-surface transition-colors"
                >
                  Logout
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                onClick={() => setOpen(false)}
                className="block px-3 py-2.5 rounded-md bg-brand-green text-white text-sm font-medium text-center hover:bg-brand-green-light transition-colors"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}

function NavLink({ to, children }) {
  return (
    <Link
      to={to}
      className="px-3 py-1.5 rounded-md text-sm text-brand-light-dim hover:text-brand-light hover:bg-brand-surface transition-colors"
    >
      {children}
    </Link>
  );
}

function MobileNavLink({ to, children }) {
  return (
    <Link
      to={to}
      className="block px-3 py-2.5 rounded-md text-sm text-brand-light-dim hover:text-brand-light hover:bg-brand-surface transition-colors"
    >
      {children}
    </Link>
  );
}
