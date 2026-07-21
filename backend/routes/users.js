import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
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
  avatar_url: u.avatar_url ?? null,
  bio:        u.bio ?? null,
  role_type:  u.role_type,
  created_at: u.created_at,
});

// ── Multer setup ──────────────────────────────────────────────────────────────

const AVATARS_DIR = '/app/uploads/avatars';

// Ensure the avatars directory exists at startup
fs.mkdirSync(AVATARS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, AVATARS_DIR),
  filename: (req, _file, cb) => {
    // userId + timestamp to bust cache
    cb(null, `${req.params.id}-${Date.now()}.png`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PNG, JPG, and WebP images are allowed.'));
    }
  },
});

// ── GET /api/users/:id ────────────────────────────────────────────────────────

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

// ── POST /api/users/:id/avatar ────────────────────────────────────────────────
// Auth required. Owner only. Accepts PNG/JPG/WebP up to 2 MB.
// Saves file to /app/uploads/avatars/, updates avatar_url in DB.

router.post('/:id/avatar', authenticateToken, upload.single('avatar'), async (req, res) => {
  const { id } = req.params;

  if (!UUID_REGEX.test(id)) {
    return res.status(400).json({ error: 'id must be a valid UUID.' });
  }

  if (req.user.id !== id) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  // Build a public URL the frontend can use directly
  const avatarUrl = `/uploads/avatars/${req.file.filename}`;

  try {
    const updated = await updateUser(id, { avatar_url: avatarUrl });
    res.json({ avatar_url: PUBLIC_FIELDS(updated).avatar_url });
  } catch (err) {
    console.error('[POST /api/users/:id/avatar]', err);
    res.status(500).json({ error: 'Failed to update avatar.' });
  }
});

// ── PATCH /api/users/:id ──────────────────────────────────────────────────────
// Auth required. Owner only. Updatable fields: username, bio, avatar_url (string).

router.patch('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  if (!UUID_REGEX.test(id)) {
    return res.status(400).json({ error: 'id must be a valid UUID.' });
  }

  if (req.user.id !== id) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const { username, bio, avatar_url } = req.body;
  const updates = {};

  if (username !== undefined) {
    if (typeof username !== 'string' || username.trim() === '') {
      return res.status(400).json({ error: 'username must be a non-empty string.' });
    }
    const trimmed = username.trim();
    if (trimmed.length < 2 || trimmed.length > 30) {
      return res.status(400).json({ error: 'Username must be between 2 and 30 characters.' });
    }
    updates.username = trimmed;
  }

  if (bio !== undefined) {
    if (bio !== null && typeof bio !== 'string') {
      return res.status(400).json({ error: 'bio must be a string or null.' });
    }
    updates.bio = bio === '' ? null : bio;
  }

  if (avatar_url !== undefined) {
    if (avatar_url !== null && typeof avatar_url !== 'string') {
      return res.status(400).json({ error: 'avatar_url must be a string or null.' });
    }
    updates.avatar_url = avatar_url;
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
      return res.status(409).json({ error: err.message });
    }
    console.error('[PATCH /api/users/:id]', err);
    res.status(500).json({ error: 'Failed to update user.' });
  }
});

export default router;