import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import './AnimeDetail.css';

const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/w500';
const TMDB_BACKDROP_BASE = 'https://image.tmdb.org/t/p/w1280';

// Available watchlist statuses shown in the dropdown menu.
const WATCHLIST_OPTIONS = [
  { value: 'plan_to_watch', label: 'Plan to Watch' },
  { value: 'watching',      label: 'Watching' },
  { value: 'completed',     label: 'Completed' },
  { value: 'dropped',       label: 'Dropped' },
];

// Display a 10-point rating as a 5-star visual.
function StarRating({ value }) {
  // Convert the 10-point rating into a 5-star scale.
  const starsOutOf5 = value / 2;
  const fullStars = Math.floor(starsOutOf5);
  const hasHalfStar = starsOutOf5 - fullStars >= 0.25 && starsOutOf5 - fullStars < 0.75;
  const roundsUpToFull = starsOutOf5 - fullStars >= 0.75;
  const totalFull = roundsUpToFull ? fullStars + 1 : fullStars;

  return (
    <span className="anime-detail__stars" aria-label={`${value} out of 10`}>
      {Array.from({ length: 5 }, (_, i) => {
        if (i < totalFull) {
          return <span key={i} className="anime-detail__star--filled">★</span>;
        }
        if (i === totalFull && hasHalfStar) {
          return <span key={i} className="anime-detail__star--half">★</span>;
        }
        return <span key={i} className="anime-detail__star--empty">★</span>;
      })}
    </span>
  );
}

