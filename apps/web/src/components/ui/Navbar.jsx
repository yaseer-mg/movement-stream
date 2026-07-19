import { Link } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';

export default function Navbar() {
  const { user, isAdmin, isAuthenticated, logout } = useAuth();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-brand-dark/80 backdrop-blur-md border-b border-brand-dark-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-brand-green flex items-center justify-center">
              <span className="text-white text-xs font-bold">MS</span>
            </div>
            <span className="text-brand-light font-bold text-lg hidden sm:block">Movement Stream</span>
          </Link>

          <div className="flex items-center gap-1 sm:gap-2">
            <NavLink to="/">Home</NavLink>
            <NavLink to="/watch">Watch</NavLink>
            <NavLink to="/events">Events</NavLink>
            <NavLink to="/recordings">Recordings</NavLink>

            <div className="w-px h-6 bg-brand-dark-border mx-2" />

            {isAuthenticated ? (
              <div className="flex items-center gap-2">
                <span className="text-brand-light-dim text-sm hidden sm:block">{user.display_name}</span>
                {isAdmin && (
                  <Link to="/admin" className="px-3 py-1.5 rounded-md bg-brand-green text-white text-sm font-medium hover:bg-brand-green-light transition-colors">
                    Admin
                  </Link>
                )}
                <button onClick={logout} className="px-3 py-1.5 rounded-md text-sm text-brand-light-dim hover:text-brand-light hover:bg-brand-surface transition-colors">
                  Logout
                </button>
              </div>
            ) : (
              <Link to="/login" className="px-4 py-1.5 rounded-md bg-brand-green text-white text-sm font-medium hover:bg-brand-green-light transition-colors">
                Sign In
              </Link>
            )}
          </div>
        </div>
      </div>
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
