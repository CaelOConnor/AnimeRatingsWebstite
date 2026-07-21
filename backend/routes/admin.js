import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { getUserById, deleteUserById, banUser, unbanUser } from '../db/users.js';
import { getReviewById, deleteReview } from '../db/reviews.js';
import { getCommentById, deleteComment } from '../db/comments.js';
import { getUsersByRole, getBannedUsers, getRecentReviews, getReports, dismissAllReportsForUser, getAllFeedback } from '../db/admin.js';
import { resolveFeedback } from '../db/feedback.js';
import { searchTmdbCandidates } from './anime.js';
import { denylistAllUserTokens } from '../services/redis.js';

const router = Router();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

// Requires a valid JWT — attached to every route in this file.
const requireAuth = authenticateToken;

// Requires role_type of 'moderator' OR 'admin'.
function requireMod(req, res, next) {
  const role = req.user?.role;
  if (role !== 'moderator' && role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden.' });
  }
  next();
}

// Requires role_type of 'admin' only.
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden.' });
  }
  next();
}

// ---------------------------------------------------------------------------
// Safe user shape — expose email for admin views but never password_hash.
// ---------------------------------------------------------------------------

const ADMIN_USER_FIELDS = (u) => ({
  id:         u.id,
  username:   u.username,
  email:      u.email,
  role_type:  u.role_type,
  is_banned:  u.is_banned,
  created_at: u.created_at,
});

// ── GET /api/admin/anime/search ───────────────────────────────────────────────
// Admin only. Looks up TMDB candidates for the "add a show" quick-add UI —
// a numeric query is treated as a direct tv/movie id lookup, anything else
// is a title search. Does not add anything; POST /api/anime/fetch/:tmdbId
// (already existing, unchanged) does the actual add once an admin picks one.

router.get('/anime/search', requireAuth, requireAdmin, async (req, res) => {
  const rawQuery = req.query.query;

  if (typeof rawQuery !== 'string' || rawQuery.trim() === '') {
    return res.status(400).json({ error: 'query is required.' });
  }

  try {
    const candidates = await searchTmdbCandidates(rawQuery.trim());
    res.json(candidates);
  } catch (err) {
    console.error('[GET /api/admin/anime/search]', err);
    res.status(500).json({ error: 'Failed to search TMDB.' });
  }
});

// ── GET /api/admin/users ──────────────────────────────────────────────────────
// Mod + admin. Returns all users.

router.get('/users', requireAuth, requireMod, async (req, res) => {
  try {
    const users = await getUsersByRole();
    res.json(users.map(ADMIN_USER_FIELDS));
  } catch (err) {
    console.error('[GET /api/admin/users]', err);
    res.status(500).json({ error: 'Failed to fetch users.' });
  }
});

// ── GET /api/admin/users/banned ───────────────────────────────────────────────
// Mod + admin. Returns only banned users.
// Registered before /:id so Express doesn't swallow the literal "banned".

router.get('/users/banned', requireAuth, requireMod, async (req, res) => {
  try {
    const users = await getBannedUsers();
    res.json(users.map(ADMIN_USER_FIELDS));
  } catch (err) {
    console.error('[GET /api/admin/users/banned]', err);
    res.status(500).json({ error: 'Failed to fetch banned users.' });
  }
});

// ── POST /api/admin/users/:id/ban ─────────────────────────────────────────────
// Admin only. Sets is_banned = true and immediately invalidates all active
// Redis tokens so the banned user cannot continue using existing sessions.

router.post('/users/:id/ban', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;

  if (!UUID_REGEX.test(id)) {
    return res.status(400).json({ error: 'id must be a valid UUID.' });
  }

  try {
    const user = await getUserById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const banned = await banUser(id);

    // Invalidate every active token for this user in Redis immediately.
    // This ensures they cannot continue using existing sessions post-ban.
    await denylistAllUserTokens(id);

    res.json(ADMIN_USER_FIELDS(banned));
  } catch (err) {
    console.error('[POST /api/admin/users/:id/ban]', err);
    res.status(500).json({ error: 'Failed to ban user.' });
  }
});

// ── POST /api/admin/users/:id/unban ───────────────────────────────────────────
// Admin only. Sets is_banned = false. Does not need to touch Redis — the
// user will simply be able to log in again and obtain a fresh, valid token.

router.post('/users/:id/unban', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;

  if (!UUID_REGEX.test(id)) {
    return res.status(400).json({ error: 'id must be a valid UUID.' });
  }

  try {
    const user = await getUserById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const unbanned = await unbanUser(id);
    res.json(ADMIN_USER_FIELDS(unbanned));
  } catch (err) {
    console.error('[POST /api/admin/users/:id/unban]', err);
    res.status(500).json({ error: 'Failed to unban user.' });
  }
});

// ── DELETE /api/admin/users/:id ───────────────────────────────────────────────
// Admin only. Hard-deletes the user — cascades to all child rows.

