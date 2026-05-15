GET /reviews?animeId=, POST /reviews, GET /reviews/:id, PATCH /reviews/:id, DELETE /reviews/:id



import { Router } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
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

export default router;