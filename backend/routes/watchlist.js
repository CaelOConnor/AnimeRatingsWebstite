import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  addToWatchlist,
  getWatchlistByUserId,
  getWatchlistEntry,
  updateWatchlistStatus,
  removeFromWatchlist,
} from '../db/watchlist.js';

const router = Router();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const VALID_STATUSES = new Set(['watching', 'completed', 'plan_to_watch', 'dropped']);

// ── GET /api/watchlist ────────────────────────────────────────────────────────
// Auth required. Returns the authenticated user's watchlist, ordered by
// updated_at DESC, with anime title and poster_path joined in.

router.get('/', authenticateToken, async (req, res) => {
  try {
    const entries = await getWatchlistByUserId(req.user.id);
    res.json(entries);
  } catch (err) {
    console.error('[GET /api/watchlist]', err);
    res.status(500).json({ error: 'Failed to fetch watchlist.' });
  }
});

// ── POST /api/watchlist ───────────────────────────────────────────────────────
// Auth required. Adds an anime to the authenticated user's watchlist.
// status defaults to plan_to_watch when omitted.

router.post('/', authenticateToken, async (req, res) => {
  const { animeId, status } = req.body;

  if (!animeId) {
    return res.status(400).json({ error: 'animeId is required.' });
  }
  if (!UUID_REGEX.test(animeId)) {
    return res.status(400).json({ error: 'animeId must be a valid UUID.' });
  }
  if (status !== undefined && !VALID_STATUSES.has(status)) {
    return res.status(400).json({
      error: 'status must be one of: watching, completed, plan_to_watch, dropped.',
    });
  }

  try {
    const entry = await addToWatchlist({
      userId: req.user.id,
      animeId,
      status: status ?? 'plan_to_watch',
    });
    res.status(201).json(entry);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'This anime is already in your watchlist.' });
    }
    if (err.code === '23503') {
      return res.status(404).json({ error: 'Anime not found.' });
    }
    console.error('[POST /api/watchlist]', err);
    res.status(500).json({ error: 'Failed to add to watchlist.' });
  }
});

// ── PATCH /api/watchlist/:animeId ─────────────────────────────────────────────
// Auth required. Updates the status on the authenticated user's entry for
// the given anime. Scoped to the requesting user — no moderator exception.

router.patch('/:animeId', authenticateToken, async (req, res) => {
  const { animeId } = req.params;
  const { status } = req.body;

  if (!UUID_REGEX.test(animeId)) {
    return res.status(400).json({ error: 'animeId must be a valid UUID.' });
  }
  if (!status) {
    return res.status(400).json({ error: 'status is required.' });
  }
  if (!VALID_STATUSES.has(status)) {
    return res.status(400).json({
      error: 'status must be one of: watching, completed, plan_to_watch, dropped.',
    });
  }

  try {
    const entry = await getWatchlistEntry(req.user.id, animeId);
    if (!entry) {
      return res.status(404).json({ error: 'Watchlist entry not found.' });
    }

    const updated = await updateWatchlistStatus(req.user.id, animeId, status);
    res.json(updated);
  } catch (err) {
    console.error('[PATCH /api/watchlist/:animeId]', err);
    res.status(500).json({ error: 'Failed to update watchlist entry.' });
  }
});

// ── DELETE /api/watchlist/:animeId ────────────────────────────────────────────
// Auth required. Removes the authenticated user's entry for the given anime.
// Scoped to the requesting user — no moderator exception.

router.delete('/:animeId', authenticateToken, async (req, res) => {
  const { animeId } = req.params;

  if (!UUID_REGEX.test(animeId)) {
    return res.status(400).json({ error: 'animeId must be a valid UUID.' });
  }

  try {
    const entry = await getWatchlistEntry(req.user.id, animeId);
    if (!entry) {
      return res.status(404).json({ error: 'Watchlist entry not found.' });
    }

    const deleted = await removeFromWatchlist(req.user.id, animeId);
    res.json(deleted);
  } catch (err) {
    console.error('[DELETE /api/watchlist/:animeId]', err);
    res.status(500).json({ error: 'Failed to remove from watchlist.' });
  }
});

export default router;