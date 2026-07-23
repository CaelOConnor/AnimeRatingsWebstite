import { Router } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { contentLimiter, userContentLimiter } from '../middleware/rateLimit.js';
import {
  createReview,
  getReviewsByAnimeId,
  getReviewsByUserId,
  getReviewById,
  updateReview,
  deleteReview,
  getReviewByUserAndAnime,
} from '../db/reviews.js';

const router = Router();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ── GET /api/reviews?animeId= ─────────────────────────────────────────────────
// Public. Returns all reviews for a given anime, with username joined in.

router.get('/', async (req, res) => {
  const { animeId } = req.query;

  if (!animeId) {
    return res.status(400).json({ error: 'animeId query parameter is required.' });
  }
  if (!UUID_REGEX.test(animeId)) {
    return res.status(400).json({ error: 'animeId must be a valid UUID.' });
  }

  try {
    const reviews = await getReviewsByAnimeId(animeId);
    res.json(reviews);
  } catch (err) {
    console.error('[GET /api/reviews]', err);
    res.status(500).json({ error: 'Failed to fetch reviews.' });
  }
});

// ── POST /api/reviews ─────────────────────────────────────────────────────────
// Auth required. Creates a review for the authenticated user.
// At least one of rating or body must be provided.

router.post('/', contentLimiter, authenticateToken, userContentLimiter, async (req, res) => {
  const { animeId, rating, body } = req.body;

  if (!animeId) {
    return res.status(400).json({ error: 'animeId is required.' });
  }
  if (!UUID_REGEX.test(animeId)) {
    return res.status(400).json({ error: 'animeId must be a valid UUID.' });
  }

  const hasRating = rating !== undefined && rating !== null;
  const hasBody = body !== undefined && body !== null;

  if (!hasRating && !hasBody) {
    return res.status(400).json({ error: 'At least one of rating or body is required.' });
  }
  if (hasRating) {
    const r = Number(rating);
    if (isNaN(r) || r < 1 || r > 10 || Math.round(r * 4) / 4 !== r) {
      return res.status(400).json({ error: 'rating must be a number between 1 and 10 in increments of 0.25.' });
    }
  }
  if (hasBody && body.trim() === '') {
    return res.status(400).json({ error: 'body cannot be empty.' });
  }

  try {
    const review = await createReview({
      animeId,
      userId: req.user.id,
      rating: hasRating ? rating : null,
      body: hasBody ? body : null,
    });
    res.status(201).json(review);
  } catch (err) {
    if (err.code === '23505' || err.message === 'You have already reviewed this anime.') {
      return res.status(409).json({ error: 'You have already reviewed this anime.' });
    }
    if (err.code === '23503') {
      return res.status(404).json({ error: 'Anime not found.' });
    }
    console.error('[POST /api/reviews]', err);
    res.status(500).json({ error: 'Failed to create review.' });
  }
});

// ── GET /api/reviews/:id ──────────────────────────────────────────────────────
// Public. Returns a single review by its UUID.

router.get('/:id', async (req, res) => {
  const { id } = req.params;

  if (!UUID_REGEX.test(id)) {
    return res.status(400).json({ error: 'id must be a valid UUID.' });
  }

  try {
    const review = await getReviewById(id);
    if (!review) {
      return res.status(404).json({ error: 'Review not found.' });
    }
    res.json(review);
  } catch (err) {
    console.error('[GET /api/reviews/:id]', err);
    res.status(500).json({ error: 'Failed to fetch review.' });
  }
});

// ── PATCH /api/reviews/:id ────────────────────────────────────────────────────
// Auth required. Owner only — moderators cannot edit others' reviews.

router.patch('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { rating, body } = req.body;

  if (!UUID_REGEX.test(id)) {
    return res.status(400).json({ error: 'id must be a valid UUID.' });
  }

  const hasRating = rating !== undefined && rating !== null;
  const hasBody = body !== undefined && body !== null;

  if (!hasRating && !hasBody) {
    return res.status(400).json({ error: 'At least one of rating or body is required.' });
  }
  if (hasRating) {
    const r = Number(rating);
    if (isNaN(r) || r < 1 || r > 10 || Math.round(r * 4) / 4 !== r) {
      return res.status(400).json({ error: 'rating must be a number between 1 and 10 in increments of 0.25.' });
    }
  }
  if (hasBody && body.trim() === '') {
    return res.status(400).json({ error: 'body cannot be empty.' });
  }

  try {
    const review = await getReviewById(id);
    if (!review) {
      return res.status(404).json({ error: 'Review not found.' });
    }

    // Only the owner can edit — no moderator exception for PATCH
    if (review.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    const updated = await updateReview(id, {
      ...(hasRating && { rating }),
      ...(hasBody && { body }),
    });
    res.json(updated);
  } catch (err) {
    console.error('[PATCH /api/reviews/:id]', err);
    res.status(500).json({ error: 'Failed to update review.' });
  }
});

// ── DELETE /api/reviews/:id ───────────────────────────────────────────────────
// Auth required. Owner or moderator.

router.delete('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  if (!UUID_REGEX.test(id)) {
    return res.status(400).json({ error: 'id must be a valid UUID.' });
  }

  try {
    const review = await getReviewById(id);
    if (!review) {
      return res.status(404).json({ error: 'Review not found.' });
    }

    if (review.user_id !== req.user.id && req.user.role === 'user') {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    const deleted = await deleteReview(id);
    res.json(deleted);
  } catch (err) {
    console.error('[DELETE /api/reviews/:id]', err);
    res.status(500).json({ error: 'Failed to delete review.' });
  }
});

export default router;