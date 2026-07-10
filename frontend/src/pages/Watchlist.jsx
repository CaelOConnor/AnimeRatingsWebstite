import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import './Watchlist.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'; // might be able to remove this line

// watchlist tabs
const TABS = [
  { key: 'watching',      label: 'Watching' },
  { key: 'plan_to_watch', label: 'Plan to Watch' },
  { key: 'completed',     label: 'Completed' },
  { key: 'dropped',       label: 'Dropped' },
];

// drop down options for watchlist
const STATUS_OPTIONS = [
  { value: 'watching',      label: 'Watching' },
  { value: 'plan_to_watch', label: 'Plan to Watch' },
  { value: 'completed',     label: 'Completed' },
  { value: 'dropped',       label: 'Dropped' },
];

// Select the first tab that actually contains entries.
// If the watchlist is empty, default to the watching tab.
function getDefaultTab(entries) {
  for (const tab of TABS) {
    if (entries.some((e) => e.status === tab.key)) return tab.key;
  }
  return 'watching';
}

export default function Watchlist() {
  // Store the watchlist data and page state.
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('watching');

  // Load the user's watchlist when the page is opened.
  useEffect(() => {
    api.get('/api/watchlist')
      .then((data) => {
        setEntries(data);
        setActiveTab(getDefaultTab(data));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Update an anime's status both locally and in the database.
  // If the API request fails, restore the previous data.
  function handleStatusChange(animeId, newStatus) {
    const previous = entries;
    setEntries((prev) =>
      prev.map((e) => e.anime_id === animeId ? { ...e, status: newStatus } : e)
    );
    api.patch(`/api/watchlist/${animeId}`, { status: newStatus })
      .catch(() => setEntries(previous));
  }

  // Remove an anime from the watchlist.
  // If the API request fails, add it back.
  function handleRemove(animeId) {
    const previous = entries;
    setEntries((prev) => prev.filter((e) => e.anime_id !== animeId));
    api.delete(`/api/watchlist/${animeId}`)
      .catch(() => setEntries(previous));
  }

  // Display only the entries that belong to the selected tab.
  const tabEntries = entries.filter((e) => e.status === activeTab);
  const totalCount = entries.length;

  // Display loading or error messages while waiting for data.
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

      {/* Display a tab for each watchlist category and show
          how many anime belong to that category. */}
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
      
      {/* Show either an empty-state message or the list of anime
          that belong to the currently selected tab. */}
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
                {/* Clicking the poster or title navigates
                    to the anime's details page. */}
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
                
                {/* Allow the user to change the watchlist status
                    or remove the anime completely. */}
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