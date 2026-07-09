import { useAuth } from '../hooks/useAuth';
import { Navigate } from 'react-router-dom';

// Only allows users with one of the specified roles to access a page.
// If the user isn't authorized, they are redirected to the home page.
export default function RoleRoute({ children, roles }) {
  // Get the current user's authentication information.
  const { user, loading } = useAuth();
  // Wait until authentication has finished loading before rendering anything.
  if (loading) return null;
  
  if (!user || !roles.includes(user.role_type)) return <Navigate to="/" replace />;
  return children;
}