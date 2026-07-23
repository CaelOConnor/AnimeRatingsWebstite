import rateLimit from 'express-rate-limit';
import { logSecurityEvent } from '../utils/securityLog.js';

const FIFTEEN_MINUTES = 15 * 60 * 1000;

/**
 * makeLimiter
 * -----------
 * Pure factory — every call returns an independent limiter with its own
 * request-count store (never share one instance across routes that should
 * be limited separately).
 *
 * skipInTest (default true) makes the limiter a no-op whenever
 * NODE_ENV=test, which this whole suite always runs under (see
 * vitest.setup.js). Route tests fire many requests at the same handler
 * within a single file — real limiting there would make test counts
 * fragile. Tests that want to exercise the limiter itself (see
 * middleware/__tests__/rateLimitTest.test.js) call this factory directly
 * with skipInTest: false.
 *
 * `name` identifies which limiter tripped in the security log — required
 * whenever a name isn't passed, calls fall back to 'unnamed' rather than
 * throwing, since makeLimiter is also used directly by tests with no name.
 *
 * `keyGenerator` defaults to express-rate-limit's own IP-based one when
 * omitted. Pass one (e.g. `(req) => req.user.id`) to key the counter on
 * something else — see userContentLimiter below, which must run after
 * authenticateToken so req.user is populated.
 */
export function makeLimiter({ windowMs, max, message, name, skipInTest = true, keyGenerator }) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message },
    keyGenerator,
    skip: skipInTest ? () => process.env.NODE_ENV === 'test' : undefined,
    // Overrides express-rate-limit's default handler (which just sends the
    // 429) to also log the trigger — same status/body as the default, so
    // this doesn't change client-visible behavior at all.
    handler: (req, res) => {
      logSecurityEvent('rate_limit_triggered', {
        limiter: name ?? 'unnamed',
        ip: req.ip,
        userId: req.user?.id ?? null,
        method: req.method,
        path: req.originalUrl,
      });
      res.status(429).json({ error: message });
    },
  });
}

// Strict — brute-force/credential-stuffing surface. Separate instances (not
// a shared one) so login and register each get their own counter.
export const loginLimiter = makeLimiter({
  windowMs: FIFTEEN_MINUTES,
  max: 10,
  message: 'Too many login attempts. Please try again later.',
  name: 'login',
});

export const registerLimiter = makeLimiter({
  windowMs: FIFTEEN_MINUTES,
  max: 10,
  message: 'Too many registration attempts. Please try again later.',
  name: 'register',
});

// General — content-creation spam surface (feedback, reviews, comments,
// reports). One shared instance across all four so a spammer can't dodge
// the limit by spreading a burst across different endpoints. Configurable
// per environment via RATE_LIMIT_WINDOW_MS/RATE_LIMIT_MAX (see
// docker-compose.yml); falls back to 15 min / 25 requests if unset.
export const contentLimiter = makeLimiter({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || FIFTEEN_MINUTES,
  max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 25,
  message: 'Too many requests. Please try again later.',
  name: 'content',
});

// Per-user counterpart to contentLimiter, applied in addition to it (never
// instead of) — confirmed live that an authenticated user rotating their
// apparent source IP (spoofed X-Forwarded-For, trusted once app.js's
// `trust proxy` was set) faced zero throttling under the IP-only limiter,
// since each "new" IP only ever sees one request. Keyed on req.user.id
// instead of IP, so it must run after authenticateToken in the route chain
// (contentLimiter runs before auth and stays IP-keyed — a single account
// and a single IP are now both capped independently, and an attacker has
// to evade both, not just one). Slightly looser than the IP cap on
// purpose: legitimate users sharing an IP (an office, a household) should
// still be somewhat protected by the IP limiter without each of them
// individually eating into a tighter shared budget.
export const userContentLimiter = makeLimiter({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || FIFTEEN_MINUTES,
  max: parseInt(process.env.RATE_LIMIT_USER_MAX, 10) || 35,
  message: 'Too many requests. Please try again later.',
  name: 'content-per-user',
  keyGenerator: (req) => req.user.id,
});
