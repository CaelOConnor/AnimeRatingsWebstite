import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';

/**
 * useAuth
 * -------
 * Clean hook to access auth state and actions from any component.
 *
 * Usage:
 *   const { user, login, logout, isLoggedIn, isModerator } = useAuth();
 *
 * Throws if used outside of <AuthProvider> so you catch wiring mistakes early.
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>');
  }
  return ctx;
}