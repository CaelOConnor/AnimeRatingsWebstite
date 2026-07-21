import { createContext, useState, useEffect, useCallback } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Create a context that allows authentication information to be shared across the entire application.
export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Store the currently logged-in user, authentication token, and whether the initial login check is still running.
  const [user, setUser]       = useState(null);

  // Initialize the token from localStorage so the user stays logged in after refreshing the page.
  const [token, setToken]     = useState(() => localStorage.getItem('token'));
  const [loading, setLoading] = useState(true); // true while /me check runs on mount

  // ── Restore session on page load ────────────────────────────────────────────
  // When the application first loads, verify that any saved authentication token is still valid.
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    fetch(`${API}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Session invalid');
        return res.json();
      })
      .then(({ user }) => setUser(user))
      .catch(() => {
        // Token is expired or revoked — clear it silently
        localStorage.removeItem('token');
        setToken(null);
      })
      .finally(() => setLoading(false));
  }, []); // runs once on mount

  // ── Save token to localStorage whenever it changes ──────────────────────────
  // Keep localStorage synchronized with the current token.
  // This allows the user's session to persist across page reloads.
  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  }, [token]);

  // ── register ─────────────────────────────────────────────────────────────────
  // Register a new account and automatically log the user in.
  const register = useCallback(async ({ username, email, password }) => {
    const res = await fetch(`${API}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  // ── login ────────────────────────────────────────────────────────────────────
  // Authenticate an existing user and save their session.
  const login = useCallback(async ({ identifier, password }) => {
    const res = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  // ── updateUser ───────────────────────────────────────────────────────────────
  // Merge partial fields (e.g. a new username) into the current user, so
  // components reading user from context (like the Navbar) re-render with
  // fresh data immediately, without waiting for a login/reload/`/me` refetch.
  const updateUser = useCallback((fields) => {
    setUser((prev) => (prev ? { ...prev, ...fields } : prev));
  }, []);

  // ── logout ───────────────────────────────────────────────────────────────────
  // Log the user out and remove their authentication data.
  const logout = useCallback(async () => {
    if (token) {
      try {
        await fetch(`${API}/api/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // Even if the server call fails, clear local state
      }
    }
    setToken(null);
    setUser(null);
  }, [token]);

  // Values made available to every component that uses AuthContext.
  const value = {
    user,          // null | { id, username, email, role_type, avatar_url, bio, ... }
    token,         // raw JWT string — pass as Bearer token in fetch calls
    loading,       // true until initial /me check completes — use to avoid flash
    isLoggedIn: !!user,
    isModerator: user?.role_type === 'moderator' || user?.role_type === 'admin',
    register,
    login,
    logout,
    updateUser,
  };

  // Provide authentication information to every component wrapped inside AuthProvider.
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}