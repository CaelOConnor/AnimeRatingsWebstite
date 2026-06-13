import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  getUserById,
  updateUser,
} from '../db/users.js';
import { getReviewsByUserId } from '../db/reviews.js';
import { getWatchlistByUserId } from '../db/watchlist.js';

const router = Router();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PUBLIC_FIELDS = (u) => ({
  id:         u.id,
  username:   u.username,
  role_type:  u.role_type,
  created_at: u.created_at,
});

// ── GET /api/users/:id ────────────────────────────────────────────────────────
// Public. Returns a user's public profile — no email or password_hash.

router.get('/:id', async (req, res) => {
  const { id } = req.params;

  if (!UUID_REGEX.test(id)) {
    return res.status(400).json({ error: 'id must be a valid UUID.' });
  }

  try {
    const user = await getUserById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json(PUBLIC_FIELDS(user));
  } catch (err) {
    console.error('[GET /api/users/:id]', err);
    res.status(500).json({ error: 'Failed to fetch user.' });
  }
});

// ── GET /api/users/:id/reviews ────────────────────────────────────────────────
// Public. Returns all reviews written by the given user.

router.get('/:id/reviews', async (req, res) => {
  const { id } = req.params;

  if (!UUID_REGEX.test(id)) {
    return res.status(400).json({ error: 'id must be a valid UUID.' });
  }

  try {
    const user = await getUserById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const reviews = await getReviewsByUserId(id);
    res.json(reviews);
  } catch (err) {
    console.error('[GET /api/users/:id/reviews]', err);
    res.status(500).json({ error: 'Failed to fetch reviews.' });
  }
});

// ── GET /api/users/:id/watchlist ──────────────────────────────────────────────
// Public. Returns the watchlist for the given user, with anime title and
// poster_path joined in.

router.get('/:id/watchlist', async (req, res) => {
  const { id } = req.params;

  if (!UUID_REGEX.test(id)) {
    return res.status(400).json({ error: 'id must be a valid UUID.' });
  }

  try {
    const user = await getUserById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const watchlist = await getWatchlistByUserId(id);
    res.json(watchlist);
  } catch (err) {
    console.error('[GET /api/users/:id/watchlist]', err);
    res.status(500).json({ error: 'Failed to fetch watchlist.' });
  }
});

// ── PATCH /api/users/:id ──────────────────────────────────────────────────────
// Auth required. Owner only. Updatable fields: username.
// Extend the allowedFields set as the schema grows (e.g. avatar_url, bio).

router.patch('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  if (!UUID_REGEX.test(id)) {
    return res.status(400).json({ error: 'id must be a valid UUID.' });
  }

  if (req.user.id !== id) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  // Build update payload from allowed fields only
  const { username } = req.body;
  const updates = {};

  if (username !== undefined) {
    if (typeof username !== 'string' || username.trim() === '') {
      return res.status(400).json({ error: 'username cannot be empty.' });
    }
    updates.username = username.trim();
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No updatable fields provided.' });
  }

  try {
    const user = await getUserById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const updated = await updateUser(id, updates);
    res.json(PUBLIC_FIELDS(updated));
  } catch (err) {
    if (err.message === 'Username is already taken') {
      return res.status(409).json({ error: 'Username already taken.' });
    }
    console.error('[PATCH /api/users/:id]', err);
    res.status(500).json({ error: 'Failed to update user.' });
  }
});

export default router;