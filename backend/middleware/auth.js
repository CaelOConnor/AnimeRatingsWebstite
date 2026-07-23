import jwt from 'jsonwebtoken';
import { isTokenDenylisted } from '../services/redis.js';

// node-redis queues commands issued while disconnected rather than
// rejecting them immediately — confirmed live (stopping the redis
// container and hitting an authenticated route) that isTokenDenylisted()
// hangs for ~35s before the client gives up reconnecting and finally
// rejects. The request fails closed either way (rejected, never treated as
// "not denylisted"), which is the safe outcome — but a 35s hang on every
// authenticated request during a Redis outage is its own availability
// problem. This timeout caps how long any one request waits before this
// path fails closed, without changing Redis's own reconnect behavior for
// everything else.
const DENYLIST_CHECK_TIMEOUT_MS = 2000;

function isTokenDenylistedWithTimeout(jti) {
  return Promise.race([
    isTokenDenylisted(jti),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Redis denylist check timed out')), DENYLIST_CHECK_TIMEOUT_MS)
    ),
  ]);
}

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
  // Confirmed live: routes behind this middleware (own profile, watchlist,
  // avatar upload, admin views, etc.) had no Cache-Control at all — just
  // Express's default ETag. Nothing here should ever be served from a
  // shared/intermediate cache or a conditional-GET replay; every route that
  // needs auth is either user-specific or a mutation. Set unconditionally,
  // before the token is even checked, so it applies to failure responses
  // (401s) too.
  res.set('Cache-Control', 'no-store');

  const authHeader = req.headers['authorization'];
  // set token to authheader.slice otherwise null
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;
  // if token is njull raise error
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    // Verify signature + expiry. algorithms is pinned explicitly — without
    // it, jsonwebtoken infers the accepted family from the key type (a
    // plain string secret here means it accepts HS256, HS384, *and*
    // HS512), even though this app only ever signs with HS256. Confirmed
    // live: a token re-signed as HS512 with the real secret got past this
    // check before this fix. Pinning to exactly what's issued means a
    // future accidental algorithm change elsewhere can't silently widen
    // what's accepted here too.
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

    // Check denylist (logged-out or banned tokens). Times out and fails
    // closed (falls to the catch block below, request rejected) rather
    // than hanging if Redis is unreachable — see comment above.
    const denylisted = await isTokenDenylistedWithTimeout(payload.jti);
    if (denylisted) {
      return res.status(401).json({ error: 'Token has been revoked' });
    }

    // Attach user info to request — available in all downstream handlers
    req.user = {
      id:       payload.sub,   // user UUID
      username: payload.username,
      role:     payload.role,
      jti:      payload.jti,
      exp:      payload.exp,
    };

    next();
    // raise erros
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
    // raise erros if not authenticated or not permitted otherwise proceed
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}