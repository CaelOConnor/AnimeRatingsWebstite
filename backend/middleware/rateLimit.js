import rateLimit from 'express-rate-limit';

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
 */
export function makeLimiter({ windowMs, max, message, skipInTest = true }) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message },
    skip: skipInTest ? () => process.env.NODE_ENV === 'test' : undefined,
  });
}

// Strict — brute-force/credential-stuffing surface. Separate instances (not
// a shared one) so login and register each get their own counter.
export const loginLimiter = makeLimiter({
  windowMs: FIFTEEN_MINUTES,
  max: 10,
  message: 'Too many login attempts. Please try again later.',
});

export const registerLimiter = makeLimiter({
  windowMs: FIFTEEN_MINUTES,
  max: 10,
  message: 'Too many registration attempts. Please try again later.',
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
});