export default function AnimeDetail() {
  // Get the anime ID from the URL and the current user's authentication information.
  const { id } = useParams();
  const { isLoggedIn, user } = useAuth();

  // Store the anime, its reviews, and the page state.
  const [anime, setAnime]           = useState(null);
  const [reviews, setReviews]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);

  // State used for the watchlist, rating, and review action buttons.
  const [watchStatus, setWatchStatus]       = useState('');
  const [watchSaving, setWatchSaving]       = useState(false);
  const [watchError, setWatchError]         = useState(null);
  const [showReviewForm, setShowReviewForm]   = useState(false);
  const [showRatingForm, setShowRatingForm]   = useState(false);
  const [userReview, setUserReview]           = useState(null);
  const [reportedReviews, setReportedReviews] = useState(new Set());

  // State used by the quick rating form.
  const [quickRating, setQuickRating]             = useState('');
  const [quickRatingError, setQuickRatingError]   = useState(null);
  const [quickRatingSaving, setQuickRatingSaving] = useState(false);

  // State used while creating or editing a written review.
  const [reviewRating, setReviewRating] = useState('');
  const [reviewTitle, setReviewTitle]   = useState('');
  const [reviewBody, setReviewBody]     = useState('');
  const [reviewError, setReviewError]   = useState(null);
  const [reviewSaving, setReviewSaving] = useState(false);

  // Load the anime details, reviews, and the current user's watchlist information whenever a new anime is opened.
  useEffect(() => {
    async function load() {
      try {
        // Request all required data at the same time to reduce the page's loading time.
        const [animeData, reviewData, watchlistData] = await Promise.all([
          api.get(`/api/anime/${id}`),
          api.get(`/api/reviews?animeId=${id}`),
          user ? api.get('/api/watchlist') : Promise.resolve(null),
        ]);
        setAnime(animeData);
        setReviews(reviewData);
        if (user) {
          const existing = reviewData.find(r => r.user_id === user.id) ?? null;
          setUserReview(existing);
          if (existing?.rating != null) setQuickRating(String(existing.rating));

          const watchEntry = watchlistData?.find(w => w.anime_id === id) ?? null;
          setWatchStatus(watchEntry?.status ?? '');
        }
      } catch (err) {
        setError('Failed to load anime.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, user]);

  // Add the anime to the user's watchlist or update its existing watchlist status.
  async function handleWatchlistChange(e) {
    const status = e.target.value;
    setWatchError(null);
    setWatchSaving(true);
    try {
      if (watchStatus) {
        // already on the watchlist — update existing entry
        await api.patch(`/api/watchlist/${id}`, { status });
      } else {
        // not on the watchlist yet — create new entry
        await api.post('/api/watchlist', { animeId: id, status });
      }
      setWatchStatus(status);
    } catch (err) {
      setWatchError(err.message || 'Failed to update watchlist.');
    } finally {
      setWatchSaving(false);
    }
  }

  // Save a rating without requiring the user to write a full review.
  async function handleQuickRatingSubmit() {
    setQuickRatingError(null);
    const r = Number(quickRating);
    if (!quickRating || isNaN(r) || r < 1 || r > 10) {
      setQuickRatingError('Rating must be between 1 and 10.');
      return;
    }
    setQuickRatingSaving(true);
    try {
      if (userReview) {
        const updated = await api.patch(`/api/reviews/${userReview.id}`, { rating: r });
        const merged = { ...updated, username: user.username };
        setUserReview(merged);
        setReviews(prev => prev.map(rv => rv.id === merged.id ? { ...rv, rating: merged.rating } : rv));
      } else {
        const newReview = await api.post('/api/reviews', { animeId: id, rating: r });
        const merged = { ...newReview, username: user.username };
        setUserReview(merged);
        setReviews(prev => [merged, ...prev]);
      }
      setShowRatingForm(false);
    } catch (err) {
      setQuickRatingError(err.message || 'Failed to save rating.');
    } finally {
      setQuickRatingSaving(false);
    }
  }

  // Create a new review or update the user's existing review.
  async function handleReviewSubmit() {
    setReviewError(null);
    if (!reviewRating || reviewRating < 1 || reviewRating > 10) {
      setReviewError('Rating must be between 1 and 10.');
      return;
    }
    setReviewSaving(true);
    try {
      let savedReview;
      if (userReview) {
        savedReview = await api.patch(`/api/reviews/${userReview.id}`, {
          rating: Number(reviewRating),
          title: reviewTitle || null,
          body: reviewBody || null,
        });
        savedReview = { ...savedReview, username: user.username };
        setReviews(prev => prev.map(rv => rv.id === savedReview.id ? savedReview : rv));
      } else {
        savedReview = await api.post('/api/reviews', {
          animeId: id,
          rating: Number(reviewRating),
          title: reviewTitle || null,
          body: reviewBody || null,
        });
        savedReview = { ...savedReview, username: user.username };
        setReviews(prev => [savedReview, ...prev]);
      }
      setUserReview(savedReview);
      setShowReviewForm(false);
      setReviewRating('');
      setReviewTitle('');
      setReviewBody('');
    } catch (err) {
      setReviewError(err.message || 'Failed to submit review.');
    } finally {
      setReviewSaving(false);
    }
  }

  // Report another user's review for moderation.
  async function handleReport(review) {
    try {
      await api.post('/api/reports', {
        targetType: 'review',
        targetId: review.id,
        reportedUserId: review.user_id,
      });
      setReportedReviews(prev => new Set([...prev, review.id]));
    } catch (err) {
      console.error('Failed to submit report:', err.message);
    }
  }

  // Show loading or error messages before rendering the anime details.
  if (loading) return <div className="anime-detail__loading">Loading…</div>;
  if (error)   return <div className="anime-detail__error">{error}</div>;
  if (!anime)  return null;

  // Only display reviews that contain written text.
  const writtenReviews = reviews.filter(r => r.body && r.body.trim() !== '');

  // Calculate the average review score.
  const averageRating = reviews.length
    ? (reviews.reduce((sum, r) => sum + (r.rating ?? 0), 0) / reviews.length).toFixed(2)
    : null;

  // Extract the release year from the air date.
  const year = anime.first_air_date ? new Date(anime.first_air_date).getFullYear() : null;

  return (
    <div className="anime-detail">

      {/* Display a background image behind the page header. TMDB doesn't
          provide a per-season backdrop — only a per-season poster — so this
          follows the currently-viewed season's poster (which does vary from
          season to season) rather than the show-level backdrop (which is
          identical across every season of the same show). Falls back to the
          show-level backdrop only if this particular row has no poster at all. */}
      {(anime.poster_path || anime.backdrop_path) && (
        <div
          className="anime-detail__backdrop"
          style={{
            backgroundImage: `url(${anime.poster_path
              ? `${TMDB_IMG_BASE}${anime.poster_path}`
              : `${TMDB_BACKDROP_BASE}${anime.backdrop_path}`})`,
          }}
        >
          <div className="anime-detail__backdrop-overlay" />
        </div>
      )}

      {/* Main anime information including the poster, genres, synopsis, and average rating. */}
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
            {/* Season count is only meaningful on the whole-series row —
                on a season-specific row (e.g. "Season 2") it's confusing. */}
            {anime.season_count && anime.season_number == null && (
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

      {/* Logged-in users can rate, review, and add the anime to their watchlist. */}
      {isLoggedIn && (
        <div className="anime-detail__actions">
          <button
            className="anime-detail__action-btn anime-detail__action-btn--primary"
            onClick={() => { setShowReviewForm(v => !v); setShowRatingForm(false); }}
          >
            {showReviewForm ? 'Cancel' : 'Write a Review'}
          </button>

          <button
            className="anime-detail__action-btn anime-detail__action-btn--secondary"
            onClick={() => { setShowRatingForm(v => !v); setShowReviewForm(false); }}
          >
            {showRatingForm ? 'Cancel' : (userReview?.rating != null ? `Rated ${userReview.rating}` : 'Rate')}
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
          {watchError && <p className="anime-detail__form-error">{watchError}</p>}
        </div>
        )}
        {/* Simple form for quickly assigning a rating without writing a review. */}
        {isLoggedIn && showRatingForm && (
        <div className="anime-detail__rating-panel">
          <label className="anime-detail__rating-panel-label">
            Your Rating (1–10)
            <input
              className="anime-detail__form-input anime-detail__form-input--rating"
              type="number"
              min="1"
              max="10"
              step="0.25"
              value={quickRating}
              onChange={e => setQuickRating(e.target.value)}
              placeholder="8.75"
            />
          </label>
          {quickRatingError && <p className="anime-detail__form-error">{quickRatingError}</p>}
          <button
            className="anime-detail__action-btn anime-detail__action-btn--primary"
            onClick={handleQuickRatingSubmit}
            disabled={quickRatingSaving}
          >
            {quickRatingSaving ? 'Saving…' : 'Save Rating'}
          </button>
        </div>
      )}

      {/* Form used to write or edit a full review. */}
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

      {/* Display all written reviews for this anime. */}
      <div className="anime-detail__reviews">
        <h2 className="anime-detail__reviews-heading">
          Reviews
          {writtenReviews.length > 0 && <span className="anime-detail__reviews-count">{writtenReviews.length}</span>}
        </h2>

        {writtenReviews.length === 0 ? (
          <div className="anime-detail__reviews-empty">
            <p>No reviews yet. Be the first to write one!</p>
          </div>
        ) : (
          <div className="anime-detail__reviews-list">
            {/* Render each review individually. */}
            {writtenReviews.map(review => (
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
                      Comments
                    </Link>
                    {/* Allow users to report reviews written by other users. */}
                    {isLoggedIn && review.user_id !== user.id && (
                      <button
                        className="anime-detail__review-btn anime-detail__review-btn--report"
                        onClick={() => handleReport(review)}
                        disabled={reportedReviews.has(review.id)}
                      >
                        {reportedReviews.has(review.id) ? 'Reported' : 'Report'}
                      </button>
                    )}
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