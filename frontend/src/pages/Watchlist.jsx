import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import './Watchlist.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const TABS = [
  { key: 'watching',      label: 'Watching' },
  { key: 'plan_to_watch', label: 'Plan to Watch' },
  { key: 'completed',     label: 'Completed' },
  { key: 'dropped',       label: 'Dropped' },
];

const STATUS_OPTIONS = [
  { value: 'watching',      label: 'Watching' },
  { value: 'plan_to_watch', label: 'Plan to Watch' },
  { value: 'completed',     label: 'Completed' },
  { value: 'dropped',       label: 'Dropped' },
];

function getDefaultTab(entries) {
  for (const tab of TABS) {
    if (entries.some((e) => e.status === tab.key)) return tab.key;
  }
  return 'watching';
}

export default function Watchlist() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('watching');

  useEffect(() => {
    api.get('/api/watchlist')
      .then((data) => {
        setEntries(data);
        setActiveTab(getDefaultTab(data));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  function handleStatusChange(animeId, newStatus) {
    const previous = entries;
    setEntries((prev) =>
      prev.map((e) => e.anime_id === animeId ? { ...e, status: newStatus } : e)
    );
    api.patch(`/api/watchlist/${animeId}`, { status: newStatus })
      .catch(() => setEntries(previous));
  }

  function handleRemove(animeId) {
    const previous = entries;
    setEntries((prev) => prev.filter((e) => e.anime_id !== animeId));
    api.delete(`/api/watchlist/${animeId}`)
      .catch(() => setEntries(previous));
  }

  const tabEntries = entries.filter((e) => e.status === activeTab);
  const totalCount = entries.length;

  if (loading) return <div className="watchlist__loading">Loading your watchlist…</div>;
  if (error)   return <div className="watchlist__error">{error}</div>;

  return (
    <div className="watchlist">
      <div className="watchlist__header">
        <h1 className="watchlist__title">My Watchlist</h1>
        {totalCount > 0 && (
          <span className="watchlist__total">{totalCount} {totalCount === 1 ? 'title' : 'titles'}</span>
        )}
      </div>

      <div className="watchlist__tabs" role="tablist">
        {TABS.map((tab) => {
          const count = entries.filter((e) => e.status === tab.key).length;
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              className={`watchlist__tab${activeTab === tab.key ? ' watchlist__tab--active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              {count > 0 && <span className="watchlist__tab-count">{count}</span>}
            </button>
          );
        })}
      </div>

      <div className="watchlist__list" role="tabpanel">
        {tabEntries.length === 0 ? (
          <div className="watchlist__empty">
            <p className="watchlist__empty-text">Nothing here yet.</p>
            <Link to="/" className="watchlist__empty-link">Browse anime</Link>
          </div>
        ) : (
          tabEntries.map((entry) => {
            const posterUrl = entry.poster_path
              ? `https://image.tmdb.org/t/p/w500${entry.poster_path}`
              : null;

            return (
              <div key={entry.id} className="watchlist-card">
                <Link to={`/anime/${entry.anime_id}`} className="watchlist-card__poster-wrap">
                  {posterUrl
                    ? <img src={posterUrl} alt={entry.title} className="watchlist-card__poster" loading="lazy" />
                    : <div className="watchlist-card__poster-fallback">✦</div>
                  }
                </Link>

                <div className="watchlist-card__body">
                  <Link to={`/anime/${entry.anime_id}`} className="watchlist-card__title">
                    {entry.title}
                  </Link>
                  <p className="watchlist-card__updated">
                    Updated {new Date(entry.updated_at).toLocaleDateString('en-US', {
                      year: 'numeric', month: 'short', day: 'numeric',
                    })}
                  </p>
                </div>

                <div className="watchlist-card__actions">
                  <select
                    className="watchlist-card__status-select"
                    value={entry.status}
                    onChange={(e) => handleStatusChange(entry.anime_id, e.target.value)}
                    aria-label={`Status for ${entry.title}`}
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>

                  <button
                    className="watchlist-card__remove"
                    onClick={() => handleRemove(entry.anime_id)}
                    aria-label={`Remove ${entry.title} from watchlist`}
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}