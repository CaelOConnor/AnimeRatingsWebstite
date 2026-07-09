import { useAuth } from '../hooks/useAuth';
import { Navigate } from 'react-router-dom';

// Prevents users from accessing a page unless they are logged in.
export default function ProtectedRoute({ children }) {
  // Get the current authentication status.
  const { isLoggedIn, loading } = useAuth();

  // Wait until authentication has finished loading.
  if (loading) return null;
  
  if (!isLoggedIn) return <Navigate to="/" replace />;
  return children;
}