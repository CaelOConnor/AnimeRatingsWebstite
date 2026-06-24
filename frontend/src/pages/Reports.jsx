import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../lib/api';
import './Reports.css';

export default function Reports() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [reports, setReports]   = useState([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError]       = useState(null);
  const [acting, setActing]     = useState(null); // userId currently being acted on

  useEffect(() => {
    if (loading) return;
    if (!user || user.role_type !== 'admin') {
      navigate('/', { replace: true });
      return;
    }

    api.get('/api/admin/reports')
      .then(data => setReports(data))
      .catch(err => setError(err.message))
      .finally(() => setFetching(false));
  }, [loading, user]);

  async function handleBan(reportedUserId) {
    setActing(reportedUserId);
    try {
      await api.post(`/api/admin/users/${reportedUserId}/ban`);
      setReports(prev =>
        prev.map(r =>
          r.reported_user_id === reportedUserId ? { ...r, is_banned: true } : r
        )
      );
    } catch (err) {
      alert(err.message);
    } finally {
      setActing(null);
    }
  }

  async function handleDismiss(reportedUserId) {
    setActing(reportedUserId);
    try {
      await api.post(`/api/admin/reports/dismiss/${reportedUserId}`);
      setReports(prev => prev.filter(r => r.reported_user_id !== reportedUserId));
    } catch (err) {
      alert(err.message);
    } finally {
      setActing(null);
    }
  }

  if (loading || fetching) {
    return (
      <div className="reports">
        <p className="reports__empty">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="reports">
        <p className="reports__error">{error}</p>
      </div>
    );
  }

  return (
    <div className="reports">
      <div className="reports__header">
        <h1 className="reports__title">Reports</h1>
        <span className="reports__count">{reports.length} pending</span>
      </div>

      {reports.length === 0 ? (
        <p className="reports__empty">No pending reports.</p>
      ) : (
        <table className="reports__table">
          <thead>
            <tr>
              <th>Reported User</th>
              <th>Reports</th>
              <th>Latest Report</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {reports.map(row => (
              <tr key={row.reported_user_id} className="reports__row">
                <td>
                  <Link
                    to={`/users/${row.reported_user_id}`}
                    className="reports__user-link"
                  >
                    {row.reported_username}
                  </Link>
                  {row.is_banned && (
                    <span className="reports__badge reports__badge--banned">Banned</span>
                  )}
                </td>
                <td className="reports__count-cell">{row.report_count}</td>
                <td className="reports__link-cell">
                  {row.latest_target_type === 'review' && (
                    <Link to={`/reviews/${row.latest_target_id}`} className="reports__content-link">
                      View Review
                    </Link>
                  )}
                  {row.latest_target_type === 'comment' && (
                    <Link to={`/reviews/${row.latest_target_id}`} className="reports__content-link">
                      View Comment
                    </Link>
                  )}
                  {row.latest_target_type === 'user' && (
                    <Link to={`/users/${row.latest_target_id}`} className="reports__content-link">
                      View Profile
                    </Link>
                  )}
                  {!row.latest_target_type && (
                    <span className="reports__no-reason">—</span>
                  )}
                </td>
                <td className="reports__actions">
                  <button
                    className="reports__btn reports__btn--ban"
                    disabled={row.is_banned || acting === row.reported_user_id}
                    onClick={() => handleBan(row.reported_user_id)}
                  >
                    {row.is_banned ? 'Banned' : 'Ban'}
                  </button>
                  <button
                    className="reports__btn reports__btn--dismiss"
                    disabled={acting === row.reported_user_id}
                    onClick={() => handleDismiss(row.reported_user_id)}
                  >
                    Dismiss
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}