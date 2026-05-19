import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  createComment,
  getCommentsByReviewId,
  getCommentById,
  updateComment,
  deleteComment,
} from '../db/comments.js';

const router = Router();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ── GET /api/comments?reviewId= ───────────────────────────────────────────────
// Public. Returns all comments for a given review, ordered by created_at ASC,
// with username joined in.

router.get('/', async (req, res) => {
  const { reviewId } = req.query;

  if (!reviewId) {
    return res.status(400).json({ error: 'reviewId query parameter is required.' });
  }
  if (!UUID_REGEX.test(reviewId)) {
    return res.status(400).json({ error: 'reviewId must be a valid UUID.' });
  }

  try {
    const comments = await getCommentsByReviewId(reviewId);
    res.json(comments);
  } catch (err) {
    console.error('[GET /api/comments]', err);
    res.status(500).json({ error: 'Failed to fetch comments.' });
  }
});

// ── POST /api/comments ────────────────────────────────────────────────────────
// Auth required. Body is mandatory — there is no rating fallback here.

router.post('/', authenticateToken, async (req, res) => {
  const { reviewId, body } = req.body;

  if (!reviewId) {
    return res.status(400).json({ error: 'reviewId is required.' });
  }
  if (!UUID_REGEX.test(reviewId)) {
    return res.status(400).json({ error: 'reviewId must be a valid UUID.' });
  }
  if (!body || body.trim() === '') {
    return res.status(400).json({ error: 'body is required and cannot be empty.' });
  }

  try {
    const comment = await createComment({
      reviewId,
      userId: req.user.id,
      body: body.trim(),
    });
    res.status(201).json(comment);
  } catch (err) {
    if (err.code === '23503' || err.message === 'Review not found.') {
      return res.status(404).json({ error: 'Review not found.' });
    }
    console.error('[POST /api/comments]', err);
    res.status(500).json({ error: 'Failed to create comment.' });
  }
});

// ── PATCH /api/comments/:id ───────────────────────────────────────────────────
// Auth required. Owner only — moderators cannot edit others' comments.

router.patch('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { body } = req.body;

  if (!UUID_REGEX.test(id)) {
    return res.status(400).json({ error: 'id must be a valid UUID.' });
  }
  if (!body || body.trim() === '') {
    return res.status(400).json({ error: 'body is required and cannot be empty.' });
  }

  try {
    const comment = await getCommentById(id);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found.' });
    }

    if (comment.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    const updated = await updateComment(id, { body: body.trim() });
    res.json(updated);
  } catch (err) {
    console.error('[PATCH /api/comments/:id]', err);
    res.status(500).json({ error: 'Failed to update comment.' });
  }
});

// ── DELETE /api/comments/:id ──────────────────────────────────────────────────
// Auth required. Owner or moderator.

router.delete('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  if (!UUID_REGEX.test(id)) {
    return res.status(400).json({ error: 'id must be a valid UUID.' });
  }

  try {
    const comment = await getCommentById(id);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found.' });
    }

    if (comment.user_id !== req.user.id && req.user.role === 'user') {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    const deleted = await deleteComment(id);
    res.json(deleted);
  } catch (err) {
    console.error('[DELETE /api/comments/:id]', err);
    res.status(500).json({ error: 'Failed to delete comment.' });
  }
});

export default router;