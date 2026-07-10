import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import './ReviewDetail.css';

// Format dates into a readable form for reviews and comments.
function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// Displays a review's rating using a star icon.
function StarRating({ rating }) {
  return (
    <span className="review-detail__rating">
      <span className="review-detail__rating-star">★</span>
      <span className="review-detail__rating-value">{rating}</span>
      <span className="review-detail__rating-max">/10</span>
    </span>
  );
}

// Displays an individual comment.
// Users can edit their own comments, while moderators and administrators can delete any comment.
function CommentItem({ comment, currentUser, onEdit, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(comment.body);
  const [saving, setSaving] = useState(false);

  // Determine whether the current user is allowed to edit or moderate this comment.
  const isOwner = currentUser?.id === comment.user_id;
  const isMod =
    currentUser?.role_type === 'moderator' || currentUser?.role_type === 'admin';

  // Save changes made while editing a comment.
  async function handleSave() {
    if (!editBody.trim()) return;
    setSaving(true);
    await onEdit(comment.id, editBody.trim());
    setSaving(false);
    setEditing(false);
  }

  // Discard any edits and restore the original comment.
  function handleCancel() {
    setEditBody(comment.body);
    setEditing(false);
  }

  return (
    <div className="review-detail__comment">
      <div className="review-detail__comment-header">
        <Link to={`/users/${comment.user_id}`} className="review-detail__comment-username">
          {comment.username}
        </Link>
        <span className="review-detail__comment-date">{formatDate(comment.created_at)}</span>
        {comment.updated_at !== comment.created_at && (
          <span className="review-detail__comment-edited">(edited)</span>
        )}
      </div>

      {editing ? (
        <div className="review-detail__comment-edit">
          <textarea
            className="review-detail__textarea"
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            rows={3}
          />
          <div className="review-detail__comment-edit-actions">
            <button
              className="review-detail__btn review-detail__btn--primary"
              onClick={handleSave}
              disabled={saving || !editBody.trim()}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              className="review-detail__btn review-detail__btn--ghost"
              onClick={handleCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="review-detail__comment-body">{comment.body}</p>
      )}

      {!editing && (isOwner || isMod) && (
        <div className="review-detail__comment-actions">
          {isOwner && (
            <button
              className="review-detail__action-btn"
              onClick={() => setEditing(true)}
            >
              Edit
            </button>
          )}
          {(isOwner || isMod) && (
            <button
              className="review-detail__action-btn review-detail__action-btn--danger"
              onClick={() => onDelete(comment.id)}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Get the review ID from the URL and the currently logged-in user's information.
export default function ReviewDetail() {
  const { id } = useParams();
  const { user } = useAuth();

  // Store the review, related anime, comments, and the page's loading state.
  const [review, setReview] = useState(null);
  const [anime, setAnime] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [composing, setComposing] = useState(false);
  const [reported, setReported]   = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // Load the review, anime information, and comments whenever a different review page is opened.
  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const rev = await api.get(`/api/reviews/${id}`);
        if (!rev) throw new Error('Review not found.');
        const [animeData, commentsData] = await Promise.all([
          api.get(`/api/anime/${rev.anime_id}`),
          api.get(`/api/comments?reviewId=${id}`),
        ]);
        setReview(rev);
        setAnime(animeData);
        setComments(commentsData);
      } catch (err) {
        setError(err.message || 'Failed to load review.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  // Create a new comment and add it to the page without requiring a full reload.
  async function handleSubmitComment() {
    if (!commentBody.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const created = await api.post('/api/comments', {
        reviewId: id,
        body: commentBody.trim(),
      });
      // The API response does not include the author's username, so add it locally before displaying the new comment.
      setComments((prev) => [...prev, { ...created, username: user.username }]);
      setCommentBody('');
      setComposing(false);
    } catch (err) {
      setSubmitError(err.message || 'Failed to post comment.');
    } finally {
      setSubmitting(false);
    }
  }

  // Update an existing comment.
  async function handleEditComment(commentId, body) {
    const updated = await api.patch(`/api/comments/${commentId}`, { body });
    setComments((prev) =>
      prev.map((c) => (c.id === commentId ? { ...c, ...updated } : c))
    );
  }

  // Remove a comment from both the database and the page.
  async function handleDeleteComment(commentId) {
    await api.delete(`/api/comments/${commentId}`);
    setComments((prev) => prev.filter((c) => c.id !== commentId));
  }

  // Show a loading spinner or an error message before rendering the review.
  if (loading) {
    return (
      <div className="review-detail__state">
        <span className="review-detail__spinner" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="review-detail__state review-detail__state--error">
        <p>{error}</p>
        <Link to="/" className="review-detail__btn review-detail__btn--primary">
          Go Home
        </Link>
      </div>
    );
  }

  return (
    <div className="review-detail">
      <div className="review-detail__container">

        {/* Back link */}
        <Link
          to={`/anime/${review.anime_id}`}
          className="review-detail__back"
        >
          ← Back
        </Link>

        {/* Review card */}
        {/* Display the selected review and its details. */}
        <article className="review-detail__card">
          <div className="review-detail__card-header">
            <div className="review-detail__meta">
              <Link
                to={`/users/${review.user_id}`}
                className="review-detail__username"
              >
                {review.username}
              </Link>
              <span className="review-detail__dot">·</span>
              <span className="review-detail__date">{formatDate(review.created_at)}</span>
              {review.updated_at !== review.created_at && (
                <span className="review-detail__edited">(edited)</span>
              )}
            </div>
            <StarRating rating={review.rating} />
          </div>

          {anime && (
            <p className="review-detail__anime-title">
              Review of{' '}
              <Link to={`/anime/${anime.id}`} className="review-detail__anime-link">
                {anime.title}
              </Link>
            </p>
          )}

          {review.body ? (
            <p className="review-detail__body">{review.body}</p>
          ) : (
            <p className="review-detail__body review-detail__body--empty">
              No written review.
            </p>
          )}

          {user && !composing && (
            <div className="review-detail__card-footer">
              <button
                className="review-detail__btn review-detail__btn--primary"
                onClick={() => setComposing(true)}
              >
                Add Comment
              </button>
              {user.id !== review.user_id && (
                <button
                  className="review-detail__btn review-detail__btn--ghost"
                  disabled={reported}
                  onClick={async () => {
                    try {
                      {/* Allow users to report another user's review.
                        Users cannot report their own reviews. */}
                      await api.post('/api/reports', {
                        targetType: 'review',
                        targetId: review.id,
                        reportedUserId: review.user_id,
                      });
                      setReported(true);
                    } catch (err) {
                      console.error('Failed to submit report:', err.message);
                    }
                  }}
                >
                  {reported ? 'Reported' : '🚩 Report'}
                </button>
              )}
            </div>
          )}
        </article>

        {/* Comments section */}
        {/* Display existing comments and allow users
            to add new ones. */}
        <section className="review-detail__comments">
          <h2 className="review-detail__comments-heading">
            Comments
            {comments.length > 0 && (
              <span className="review-detail__comments-count">{comments.length}</span>
            )}
          </h2>

          {comments.length === 0 && !composing && (
            <p className="review-detail__comments-empty">
              No comments yet.{user ? ' Be the first!' : ''}
            </p>
          )}

          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              currentUser={user}
              onEdit={handleEditComment}
              onDelete={handleDeleteComment}
            />
          ))}

          {/* Inline compose */}
          {composing && (
            <div className="review-detail__compose">
              <textarea
                className="review-detail__textarea"
                placeholder="Write a comment…"
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                rows={4}
                autoFocus
              />
              {submitError && (
                <p className="review-detail__compose-error">{submitError}</p>
              )}
              <div className="review-detail__compose-actions">
                <button
                  className="review-detail__btn review-detail__btn--primary"
                  onClick={handleSubmitComment}
                  disabled={submitting || !commentBody.trim()}
                >
                  {submitting ? 'Posting…' : 'Post'}
                </button>
                <button
                  className="review-detail__btn review-detail__btn--ghost"
                  onClick={() => {
                    setComposing(false);
                    setCommentBody('');
                    setSubmitError(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}