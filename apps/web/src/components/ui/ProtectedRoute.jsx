import { Navigate, useLocation } from 'react-router-dom';
import { useAuthContext } from '../../context/AuthContext';

function homeForRole(user) {
  const role = user?.role;
  if (role === 'super_admin' || role === 'admin') return '/admin';
  if (role === 'camera_op') return '/camera';
  return '/';
}

export default function ProtectedRoute({
  children,
  requireAdmin = false,
  requireSuperAdmin = false,
  requireCameraAccess = false,
}) {
  const { loading, isAuthenticated, isAdmin, isSuperAdmin, user } = useAuthContext();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-dark">
        <div className="w-6 h-6 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  const isCameraAccess = isAdmin || isSuperAdmin || user?.role === 'camera_op';

  if (requireSuperAdmin && !isSuperAdmin) {
    return <Navigate to={homeForRole(user)} replace />;
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to={homeForRole(user)} replace />;
  }

  if (requireCameraAccess && !isCameraAccess) {
    return <Navigate to={homeForRole(user)} replace />;
  }

  return children;
}