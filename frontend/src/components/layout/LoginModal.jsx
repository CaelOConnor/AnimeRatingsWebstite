import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import './LoginModal.css';

export default function LoginModal({ isOpen, onClose }) {
  const { login } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword]     = useState('');
  const [error, setError]           = useState('');
  const [loading, setLoading]       = useState(false);

  const identifierRef = useRef(null);
  const overlayRef    = useRef(null);

  // Auto-focus identifier on open; reset form on close
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => identifierRef.current?.focus(), 60);
    } else {
      setIdentifier('');
      setPassword('');
      setError('');
      setLoading(false);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login({ identifier, password });
      onClose();
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      ref={overlayRef}
      className="login-modal__overlay"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="Log in"
    >
      <div className="login-modal">

        <div className="login-modal__header">
          <span className="login-modal__star">✦</span>
          <h2 className="login-modal__title">Welcome back</h2>
          <p className="login-modal__subtitle">Log in to your ShowRater account</p>
        </div>

        <button onClick={onClose} className="login-modal__close" aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <form onSubmit={handleSubmit} className="login-modal__form" noValidate>
          <div className="login-modal__field">
            <label className="login-modal__label" htmlFor="login-identifier">
              Email or username
            </label>
            <input
              ref={identifierRef}
              id="login-identifier"
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="Email or username"
              required
              autoComplete="username"
              className="login-modal__input"
            />
          </div>

          <div className="login-modal__field">
            <label className="login-modal__label" htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              className="login-modal__input"
            />
          </div>

          {error && (
            <div className="login-modal__error" role="alert">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="login-modal__submit">
            {loading ? 'Logging in…' : 'Log in'}
          </button>
        </form>

        <p className="login-modal__footer">
          Don't have an account?{' '}
          <Link to="/register" className="login-modal__footer-link" onClick={onClose}>
            Sign up
          </Link>
        </p>

      </div>
    </div>
  );
}