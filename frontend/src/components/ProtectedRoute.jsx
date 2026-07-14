import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

/**
 * ProtectedRoute
 * --------------
 * Wrap any route that requires a logged-in user.
 * Saves the attempted URL so we can redirect back after login.
 *
 * Basic usage (any logged-in user):
 *   <Route path="/watchlist" element={<ProtectedRoute><Watchlist /></ProtectedRoute>} />
 *
 * Role-restricted (moderator only):
 *   <Route path="/admin" element={<ProtectedRoute role="moderator"><AdminPanel /></ProtectedRoute>} />
 */
export function ProtectedRoute({ children, role }) {
  const { isLoggedIn, user, loading } = useAuth();
  const location = useLocation();

  // Don't redirect while we're still checking the stored token
  if (loading) return null;

  // If the user is not logged in, send them to the login page and remember the page they wanted.
  if (!isLoggedIn) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If this route requires a specific role, only allow users with that role (or administrators) to continue.
  if (role && user?.role_type !== role && user?.role_type !== 'admin') {
    return <Navigate to="/" replace />;
  }

  // User passed all checks, so render the protected page.
  return children;
}