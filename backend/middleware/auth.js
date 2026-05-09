import jwt from 'jsonwebtoken';
import { isTokenDenylisted } from '../services/redis.js';

/**
 * authenticateToken
 * -----------------
 * Verifies the JWT in the Authorization header.
 * Checks the Redis denylist (handles logout + bans).
 * Populates req.user on success.
 *
 * Use on any route that requires a logged-in user.
 */
export async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    // 1. Verify signature + expiry
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // 2. Check denylist (logged-out or banned tokens)
    const denylisted = await isTokenDenylisted(payload.jti);
    if (denylisted) {
      return res.status(401).json({ error: 'Token has been revoked' });
    }

    // 3. Attach user info to request — available in all downstream handlers
    req.user = {
      id:       payload.sub,   // user UUID
      username: payload.username,
      role:     payload.role,
      jti:      payload.jti,
      exp:      payload.exp,
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    console.error('[auth middleware] Unexpected error:', err);
    return res.status(500).json({ error: 'Authentication error' });
  }
}

/**
 * requireRole(...roles)
 * ---------------------
 * Must be used AFTER authenticateToken.
 * Rejects the request if req.user.role is not in the allowed list.
 *
 * Usage:
 *   router.delete('/review/:id',
 *     authenticateToken,
 *     requireRole('moderator', 'admin'),
 *     deleteReviewHandler
 *   );
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}