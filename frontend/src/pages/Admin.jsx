import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { api } from '../lib/api';
import './Admin.css';

const FEEDBACK_TYPE_LABELS = {
  show_request: 'Show Request',
  bug_report:   'Bug Report',
};

const API_BASE   = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const TMDB_THUMB = 'https://image.tmdb.org/t/p/w92';

export default function Admin() {
  // Ban/unban/delete are admin-only on the backend — moderators can view
  // this page (per the route's roles) but shouldn't see action buttons
  // that would just 403 when clicked.
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.role_type === 'admin';

  // Store the user list and the page's current state.
  const [users, setUsers]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);

  // Store the feedback list (show requests + bug reports) and its own page state.
  const [feedback, setFeedback]               = useState([]);
  const [feedbackLoading, setFeedbackLoading] = useState(true);
  const [feedbackError, setFeedbackError]     = useState(null);

  // State used while marking a feedback row as completed (resolved).
  const [resolvingId, setResolvingId]     = useState(null);
  const [resolveError, setResolveError]   = useState(null); // { id, message }

  // State used by the "Add a Show" quick-add control.
  const [addQuery, setAddQuery]             = useState('');
  const [addSearching, setAddSearching]     = useState(false);
  const [addSearchError, setAddSearchError] = useState(null);
  const [addCandidates, setAddCandidates]   = useState(null); // null = no search run yet
  const [addSeasonInputs, setAddSeasonInputs] = useState({}); // { [candidateId]: seasonString }
  const [addingId, setAddingId]             = useState(null);
  const [addResult, setAddResult]           = useState(null); // { id, success, message }

  // State used for searching, filtering, and performing administrative actions on individual users.
  const [search, setSearch]                 = useState('');
  const [bannedOnly, setBannedOnly]          = useState(false);
  const [actioningId, setActioningId]        = useState(null);
  const [actionError, setActionError]        = useState(null);

  // Reload the user list whenever the banned-only filter changes.
  useEffect(() => {
    loadUsers();
  }, [bannedOnly]);

  // Load the feedback list once, on mount.
  useEffect(() => {
    api.get('/api/admin/feedback')
      .then(data => setFeedback(data))
      .catch(err => setFeedbackError(err.message || 'Failed to load feedback.'))
      .finally(() => setFeedbackLoading(false));
  }, []);

  // Mark a feedback row as completed. Removes it from local state on success
  // instead of a full refetch — the row stays put with an inline error if
  // the request fails.
  async function handleResolveFeedback(item) {
    setResolveError(null);
    setResolvingId(item.id);
    try {
      await api.patch(`/api/admin/feedback/${item.id}`);
      setFeedback(prev => prev.filter(f => f.id !== item.id));
    } catch (err) {
      setResolveError({ id: item.id, message: err.message || 'Failed to mark as completed.' });
    } finally {
      setResolvingId(null);
    }
  }

  // Search TMDB for "add a show" candidates. A plain number is treated as a
  // direct TMDB id lookup by the backend, so this same call covers both
  // "search by name" and "confirm by id" — the id case just comes back as a
  // single-candidate array.
  async function handleAddShowSearch(e) {
    e.preventDefault();
    const q = addQuery.trim();
    if (!q) return;

    setAddSearching(true);
    setAddSearchError(null);
    setAddCandidates(null);
    setAddResult(null);
    try {
      const results = await api.get(`/api/admin/anime/search?query=${encodeURIComponent(q)}`);
      setAddCandidates(results);
    } catch (err) {
      setAddSearchError(err.message || 'Search failed.');
    } finally {
      setAddSearching(false);
    }
  }

  // Add the selected candidate to the catalog. Uses a raw fetch (not the
  // shared `api` helper) because the 200-vs-201 status distinguishes
  // "already cached" from "newly added", and `api`'s wrapper only returns
  // the parsed body — not the status code.
  async function handleAddShowConfirm(candidate) {
    setAddingId(candidate.id);
    setAddResult(null);

    const params = new URLSearchParams();
    if (candidate.mediaType === 'movie') {
      params.set('type', 'movie');
    } else {
      const season = (addSeasonInputs[candidate.id] ?? '').trim();
      if (season !== '') params.set('season', season);
    }
    const qs = params.toString();

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/anime/fetch/${candidate.id}${qs ? `?${qs}` : ''}`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add show.');

      const message = res.status === 201 ? `Added: ${data.title}` : `Already in catalog: ${data.title}`;
      setAddResult({ id: candidate.id, success: true, message });
    } catch (err) {
      setAddResult({ id: candidate.id, success: false, message: err.message || 'Failed to add show.' });
    } finally {
      setAddingId(null);
    }
  }

  // Retrieve the appropriate list of users from the backend.
  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      // Use a different endpoint depending on whether only banned users should be displayed.
      const endpoint = bannedOnly ? '/api/admin/users/banned' : '/api/admin/users';
      const data = await api.get(endpoint);
      setUsers(data);
    } catch (err) {
      setError(err.message || 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  }

  // Ban the selected user and immediately update the page.
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

  // Remove a user's ban. If only banned users are being shown, remove them from the current list.
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

  // Permanently delete a user after confirmation.
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

  // Filter users based on the current search text.
  const filteredUsers = users.filter(u => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  return (
    <div className="admin">
      {/* Controls used to search users and toggle the banned-only view. */}
      <div className="admin__container">
        <h1 className="admin__title">Admin</h1>

        {/* Quick-add a show by TMDB id or title — admin-only, same as the
            backend's GET /api/admin/anime/search gating. */}
        {isAdmin && (
          <section className="admin__section">
            <div className="admin__section-header">
              <h2 className="admin__section-title">Add a Show</h2>
            </div>

            <form className="admin__add-show-form" onSubmit={handleAddShowSearch}>
              <input
                className="admin__search"
                type="text"
                placeholder="Show name or TMDB id…"
                value={addQuery}
                onChange={e => setAddQuery(e.target.value)}
              />
              <button
                type="submit"
                className="admin__btn admin__btn--secondary"
                disabled={addSearching || !addQuery.trim()}
              >
                {addSearching ? 'Searching…' : 'Search'}
              </button>
            </form>

            {addSearchError && <p className="admin__error">{addSearchError}</p>}

            {addCandidates && (
              addCandidates.length === 0 ? (
                <p className="admin__state">No matches found on TMDB.</p>
              ) : (
                <div className="admin__add-show-results">
                  {addCandidates.map(candidate => (
                    <div key={candidate.id} className="admin__add-show-card">
                      {candidate.posterPath ? (
                        <img
                          className="admin__add-show-poster"
                          src={`${TMDB_THUMB}${candidate.posterPath}`}
                          alt={candidate.title}
                        />
                      ) : (
                        <div className="admin__add-show-poster admin__add-show-poster--empty" />
                      )}

                      <div className="admin__add-show-info">
                        <span className="admin__add-show-title">{candidate.title}</span>
                        <span className="admin__add-show-meta">
                          {candidate.year ?? 'Unknown year'} · {candidate.mediaType === 'movie' ? 'Movie' : 'TV'}
                        </span>

                        {/* Movies don't have seasons — only offer this for TV candidates. */}
                        {candidate.mediaType === 'tv' && (
                          <input
                            className="admin__add-show-season"
                            type="text"
                            inputMode="numeric"
                            placeholder="Season (optional)"
                            value={addSeasonInputs[candidate.id] ?? ''}
                            onChange={e => setAddSeasonInputs(prev => ({ ...prev, [candidate.id]: e.target.value }))}
                          />
                        )}

                        {addResult?.id === candidate.id && (
                          <p className={
                            addResult.success
                              ? 'admin__add-show-result'
                              : 'admin__add-show-result admin__add-show-result--error'
                          }>
                            {addResult.message}
                          </p>
                        )}
                      </div>

                      <button
                        className="admin__btn admin__btn--success"
                        onClick={() => handleAddShowConfirm(candidate)}
                        disabled={addingId === candidate.id}
                      >
                        {addingId === candidate.id ? '…' : 'Add'}
                      </button>
                    </div>
                  ))}
                </div>
              )
            )}
          </section>
        )}

        <section className="admin__section admin__section--spaced">
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

          {/* Display the appropriate page state before showing the user table. */}
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
              {/* Display all users matching the current filters. */}
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
                  {/* Display information and administrative actions for a single user. */}
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
                      {/* Ban, unban, or delete the selected user — admin-only actions. */}
                      <td className="admin__actions">
                        {!isAdmin ? (
                          <span className="admin__no-actions">—</span>
                        ) : user.is_banned ? (
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
                        {isAdmin && (
                          <button
                            className="admin__btn admin__btn--danger"
                            onClick={() => handleDelete(user)}
                            disabled={actioningId === user.id}
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="admin__section admin__section--spaced">
          <div className="admin__section-header">
            <h2 className="admin__section-title">Feedback</h2>
          </div>

          {/* Display the appropriate page state before showing the feedback table. */}
          {feedbackLoading ? (
            <p className="admin__state">Loading feedback…</p>
          ) : feedbackError ? (
            <p className="admin__state admin__state--error">{feedbackError}</p>
          ) : feedback.length === 0 ? (
            <p className="admin__state">No feedback submitted yet.</p>
          ) : (
            <div className="admin__table-wrap">
              {/* Show requests and bug reports, newest first (as returned by the API). */}
              <table className="admin__table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Content</th>
                    <th>Submitted By</th>
                    <th>Date</th>
                    <th aria-label="Actions"></th>
                  </tr>
                </thead>
                <tbody>
                  {feedback.map(item => (
                    <tr key={item.id}>
                      <td>
                        <span className={`admin__feedback-type admin__feedback-type--${item.type}`}>
                          {FEEDBACK_TYPE_LABELS[item.type] ?? item.type}
                        </span>
                      </td>
                      <td className="admin__feedback-content">{item.content}</td>
                      <td>{item.username}</td>
                      <td>{new Date(item.created_at).toLocaleDateString()}</td>
                      {/* Mark this feedback row as completed — removes it from the list. */}
                      <td className="admin__feedback-actions">
                        <button
                          className="admin__btn admin__btn--success"
                          onClick={() => handleResolveFeedback(item)}
                          disabled={resolvingId === item.id}
                        >
                          {resolvingId === item.id ? '…' : 'Completed?'}
                        </button>
                        {resolveError?.id === item.id && (
                          <p className="admin__feedback-resolve-error">{resolveError.message}</p>
                        )}
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