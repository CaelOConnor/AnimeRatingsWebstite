import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import './UserProfile.css';

// Constants used throughout the profile page.
const TMDB_POSTER  = 'https://image.tmdb.org/t/p/w500';
const API_BASE     = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Used to group and display watchlist entries in a consistent order.
const STATUS_ORDER  = ['watching', 'completed', 'plan_to_watch', 'dropped'];
const STATUS_LABELS = {
  watching:      'Watching',
  completed:     'Completed',
  plan_to_watch: 'Plan to Watch',
  dropped:       'Dropped',
};

// Helper functions for displaying dates in a readable format.
function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function formatJoinDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long',
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

// Displays the user's avatar image.
// If no avatar exists, show the user's first initial instead.
function Avatar({ avatarUrl, username, size = 'md' }) {
  if (avatarUrl) {
    const src = avatarUrl.startsWith('/uploads')
      ? `${API_BASE}${avatarUrl}`
      : avatarUrl;
    return (
      <img
        className={`user-profile__avatar user-profile__avatar--img user-profile__avatar--${size}`}
        src={src}
        alt={`${username}'s avatar`}
      />
    );
  }
  return (
    <div className={`user-profile__avatar user-profile__avatar--initials user-profile__avatar--${size}`} aria-hidden="true">
      {username?.[0]?.toUpperCase() ?? '?'}
    </div>
  );
}

// Displays a preview of one review on the user's profile.
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

// Displays all watchlist entries that belong to a single status
// (Watching, Completed, Plan to Watch, etc.).
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
          <Link key={entry.id} to={`/anime/${entry.anime_id}`} className="user-profile__wl-card">
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

