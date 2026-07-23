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

  // Confirmed live (real HTTP requests, spoofed X-Forwarded-For) that
  // contentLimiter alone — keyed on IP by default — lets a single
  // authenticated user submit unlimited requests just by rotating their
  // apparent source IP each time. userContentLimiter closes that by keying
  // on req.user.id instead. This test proves the mechanism in isolation:
  // a custom keyGenerator ignores IP entirely and tracks per-key counters.
  it('with a custom keyGenerator, ignores IP and rate-limits per key instead (e.g. per user id)', async () => {
    const app = express();
    // Stand-in for authenticateToken — a real route would populate
    // req.user from the verified JWT; here it's set directly from a
    // header so the test can drive it per-request.
    app.use((req, res, next) => {
      req.user = { id: req.headers['x-fake-user-id'] };
      next();
    });
    app.get(
      '/ping',
      makeLimiter({
        windowMs: 60_000,
        max: 2,
        message: 'Too many requests. Please try again later.',
        skipInTest: false,
        keyGenerator: (req) => req.user.id,
      }),
      (req, res) => res.json({ ok: true })
    );
    const request = supertest(app);

    // Same user id, three different spoofed source IPs — the IP-based
    // default would treat these as three independent, unthrottled callers.
    const first = await request.get('/ping').set('x-fake-user-id', 'userA').set('X-Forwarded-For', '1.1.1.1');
    const second = await request.get('/ping').set('x-fake-user-id', 'userA').set('X-Forwarded-For', '2.2.2.2');
    const third = await request.get('/ping').set('x-fake-user-id', 'userA').set('X-Forwarded-For', '3.3.3.3');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429); // max:2 hit on the 3rd, despite the 3rd "IP"

    // A different user id gets its own independent counter.
    const otherUser = await request.get('/ping').set('x-fake-user-id', 'userB').set('X-Forwarded-For', '1.1.1.1');
    expect(otherUser.status).toBe(200);
  });
});
