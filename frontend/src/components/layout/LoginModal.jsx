import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';

export default function LoginModal({ isOpen, onClose }) {
  const { login } = useAuth();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const emailRef    = useRef(null);
  const overlayRef  = useRef(null);

  // Auto-focus email field when modal opens; reset form when it closes
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => emailRef.current?.focus(), 60);
    } else {
      setEmail('');
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

  // Click-outside to close
  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login({ email, password });
      onClose();
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div ref={overlayRef} style={s.overlay} onClick={handleOverlayClick} role="dialog" aria-modal="true" aria-label="Log in">
      <div style={s.modal}>

        {/* Header */}
        <div style={s.header}>
          <span style={s.star}>✦</span>
          <h2 style={s.title}>Welcome back</h2>
          <p style={s.subtitle}>Log in to your ShowRater account</p>
          <button onClick={onClose} style={s.closeBtn} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={s.form} noValidate>
          <div style={s.field}>
            <label style={s.label} htmlFor="login-email">Email</label>
            <input
              ref={emailRef}
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
              style={s.input}
              onFocus={(e) => Object.assign(e.target.style, s.inputFocus)}
              onBlur={(e)  => Object.assign(e.target.style, s.inputBlur)}
            />
          </div>

          <div style={s.field}>
            <label style={s.label} htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              style={s.input}
              onFocus={(e) => Object.assign(e.target.style, s.inputFocus)}
              onBlur={(e)  => Object.assign(e.target.style, s.inputBlur)}
            />
          </div>

          {error && (
            <div style={s.errorBox} role="alert">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={loading ? { ...s.submitBtn, ...s.submitBtnDisabled } : s.submitBtn}>
            {loading ? 'Logging in…' : 'Log in'}
          </button>
        </form>

        {/* Footer */}
        <p style={s.footer}>
          Don't have an account?{' '}
          <a href="/register" style={s.footerLink} onClick={onClose}>Sign up</a>
        </p>

      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(30, 25, 60, 0.45)',
    backdropFilter: 'blur(4px)',
    WebkitBackdropFilter: 'blur(4px)',
    padding: '16px',
  },
  modal: {
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: '0 8px 40px rgba(100, 80, 200, 0.18), 0 2px 8px rgba(0,0,0,0.08)',
    width: '100%',
    maxWidth: '400px',
    padding: '32px',
    position: 'relative',
    border: '1px solid var(--color-border)',
  },

  // Header
  header: {
    marginBottom: '24px',
  },
  star: {
    display: 'block',
    fontSize: '20px',
    color: 'var(--color-accent)',
    marginBottom: '10px',
    lineHeight: 1,
  },
  title: {
    margin: '0 0 4px',
    fontSize: '20px',
    fontWeight: 700,
    color: 'var(--color-text)',
    letterSpacing: '-0.02em',
    fontFamily: 'var(--font-sans)',
  },
  subtitle: {
    margin: 0,
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    fontFamily: 'var(--font-sans)',
  },
  closeBtn: {
    position: 'absolute',
    top: '20px',
    right: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '30px',
    height: '30px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--color-border)',
    background: 'transparent',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    padding: 0,
    fontFamily: 'var(--font-sans)',
  },

  // Form
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--color-text)',
    fontFamily: 'var(--font-sans)',
    letterSpacing: '0.02em',
    textTransform: 'uppercase',
  },
  input: {
    height: '40px',
    padding: '0 12px',
    borderRadius: 'var(--radius-md)',
    border: '1.5px solid var(--color-border)',
    background: 'var(--color-bg)',
    color: 'var(--color-text)',
    fontSize: '14px',
    fontFamily: 'var(--font-sans)',
    outline: 'none',
    transition: 'border-color 0.15s',
    width: '100%',
    boxSizing: 'border-box',
  },
  // Applied via onFocus/onBlur
  inputFocus: {
    borderColor: 'var(--color-accent)',
    boxShadow: '0 0 0 3px rgba(124, 111, 205, 0.15)',
  },
  inputBlur: {
    borderColor: 'var(--color-border)',
    boxShadow: 'none',
  },

  // Error
  errorBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    padding: '10px 12px',
    borderRadius: 'var(--radius-md)',
    background: '#FEF2F2',
    border: '1px solid #FECACA',
    color: '#DC2626',
    fontSize: '13px',
    fontFamily: 'var(--font-sans)',
    fontWeight: 500,
  },

  // Submit
  submitBtn: {
    height: '42px',
    borderRadius: 'var(--radius-md)',
    border: 'none',
    background: 'var(--color-accent)',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 600,
    fontFamily: 'var(--font-sans)',
    cursor: 'pointer',
    marginTop: '4px',
    transition: 'background 0.15s, opacity 0.15s',
    letterSpacing: '-0.01em',
  },
  submitBtnDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },

  // Footer
  footer: {
    marginTop: '20px',
    textAlign: 'center',
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    fontFamily: 'var(--font-sans)',
  },
  footerLink: {
    color: 'var(--color-accent)',
    fontWeight: 600,
    textDecoration: 'none',
  },
};