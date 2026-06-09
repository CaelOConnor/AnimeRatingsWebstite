import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import './UserProfile.css';

const TMDB_POSTER = 'https://image.tmdb.org/t/p/w500';

const STATUS_ORDER = ['watching', 'completed', 'plan_to_watch', 'dropped'];
const STATUS_LABELS = {
  watching:     'Watching',
  completed:    'Completed',
  plan_to_watch: 'Plan to Watch',
  dropped:      'Dropped',
};

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatJoinDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
  });
}

function InitialsAvatar({ username }) {
  return (
    <div className="user-profile__avatar" aria-hidden="true">
      {username?.[0]?.toUpperCase() ?? '?'}
    </div>
  );
}

function ReviewCard({ review }) {
  return (
    <Link to={`/reviews/${review.id}`} className="user-profile__review-card">
      <div className="user-profile__review-top">
        <span className="user-profile__review-anime">{review.title}</span>
        <span className="user-profile__review-rating">
          <span className="user-profile__review-star">★</span>
          {review.rating}
          <span className="user-profile__review-max">/10</span>
        </span>
      </div>
      {review.body && (
        <p className="user-profile__review-body">{review.body}</p>
      )}
      <span className="user-profile__review-date">{formatDate(review.created_at)}</span>
    </Link>
  );
}

function WatchlistGroup({ status, entries }) {
  if (!entries.length) return null;
  return (
    <div className="user-profile__wl-group">
      <h3 className="user-profile__wl-group-heading">
        {STATUS_LABELS[status]}
        <span className="user-profile__wl-count">{entries.length}</span>
      </h3>
      <div className="user-profile__wl-grid">
        {entries.map((entry) => (
          <Link
            key={entry.id}
            to={`/anime/${entry.anime_id}`}
            className="user-profile__wl-card"
          >
            {entry.poster_path ? (
              <img
                className="user-profile__wl-poster"
                src={`${TMDB_POSTER}${entry.poster_path}`}
                alt={entry.title}
              />
            ) : (
              <div className="user-profile__wl-poster user-profile__wl-poster--empty" />
            )}
            <span className="user-profile__wl-title">{entry.title}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function UserProfile() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [user, setUser]         = useState(null);
  const [reviews, setReviews]   = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [tab, setTab]           = useState('reviews');

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [userData, reviewsData, watchlistData] = await Promise.all([
          api.get(`/api/users/${id}`),
          api.get(`/api/users/${id}/reviews`),
          api.get(`/api/users/${id}/watchlist`),
        ]);
        setUser(userData);
        setReviews(reviewsData);
        setWatchlist(watchlistData);
      } catch (err) {
        setError(err.message || 'Failed to load profile.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const groupedWatchlist = STATUS_ORDER.reduce((acc, status) => {
    acc[status] = watchlist.filter((e) => e.status === status);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="user-profile__state">
        <span className="user-profile__spinner" />
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="user-profile__state user-profile__state--error">
        <p>{error ?? 'User not found.'}</p>
        <Link to="/" className="user-profile__btn">Go Home</Link>
      </div>
    );
  }

  return (
    <div className="user-profile">
      <div className="user-profile__container">

        {/* Back */}
        <button
          className="user-profile__back"
          onClick={() => navigate(-1)}
        >
          ← Back
        </button>

        {/* Header */}
        <div className="user-profile__header">
          <InitialsAvatar username={user.username} />
          <div className="user-profile__header-info">
            <h1 className="user-profile__username">{user.username}</h1>
            <p className="user-profile__joined">Member since {formatJoinDate(user.created_at)}</p>
          </div>
          <div className="user-profile__stats">
            <div className="user-profile__stat">
              <span className="user-profile__stat-value">{reviews.length}</span>
              <span className="user-profile__stat-label">Reviews</span>
            </div>
            <div className="user-profile__stat">
              <span className="user-profile__stat-value">{watchlist.length}</span>
              <span className="user-profile__stat-label">Watchlist</span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="user-profile__tabs" role="tablist">
          <button
            className={`user-profile__tab${tab === 'reviews' ? ' user-profile__tab--active' : ''}`}
            onClick={() => setTab('reviews')}
            role="tab"
            aria-selected={tab === 'reviews'}
          >
            Reviews
          </button>
          <button
            className={`user-profile__tab${tab === 'watchlist' ? ' user-profile__tab--active' : ''}`}
            onClick={() => setTab('watchlist')}
            role="tab"
            aria-selected={tab === 'watchlist'}
          >
            Watchlist
          </button>
        </div>

        {/* Tab panels */}
        {tab === 'reviews' && (
          <div className="user-profile__panel">
            {reviews.length === 0 ? (
              <p className="user-profile__empty">No reviews yet.</p>
            ) : (
              <div className="user-profile__reviews-list">
                {reviews.map((review) => (
                  <ReviewCard key={review.id} review={review} />
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'watchlist' && (
          <div className="user-profile__panel">
            {watchlist.length === 0 ? (
              <p className="user-profile__empty">Watchlist is empty.</p>
            ) : (
              STATUS_ORDER.map((status) => (
                <WatchlistGroup
                  key={status}
                  status={status}
                  entries={groupedWatchlist[status]}
                />
              ))
            )}
          </div>
        )}

      </div>
    </div>
  );
}