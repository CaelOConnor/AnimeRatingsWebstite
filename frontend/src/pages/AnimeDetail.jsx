import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import './AnimeDetail.css';

const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/w500';
const TMDB_BACKDROP_BASE = 'https://image.tmdb.org/t/p/w1280';

const WATCHLIST_OPTIONS = [
  { value: 'plan_to_watch', label: 'Plan to Watch' },
  { value: 'watching',      label: 'Watching' },
  { value: 'completed',     label: 'Completed' },
  { value: 'dropped',       label: 'Dropped' },
];

function StarRating({ value }) {
  const filled = Math.round(value / 2);
  return (
    <span className="anime-detail__stars" aria-label={`${value} out of 10`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < filled ? 'anime-detail__star--filled' : 'anime-detail__star--empty'}>★</span>
      ))}
    </span>
  );
}

export default function AnimeDetail() {
  const { id } = useParams();
  const { isLoggedIn, user } = useAuth();

  const [anime, setAnime]           = useState(null);
  const [reviews, setReviews]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);

  // action bar state
  const [watchStatus, setWatchStatus]       = useState('');
  const [watchSaving, setWatchSaving]       = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);

  // review form state
  const [reviewRating, setReviewRating] = useState('');
  const [reviewTitle, setReviewTitle]   = useState('');
  const [reviewBody, setReviewBody]     = useState('');
  const [spoilers, setSpoilers]         = useState(false);
  const [reviewError, setReviewError]   = useState(null);
  const [reviewSaving, setReviewSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [animeData, reviewData] = await Promise.all([
          api.get(`/api/anime/${id}`),
          api.get(`/api/reviews?animeId=${id}`),
        ]);
        setAnime(animeData);
        setReviews(reviewData);
      } catch (err) {
        setError('Failed to load anime.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function handleWatchlistChange(e) {
    const status = e.target.value;
    setWatchStatus(status);
    if (!status) return;
    setWatchSaving(true);
    try {
      await api.post('/api/watchlist', { animeId: id, status });
    } catch {
      // silent fail for now
    } finally {
      setWatchSaving(false);
    }
  }

  async function handleReviewSubmit() {
    setReviewError(null);
    if (!reviewRating || reviewRating < 1 || reviewRating > 10) {
      setReviewError('Rating must be between 1 and 10.');
      return;
    }
    setReviewSaving(true);
    try {
      const newReview = await api.post('/api/reviews', {
        animeId: id,
        rating: Number(reviewRating),
        title: reviewTitle || null,
        body: reviewBody || null,
        containsSpoilers: spoilers,
      });
      setReviews(prev => [newReview, ...prev]);
      setShowReviewForm(false);
      setReviewRating('');
      setReviewTitle('');
      setReviewBody('');
      setSpoilers(false);
    } catch (err) {
      setReviewError(err.message || 'Failed to submit review.');
    } finally {
      setReviewSaving(false);
    }
  }

  if (loading) return <div className="anime-detail__loading">Loading…</div>;
  if (error)   return <div className="anime-detail__error">{error}</div>;
  if (!anime)  return null;

  const averageRating = reviews.length
    ? (reviews.reduce((sum, r) => sum + (r.rating ?? 0), 0) / reviews.length).toFixed(1)
    : null;

  const year = anime.first_air_date ? new Date(anime.first_air_date).getFullYear() : null;

  return (
    <div className="anime-detail">

      {/* ── Backdrop ── */}
      {anime.backdrop_path && (
        <div
          className="anime-detail__backdrop"
          style={{ backgroundImage: `url(${TMDB_BACKDROP_BASE}${anime.backdrop_path})` }}
        >
          <div className="anime-detail__backdrop-overlay" />
        </div>
      )}

      {/* ── Hero ── */}
      <div className="anime-detail__hero">
        <div className="anime-detail__poster-wrap">
          {anime.poster_path
            ? <img
                className="anime-detail__poster"
                src={`${TMDB_IMG_BASE}${anime.poster_path}`}
                alt={anime.title}
              />
            : <div className="anime-detail__poster-placeholder">No Image</div>
          }
        </div>

        <div className="anime-detail__meta">
          <h1 className="anime-detail__title">{anime.title}</h1>

          {anime.original_title && anime.original_title !== anime.title && (
            <p className="anime-detail__original-title">{anime.original_title}</p>
          )}

          <div className="anime-detail__tags">
            {anime.genres?.map(g => (
              <span key={g} className="anime-detail__genre-tag">{g}</span>
            ))}
          </div>

          <div className="anime-detail__facts">
            {anime.status && (
              <span className="anime-detail__fact">
                <span className="anime-detail__fact-label">Status</span>
                {anime.status}
              </span>
            )}
            {year && (
              <span className="anime-detail__fact">
                <span className="anime-detail__fact-label">Year</span>
                {year}
              </span>
            )}
            {anime.episode_count && (
              <span className="anime-detail__fact">
                <span className="anime-detail__fact-label">Episodes</span>
                {anime.episode_count}
              </span>
            )}
            {anime.season_count && (
              <span className="anime-detail__fact">
                <span className="anime-detail__fact-label">Seasons</span>
                {anime.season_count}
              </span>
            )}
          </div>

          {averageRating && (
            <div className="anime-detail__rating-summary">
              <StarRating value={parseFloat(averageRating)} />
              <span className="anime-detail__rating-number">{averageRating}</span>
              <span className="anime-detail__rating-count">({reviews.length} review{reviews.length !== 1 ? 's' : ''})</span>
            </div>
          )}

          {anime.overview && (
            <p className="anime-detail__overview">{anime.overview}</p>
          )}
        </div>
      </div>

      {/* ── Action bar ── */}
      {isLoggedIn && (
        <div className="anime-detail__actions">
          <button
            className="anime-detail__action-btn anime-detail__action-btn--primary"
            onClick={() => setShowReviewForm(v => !v)}
          >
            {showReviewForm ? 'Cancel' : '✏️ Write a Review'}
          </button>

          <select
            className="anime-detail__watchlist-select"
            value={watchStatus}
            onChange={handleWatchlistChange}
            disabled={watchSaving}
          >
            <option value="">＋ Add to Watchlist</option>
            {WATCHLIST_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* ── Review form ── */}
      {isLoggedIn && showReviewForm && (
        <div className="anime-detail__review-form">
          <h3 className="anime-detail__review-form-title">Your Review</h3>

          <div className="anime-detail__form-row">
            <label className="anime-detail__form-label">
              Rating (1–10)
              <input
                className="anime-detail__form-input anime-detail__form-input--rating"
                type="number"
                min="1"
                max="10"
                step="0.5"
                value={reviewRating}
                onChange={e => setReviewRating(e.target.value)}
                placeholder="8.5"
              />
            </label>

            <label className="anime-detail__form-label anime-detail__form-label--grow">
              Review Title (optional)
              <input
                className="anime-detail__form-input"
                type="text"
                value={reviewTitle}
                onChange={e => setReviewTitle(e.target.value)}
                placeholder="A masterpiece of storytelling…"
                maxLength={200}
              />
            </label>
          </div>

          <label className="anime-detail__form-label">
            Review
            <textarea
              className="anime-detail__form-textarea"
              value={reviewBody}
              onChange={e => setReviewBody(e.target.value)}
              placeholder="Share your thoughts…"
              rows={5}
            />
          </label>

          <label className="anime-detail__form-checkbox">
            <input
              type="checkbox"
              checked={spoilers}
              onChange={e => setSpoilers(e.target.checked)}
            />
            Contains spoilers
          </label>

          {reviewError && <p className="anime-detail__form-error">{reviewError}</p>}

          <button
            className="anime-detail__action-btn anime-detail__action-btn--primary"
            onClick={handleReviewSubmit}
            disabled={reviewSaving}
          >
            {reviewSaving ? 'Submitting…' : 'Submit Review'}
          </button>
        </div>
      )}

      {/* ── Reviews list ── */}
      <div className="anime-detail__reviews">
        <h2 className="anime-detail__reviews-heading">
          Reviews
          {reviews.length > 0 && <span className="anime-detail__reviews-count">{reviews.length}</span>}
        </h2>

        {reviews.length === 0 ? (
          <div className="anime-detail__reviews-empty">
            <p>No reviews yet. Be the first to write one!</p>
          </div>
        ) : (
          <div className="anime-detail__reviews-list">
            {reviews.map(review => (
              <div key={review.id} className="anime-detail__review-card">
                <div className="anime-detail__review-header">
                  <Link
                    to={`/users/${review.user_id}`}
                    className="anime-detail__review-username"
                  >
                    {review.username}
                  </Link>
                  {review.rating != null && (
                    <span className="anime-detail__review-rating">{review.rating}<span className="anime-detail__review-rating-denom">/10</span></span>
                  )}
                  {review.contains_spoilers && (
                    <span className="anime-detail__spoiler-badge">Spoilers</span>
                  )}
                </div>

                {review.title && (
                  <p className="anime-detail__review-title">{review.title}</p>
                )}

                {review.body && (
                  <p className="anime-detail__review-body">{review.body}</p>
                )}

                <div className="anime-detail__review-footer">
                  <span className="anime-detail__review-date">
                    {new Date(review.created_at).toLocaleDateString()}
                  </span>
                  <div className="anime-detail__review-actions">
                    <Link
                      to={`/reviews/${review.id}`}
                      className="anime-detail__review-btn"
                    >
                      💬 Comments
                    </Link>
                    <button className="anime-detail__review-btn anime-detail__review-btn--report">
                      🚩 Report
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}