import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import './Register.css';

// Validate the registration fields before sending them to the backend.
// Returns an error message if validation fails, otherwise returns null.
function validate({ email, password }) {
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must contain at least one special character.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return 'Please enter a valid email address.';
  return null;
}

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  // Form data is stored in React state, making the inputs controlled components (React manages their current values).
  const [form, setForm]       = useState({ username: '', email: '', password: '' });
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  // Update the matching form field whenever the user types.
  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  // Handle account creation when the form is submitted.
  async function handleSubmit(e) {
    // Prevent the browser's default page refresh behavior.
    e.preventDefault();

    // Validate input before making the API request.
    const validationError = validate(form);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    setLoading(true);
    try {
      // Create the account through the authentication context.
      await register(form);

      // Redirect the user after successful registration.
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="register-page">
      <div className="register-card">
        <div className="register-card__body">
          <h1 className="register-card__title">Create account</h1>

          {error && <p className="register-error">{error}</p>}

          {/* Form submission is handled by React instead of
              allowing the browser to reload the page. */}
          <form onSubmit={handleSubmit} className="register-form">
            <div className="register-form__field">
              <label className="register-form__label" htmlFor="username">Username</label>
              <input
                className="register-form__input"
                id="username"
                name="username"
                type="text"
                value={form.username}
                onChange={handleChange}
                autoComplete="username"
                required
              />
            </div>

            <div className="register-form__field">
              <label className="register-form__label" htmlFor="email">Email</label>
              <input
                className="register-form__input"
                id="email"
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                autoComplete="email"
                required
              />
            </div>

            <div className="register-form__field">
              <label className="register-form__label" htmlFor="password">Password</label>
              <input
                className="register-form__input"
                id="password"
                name="password"
                type="password"
                value={form.password}
                onChange={handleChange}
                autoComplete="new-password"
                minLength={8}
                required
              />
              <span className="register-form__hint">
                Min 8 chars · one uppercase · one number · one special character
              </span>
            </div>

            <button
              type="submit"
              className="register-form__submit"
              disabled={loading}
            >
              {loading ? 'Creating account…' : 'Register'}
            </button>
          </form>

          <p className="register-footer">
            Already have an account? <Link to="/?login=true">Go to home</Link>
          </p>
        </div>
      </div>
    </div>
  );
}