router.delete('/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;

  if (!UUID_REGEX.test(id)) {
    return res.status(400).json({ error: 'id must be a valid UUID.' });
  }

  try {
    const user = await getUserById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // ── GET /api/admin/reviews ────────────────────────────────────────────────────

    // replace:
    await deleteUserById(id);

    // Invalidate every active token for this user immediately — without
    // this, a deleted user's existing JWT would still pass authenticateToken
    // until natural expiry, since req.user is built from the token payload
    // alone with no DB existence check.
    await denylistAllUserTokens(id);

    res.status(204).send();
  } catch (err) {
    console.error('[DELETE /api/admin/users/:id]', err);
    res.status(500).json({ error: 'Failed to delete user.' });
  }
});

// ── GET /api/admin/reviews ────────────────────────────────────────────────────

// ── GET /api/admin/reviews ────────────────────────────────────────────────────
// Mod + admin. Returns recent reviews for the moderation queue.

router.get('/reviews', requireAuth, requireMod, async (req, res) => {
  try {
    const reviews = await getRecentReviews();
    res.json(reviews);
  } catch (err) {
    console.error('[GET /api/admin/reviews]', err);
    res.status(500).json({ error: 'Failed to fetch reviews.' });
  }
});

// ── DELETE /api/admin/reviews/:id ─────────────────────────────────────────────
// Admin only. Removes any review regardless of ownership.

router.delete('/reviews/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;

  if (!UUID_REGEX.test(id)) {
    return res.status(400).json({ error: 'id must be a valid UUID.' });
  }

  try {
    const review = await getReviewById(id);
    if (!review) {
      return res.status(404).json({ error: 'Review not found.' });
    }

    await deleteReview(id);
    res.status(204).send();
  } catch (err) {
    console.error('[DELETE /api/admin/reviews/:id]', err);
    res.status(500).json({ error: 'Failed to delete review.' });
  }
});

// ── DELETE /api/admin/comments/:id ───────────────────────────────────────────
// Admin only. Removes any comment regardless of ownership.

router.delete('/comments/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;

  if (!UUID_REGEX.test(id)) {
    return res.status(400).json({ error: 'id must be a valid UUID.' });
  }

  try {
    const comment = await getCommentById(id);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found.' });
    }

    await deleteComment(id);
    res.status(204).send();
  } catch (err) {
    console.error('[DELETE /api/admin/comments/:id]', err);
    res.status(500).json({ error: 'Failed to delete comment.' });
  }
});

// ── GET /api/admin/reports ────────────────────────────────────────────────────
// Mod + admin. Returns pending reports grouped by reported user.

router.get('/reports', requireAuth, requireMod, async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const reports = await getReports(status);
    res.json(reports);
  } catch (err) {
    console.error('[GET /api/admin/reports]', err);
    res.status(500).json({ error: 'Failed to fetch reports.' });
  }
});

// ── GET /api/admin/feedback ───────────────────────────────────────────────────
// Mod + admin. Returns all show requests + bug reports, newest first.

router.get('/feedback', requireAuth, requireMod, async (req, res) => {
  try {
    const feedback = await getAllFeedback();
    res.json(feedback);
  } catch (err) {
    console.error('[GET /api/admin/feedback]', err);
    res.status(500).json({ error: 'Failed to fetch feedback.' });
  }
});

// ── PATCH /api/admin/feedback/:id ─────────────────────────────────────────────
// Mod + admin. Marks a feedback row as resolved (soft — row is kept, just
// filtered out of GET /api/admin/feedback going forward).

router.patch('/feedback/:id', requireAuth, requireMod, async (req, res) => {
  const { id } = req.params;

  if (!UUID_REGEX.test(id)) {
    return res.status(400).json({ error: 'id must be a valid UUID.' });
  }

  try {
    const feedback = await resolveFeedback(id);
    if (!feedback) {
      return res.status(404).json({ error: 'Feedback not found.' });
    }
    res.json(feedback);
  } catch (err) {
    console.error('[PATCH /api/admin/feedback/:id]', err);
    res.status(500).json({ error: 'Failed to update feedback.' });
  }
});

// ── POST /api/admin/reports/dismiss/:userId ───────────────────────────────────
// Mod + admin. Dismisses all pending reports against a user.

router.post('/reports/dismiss/:userId', requireAuth, requireMod, async (req, res) => {
  const { userId } = req.params;

  if (!UUID_REGEX.test(userId)) {
    return res.status(400).json({ error: 'userId must be a valid UUID.' });
  }

  try {
    const user = await getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    await dismissAllReportsForUser(userId, req.user.id);
    res.status(204).send();
  } catch (err) {
    console.error('[POST /api/admin/reports/dismiss/:userId]', err);
    res.status(500).json({ error: 'Failed to dismiss reports.' });
  }
});

export default router;