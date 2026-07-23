import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/db.js';
import { authenticateToken } from '../middleware/auth.js';
import { loginLimiter, registerLimiter } from '../middleware/rateLimit.js';
import {
  denylistToken,
  addActiveToken,
  removeActiveToken,
} from '../services/redis.js';

const router = Router();

const SALT_ROUNDS = 12;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Precomputed with the same SALT_ROUNDS (12) as real user hashes — never
// changes, never matches a real password. Compared against on the
// "identifier doesn't exist" path below so that path pays the same
// bcrypt.compare() cost a real user lookup would, closing a timing
// side-channel that would otherwise let an attacker enumerate valid
// usernames/emails by measuring response time (nonexistent identifiers
// used to return near-instantly, skipping bcrypt entirely).
const DUMMY_PASSWORD_HASH = '$2b$12$h8MabOXjvvGGk7mCx5IJ3eTsjo0ppB0MXa.8lBPcDcQvAD4kgpkbC';

// ── Helpers ───────────────────────────────────────────────────────────────────

function signToken(user) {
  const jti = uuidv4(); // unique ID for this specific token
  const token = jwt.sign(
    {
      sub:      user.id,       // subject — the user's UUID
      username: user.username,
      role:     user.role_type,
      jti,                     // JWT ID — used for denylist lookups
    },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
  // Decode to get the actual exp timestamp (unix seconds)
  const { exp } = jwt.decode(token);
  return { token, jti, exp };
}

function sanitizeUser(user) {
  // Never send password_hash to the frontend
  const { password_hash, ...safe } = user;
  return safe;
}

// ── POST /api/auth/register ───────────────────────────────────────────────────

router.post('/register', registerLimiter, async (req, res) => {
  const { username, email, password } = req.body;

  // Basic validation
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'username, email and password are required' });
  }
  if (username.length < 2 || username.length > 30) {
    return res.status(400).json({ error: 'Username must be between 2 and 30 characters' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  try {
    // Check for existing username / email — give specific errors
    const existing = await query(
      'SELECT id, username, email FROM users WHERE email = $1 OR username = $2 LIMIT 1',
      [email.toLowerCase(), username]
    );
    if (existing.rows.length > 0) {
      const taken = existing.rows[0];
      if (taken.email === email.toLowerCase()) {
        return res.status(409).json({ error: 'Email is already registered' });
      }
      return res.status(409).json({ error: 'Username is already taken' });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    // Insert user
    const result = await query(
      `INSERT INTO users (username, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, username, email, avatar_url, bio, is_banned, role_type, created_at`,
      [username, email.toLowerCase(), password_hash]
    );
    const user = result.rows[0];

    // Sign token
    const { token, jti, exp } = signToken(user);
    await addActiveToken(user.id, jti, exp);

    res.status(201).json({ token, user: sanitizeUser(user) });
  } catch (err) {
    console.error('[auth/register]', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────

router.post('/login', loginLimiter, async (req, res) => {
  const { identifier, password } = req.body;

  if (!identifier || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const result = await query(
      `SELECT id, username, email, password_hash, avatar_url, bio, is_banned, role_type, created_at
       FROM users WHERE email = LOWER($1) OR username = $1`,
      [identifier]
    );

    const user = result.rows[0];

    if (!user) {
      // Burn the same bcrypt.compare() cost the found-user path below pays,
      // so response time can't be used to tell "no such user" apart from
      // "wrong password" — the JSON error message alone already doesn't.
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.is_banned) {
      return res.status(403).json({ error: 'This account has been suspended' });
    }

    const { token, jti, exp } = signToken(user);
    await addActiveToken(user.id, jti, exp);

    res.json({ token, user: sanitizeUser(user) });
  } catch (err) {
    console.error('[auth/login]', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────

router.post('/logout', authenticateToken, async (req, res) => {
  try {
    const { id, jti, exp } = req.user;
    await denylistToken(jti, exp);
    await removeActiveToken(id, jti);
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('[auth/logout]', err);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
// Frontend calls this on page load to restore session from a stored token

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, username, email, avatar_url, bio, is_banned, role_type, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'User not found' });
    }
    // Re-check ban status on every /me call — catches bans without waiting for token expiry
    if (result.rows[0].is_banned) {
      return res.status(403).json({ error: 'This account has been suspended' });
    }
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('[auth/me]', err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

export default router;