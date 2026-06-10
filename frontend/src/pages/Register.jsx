import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import './Register.css';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm]       = useState({ username: '', email: '', password: '' });
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(form);
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
            Already have an account? <Link to="/">Go to home</Link>
          </p>
        </div>
      </div>
    </div>
  );
}