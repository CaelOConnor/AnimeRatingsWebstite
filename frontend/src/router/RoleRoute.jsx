import { useAuth } from '../hooks/useAuth';
import { Navigate } from 'react-router-dom';

export default function RoleRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user || !roles.includes(user.role_type)) return <Navigate to="/" replace />;
  return children;
}