// Displays one of the user's highest-rated anime.
function FavoriteCard({ review }) {
  return (
    <Link to={`/anime/${review.anime_id}`} className="user-profile__fav-card">
      {review.poster_path ? (
        <img
          className="user-profile__fav-poster"
          src={`${TMDB_POSTER}${review.poster_path}`}
          alt={review.title}
        />
      ) : (
        <div className="user-profile__fav-poster user-profile__fav-poster--empty" />
      )}
      <div className="user-profile__fav-rating">
        <span className="user-profile__fav-star">★</span>
        {Number(review.rating).toFixed(1)}
      </div>
      <span className="user-profile__fav-title">{review.title}</span>
    </Link>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function UserProfile() {
  // Get the user ID from the URL and authentication information for the currently logged-in user.
  const { id }     = useParams();
  const navigate   = useNavigate();
  const { user: authUser } = useAuth();
  const fileInputRef = useRef(null);

  const isSelf  = authUser?.id === id;
  const isAdmin = authUser?.role_type === 'admin';

  // State used to store profile data and page status.
  const [user,      setUser]      = useState(null);
  const [reviews,   setReviews]   = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [tab,       setTab]       = useState('reviews');

  // State used when editing the user's bio.
  const [bio,        setBio]        = useState('');
  const [bioSaving,  setBioSaving]  = useState(false);
  const [bioError,   setBioError]   = useState(null);
  const [bioSuccess, setBioSuccess] = useState(false);

  // State used while uploading a new profile picture.
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError,     setAvatarError]     = useState(null);

  // State used for administrator actions.
  const [adminActing,  setAdminActing]  = useState(false);
  const [adminError,   setAdminError]   = useState(null);

  // Load the user's profile, reviews, and watchlist whenever a different profile page is opened.
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
        setBio(userData.bio ?? '');
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

  // Select the user's 10 highest-rated reviews to display in the "Top Rated" section.
  const favorites = [...reviews]
    .filter((r) => r.rating != null)
    .sort((a, b) => Number(b.rating) - Number(a.rating))
    .slice(0, 10);

  // Organize watchlist entries by status so they can be displayed under separate headings.
  const groupedWatchlist = STATUS_ORDER.reduce((acc, status) => {
    acc[status] = watchlist.filter((e) => e.status === status);
    return acc;
  }, {});

  // ── Handlers ────────────────────────────────────────────────────────────────
  // Upload a new avatar and update the profile when successful.
  async function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setAvatarError(null);
    setAvatarUploading(true);

    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const result = await api.upload(`/api/users/${id}/avatar`, formData);
      setUser((prev) => ({ ...prev, avatar_url: result.avatar_url }));
    } catch (err) {
      setAvatarError(err.message || 'Failed to upload avatar.');
    } finally {
      setAvatarUploading(false);
      // Reset file input so selecting the same file again fires onChange
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  // Save changes made to the user's biography.
  async function handleBioSave() {
    setBioSaving(true);
    setBioError(null);
    setBioSuccess(false);
    try {
      const updated = await api.patch(`/api/users/${id}`, { bio: bio.trim() || null });
      setUser((prev) => ({ ...prev, bio: updated.bio }));
      setBioSuccess(true);
      setTimeout(() => setBioSuccess(false), 2500);
    } catch (err) {
      setBioError(err.message || 'Failed to save bio.');
    } finally {
      setBioSaving(false);
    }
  }

  // Administrator actions for managing user accounts.
  async function handleAdminBan() {
    if (!window.confirm(`Ban ${user.username}? This will immediately invalidate their session.`)) return;
    setAdminActing(true);
    setAdminError(null);
    try {
      await api.post(`/api/admin/users/${id}/ban`);
      setUser((prev) => ({ ...prev, is_banned: true }));
    } catch (err) {
      setAdminError(err.message || 'Failed to ban user.');
    } finally {
      setAdminActing(false);
    }
  }

  async function handleAdminUnban() {
    setAdminActing(true);
    setAdminError(null);
    try {
      await api.post(`/api/admin/users/${id}/unban`);
      setUser((prev) => ({ ...prev, is_banned: false }));
    } catch (err) {
      setAdminError(err.message || 'Failed to unban user.');
    } finally {
      setAdminActing(false);
    }
  }

  async function handleAdminDelete() {
    if (!window.confirm(`Permanently delete ${user.username}? This cannot be undone.`)) return;
    setAdminActing(true);
    setAdminError(null);
    try {
      await api.delete(`/api/admin/users/${id}`);
      navigate('/admin');
    } catch (err) {
      setAdminError(err.message || 'Failed to delete user.');
      setAdminActing(false);
    }
  }

  // ── Render guards ────────────────────────────────────────────────────────────
  // Show a loading spinner or an error message before attempting to render the profile.
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

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="user-profile">
      <div className="user-profile__container">
        {/* Return to the previous page in the browser history. */}
        <button className="user-profile__back" onClick={() => navigate(-1)}>← Back</button>

        {/* Administrator controls for banning, unbanning, or deleting another user's account. */}
        {isAdmin && !isSelf && (
          <div className="user-profile__admin-strip">
            <span className="user-profile__admin-label">Admin actions</span>
            {adminError && <span className="user-profile__admin-error">{adminError}</span>}
            <div className="user-profile__admin-actions">
              {user.is_banned ? (
                <button
                  className="user-profile__admin-btn user-profile__admin-btn--unban"
                  onClick={handleAdminUnban}
                  disabled={adminActing}
                >
                  Unban
                </button>
              ) : (
                <button
                  className="user-profile__admin-btn user-profile__admin-btn--ban"
                  onClick={handleAdminBan}
                  disabled={adminActing}
                >
                  Ban
                </button>
              )}
              <button
                className="user-profile__admin-btn user-profile__admin-btn--delete"
                onClick={handleAdminDelete}
                disabled={adminActing}
              >
                Delete account
              </button>
            </div>
          </div>
        )}

        {/* Header */}
        {/* Profile information including avatar, username, biography, and account statistics. */}
        <div className="user-profile__header">
          <div className="user-profile__avatar-wrap">
            <Avatar avatarUrl={user.avatar_url} username={user.username} size="lg" />
            {isSelf && (
              <>
              {/* Allow users to upload a new profile picture when viewing their own profile. */}
                <button
                  className="user-profile__avatar-edit"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={avatarUploading}
                  aria-label="Change avatar"
                >
                  {avatarUploading ? '…' : '✎'}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="user-profile__avatar-input"
                  onChange={handleAvatarChange}
                />
                {avatarError && (
                  <p className="user-profile__avatar-error">{avatarError}</p>
                )}
              </>
            )}
          </div>

          <div className="user-profile__header-info">
            <div className="user-profile__name-row">
              <h1 className="user-profile__username">{user.username}</h1>
              {user.is_banned && (
                <span className="user-profile__banned-badge">Banned</span>
              )}
            </div>
            <p className="user-profile__joined">Member since {formatJoinDate(user.created_at)}</p>

            {/* Bio display */}
            {!isSelf && user.bio && (
              <p className="user-profile__bio">{user.bio}</p>
            )}

            {/* Bio edit (own profile) */}
            {isSelf && (
              <div className="user-profile__bio-edit">
                <textarea
                  className="user-profile__bio-input"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Write a short bio…"
                  maxLength={300}
                  rows={3}
                />
                <div className="user-profile__bio-footer">
                  <span className="user-profile__bio-count">{bio.length}/300</span>
                  <button
                    className="user-profile__bio-save"
                    onClick={handleBioSave}
                    disabled={bioSaving}
                  >
                    {bioSaving ? 'Saving…' : 'Save bio'}
                  </button>
                </div>
                {bioError   && <p className="user-profile__bio-error">{bioError}</p>}
                {bioSuccess && <p className="user-profile__bio-success">Bio saved!</p>}
              </div>
            )}
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

        {/* Display the user's highest-rated anime. */}
        {favorites.length > 0 && (
          <section className="user-profile__favorites">
            <h2 className="user-profile__section-heading">Top Rated</h2>
            <div className="user-profile__fav-grid">
              {favorites.map((review) => (
                <FavoriteCard key={review.id} review={review} />
              ))}
            </div>
          </section>
        )}

        {/* Tabs */}
        {/* Switch between viewing the user's reviews and their watchlist. */}
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
        {/* Display all written reviews. */}
        {tab === 'reviews' && (
          <div className="user-profile__panel">
            {reviews.filter(r => r.body).length === 0 ? (
              <p className="user-profile__empty">No written reviews yet.</p>
            ) : (
              <div className="user-profile__reviews-list">
                {reviews.filter(r => r.body).map((review) => (
                  <ReviewCard key={review.id} review={review} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Display the user's watchlist grouped by status. */}
        {tab === 'watchlist' && (
          <div className="user-profile__panel">
            {watchlist.length === 0 ? (
              <p className="user-profile__empty">Watchlist is empty.</p>
            ) : (
              STATUS_ORDER.map((status) => (
                <WatchlistGroup key={status} status={status} entries={groupedWatchlist[status]} />
              ))
            )}
          </div>
        )}

      </div>
    </div>
  );
}