import { describe, it, expect } from 'vitest';
import express from 'express';
import supertest from 'supertest';
import { makeLimiter } from '../rateLimit.js';

// ---------------------------------------------------------------------------
// makeLimiter is the pure factory the real app-wired limiters (loginLimiter,
// registerLimiter, contentLimiter) are built from. Those three skip
// rate-limiting entirely under NODE_ENV=test (this whole suite always runs
// with NODE_ENV=test — see vitest.setup.js), so hitting them through app.js
// could never actually produce a 429 here. This test builds its own tiny
// app + limiter instance with skipInTest: false to exercise the real
// rate-limiting behavior directly, independent of that test-mode bypass.
// ---------------------------------------------------------------------------

function buildTestApp({ max, windowMs = 60_000 }) {
  const app = express();
  app.get(
    '/ping',
    makeLimiter({ windowMs, max, message: 'Too many requests. Please try again later.', skipInTest: false }),
    (req, res) => res.json({ ok: true })
  );
  return app;
}

describe('rate limiting (makeLimiter)', () => {
  it('allows requests up to the configured max', async () => {
    const app = buildTestApp({ max: 3 });
    const request = supertest(app);

    for (let i = 0; i < 3; i++) {
      const res = await request.get('/ping');
      expect(res.status).toBe(200);
    }
  });

  it('returns 429 once the max is exceeded within the window', async () => {
    const app = buildTestApp({ max: 3 });
    const request = supertest(app);

    for (let i = 0; i < 3; i++) {
      await request.get('/ping');
    }

    const res = await request.get('/ping');

    expect(res.status).toBe(429);
    expect(res.body.error).toBe('Too many requests. Please try again later.');
  });

  it('does not rate-limit at all when skipInTest defaults true under NODE_ENV=test', async () => {
    const app = express();
    app.get(
      '/ping',
      makeLimiter({ windowMs: 60_000, max: 1, message: 'Too many requests. Please try again later.' }),
      (req, res) => res.json({ ok: true })
    );
    const request = supertest(app);

    // Well over the max=1 — would 429 on the second request if the
    // NODE_ENV=test skip weren't in effect.
    for (let i = 0; i < 5; i++) {
      const res = await request.get('/ping');
      expect(res.status).toBe(200);
    }
  });
});
