import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import './Admin.css';

export default function Admin() {
  const [users, setUsers]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);

  const [search, setSearch]                 = useState('');
  const [bannedOnly, setBannedOnly]          = useState(false);
  const [actioningId, setActioningId]        = useState(null);
  const [actionError, setActionError]        = useState(null);

  useEffect(() => {
    loadUsers();
  }, [bannedOnly]);

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const endpoint = bannedOnly ? '/api/admin/users/banned' : '/api/admin/users';
      const data = await api.get(endpoint);
      setUsers(data);
    } catch (err) {
      setError(err.message || 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  }

  async function handleBan(user) {
    setActionError(null);
    setActioningId(user.id);
    try {
      await api.post(`/api/admin/users/${user.id}/ban`);
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_banned: true } : u));
    } catch (err) {
      setActionError(err.message || 'Failed to ban user.');
    } finally {
      setActioningId(null);
    }
  }

  async function handleUnban(user) {
    setActionError(null);
    setActioningId(user.id);
    try {
      await api.post(`/api/admin/users/${user.id}/unban`);
      if (bannedOnly) {
        // user no longer belongs in the banned-only view
        setUsers(prev => prev.filter(u => u.id !== user.id));
      } else {
        setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_banned: false } : u));
      }
    } catch (err) {
      setActionError(err.message || 'Failed to unban user.');
    } finally {
      setActioningId(null);
    }
  }

  async function handleDelete(user) {
    const confirmed = window.confirm(
      `Permanently delete ${user.username}? This will also delete all of their reviews, comments, and watchlist entries. This cannot be undone.`
    );
    if (!confirmed) return;

    setActionError(null);
    setActioningId(user.id);
    try {
      await api.delete(`/api/admin/users/${user.id}`);
      setUsers(prev => prev.filter(u => u.id !== user.id));
    } catch (err) {
      setActionError(err.message || 'Failed to delete user.');
    } finally {
      setActioningId(null);
    }
  }

  const filteredUsers = users.filter(u => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  return (
    <div className="admin">
      <div className="admin__container">
        <h1 className="admin__title">Admin</h1>

        <section className="admin__section">
          <div className="admin__section-header">
            <h2 className="admin__section-title">Users</h2>

            <div className="admin__controls">
              <input
                className="admin__search"
                type="text"
                placeholder="Search by username or email…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />

              <label className="admin__toggle">
                <input
                  type="checkbox"
                  checked={bannedOnly}
                  onChange={e => setBannedOnly(e.target.checked)}
                />
                Banned only
              </label>
            </div>
          </div>

          {actionError && <p className="admin__error">{actionError}</p>}

          {loading ? (
            <p className="admin__state">Loading users…</p>
          ) : error ? (
            <p className="admin__state admin__state--error">{error}</p>
          ) : filteredUsers.length === 0 ? (
            <p className="admin__state">
              {bannedOnly ? 'No banned users.' : 'No users found.'}
            </p>
          ) : (
            <div className="admin__table-wrap">
              <table className="admin__table">
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Joined</th>
                    <th aria-label="Actions"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map(user => (
                    <tr key={user.id}>
                      <td>{user.username}</td>
                      <td>{user.email}</td>
                      <td>
                        <span className={`admin__role admin__role--${user.role_type}`}>
                          {user.role_type}
                        </span>
                      </td>
                      <td>
                        {user.is_banned ? (
                          <span className="admin__status admin__status--banned">Banned</span>
                        ) : (
                          <span className="admin__status admin__status--active">Active</span>
                        )}
                      </td>
                      <td>{new Date(user.created_at).toLocaleDateString()}</td>
                      <td className="admin__actions">
                        {user.is_banned ? (
                          <button
                            className="admin__btn admin__btn--secondary"
                            onClick={() => handleUnban(user)}
                            disabled={actioningId === user.id}
                          >
                            {actioningId === user.id ? '…' : 'Unban'}
                          </button>
                        ) : (
                          <button
                            className="admin__btn admin__btn--warning"
                            onClick={() => handleBan(user)}
                            disabled={actioningId === user.id}
                          >
                            {actioningId === user.id ? '…' : 'Ban'}
                          </button>
                        )}
                        <button
                          className="admin__btn admin__btn--danger"
                          onClick={() => handleDelete(user)}
                          disabled={actioningId === user.id}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}