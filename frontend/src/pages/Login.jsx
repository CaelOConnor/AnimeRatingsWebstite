import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function Login() {
  const { login }    = useAuth();
  const navigate     = useNavigate();
  const location     = useLocation();

  // If the user was redirected here from a protected route, go back there after login
  const from = location.state?.from?.pathname || '/';

  // Store the login form data and page state.
  const [form, setForm]       = useState({ email: '', password: '' });

  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  // Update the appropriate form field whenever the user types.
  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  // Attempt to log the user into their account.
  async function handleSubmit(e) {
    // Prevent the browser from reloading the page.
    e.preventDefault();
    setError('');
    setLoading(true);
    // Authenticate the user through the authentication context.
    try {
      await login(form);

      // Redirect the user after a successful login.
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <h1>Sign in</h1>

      {error && <p className="auth-error">{error}</p>}

      {/* Handle login using React instead of allowing the browser to submit the form normally. */}
      <form onSubmit={handleSubmit} className="auth-form">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          value={form.email}
          onChange={handleChange}
          autoComplete="email"
          required
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          value={form.password}
          onChange={handleChange}
          autoComplete="current-password"
          required
        />

        <button type="submit" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p>
        Don't have an account? <Link to="/register">Create one</Link>
      </p>
    </div>
  );
}